/* Liquid Design — approved portable engine; build: node liquid-design/build.mjs */
(function(host){'use strict';if(host.LiquidDesign)return;
var window=Object.create(host),module=undefined;
['requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','matchMedia'].forEach(function(k){window[k]=host[k].bind(host)});
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LiquidDesignPhysics = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var DEFAULTS = Object.freeze({
    centerCoupling: 0.06,
    centerLimit: 14,
    stretchLimit: 40,
    axisHysteresis: 6,
    connectionOuter: 20,
    connectionInner: 8,
    // Natural angular frequency in radians per second.
    springFrequency: 54,
    springDamping: 1,
    maxDelta: 1 / 30,
  });
  var IPAD_FLUID_SPRING = Object.freeze(Object.assign({}, DEFAULTS, {
    springFrequency: 10.5,
    springDamping: 0.4342,
  }));

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(min, max, value) {
    var t = clamp((value - min) / (max - min), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function rubberBand(displacement, coupling, limit) {
    if (!Number.isFinite(displacement) || !Number.isFinite(coupling)
      || !Number.isFinite(limit) || limit <= 0) {
      throw new RangeError('rubberBand requires finite values and a positive limit');
    }
    var sign = displacement < 0 ? -1 : 1;
    return sign * limit * (1 - Math.exp(-Math.abs(displacement) * coupling / limit));
  }

  function connectionStrength(edgeDistance, outerRadius, innerRadius) {
    if (!Number.isFinite(edgeDistance) || !Number.isFinite(outerRadius)
      || !Number.isFinite(innerRadius) || outerRadius <= innerRadius) {
      throw new RangeError('connection radii must be finite and outerRadius must exceed innerRadius');
    }
    return 1 - smoothstep(innerRadius, outerRadius, edgeDistance);
  }

  function pointerOutsideGlass(x, y, rect) {
    var radius = Math.min(rect.radius, rect.width / 2, rect.height / 2);
    var innerX = Math.max(rect.left + radius, Math.min(rect.left + rect.width - radius, x));
    var innerY = Math.max(rect.top + radius, Math.min(rect.top + rect.height - radius, y));
    var dx = x - innerX, dy = y - innerY, distance = Math.hypot(dx, dy);
    if (distance <= radius) return { x: 0, y: 0 };
    var excess = (distance - radius) / distance;
    return { x: dx * excess, y: dy * excess };
  }

  function directionAxis(direction) {
    if (direction === 'left' || direction === 'right') return 'x';
    if (direction === 'up' || direction === 'down') return 'y';
    return null;
  }

  function resolveDirection(dx, dy, previousDirection, hysteresis) {
    var absX = Math.abs(dx);
    var absY = Math.abs(dy);
    if (absX === 0 && absY === 0) {
      return directionAxis(previousDirection) ? previousDirection : 'right';
    }

    var previousAxis = directionAxis(previousDirection);
    if (previousAxis && Math.abs(absX - absY) <= hysteresis) {
      if (previousAxis === 'x') return dx < 0 ? 'left' : 'right';
      return dy < 0 ? 'up' : 'down';
    }
    if (absX >= absY) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'up' : 'down';
  }

  function deriveSlabBounds(material, geometry) {
    var direction = material.stretchDirection;
    var horizontal = direction === 'left' || direction === 'right';
    var vertical = direction === 'up' || direction === 'down';
    var stretch = Math.max(0, material.stretchAmount || 0);
    var centerX = (geometry.slabCenterX || 0) + (material.centerOffsetX || 0);
    var centerY = (geometry.slabCenterY || 0) + (material.centerOffsetY || 0);
    var halfWidth = geometry.slabHalfWidth + (horizontal ? stretch : 0);
    var halfHeight = geometry.slabHalfHeight + (vertical ? stretch : 0);
    return {
      centerX: centerX,
      centerY: centerY,
      halfWidth: halfWidth,
      halfHeight: halfHeight,
      left: centerX - halfWidth,
      right: centerX + halfWidth,
      top: centerY - halfHeight,
      bottom: centerY + halfHeight,
    };
  }

  function deriveConnections(material, geometry, config) {
    var deformsSlab = material.deformSlab !== false && material.activeShape !== 'left-circle'
      && material.activeShape !== 'right-circle';
    var bounds = deriveSlabBounds(deformsSlab ? material : {
      stretchDirection: 'rest', stretchAmount: 0, centerOffsetX: 0, centerOffsetY: 0,
    }, geometry);
    var slabLeft = bounds.left;
    var slabRight = bounds.right;
    slabLeft = Math.max(-geometry.trackHalfWidth, slabLeft);
    slabRight = Math.min(geometry.trackHalfWidth, slabRight);
    var pressure = Math.max(0, material.stretchAmount || 0);
    var direction = material.stretchDirection;
    var directionX = direction === 'left' ? -1 : (direction === 'right' ? 1 : 0);
    var horizontalPressure = Math.abs(directionX);
    var verticalPressure = direction === 'up' || direction === 'down' ? 1 : 0;
    var perpendicularCompression = Math.max(0, material.perpendicularCompression || 0);
    var contact = Math.max(0, material.compression || 0);
    var leftCenter = geometry.circleCenters[0];
    var rightCenter = geometry.circleCenters[1];
    var leftRadiusX = geometry.circleRadius;
    var rightRadiusX = geometry.circleRadius;
    if (material.activeShape === 'left-circle') {
      leftCenter += directionX * pressure * 0.5;
      leftRadiusX += horizontalPressure * pressure * 0.5 + contact * 0.18;
      leftRadiusX = Math.max(4, leftRadiusX - verticalPressure * pressure * perpendicularCompression);
    } else if (material.activeShape === 'right-circle') {
      rightCenter += directionX * pressure * 0.5;
      rightRadiusX += horizontalPressure * pressure * 0.5 + contact * 0.18;
      rightRadiusX = Math.max(4, rightRadiusX - verticalPressure * pressure * perpendicularCompression);
    }
    var leftCircleEdge = leftCenter + leftRadiusX;
    var rightCircleEdge = rightCenter - rightRadiusX;
    var leftEdgeDistance = Math.max(0, slabLeft - leftCircleEdge);
    var rightEdgeDistance = Math.max(0, rightCircleEdge - slabRight);
    return {
      leftEdgeDistance: leftEdgeDistance,
      rightEdgeDistance: rightEdgeDistance,
      leftConnection: connectionStrength(
        leftEdgeDistance,
        config.connectionOuter,
        config.connectionInner,
      ),
      rightConnection: connectionStrength(
        rightEdgeDistance,
        config.connectionOuter,
        config.connectionInner,
      ),
    };
  }

  function deriveMaterialState(input, geometry, config) {
    var active = input.active === true;
    var direction = active
      ? resolveDirection(
        input.pointerDx,
        input.pointerDy,
        input.previousDirection,
        config.axisHysteresis,
      )
      : 'rest';
    var horizontal = direction === 'left' || direction === 'right';
    var displacement = horizontal ? input.pointerDx : input.pointerDy;
    var centerCoupling = clamp(config.centerCoupling, 0.05, 0.08);
    var centerOffset = direction === 'rest'
      ? 0
      : rubberBand(displacement, centerCoupling, config.centerLimit);
    var stretchAmount = direction === 'rest'
      ? 0
      : Math.abs(rubberBand(displacement, centerCoupling * 3, config.stretchLimit));
    var material = {
      activeCenter: input.activeCenter,
      centerOffsetX: horizontal ? centerOffset : 0,
      centerOffsetY: horizontal || direction === 'rest' ? 0 : centerOffset,
      stretchDirection: direction,
      stretchAmount: stretchAmount,
      velocityX: input.velocityX,
      velocityY: input.velocityY,
    };
    return Object.assign(material, deriveConnections(material, geometry, config));
  }

  function deriveIpadFluidState(input, geometry, config) {
    var state = {
      centerOffsetX: 0,
      centerOffsetY: 0,
      leftExtension: 0,
      rightExtension: 0,
      topExtension: 0,
      bottomExtension: 0,
      compressionX: 0,
      compressionY: 0,
    };
    if (input.active !== true) return state;

    var width = geometry.slabHalfWidth * 2;
    var height = geometry.slabHalfHeight * 2;
    // Small controls keep their familiar feel; broad surfaces resist the same
    // pointer pressure progressively. Use resting area, never deformed bounds.
    // areaScaleLimit (optional) caps that resistance for sheets that must
    // still visibly pull, such as an open Options menu.
    var areaCap = Number(config.areaScaleLimit) > 0 ? Number(config.areaScaleLimit) : Infinity;
    var areaResistance = 1.35 * Math.min(areaCap, Math.max(1, Math.sqrt(width * height / (52 * 52))));
    var centerCoupling = clamp(config.centerCoupling, 0.05, 0.08);
    var stretchGain = clamp(Number(config.fluidStretchGain) || 1, 1, 3);
    var stretchRatio = clamp(Number(config.fluidStretchRatio) || 0.55, 0.1, 0.7);
    var facingShare = 0.88;
    var oppositeShare = 1 - facingShare;
    // stretchLimit is the maximum facing-edge extension in CSS pixels.
    var areaScale = Math.min(areaCap, Math.max(1, Math.sqrt(width * height / (52 * 52))));
    var horizontalFacingLimit = Math.min(config.stretchLimit, width * stretchRatio) / areaScale;
    var verticalFacingLimit = Math.min(config.stretchLimit, height * stretchRatio) / areaScale;
    var horizontalPressure = Math.abs(rubberBand(
      input.pointerDx * 0.5,
      centerCoupling * 3 * stretchGain / areaResistance,
      horizontalFacingLimit / facingShare,
    ));
    var verticalPressure = Math.abs(rubberBand(
      input.pointerDy * 0.5,
      centerCoupling * 3 * stretchGain / areaResistance,
      verticalFacingLimit / facingShare,
    ));

    state.centerOffsetX = rubberBand(input.pointerDx, centerCoupling, config.centerLimit);
    state.centerOffsetY = rubberBand(input.pointerDy, centerCoupling, config.centerLimit);
    if (input.pointerDx < 0) {
      state.leftExtension = horizontalPressure * facingShare;
      state.rightExtension = horizontalPressure * oppositeShare;
    } else {
      state.leftExtension = horizontalPressure * oppositeShare;
      state.rightExtension = horizontalPressure * facingShare;
    }
    if (input.pointerDy < 0) {
      state.topExtension = verticalPressure * facingShare;
      state.bottomExtension = verticalPressure * oppositeShare;
    } else {
      state.topExtension = verticalPressure * oppositeShare;
      state.bottomExtension = verticalPressure * facingShare;
    }
    state.compressionX = Math.abs(rubberBand(
      input.pointerDy,
      centerCoupling,
      width * 0.12,
    ));
    state.compressionY = Math.abs(rubberBand(
      input.pointerDx,
      centerCoupling,
      height * 0.12,
    ));
    return state;
  }

  function deriveIpadFluidBounds(material, geometry) {
    material = material || {};
    var contact = Math.max(0, Number(material.compression) || 0);
    var halfWidth = Math.max(0, geometry.slabHalfWidth
      - (Number(material.compressionX) || 0) * 0.5 + contact * 0.18);
    var halfHeight = Math.max(0, geometry.slabHalfHeight
      - (Number(material.compressionY) || 0) * 0.5 + contact * 0.12);
    var centerX = (geometry.slabCenterX || 0) + (Number(material.centerOffsetX) || 0);
    var centerY = (geometry.slabCenterY || 0) + (Number(material.centerOffsetY) || 0);
    var left = centerX - halfWidth - (Number(material.leftExtension) || 0);
    var right = centerX + halfWidth + (Number(material.rightExtension) || 0);
    var top = centerY - halfHeight - (Number(material.topExtension) || 0);
    var bottom = centerY + halfHeight + (Number(material.bottomExtension) || 0);
    halfWidth = (right - left) * 0.5;
    halfHeight = (bottom - top) * 0.5;
    return {
      centerX: (left + right) * 0.5,
      centerY: (top + bottom) * 0.5,
      halfWidth: halfWidth,
      halfHeight: halfHeight,
      left: left,
      right: right,
      top: top,
      bottom: bottom,
      radius: Math.max(0, Math.min(halfWidth, halfHeight)),
    };
  }

  function clampPointToIpadFluid(point, bounds) {
    return {
      x: clamp(point.x, bounds.left, bounds.right),
      y: clamp(point.y, bounds.top, bounds.bottom),
    };
  }

  function stepSpring(state, target, dt, config) {
    var step = clamp(dt, 0, config.maxDelta);
    var angularFrequency = config.springFrequency;
    var damping = config.springDamping;
    if (!Number.isFinite(angularFrequency) || angularFrequency <= 0
      || !Number.isFinite(damping) || damping < 0.4 || damping > 1) {
      throw new RangeError('spring requires a positive angular frequency and damping from 0.4 to 1');
    }
    var offset = state.x - target;

    if (damping === 1) {
      var decay = Math.exp(-angularFrequency * step);
      var coefficient = state.velocity + angularFrequency * offset;
      return {
        x: target + (offset + coefficient * step) * decay,
        velocity: (state.velocity - angularFrequency * coefficient * step) * decay,
      };
    }

    var dampedFrequency = angularFrequency * Math.sqrt(1 - damping * damping);
    var dampedStep = dampedFrequency * step;
    var underDecay = Math.exp(-damping * angularFrequency * step);
    var cosine = Math.cos(dampedStep);
    var sine = Math.sin(dampedStep);
    var positionCoefficient = (state.velocity + damping * angularFrequency * offset)
      / dampedFrequency;
    return {
      x: target + underDecay * (offset * cosine + positionCoefficient * sine),
      velocity: underDecay * (
        state.velocity * cosine
        - (damping * angularFrequency * state.velocity
          + angularFrequency * angularFrequency * offset) / dampedFrequency * sine
      ),
    };
  }

  function isSettled(state, epsilon) {
    return Math.abs(state.x) <= epsilon && Math.abs(state.velocity) <= epsilon;
  }

  function chooseQuality(capabilities) {
    if (!capabilities.webgl2 || capabilities.reducedMotion) return 'fallback';
    if (capabilities.automated && !capabilities.deterministic) return 'fallback';
    return capabilities.touch ? 'medium' : 'high';
  }

  return {
    DEFAULTS: DEFAULTS,
    IPAD_FLUID_SPRING: IPAD_FLUID_SPRING,
    rubberBand: rubberBand,
    pointerOutsideGlass: pointerOutsideGlass,
    connectionStrength: connectionStrength,
    resolveDirection: resolveDirection,
    deriveSlabBounds: deriveSlabBounds,
    deriveConnections: deriveConnections,
    deriveMaterialState: deriveMaterialState,
    deriveIpadFluidState: deriveIpadFluidState,
    deriveIpadFluidBounds: deriveIpadFluidBounds,
    clampPointToIpadFluid: clampPointToIpadFluid,
    stepSpring: stepSpring,
    isSettled: isSettled,
    chooseQuality: chooseQuality,
  };
});

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiquidDesignUnion = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  // Apple's public API describes proximity blending, not its shader equation.
  // This smooth distance union is our browser approximation of that behavior.
  function distance(b, x, y) {
    var hx = b.w / 2, hy = b.h / 2;
    var r = b.r === undefined ? Math.min(hx, hy) : b.r;
    var rx = Math.max(.001, Math.min(hx, b.rx === undefined ? r : b.rx));
    var ry = Math.max(.001, Math.min(hy, b.ry === undefined ? r : b.ry));
    var qx = Math.abs(x - b.x - hx) - hx + rx;
    var qy = Math.abs(y - b.y - hy) - hy + ry;
    if (qx <= 0) return qy - ry;
    if (qy <= 0) return qx - rx;
    var k0 = Math.hypot(qx / rx, qy / ry);
    var k1 = Math.hypot(qx / (rx * rx), qy / (ry * ry));
    return k0 * (k0 - 1) / Math.max(.000001, k1);
  }
  function outline(input, spacing, fixedGrid) {
    var range = Math.max(.1, spacing === undefined ? 22 : spacing);
    var boxes = input.filter(function (b) { return b.w > .01 && b.h > .01; });
    // Absorbed lobes must not thicken the host or leave an internal rim.
    boxes = boxes.filter(function (b, i) {
      return !boxes.some(function (host, j) {
        if (i === j || host.w * host.h < b.w * b.h || (host.w * host.h === b.w * b.h && j > i)) return false;
        var r = b.r === undefined ? Math.min(b.w, b.h) / 2 : b.r;
        var rx = Math.min(b.w / 2, b.rx === undefined ? r : b.rx);
        var ry = Math.min(b.h / 2, b.ry === undefined ? r : b.ry);
        for (var k = 0; k < 32; k++) {
          var angle = k * Math.PI / 16, c = Math.cos(angle), s = Math.sin(angle);
          var x = b.x + b.w / 2 + Math.sign(c) * (b.w / 2 - rx) + rx * c;
          var y = b.y + b.h / 2 + Math.sign(s) * (b.h / 2 - ry) + ry * s;
          if (distance(host, x, y) > .001) return false;
        }
        return true;
      });
    });
    if (!boxes.length) return { path: '', contours: [], connections: 0 };
    function field(x, y) {
      var d = distance(boxes[0], x, y);
      for (var i = 1; i < boxes.length; i++) {
        var other = distance(boxes[i], x, y);
        var h = Math.max(0, 1 - Math.abs(d - other) / (range * 2));
        d = Math.min(d, other) - range * .5 * h * h;
      }
      return d;
    }
    var step = 1.25, pad = range + 2;
    var left = Math.min.apply(null, boxes.map(function (b) { return b.x; })) - pad;
    var top = Math.min.apply(null, boxes.map(function (b) { return b.y; })) - pad;
    var right = Math.max.apply(null, boxes.map(function (b) { return b.x + b.w; })) + pad;
    var bottom = Math.max.apply(null, boxes.map(function (b) { return b.y + b.h; })) + pad;
    if (fixedGrid) {
      left = Math.floor(left / step) * step; top = Math.floor(top / step) * step;
      right = Math.ceil(right / step) * step; bottom = Math.ceil(bottom / step) * step;
    }
    var cols = Math.ceil((right - left) / step), rows = Math.ceil((bottom - top) / step);
    var values = new Float32Array((cols + 1) * (rows + 1));
    for (var y = 0; y <= rows; y++) for (var x = 0; x <= cols; x++) values[y * (cols + 1) + x] = field(left + x * step, top + y * step);
    var nodes = new Map();
    function edge(x, y, horizontal) {
      var key = (horizontal ? 'h' : 'v') + x + ':' + y;
      if (!nodes.has(key)) {
        var index = y * (cols + 1) + x;
        var a = values[index], b = values[index + (horizontal ? 1 : cols + 1)];
        var t = a / (a - b);
        nodes.set(key, { point: [left + (x + (horizontal ? t : 0)) * step, top + (y + (horizontal ? 0 : t)) * step], links: [] });
      }
      return key;
    }
    function join(a, b) { nodes.get(a).links.push(b); nodes.get(b).links.push(a); }
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
      var index = y * (cols + 1) + x;
      var v = [values[index], values[index + 1], values[index + cols + 2], values[index + cols + 1]];
      var edges = [];
      if ((v[0] < 0) !== (v[1] < 0)) edges.push(edge(x, y, true));
      if ((v[1] < 0) !== (v[2] < 0)) edges.push(edge(x + 1, y, false));
      if ((v[2] < 0) !== (v[3] < 0)) edges.push(edge(x, y + 1, true));
      if ((v[3] < 0) !== (v[0] < 0)) edges.push(edge(x, y, false));
      if (edges.length === 2) join(edges[0], edges[1]);
      else if (edges.length === 4) {
        if ((field(left + (x + .5) * step, top + (y + .5) * step) < 0) === (v[0] < 0)) {
          join(edges[0], edges[1]); join(edges[2], edges[3]);
        } else { join(edges[0], edges[3]); join(edges[1], edges[2]); }
      }
    }
    var visited = new Set(), contours = [];
    nodes.forEach(function (_, start) {
      if (visited.has(start)) return;
      var points = [], key = start, previous = null;
      do {
        var node = nodes.get(key);
        visited.add(key); points.push(node.point);
        var next = node.links[0] === previous ? node.links[1] : node.links[0];
        previous = key; key = next;
      } while (key && key !== start && !visited.has(key));
      if (points.length < 3) return;
      var area = 0;
      for (var i = 0; i < points.length; i++) {
        var a = points[i], b = points[(i + 1) % points.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      if (area < 0) points.reverse();
      contours.push(points);
    });
    var path = contours.map(function (points) {
      return points.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(3) + ',' + p[1].toFixed(3); }).join('') + 'Z';
    }).join(' ');
    return { path: path, contours: contours, connections: Math.max(0, input.length - contours.length) };
  }
  return { outline: outline };
});

(function (root) {
  'use strict';

  // Screen-to-local frame for an element whose ancestors may be rotated
  // (the chat rail turns its toolbar pill -90deg). Returns null when the
  // element is upright, so callers keep their plain screen-space path.
  function frameOf(el) {
    var angle = 0;
    for (var node = el; node && node.nodeType === 1; node = node.parentElement) {
      var cs = getComputedStyle(node);
      var rotate = cs.rotate;
      if (rotate && rotate !== 'none') {
        var parts = rotate.trim().split(/\s+/);
        var value = parts[parts.length - 1], deg = parseFloat(value);
        if (/rad$/.test(value)) deg = deg * 180 / Math.PI;
        else if (/turn$/.test(value)) deg *= 360;
        // Only 2D (z-axis) rotations are supported.
        if (parts.length === 1 || parts.length === 4 && parseFloat(parts[2]) !== 0) angle += deg || 0;
      }
      if (cs.transform && cs.transform !== 'none') {
        var m = new DOMMatrix(cs.transform);
        angle += Math.atan2(m.b, m.a) * 180 / Math.PI;
      }
    }
    angle = ((angle % 360) + 360) % 360;
    if (angle < 0.01 || angle > 359.99) return null;
    var theta = angle * Math.PI / 180, cos = Math.cos(theta), sin = Math.sin(theta);
    var rect = el.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    // A rotated box's bounding width + height = (w + h)(|cos| + |sin|) * scale.
    var scale = w + h ? (rect.width + rect.height) / ((w + h) * (Math.abs(cos) + Math.abs(sin))) : 1;
    scale = Math.max(.01, scale || 1);
    var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    return {
      angle: angle, scale: scale, width: w, height: h,
      // Local CSS px from the element's border-box top-left.
      toLocal: function (x, y) {
        var dx = x - cx, dy = y - cy;
        return { x: (dx * cos + dy * sin) / scale + w / 2, y: (-dx * sin + dy * cos) / scale + h / 2 };
      },
    };
  }
  root.LiquidDesignFrame = frameOf;

  function create(group, options) {
    options = options || {};
    var button = options.button || group.querySelector('[data-liquid-control]');
    var slab = options.slab || group.querySelector('[data-liquid-shape="slab"]');
    var glass = options.glass || group.querySelector('.lgd-live-glass');
    var track = options.track || group.querySelector('[data-liquid-track]');
    var listeners = [];
    var destroyed = false;
    function listen(element, name, handler) {
      element.addEventListener(name, handler);
      listeners.push(function () { element.removeEventListener(name, handler); });
    }
    var Physics = root.LiquidDesignPhysics;
    var motionMedia = root.matchMedia('(prefers-reduced-motion: reduce)');
    var reduced = !!options.staticMotion || motionMedia.matches;
    var pointerId = null;
    var editingPointer = null;
    var startX = 0;
    var startY = 0;
    var pointerX = 0;
    var pointerY = 0;
    var pressing = false;
    var lastTime = 0;
    var releaseElapsed = 0;
    var frameId = 0;
    var touch = 0;
    var touchSpring = { x: 0, velocity: 0 };
    var touchTarget = 0;
    var lastTouchPoint = null;
    var geometry;
    var trackRect;
    var restingRect;
    var springNames = [
      'centerOffsetX', 'centerOffsetY', 'leftExtension', 'rightExtension',
      'topExtension', 'bottomExtension', 'compressionX', 'compressionY',
    ];
    var springs = {};
    springNames.forEach(function (name) { springs[name] = { x: 0, velocity: 0 }; });
    var contact = { x: 0, velocity: 0 };
    var config = Object.assign({}, Physics.DEFAULTS, {
      centerCoupling: 0.06,
      stretchLimit: 40,
      // Exponential rubber-band response: easy initial travel, diminishing gain near the cap.
      fluidStretchGain: 2.1,
      fluidStretchRatio: 0.30,
      areaScaleLimit: options.areaScaleLimit || 0,
    });
    var attack = Object.assign({}, Physics.IPAD_FLUID_SPRING, {
      springFrequency: 26, springDamping: 0.98,
    });
    var release = Object.assign({}, Physics.IPAD_FLUID_SPRING, {
      springFrequency: options.releaseFrequency || 22, springDamping: 0.98,
    });
    var lightSpringConfig = Object.assign({}, Physics.IPAD_FLUID_SPRING, {
      springFrequency: 32, springDamping: 0.98,
    });

    // When the track is rotated, all geometry and pointer math runs in the
    // track's own (unrotated) CSS space, so a pull along the rotated pill
    // stretches its long axis instead of a screen axis.
    var frame = null;
    function local(x, y) { return frame ? frame.toLocal(x, y) : { x: x, y: y }; }
    function measure() {
      frame = options.measureRect ? null : frameOf(track);
      var rect;
      if (options.measureRect) rect = options.measureRect();
      else if (frame) {
        var sr = slab.getBoundingClientRect(), c = frame.toLocal(sr.left + sr.width / 2, sr.top + sr.height / 2);
        rect = { left: c.x - slab.offsetWidth / 2, top: c.y - slab.offsetHeight / 2,
          width: slab.offsetWidth, height: slab.offsetHeight };
      } else rect = slab.getBoundingClientRect();
      var radius = parseFloat(getComputedStyle(slab).borderTopLeftRadius);
      restingRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        radius: Number.isFinite(radius) ? radius : Math.min(rect.width, rect.height) / 2 };
      trackRect = frame ? { left: 0, top: 0, width: frame.width, height: frame.height } : track.getBoundingClientRect();
      geometry = {
        slabHalfWidth: rect.width / 2,
        slabHalfHeight: rect.height / 2,
        slabCenterX: rect.left + rect.width / 2 - trackRect.left - trackRect.width / 2,
        slabCenterY: rect.top + rect.height / 2 - trackRect.top - trackRect.height / 2,
      };
    }

    function wake() {
      if (!destroyed && !frameId) frameId = root.requestAnimationFrame(tick);
    }
    listen(motionMedia, 'change', function () {
      reduced = !!options.staticMotion || motionMedia.matches;
      if (reduced) {
        pressing = false; touchTarget = 0; touch = 0;
        springNames.forEach(function (name) { springs[name] = { x: 0, velocity: 0 }; });
        contact = { x: 0, velocity: 0 }; touchSpring = { x: 0, velocity: 0 };
      }
      wake();
    });

    function tick(time) {
      frameId = 0;
      measure();
      var dt = lastTime ? Math.min((time - lastTime) / 1000, 1 / 30) : 1 / 60;
      lastTime = time;
      releaseElapsed = pressing ? 0 : releaseElapsed + dt;
      var rawX = pointerX, rawY = pointerY, rawStartX = startX, rawStartY = startY;
      var p = local(rawX, rawY), s0 = local(rawStartX, rawStartY);
      pointerX = p.x; pointerY = p.y; startX = s0.x; startY = s0.y;
      try {
      var outside = pointerId !== null ? Physics.pointerOutsideGlass(pointerX, pointerY, restingRect) : { x: 0, y: 0 };
      // A broad sheet pressed in its middle (an open Options menu) barely
      // leaves its own edge during a pull, so edge-distance pressure stays
      // near zero. pullFromPress measures the pull from the press point
      // instead, past a small dead zone so a still click never deforms.
      if (options.pullFromPress && pointerId !== null) {
        var pullX = pointerX - startX, pullY = pointerY - startY, dead = 4;
        var fromPress = { x: Math.sign(pullX) * Math.max(0, Math.abs(pullX) - dead), y: Math.sign(pullY) * Math.max(0, Math.abs(pullY) - dead) };
        outside = { x: Math.abs(fromPress.x) > Math.abs(outside.x) ? fromPress.x : outside.x, y: Math.abs(fromPress.y) > Math.abs(outside.y) ? fromPress.y : outside.y };
      }
      var target = Physics.deriveIpadFluidState({
        // A dropdown can hide its panel before the pointer spring settles.
        // Hidden geometry has no positive stretch limit to solve against.
        active: pressing && !reduced && geometry.slabHalfWidth > 0 && geometry.slabHalfHeight > 0,
        pointerDx: outside.x,
        pointerDy: outside.y,
      }, geometry, config);
      // Position is resisted relative to the gesture's original resting anchor,
      // not accumulated from the previous frame or the moving material center.
      if (pressing && !reduced && (pointerId !== null || editingPointer !== null)) {
        var areaScale = Math.min(options.areaScaleLimit || Infinity, Math.max(1, Math.sqrt(geometry.slabHalfWidth * geometry.slabHalfHeight * 4 / (52 * 52))));
        target.centerOffsetX = Physics.rubberBand(pointerX - startX, (options.centerCoupling || 0.06) / areaScale, (options.centerLimit || 14) / areaScale);
        target.centerOffsetY = Physics.rubberBand(pointerY - startY, (options.centerCoupling || 0.06) / areaScale, (options.centerLimit || 14) / areaScale);
        var horizontal = Math.abs(outside.x);
        var vertical = Math.abs(outside.y);
        // Smooth axis preference suppresses squeeze at diagonal crossover.
        // Contact adds .24/.36 of its amplitude to full height/width, so
        // compensate that bulge as the facing-edge stretch grows.
        var xWeight = Math.max(0, horizontal - vertical) / Math.max(1, horizontal);
        var yWeight = Math.max(0, vertical - horizontal) / Math.max(1, vertical);
        target.compressionY = Math.min(target.compressionY + (7.68 + geometry.slabHalfHeight * .16) * (1 - Math.exp(-horizontal / 48)) * xWeight / areaScale, 12 / areaScale);
        target.compressionX = Math.min(target.compressionX + (11.52 + geometry.slabHalfWidth * .12) * (1 - Math.exp(-vertical / 48)) * yWeight / areaScale, 12 / areaScale);
      }
      // Small controls get one restrained rebound; large surfaces retain the
      // anchored, nearly critical response. Derive this from resting area.
      var restingAreaScale = Math.max(1, Math.sqrt(geometry.slabHalfWidth * geometry.slabHalfHeight * 4 / (52 * 52)));
      var panelWeight = Math.min(1, Math.max(0, (restingAreaScale - 1) / 2));
      attack.springDamping = 0.72 + 0.26 * panelWeight;
      release.springDamping = 0.62 + 0.36 * panelWeight;
      var motion = pressing ? attack : release;
      springNames.forEach(function (name) {
        springs[name] = Physics.stepSpring(springs[name], target[name], dt, motion);
      });
      var contactArea = Math.max(1, Math.sqrt(geometry.slabHalfWidth * geometry.slabHalfHeight * 4 / (52 * 52)));
      contact = Physics.stepSpring(contact, pressing && !reduced ? 8 / contactArea : 0, dt, motion);
      // A fast light spring adds a small pulse while sharing the material's spring character.
      touchSpring = Physics.stepSpring(touchSpring, touchTarget, dt,
        pressing ? lightSpringConfig : release);
      touch = Math.max(0, Math.min(1.2, touchSpring.x));
      // End after two return cycles; the remaining lobe is below visible scale.
      if (!pressing && releaseElapsed > 4 * Math.PI / (release.springFrequency * Math.sqrt(1 - release.springDamping * release.springDamping))) {
        springNames.forEach(function (name) { springs[name] = { x: 0, velocity: 0 }; });
        contact = { x: 0, velocity: 0 };
        touchSpring = { x: 0, velocity: 0 }; touch = 0;
      }
      var material = { compression: Math.max(0, contact.x) };
      springNames.forEach(function (name) { material[name] = springs[name].x; });
      if (options.deformationScale !== undefined) {
        material.compression *= options.deformationScale;
        springNames.forEach(function (name) {
          if (name.indexOf('centerOffset') !== 0) material[name] *= options.deformationScale;
        });
      }
      // Preserve the negative release lobe as a slight contraction past rest.
      // The shared bounds helper accepts only positive contact bulge.
      if (contact.x < 0) {
        material.compressionX += -contact.x * 0.36;
        material.compressionY += -contact.x * 0.24;
      }
      var bounds = Physics.deriveIpadFluidBounds(material, geometry);
      var lightPoint = pointerId === null && editingPointer === null
        ? (lastTouchPoint || { x: bounds.centerX, y: bounds.centerY })
        : Physics.clampPointToIpadFluid({
          x: pointerX - trackRect.left - trackRect.width / 2,
          y: pointerY - trackRect.top - trackRect.height / 2,
        }, bounds);
      if (pressing) lastTouchPoint = lightPoint;
      if (options.render) options.render({ bounds: bounds, geometry: geometry, touch: touch,
        lightPoint: lightPoint, touchRadius: 92 * Math.max(0.65, Math.min(1.18, 1 + (touchSpring.x - touchTarget) * 0.18)) });
      else {
      glass.style.left = (trackRect.width / 2 + bounds.centerX) + 'px';
      glass.style.top = (trackRect.height / 2 + bounds.centerY) + 'px';
      glass.style.width = Math.max(1, bounds.halfWidth * 2) + 'px';
      glass.style.height = Math.max(1, bounds.halfHeight * 2) + 'px';
      glass.style.setProperty('--lgd-touch-x', (50 + (lightPoint.x - bounds.centerX) / (bounds.halfWidth * 2) * 100) + '%');
      glass.style.setProperty('--lgd-touch-y', (50 + (lightPoint.y - bounds.centerY) / (bounds.halfHeight * 2) * 100) + '%');
      glass.style.setProperty('--lgd-touch-strength', touch.toFixed(3));
      glass.style.setProperty('--lgd-touch-radius', (92 * Math.max(0.65, Math.min(1.18, 1 + (touchSpring.x - touchTarget) * 0.18))) + 'px');
      // Content and material share the same bounds, with no resisted secondary motion.
      slab.style.setProperty('--lgd-content-x', (bounds.centerX - geometry.slabCenterX) + 'px');
      slab.style.setProperty('--lgd-content-y', (bounds.centerY - geometry.slabCenterY) + 'px');
      slab.style.setProperty('--lgd-content-scale-x', (bounds.halfWidth / geometry.slabHalfWidth).toFixed(4));
      slab.style.setProperty('--lgd-content-scale-y', (bounds.halfHeight / geometry.slabHalfHeight).toFixed(4));
      }
      var settled = !pressing && Math.abs(touchSpring.x) < 0.005 && Math.abs(touchSpring.velocity) < 0.05
        && Math.abs(contact.x) < 0.08 && Math.abs(contact.velocity) < 0.8
        && springNames.every(function (name) {
          return Math.abs(springs[name].x) < 0.08 && Math.abs(springs[name].velocity) < 0.8;
        });
      } finally { pointerX = rawX; pointerY = rawY; startX = rawStartX; startY = rawStartY; }
      if (!settled && !reduced) wake();
      else if (settled) {
        lastTime = 0;
        lastTouchPoint = null;
        slab.style.removeProperty('--lgd-content-x');
        slab.style.removeProperty('--lgd-content-y');
        slab.style.removeProperty('--lgd-content-scale-x');
        slab.style.removeProperty('--lgd-content-scale-y');
      }
    }

    function releasePointer(event) {
      if (pointerId === null || event.pointerId !== pointerId) return;
      var captured = pointerId;
      pointerId = null;
      pressing = false;
      releaseElapsed = 0;
      touchTarget = 0;
      // Preserve current velocity; release adds no artificial kick or bulge.
      if (button.hasPointerCapture(captured)) button.releasePointerCapture(captured);
      wake();
    }

    listen(button, 'pointerdown', function (event) {
      if (button.disabled || event.button !== 0 || pointerId !== null) return;
      // Nested buttons and links own their activation, including inside a
      // static-action surface. Do not preventDefault or capture their press
      // for the parent glass surface, or their click handlers never fire.
      // A static-action surface (a toolbar pill) instead hands the press to
      // the glass the same way as a field below: no preventDefault or capture
      // while inside, so the button still clicks, and the glass stretches
      // once the pointer pulls past its edge.
      var nestedAction = options.editableSurface && event.target.closest('button, a');
      if (nestedAction && !options.staticActionSurface) return;
      // A nested independent glass control or compound component owns its own
      // gesture. Capturing it here would make the parent surface deform along
      // with an Options sheet dragged above it.
      var nestedControl = options.editableSurface && event.target.closest('[data-lgp-control],[data-lgp-component]');
      // A compound Options source lives inside its own component host. That
      // host is the motion track, not a separate control. Let the source
      // group's gesture own the whole capsule instead of handing the press
      // back to the individual button under the pointer.
      if (nestedControl && nestedControl !== button && nestedControl !== track) return;
      if (nestedAction || (options.editableSurface && event.target.closest('input, textarea, select, [contenteditable]'))) {
        // Let the native field place its caret/select text until the pointer
        // leaves the resting glass. Then hand that same gesture to the spring.
        measure();
        editingPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        startX = pointerX = event.clientX; startY = pointerY = event.clientY;
        pressing = !reduced; releaseElapsed = 0; touchTarget = reduced ? 0 : 1;
        var down = local(event.clientX, event.clientY);
        lastTouchPoint = { x: down.x - trackRect.left - trackRect.width / 2,
          y: down.y - trackRect.top - trackRect.height / 2 };
        wake();
        return;
      }
      // Blank glass/labels belong to the gesture from its very first press.
      // Editors above retain native caret placement and text selection.
      event.preventDefault();
      measure();
      pointerId = event.pointerId;
      startX = pointerX = event.clientX;
      startY = pointerY = event.clientY;
      pressing = !reduced;
      releaseElapsed = 0;
      touchTarget = reduced ? 0 : 1;
      button.setPointerCapture(pointerId);
      wake();
    });
    listen(button, 'pointermove', function (event) {
      if (event.pointerId !== pointerId) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      wake();
    });
    listen(button, 'pointerup', releasePointer);
    listen(button, 'pointercancel', releasePointer);
    listen(button, 'lostpointercapture', function (event) {
      // Touch has implicit input capture. Its old capture-loss event bubbles
      // during handoff; release only if the form itself no longer owns it.
      if (!button.hasPointerCapture(event.pointerId)) releasePointer(event);
    });
    if (options.editableSurface) {
      listen(button, 'dragstart', function (event) {
        // Native dragging of selected text cancels the pointer stream before
        // an outside pull can reach the glass handoff. Keep in-field selection,
        // but reserve selected-text drag-and-drop for this liquid gesture.
        if (editingPointer) event.preventDefault();
      });
      listen(root, 'pointermove', function (event) {
        if (!editingPointer || event.pointerId !== editingPointer.id) return;
        pointerX = event.clientX; pointerY = event.clientY;
        wake();
        var here = local(event.clientX, event.clientY);
        var outside = Physics.pointerOutsideGlass(here.x, here.y, restingRect);
        if (reduced || Math.hypot(outside.x, outside.y) < 3) return;
        pointerId = event.pointerId;
        startX = editingPointer.x; startY = editingPointer.y;
        pointerX = event.clientX; pointerY = event.clientY;
        editingPointer = null;
        pressing = true; releaseElapsed = 0; touchTarget = 1;
        button.setPointerCapture(pointerId);
        event.preventDefault(); wake();
      });
      function endEditingPointer(event) {
        if (!editingPointer || event.pointerId !== editingPointer.id) return;
        editingPointer = null; pressing = false; releaseElapsed = 0; touchTarget = 0;
        wake();
      }
      listen(root, 'pointerup', endEditingPointer);
      listen(root, 'pointercancel', endEditingPointer);
    }
    listen(button, 'keydown', function (event) {
      if (options.editableSurface) return;
      if (button.disabled || pointerId !== null || event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
      pressing = !reduced;
      releaseElapsed = 0;
      touchTarget = reduced ? 0 : 1;
      wake();
    });
    listen(button, 'keyup', function (event) {
      if (options.editableSurface) return;
      if (pointerId !== null || (event.key !== ' ' && event.key !== 'Enter')) return;
      pressing = false;
      releaseElapsed = 0;
      touchTarget = 0;
      wake();
    });
    listen(button, 'blur', function () {
      if (pointerId !== null) return;
      pressing = false;
      touchTarget = 0;
      wake();
    });
    listen(root, 'resize', function () { measure(); wake(); });
    var observer = root.ResizeObserver ? new root.ResizeObserver(function () { measure(); wake(); }) : null;
    if (observer) { observer.observe(slab); observer.observe(track); }
    measure();
    wake();
    return {
      refresh: function () { if (!destroyed) { measure(); wake(); } },
      reset: function () {
        root.cancelAnimationFrame(frameId); frameId = 0;
        if (pointerId !== null && button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
        pointerId = null; editingPointer = null; pressing = false; lastTime = 0;
        springNames.forEach(function (name) { springs[name] = { x: 0, velocity: 0 }; });
        contact = { x: 0, velocity: 0 }; touchSpring = { x: 0, velocity: 0 };
        touch = 0; touchTarget = 0; lastTouchPoint = null; releaseElapsed = 0;
      },
      // Transfer an in-progress native gesture between compound surfaces.
      beginGesture: function (event, origin) {
        if (destroyed) return;
        measure();
        pointerId = event.pointerId;
        startX = origin.x; startY = origin.y;
        pointerX = event.clientX; pointerY = event.clientY;
        pressing = !reduced; releaseElapsed = 0;
        touchTarget = reduced ? 0 : 1;
        wake();
      },
      moveGesture: function (event) {
        if (destroyed || event.pointerId !== pointerId) return;
        pointerX = event.clientX; pointerY = event.clientY; wake();
      },
      endGesture: releasePointer,
      destroy: function () {
        destroyed = true;
        root.cancelAnimationFrame(frameId);
        listeners.forEach(function (remove) { remove(); });
        if (observer) observer.disconnect();
        if (pointerId !== null && button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
        ['x', 'y', 'scale-x', 'scale-y'].forEach(function (name) { slab.style.removeProperty('--lgd-content-' + name); });
      },
    };
  }

  root.LiquidDesignLiveDemo = { create: create };
})(window);

(function (root) {
  'use strict';
  function smooth(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function frame(pill, menu, time, direction, closing) {
    var t = Math.max(0, Math.min(1, time));
    var join = .24;
    var restingDiameter = Math.min(pill.w, pill.h);
    var diameter = Math.min(restingDiameter * 1.35, pill.w, menu.w, menu.h);
    var pillRadius = Number.isFinite(pill.r) ? pill.r : restingDiameter / 2;
    var menuRadius = Number.isFinite(menu.r) ? menu.r : Math.min(30, menu.w / 2, menu.h / 2);
    var shrink = smooth(t / join);
    // One damped arrival: restoring acceleration remains active at the peak,
    // unlike two independent ease curves that stop at their shared waypoint.
    var u = Math.max(0, (t - join) / (1 - join));
    var springTime = (u - .025 * (1 - Math.exp(-u / .025))) / .975;
    var damping = .72, frequency = 7.6;
    var damped = frequency * Math.sqrt(1 - damping * damping);
    function response(s) {
      return 1 - Math.exp(-damping * frequency * s) *
        (Math.cos(damped * s) + damping * frequency / damped * Math.sin(damped * s));
    }
    var grow = t < join ? 0 : response(springTime);
    // Remove the tiny residual only at the end without a terminal snap.
    grow += (1 - response(1)) * smooth((u - .78) / .22);
    var travel = smooth(t / .68);
    var cx = pill.x + pill.w / 2 + (menu.x + menu.w / 2 - pill.x - pill.w / 2) * travel;
    var cy = pill.y + pill.h / 2 + (menu.y + menu.h / 2 - pill.y - pill.h / 2) * travel;
    // Continuous center travel carries the silhouette through its minimum,
    // even when width reverses direction. All boundary derivatives are smooth.
    cy += direction * 8 * Math.pow(Math.sin(Math.PI * t), 2);
    cy += direction * menu.h * .16 * (grow - Math.min(1, grow));
    // The sheet pops slightly forward in scale and returns to its resting
    // bounds; the pill has no separate upward closing impulse.
    var w = pill.w + (diameter - pill.w) * shrink + (menu.w - diameter) * grow;
    var h = pill.h + (diameter - pill.h) * shrink + (menu.h - diameter) * grow;
    var rounding = smooth((t - .46) / .34);
    var circularRadius = Math.min(w, h) / 2;
    var r = circularRadius + (menuRadius - circularRadius) * rounding;
    if (t === 0) r = pillRadius;
    r = Math.min(r, w / 2, h / 2);
    // The controller reverses path time; both directions use the same frame.
    var tail = 0;
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h, r: r, tail: tail,
      reveal: smooth(t / .64), face: 1 - smooth(t / .24) };
  }
  function closingSpring(pill, menu, elapsed, duration, direction, from) {
    from = Number.isFinite(from) ? from : 1;
    var handoff = duration * .4;
    var anchor = pill.y + pill.h / 2;
    function center(ms) {
      var progress = Math.max(0, Math.min(1, ms / duration));
      var shape = frame(pill, menu, from * Math.pow(1 - progress, 2), direction, true);
      return shape.y + shape.h / 2;
    }
    function velocity(ms) { return (center(ms + .05) - center(ms - .05)) / .0001; }
    if (elapsed <= handoff) return { y: center(elapsed), velocity: velocity(elapsed), settled: false };
    // Continue from the closing path's position AND velocity, rather than
    // adding an unrelated pulse. Time is analytic, independent of frame rate.
    var displacement = center(handoff) - anchor;
    var incoming = velocity(handoff);
    var frequency = 26, damping = .5;
    var decay = frequency * damping;
    var oscillation = frequency * Math.sqrt(1 - damping * damping);
    var b = (incoming + decay * displacement) / oscillation;
    var seconds = (elapsed - handoff) / 1000;
    var cosine = Math.cos(oscillation * seconds), sine = Math.sin(oscillation * seconds);
    var envelope = Math.exp(-decay * seconds);
    var offset = envelope * (displacement * cosine + b * sine);
    var speed = envelope * ((b * oscillation - decay * displacement) * cosine -
      (displacement * oscillation + decay * b) * sine);
    // At the first rebound peak, change to a critically damped return.
    // Position, zero peak velocity, and restoring acceleration stay continuous;
    // the return approaches the anchor without a second, opposite-side lobe.
    var peakAngle = Math.atan2(incoming, displacement * oscillation + decay * b);
    if (peakAngle < 0) peakAngle += Math.PI;
    var peakTime = peakAngle / oscillation;
    if (seconds > peakTime) {
      var peakOffset = Math.exp(-decay * peakTime) *
        (displacement * Math.cos(peakAngle) + b * Math.sin(peakAngle));
      var returning = seconds - peakTime;
      var returnEnvelope = Math.exp(-frequency * returning);
      offset = peakOffset * (1 + frequency * returning) * returnEnvelope;
      speed = -peakOffset * frequency * frequency * returning * returnEnvelope;
    }
    return { y: anchor + offset, velocity: speed, settled: Math.abs(offset) < .05 && Math.abs(speed) < 1 };
  }
  var api = { frame: frame, closingSpring: closingSpring };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LiquidDesignMenuMotion = api;
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  'use strict';
  var sources = new Set(), painters = new Set(), observer = null, frame = 0, serial = 0;
  function svg(name, attributes) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, attributes[key]); });
    return node;
  }
  function notify() {
    if (!frame && painters.size) frame = root.requestAnimationFrame(function () {
      frame = 0; painters.forEach(function (paint) { paint(); });
    });
  }
  function owned(node) {
    return node.nodeType === 1 && !!node.closest('.lgp-material,.lgp-outline,.lgc-material,.lgc-outline') && !node.hasAttribute('data-liquid-color-source');
  }
  function collect(node) {
    if (node.nodeType !== 1 || owned(node)) return false;
    var changed = false;
    if (node.hasAttribute('data-liquid-color-source')) { sources.add(node); changed = true; }
    node.querySelectorAll('[data-liquid-color-source]').forEach(function (source) { sources.add(source); changed = true; });
    return changed;
  }
  function attach() {
    if (observer) return;
    document.querySelectorAll('[data-liquid-color-source]').forEach(function (source) { sources.add(source); });
    observer = new MutationObserver(function (mutations) {
      var dirty = false;
      mutations.forEach(function (mutation) {
        var target = mutation.target;
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(function (node) { if (collect(node)) dirty = true; });
          // Check known sources, not all removed subtrees or the document.
          if (mutation.removedNodes.length) sources.forEach(function (source) {
            if (!source.isConnected) { sources.delete(source); dirty = true; }
          });
        } else if (mutation.attributeName === 'data-liquid-color-source') {
          if (target.hasAttribute('data-liquid-color-source')) sources.add(target); else sources.delete(target);
          dirty = true;
        } else if (!owned(target)) {
          sources.forEach(function (source) { if (target === source || target.contains(source)) dirty = true; });
        }
      });
      if (dirty) notify();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-liquid-color-source', 'data-liquid-color-scene', 'style', 'class', 'hidden', 'inert'] });
  }
  // Explicit sources only: no DOM screenshots or arbitrary pixel sampling.
  root.LiquidDesignColors = {
    create: function (host, material, drawing) {
      attach();
      var boxes = [], contour = '', layer = document.createElement('span'), disposed = false, lastPaint = '';
      var rims = svg('g', { 'class': 'lg-color-rims', 'pointer-events': 'none' }), id = 'lg-color-' + (++serial);
      if (drawing) drawing.append(rims);
      layer.className = 'lg-color-spills'; layer.setAttribute('aria-hidden', 'true'); material.prepend(layer);
      function paint(next, path) {
        if (disposed) return;
        if (next) boxes = next;
        if (path !== undefined) contour = path;
        if (!sources.size) {
          if (lastPaint) { layer.replaceChildren(); rims.replaceChildren(); lastPaint = ''; }
          return;
        }
        var scene = host.closest('[data-liquid-color-scene]') || document;
        var rect = material.getBoundingClientRect(), gradients = [], reflections = [];
        var scaleX = rect.width / (material.offsetWidth || rect.width) || 1;
        var scaleY = rect.height / (material.offsetHeight || rect.height) || 1;
        sources.forEach(function (source) {
          if (!source.isConnected || scene !== document && !scene.contains(source)) return;
          var style = getComputedStyle(source), s = source.getBoundingClientRect();
          if (source.hidden || source.closest('[hidden],[inert]') || style.visibility === 'hidden' || style.display === 'none' || +style.opacity === 0 || !s.width || !s.height) return;
          boxes.forEach(function (b) {
            var cx = (s.left + s.width / 2 - rect.left) / scaleX, cy = (s.top + s.height / 2 - rect.top) / scaleY;
            var x = Math.max(b.x, Math.min(b.x + b.w, cx)), y = Math.max(b.y, Math.min(b.y + b.h, cy));
            var gapX = Math.max(b.x - (s.right - rect.left) / scaleX, (s.left - rect.left) / scaleX - b.x - b.w, 0);
            var gapY = Math.max(b.y - (s.bottom - rect.top) / scaleY, (s.top - rect.top) / scaleY - b.y - b.h, 0);
             var distance = Math.hypot(gapX, gapY);
             var range = parseFloat(getComputedStyle(host).getPropertyValue('--liquid-design-color-range')) || 80;
            if (distance >= range) return;
            // A source covering the face contributes through native backdrop blur;
            // its supplemental reflection still originates at the nearest edge.
            if (cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h) {
              var edges = [cx-b.x,b.x+b.w-cx,cy-b.y,b.y+b.h-cy], i = edges.indexOf(Math.min.apply(null,edges));
              if (i === 0) x=b.x; else if(i === 1) x=b.x+b.w; else if(i === 2) y=b.y; else y=b.y+b.h;
            }
            var proximity = Math.pow(1 - distance / range, 2);
            var strength = .12 * proximity;
            var color = source.getAttribute('data-liquid-color-source') || style.backgroundColor;
            if (!root.CSS.supports('color', color)) return;
            var spill = document.createElement('span'); spill.className = 'lg-color-spill';
            var rx = Math.min(180, Math.max(65, s.width)), ry = Math.min(180, Math.max(65, s.height));
            // Broad along the object's facing edge; shorter across the glass.
            if (x === b.x || x === b.x+b.w) { rx=120; ry=Math.min(180,Math.max(85,s.height*1.3)); }
            else { ry=120; rx=Math.min(180,Math.max(85,s.width*1.3)); }
            spill.style.cssText = 'position:absolute;pointer-events:none;inset:0;filter:blur(12px);opacity:'+strength+';background:radial-gradient(ellipse '+rx+'px '+ry+'px at '+x+'px '+y+'px,'+color+' 0%,transparent 100%)';
            gradients.push(spill);
            if (drawing && contour) {
              var gradientId = id + '-' + reflections.length;
              var gradient = svg('radialGradient', { id: gradientId, gradientUnits: 'userSpaceOnUse',
                cx: x, cy: y, r: rx, gradientTransform: 'translate(0 ' + y + ') scale(1 ' + (ry / rx) + ') translate(0 ' + -y + ')' });
              gradient.append(svg('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '1' }),
                svg('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }));
              var reflection = svg('path', { d: contour, fill: 'none', stroke: 'url(#' + gradientId + ')',
                'stroke-width': '1.25', opacity: .8 * proximity });
              reflections.push(gradient, reflection);
            }
          });
        });
        var key = gradients.map(function (spill) { return spill.style.cssText; }).join('|') + (gradients.length ? contour : '');
        if (key !== lastPaint) {
          layer.replaceChildren.apply(layer, gradients); rims.replaceChildren.apply(rims, reflections); lastPaint = key;
        }
      }
      function changed(event) {
        var scene = host.closest('[data-liquid-color-scene]');
        if (!scene || scene.contains(event.target) || scene === event.target) paint();
      }
      function repaint() { paint(); }
      painters.add(repaint);
      document.addEventListener('liquid-color-change', changed);
      root.addEventListener('resize', repaint); root.addEventListener('scroll', repaint, true);
      return { paint: function (next, path) { paint(next, path); }, destroy: function () {
        disposed = true; document.removeEventListener('liquid-color-change',changed);
        root.removeEventListener('resize',repaint); root.removeEventListener('scroll',repaint,true); layer.remove(); rims.remove();
        painters.delete(repaint);
        if (!painters.size) {
          observer.disconnect(); observer = null; sources.clear();
          root.cancelAnimationFrame(frame); frame = 0;
        }
      } };
    }
  };
})(window);

(function (root) {
  'use strict';
  // Lens refraction for glass material. A displacement map, generated once per
  // resting shape in a small canvas and cached, bends the backdrop behind the
  // glass: flat in the middle, strongest at the rim, like a convex edge.
  // Only Chromium can feed an SVG filter into backdrop-filter; everything else
  // (all of iOS) keeps the existing blur + lens-highlight material.
  var NS = 'http://www.w3.org/2000/svg';
  var maps = new Map(), MAP_LIMIT = 48, MAP_MAX = 512, MOVING_MAP_MAX = 160, serial = 0, host = null;
  var plain = root.matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)');

  function chromium() {
    var data = navigator.userAgentData;
    if (data && data.brands) return data.brands.some(function (b) { return /Chromium/.test(b.brand); });
    // iOS Chrome/Edge report CriOS/EdgiOS and run WebKit, so they never match.
    return /Chrome\/\d/.test(navigator.userAgent);
  }
  var capable = !!(root.CSS && CSS.supports('backdrop-filter', 'url(#a)')) && chromium();
  function enabled(el) {
    var force = document.documentElement.getAttribute('data-liquid-design-refraction');
    if (force === 'off' || (el && el.closest('[data-liquid-design-refraction="off"]'))) return false;
    if (!capable || plain.matches) return false;
    // Keep automated snapshots deterministic unless a test opts in.
    return force === 'on' || !navigator.webdriver;
  }
  function svg(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }
  function container() {
    if (host && host.isConnected) return host;
    host = svg('svg', { width: '0', height: '0', 'aria-hidden': 'true', focusable: 'false' });
    host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    document.body.append(host);
    return host;
  }

  // Rim profile, after Apple's approach: the glass is a flat slab whose edge
  // rolls off as a convex squircle, height(x) = (1 - (1 - x)^4)^(1/4), with x
  // running 0 at the rim to 1 where the face goes flat. Light through that
  // surface bends by Snell's law (n = 1.5), so the shift is large right at the
  // rim and eases out to nothing well before the middle, which stays
  // untouched, unlike a dome that bends the whole face.
  var PROFILE_STEPS = 256, PROFILE = (function () {
    var out = new Float32Array(PROFILE_STEPS), n = 1.5, peak = 0, i;
    function height(x) { return Math.pow(1 - Math.pow(1 - x, 4), .25); }
    for (i = 0; i < PROFILE_STEPS; i++) {
      var x = (i + .5) / PROFILE_STEPS, dx = .001;
      var slope = (height(Math.min(1, x + dx)) - height(Math.max(0, x - dx))) / (2 * dx);
      // Incidence angle against the surface normal, then the refracted ray's
      // sideways travel through the remaining glass thickness.
      var incidence = Math.atan(slope), refracted = Math.asin(Math.sin(incidence) / n);
      var shift = Math.tan(incidence - refracted) * height(x);
      out[i] = shift; if (shift > peak) peak = shift;
    }
    for (i = 0; i < PROFILE_STEPS; i++) out[i] /= peak || 1;
    return out;
  })();

  // Signed distance to one rounded rectangle (negative inside).
  function boxDistance(px, py, b) {
    var hw = b.w / 2, hh = b.h / 2, r = Math.min(b.r, hw, hh);
    var qx = Math.abs(px - b.x - hw) - hw + r, qy = Math.abs(py - b.y - hh) - hh + r;
    var ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
  }
  // Union of the shapes; blend > 0 melts neighbouring lobes together with a
  // polynomial smooth-min, matching the engine's blended contours.
  function distance(px, py, boxes, blend) {
    var d = boxDistance(px, py, boxes[0]);
    for (var n = 1; n < boxes.length; n++) {
      var e = boxDistance(px, py, boxes[n]);
      if (blend > 0) { var t = Math.max(blend - Math.abs(d - e), 0) / blend; d = Math.min(d, e) - t * t * blend / 4; }
      else d = Math.min(d, e);
    }
    return d;
  }
  // Any glass shape → inward displacement vectors in R/G. The distance field
  // gives both how deep a pixel sits inside the rim and which way is outward
  // (its gradient), so single pills, button rows and blended menus share one
  // path.
  function field(w, h, boxes, blend, bezel, limit) {
    limit = limit || MAP_MAX;
    var key = w + 'x' + h + 'b' + bezel + 'm' + blend + 'q' + limit + ':' + boxes.map(function (b) { return [b.x, b.y, b.w, b.h, b.r].join(','); }).join(';');
    if (maps.has(key)) { var hit = maps.get(key); maps.delete(key); maps.set(key, hit); return hit; }
    // Full resolution up to MAP_MAX: a downscaled map stair-steps the rim.
    // Moving shapes pass a smaller limit; the settled shape rebuilds sharp.
    var k = Math.min(1, limit / Math.max(w, h));
    var cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
    var sdf = new Float32Array(cw * ch), i, j;
    for (j = 0; j < ch; j++) for (i = 0; i < cw; i++) sdf[j * cw + i] = distance((i + .5) / k, (j + .5) / k, boxes, blend);
    var canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
    var ctx = canvas.getContext('2d'), image = ctx.createImageData(cw, ch), px = image.data;
    for (j = 0; j < ch; j++) {
      for (i = 0; i < cw; i++) {
        var depth = -sdf[j * cw + i], vx = 0, vy = 0;
        if (depth > 0 && depth < bezel) {
          var gx = sdf[j * cw + Math.min(cw - 1, i + 1)] - sdf[j * cw + Math.max(0, i - 1)];
          var gy = sdf[Math.min(ch - 1, j + 1) * cw + i] - sdf[Math.max(0, j - 1) * cw + i];
          var len = Math.sqrt(gx * gx + gy * gy) || 1;
          var m = PROFILE[Math.min(PROFILE_STEPS - 1, Math.floor(depth / bezel * PROFILE_STEPS))];
          // Sample inward: the rim magnifies what sits just inside it.
          vx = -gx / len * m; vy = -gy / len * m;
        }
        var o = (j * cw + i) * 4;
        px[o] = 128 + vx * 127; px[o + 1] = 128 + vy * 127; px[o + 2] = 128; px[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    var url = canvas.toDataURL();
    maps.set(key, url);
    if (maps.size > MAP_LIMIT) maps.delete(maps.keys().next().value);
    return url;
  }
  function map(w, h, r, bezel) { return field(w, h, [{ x: 0, y: 0, w: w, h: h, r: r }], 0, bezel); }

  function attach(material) {
    var id = 'lgr-' + (++serial), filter = null, image = null, displacer = null, key = '', active = false;
    var strength = 1, size = '', scale = '';
    // One displacement pass. The per-channel RGB fringe tripled the filter
    // cost, and Chromium re-rasterizes backdrop filters on every frame.
    function build() {
      filter = svg('filter', { id: id, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse',
        x: '0', y: '0', width: '1', height: '1', 'color-interpolation-filters': 'sRGB' });
      image = svg('feImage', { x: '0', y: '0', width: '1', height: '1', preserveAspectRatio: 'none', result: 'map' });
      displacer = svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G' });
      filter.append(image, displacer);
      container().append(filter);
    }
    var pending = 0, built = 0;
    function off() {
      clearTimeout(pending);
      if (!active) return;
      active = false; size = ''; scale = ''; material.style.removeProperty('backdrop-filter'); material.removeAttribute('data-lgp-refracting'); material.style.removeProperty('--lgp-refraction-map'); key = '';
    }
    function prepare() {
      if (!filter) { build(); key = ''; }
      if (!filter.isConnected) container().append(filter);
    }
    // Strength is read once per resting shape, not on every animation frame.
    function readStrength() {
      var v = parseFloat(getComputedStyle(material).getPropertyValue('--liquid-design-refraction'));
      strength = v >= 0 ? v : 1;
    }
    // A rim band, not the whole face: a bit over a quarter of the short side.
    function bezelFor(bw, bh) { return Math.round(Math.min(26, Math.max(8, Math.min(bw, bh) * .28))); }
    // Attributes are written only when they change: any write invalidates
    // the filter and forces the backdrop to be filtered again.
    function place(w, h, bezel) {
      var nextSize = w.toFixed(1) + 'x' + h.toFixed(1), nextScale = (bezel * 3.6 * strength).toFixed(2);
      if (nextSize !== size) {
        size = nextSize;
        [filter, image].forEach(function (node) { node.setAttribute('width', w.toFixed(1)); node.setAttribute('height', h.toFixed(1)); });
      }
      if (nextScale !== scale) { scale = nextScale; displacer.setAttribute('scale', scale); }
      if (!active) {
        active = true; material.setAttribute('data-lgp-refracting', '');
        // A lens needs a clearer face than frost, or the bending is hidden.
        material.style.setProperty('backdrop-filter', 'blur(var(--liquid-design-refraction-blur, 2px)) url(#' + id + ') ' +
          'saturate(var(--liquid-design-saturate, var(--lgp-saturate))) brightness(var(--lgp-brightness))');
      }
    }
    return {
      // w/h: current painted size; baseW/baseH: resting layout size. The map is
      // keyed on the resting shape and simply stretched while the glass deforms.
      update: function (w, h, rx, ry, baseW, baseH) {
        if (!enabled(material) || !(w > 4 && h > 4)) { off(); return; }
        prepare(); clearTimeout(pending);
        var bw = Math.round(baseW || w), bh = Math.round(baseH || h);
        var r = Math.round(Math.min(Math.min(rx, ry) * (bw / w), bw / 2, bh / 2));
        var bezel = bezelFor(bw, bh), next = bw + 'x' + bh + 'r' + r + 'b' + bezel;
        if (next !== key) {
          readStrength();
          var url = map(bw, bh, r, bezel); image.setAttribute('href', url); key = next;
          // Kept on the material so the debug view can paint the map itself.
          material.style.setProperty('--lgp-refraction-map', 'url("' + url + '")');
        }
        place(w, h, bezel);
      },
      // Compound glass: several rounded boxes in one material (a button row,
      // an expanded menu). Boxes are in material-local px. The map is
      // regenerated only when the rounded shape changes, and at most every
      // 90ms while it is moving; in between the last map simply stretches.
      updateShape: function (w, h, boxes, blend) {
        if (!enabled(material) || !(w > 4 && h > 4) || !boxes.length) { off(); return; }
        prepare();
        var snap = function (v) { return Math.round(v / 2) * 2; };
        var shape = boxes.map(function (b) {
          var r = Math.min(b.rx === undefined ? (b.r || 0) : b.rx, b.ry === undefined ? (b.r || 0) : b.ry, b.w / 2, b.h / 2);
          return { x: snap(b.x), y: snap(b.y), w: snap(b.w), h: snap(b.h), r: snap(r) };
        });
        var short = Math.min.apply(null, shape.map(function (b) { return Math.min(b.w, b.h); }));
        var bezel = bezelFor(short, short), bw = snap(w), bh = snap(h), next = 'c' + bw + 'x' + bh + JSON.stringify(shape) + blend;
        var now = performance.now();
        if (next !== key) {
          clearTimeout(pending);
          var build = function (limit) {
            readStrength();
            var url = field(bw, bh, shape, Math.round(blend), bezel, limit); image.setAttribute('href', url); built = performance.now();
            material.style.setProperty('--lgp-refraction-map', 'url("' + url + '")');
          };
          // A stale map stretched over a moving contour (Tools expanding)
          // bends backdrop where the new lobes are not, which reads as ghost
          // glass ahead of the fill. While the shape moves, rebuild a coarse
          // map every frame so it always matches the clip; once it holds
          // still for 90ms, rebuild it at full resolution.
          if (!key || now - built > 90) build();
          else { build(MOVING_MAP_MAX); pending = setTimeout(function () { build(); }, 90); }
          key = next;
        }
        place(w, h, bezel);
      },
      disable: off,
      destroy: function () { off(); clearTimeout(pending); if (filter) filter.remove(); filter = null; }
    };
  }

  // Debug view: <html data-liquid-design-refraction-debug> (the bundle keeps
  // this module private, so the attribute is the public switch). Paints each lens's map on its
  // glass: red = sideways pull, green = vertical pull, flat grey = no bend.
  function debug(on) {
    document.documentElement.toggleAttribute('data-liquid-design-refraction-debug', on !== false);
  }
  root.LiquidDesignRefraction = { attach: attach, debug: debug, supported: function () { return capable; } };
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  'use strict';
  // Backdrop awareness for glass. Clear glass takes on whatever sits behind
  // it, so a fixed ink or veil can vanish (dark icons over cobalt, a dark
  // disc over black). A few points under each control are sampled from the
  // page itself: solid background colours, plus same-origin images and CSS
  // background images drawn once into a small canvas. The result is two
  // attributes on the glass host, which CSS turns into ink, veil and rim:
  //   data-lgp-backdrop="dark|light"  what is behind the glass
  //   data-lgp-ink="light|dark"       set only when the theme's ink would clash
  var watched = new Map(), images = new Map(), timer = 0, frame = 0, wait = 0, last = 0;
  var IMAGE_MAX = 160, CLUSTER_GAP = 48, MIN_GAP = 120;

  function enabled(el) {
    var force = document.documentElement.getAttribute('data-liquid-design-adapt');
    if (force === 'off' || el.closest('[data-liquid-design-adapt="off"]')) return false;
    return force === 'on' || !navigator.webdriver;
  }
  function parseColor(value) {
    var m = /rgba?\(([^)]+)\)/.exec(value || '');
    if (!m) return null;
    var p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function luma(c) { return (.299 * c.r + .587 * c.g + .114 * c.b) / 255; }

  // Same-origin pixels only; a tainted or failed image is simply skipped.
  function pixels(url) {
    var entry = images.get(url);
    if (entry) return entry.data ? entry : null;
    entry = { data: null }; images.set(url, entry);
    var img = new Image();
    img.onload = function () {
      try {
        var iw = img.naturalWidth || 300, ih = img.naturalHeight || 150, k = Math.min(1, IMAGE_MAX / Math.max(iw, ih));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(iw * k)); canvas.height = Math.max(1, Math.round(ih * k));
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        entry.data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        entry.w = canvas.width; entry.h = canvas.height; entry.iw = iw; entry.ih = ih;
        schedule();
      } catch (e) { /* cross-origin */ }
    };
    img.src = url;
    return null;
  }
  function sameOrigin(url) {
    try { return new URL(url, document.baseURI).origin === location.origin; } catch (e) { return false; }
  }
  // Maps a viewport point into an image drawn with cover/contain/fill sizing
  // and percentage or pixel positioning, as CSS and object-fit lay it out.
  function imageAt(entry, rect, x, y, fit, position) {
    var W = rect.width, H = rect.height, dw = W, dh = H;
    if (fit === 'cover' || fit === 'contain') {
      var s = (fit === 'cover' ? Math.max : Math.min)(W / entry.iw, H / entry.ih);
      dw = entry.iw * s; dh = entry.ih * s;
    } else if (fit === 'auto' || fit === 'none') { dw = entry.iw; dh = entry.ih; }
    var pos = (position || '50% 50%').split(/\s+/), offset = function (token, free) {
      if (/%$/.test(token)) return free * parseFloat(token) / 100;
      return parseFloat(token) || 0;
    };
    var ox = offset(pos[0] || '50%', W - dw), oy = offset(pos[1] || '50%', H - dh);
    var u = (x - rect.left - ox) / dw, v = (y - rect.top - oy) / dh;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    var i = Math.min(entry.w - 1, Math.floor(u * entry.w)), j = Math.min(entry.h - 1, Math.floor(v * entry.h));
    var o = (j * entry.w + i) * 4, a = entry.data[o + 3] / 255;
    return a > .5 ? { r: entry.data[o], g: entry.data[o + 1], b: entry.data[o + 2], a: a } : null;
  }
  function layer(node) {
    return node.closest && node.closest('.lgp-material, .lgp-outline, .lgp-highlights, .lgc-material, .lgc-outline, .lgc-highlights, .lg-color-spills');
  }
  // The first opaque thing beneath (x, y), skipping the glass's own subtree.
  // Same-origin iframes (the persistent shell) are followed into.
  function colorAt(doc, x, y, host) {
    var stack = doc.elementsFromPoint(x, y);
    for (var n = 0; n < stack.length; n++) {
      var node = stack[n];
      if (host && (host === node || host.contains(node))) continue;
      if (layer(node)) continue;
      if (node.tagName === 'IFRAME') {
        try {
          var inner = node.contentDocument, box = node.getBoundingClientRect();
          if (inner && inner.documentElement) { var c = colorAt(inner, x - box.left, y - box.top, null); if (c) return c; }
        } catch (e) { /* cross-origin frame */ }
        continue;
      }
      var view = doc.defaultView, cs = view.getComputedStyle(node), rect = node.getBoundingClientRect();
      if (node.tagName === 'IMG' && node.complete && node.currentSrc && sameOrigin(node.currentSrc)) {
        var picture = pixels(node.currentSrc);
        var hit = picture && imageAt(picture, rect, x, y, cs.objectFit === 'fill' ? 'fill' : cs.objectFit, cs.objectPosition);
        if (hit) return hit;
      }
      var urls = /url\(["']?([^"')]+)["']?\)/.exec(cs.backgroundImage);
      if (urls && sameOrigin(urls[1])) {
        var art = pixels(new URL(urls[1], doc.baseURI).href);
        var size = cs.backgroundSize.split(',')[0].trim();
        var found = art && imageAt(art, rect, x, y, size === 'cover' || size === 'contain' ? size : (size === 'auto' ? 'auto' : 'fill'), cs.backgroundPosition.split(',')[0]);
        if (found) return found;
      }
      var color = parseColor(cs.backgroundColor);
      if (color && color.a >= .5) return color;
    }
    var canvas = parseColor(doc.defaultView.getComputedStyle(doc.body || doc.documentElement).backgroundColor);
    if (canvas && canvas.a >= .5) return canvas;
    canvas = parseColor(doc.defaultView.getComputedStyle(doc.documentElement).backgroundColor);
    return canvas && canvas.a >= .5 ? canvas : { r: 255, g: 255, b: 255, a: 1 };
  }
  // Scrims: fixed or sticky tint layers that ignore the pointer (the home
  // page's top shadow, a modal dimmer). elementsFromPoint never returns them,
  // so they are found by scanning, cached for a moment, and composited over
  // the colour found beneath. Opt a layer in explicitly with
  // data-liquid-design-scrim, or out with data-liquid-design-scrim="off".
  var scrims = [], scrimsAt = -Infinity, SCRIM_TTL = 5000;
  function findScrims() {
    var now = performance.now();
    if (now - scrimsAt < SCRIM_TTL) return scrims;
    scrimsAt = now; scrims = [];
    document.querySelectorAll('body *').forEach(function (n) {
      if (n.closest('[data-lgp-control], [data-lgp-group], [data-lgp-component]')) return;
      var flag = n.getAttribute('data-liquid-design-scrim');
      if (flag === 'off') return;
      var cs = getComputedStyle(n);
      if (flag === null && (cs.pointerEvents !== 'none' || (cs.position !== 'fixed' && cs.position !== 'sticky'))) return;
      var c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) scrims.push(n);
    });
    return scrims;
  }
  // Vertical "linear-gradient(to bottom, ...)" masks, the common shape for a
  // fading bar; anything else counts as fully opaque.
  function maskAlpha(cs, rect, y) {
    var mask = cs.webkitMaskImage || cs.maskImage;
    if (!mask || mask === 'none') return 1;
    // Computed values drop the default direction, so "to bottom" is optional;
    // any other explicit direction falls back to fully opaque.
    var m = /^linear-gradient\((?:(?:to bottom|180deg),)?(.*)\)$/.exec(mask);
    if (!m || /^\s*(to |-?[\d.]+(deg|turn|rad))/.test(m[1])) return 1;
    var stops = [], re = /(transparent|rgba?\([^)]*\)|#[0-9a-f]+|black)\s+([\d.]+)%/gi, hit;
    while ((hit = re.exec(m[1]))) {
      var c = /transparent/i.test(hit[1]) ? 0 : (parseColor(hit[1]) || { a: 1 }).a;
      stops.push([parseFloat(hit[2]) / 100, c]);
    }
    if (!stops.length) return 1;
    var t = (y - rect.top) / (rect.height || 1);
    if (t <= stops[0][0]) return stops[0][1];
    for (var i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) { var a = stops[i - 1], b = stops[i], k = (t - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * k; }
    }
    return stops[stops.length - 1][1];
  }
  function opacity(n) {
    var o = 1;
    for (; n && n !== document.documentElement; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  }
  // Returns the colour with any scrim at (x, y) laid over it, plus how dark
  // the scrim tinting was (0 = none), so a dimmed bar can prefer white ink.
  function overlay(base, x, y) {
    var c = { r: base.r, g: base.g, b: base.b, a: 1 }, dim = 0;
    findScrims().forEach(function (n) {
      var rect = n.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
      var cs = getComputedStyle(n), tint = parseColor(cs.backgroundColor);
      var a = tint.a * maskAlpha(cs, rect, y) * opacity(n);
      if (a <= .01) return;
      c.r += (tint.r - c.r) * a; c.g += (tint.g - c.g) * a; c.b += (tint.b - c.b) * a;
      if (luma(tint) < .3) dim = Math.max(dim, a);
    });
    c.dim = dim;
    return c;
  }
  function tinted(el) {
    var tint = getComputedStyle(el).getPropertyValue('--liquid-design-tint').trim();
    return !!tint && !/^(transparent|none|initial)$/.test(tint) && !/rgba?\([^)]*[,/]\s*0\)$/.test(tint);
  }
  // WCAG relative luminance and contrast, for choosing the ink.
  function channel(v) { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }
  function luminance(c) { return .2126 * channel(c.r) + .7152 * channel(c.g) + .0722 * channel(c.b); }
  function contrast(a, b) { return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }
  var WHITE = 1, INK = luminance({ r: 20, g: 20, b: 19 });

  // Reads a 3x3 grid under the glass. Returns null when it cannot be read.
  function measure(el) {
    if (!el.isConnected || !enabled(el)) return null;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > innerHeight) return null;
    var colors = [];
    [.2, .5, .8].forEach(function (fy) {
      [.2, .5, .8].forEach(function (fx) {
        var x = rect.left + rect.width * fx, y = rect.top + rect.height * fy;
        colors.push(overlay(colorAt(document, x, y, el), x, y));
      });
    });
    return { rect: rect, colors: colors };
  }
  // Neighbouring glass in one strip of chrome (the top bar's back, tools and
  // Labs21 controls) reads as one surface, so it adapts as one: the samples
  // are pooled and every member gets the same ink and rim. Rows are fixed or
  // sticky hosts whose vertical extents overlap; a subtree can also opt in
  // explicitly with data-liquid-design-adapt-group.
  function pinned(el) {
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      var position = getComputedStyle(n).position;
      if (position === 'fixed' || position === 'sticky') return true;
    }
    return false;
  }
  function rows(list) {
    var groups = [], loose = [];
    list.forEach(function (item) {
      var named = item.el.closest('[data-liquid-design-adapt-group]');
      item.key = named ? named.getAttribute('data-liquid-design-adapt-group') || named : null;
      if (item.key) {
        var same = groups.find(function (g) { return g.key === item.key; });
        if (same) same.items.push(item); else groups.push({ key: item.key, items: [item] });
      } else if (pinned(item.el)) loose.push(item);
      else groups.push({ items: [item] });
    });
    // A cluster is controls on the same line that sit close together, so the
    // left share button and the right-hand toolbar adapt independently.
    loose.sort(function (a, b) { return a.m.rect.left - b.m.rect.left; });
    loose.forEach(function (item) {
      var r = item.m.rect, row = groups.find(function (g) {
        return g.row && r.top < g.bottom && r.bottom > g.top && r.left - g.right < CLUSTER_GAP;
      });
      if (row) { row.items.push(item); row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom); row.right = Math.max(row.right, r.right); }
      else groups.push({ row: true, top: r.top, bottom: r.bottom, right: r.right, items: [item] });
    });
    return groups;
  }
  // The ink with the better worst case wins. Any dark band behind the row
  // (a shadow, the top of an illustration) drags dark ink's worst case down,
  // so the whole row turns white, as Apple's chrome does. Hysteresis: the
  // challenger must beat the current ink by 15% before anything flips.
  function decide(colors, previous) {
    var lightWorst = Infinity, darkWorst = Infinity, dim = 0;
    colors.forEach(function (c) {
      dim = Math.max(dim, c.dim || 0);
      var L = luminance(c);
      lightWorst = Math.min(lightWorst, contrast(WHITE, L));
      darkWorst = Math.min(darkWorst, contrast(INK, L));
    });
    // A dark scrim over the row (the top shadow fading in) is the page saying
    // "this bar is dimmed": the whole cluster goes white, even over the
    // lighter patches the worst-case contrast would otherwise favour.
    if (dim > .1) return 'light';
    if (previous === 'dark') return lightWorst > darkWorst * 1.15 ? 'light' : 'dark';
    if (previous === 'light') return darkWorst > lightWorst * 1.15 ? 'dark' : 'light';
    return lightWorst >= darkWorst ? 'light' : 'dark';
  }
  function apply(el, state, colors, ink) {
    // The first reading lands instantly so glass never fades in from the
    // wrong shade on load; every later change crossfades in CSS.
    if (!state.tone) el.style.setProperty('--lgp-adapt-duration', '0ms');
    else if (state.first) { el.style.removeProperty('--lgp-adapt-duration'); state.first = false; }
    // The glass shade still follows the average colour behind each control,
    // so it reads as a piece of that surface rather than a fixed grey disc.
    var r = 0, g = 0, b = 0, total = 0;
    colors.forEach(function (c) { r += c.r; g += c.g; b += c.b; total += luma(c); });
    var n = colors.length, shade = 'rgb(' + Math.round(r / n) + ' ' + Math.round(g / n) + ' ' + Math.round(b / n) + ')';
    if (el.style.getPropertyValue('--lgp-backdrop-color') !== shade) el.style.setProperty('--lgp-backdrop-color', shade);
    var lum = (total / n).toFixed(3);
    if (el.style.getPropertyValue('--lgp-backdrop-luma') !== lum) el.style.setProperty('--lgp-backdrop-luma', lum);
    // White ink means a dark backdrop, and the rim/contour follow it, so the
    // outline treatment always agrees with the label.
    var tone = ink === 'light' ? 'dark' : 'light';
    state.tone = tone; state.ink = ink;
    if (el.getAttribute('data-lgp-backdrop') !== tone) el.setAttribute('data-lgp-backdrop', tone);
    var themed = el.closest('[data-lgp-theme]');
    var theme = themed ? themed.getAttribute('data-lgp-theme') : 'light';
    // Tinted glass keeps its own label colour; otherwise the attribute is set
    // only when the chosen ink differs from the theme's own.
    var flip = tinted(el) ? '' : (theme === 'dark') === (ink === 'light') ? '' : ink;
    if (flip) { if (el.getAttribute('data-lgp-ink') !== flip) el.setAttribute('data-lgp-ink', flip); }
    else if (el.hasAttribute('data-lgp-ink')) el.removeAttribute('data-lgp-ink');
  }
  function clear(el, state) {
    state.tone = ''; state.ink = ''; state.first = true;
    el.style.removeProperty('--lgp-adapt-duration');
    el.removeAttribute('data-lgp-backdrop'); el.removeAttribute('data-lgp-ink');
    el.style.removeProperty('--lgp-backdrop-luma');
    el.style.removeProperty('--lgp-backdrop-color');
  }
  function run() {
    frame = 0; last = performance.now();
    var list = [];
    watched.forEach(function (state, el) {
      if (!el.isConnected || !enabled(el)) { clear(el, state); return; }
      var m = measure(el);
      if (m) list.push({ el: el, state: state, m: m });
    });
    rows(list).forEach(function (group) {
      var pooled = [], previous = '';
      group.items.forEach(function (item) { pooled = pooled.concat(item.m.colors); previous = previous || item.state.ink; });
      var ink = decide(pooled, previous);
      group.items.forEach(function (item) { apply(item.el, item.state, item.m.colors, ink); });
    });
  }
  // Sampling reads layout (elementsFromPoint, computed styles), so it runs at
  // most every MIN_GAP ms: a scroll settles within a beat instead of
  // sampling on every frame.
  function schedule() {
    if (frame || wait) return;
    var delay = MIN_GAP - (performance.now() - last);
    if (delay <= 0) frame = root.requestAnimationFrame(run);
    else wait = setTimeout(function () { wait = 0; frame = root.requestAnimationFrame(run); }, delay);
  }
  // A discrete change (theme toggle, page class swap) skips the throttle and
  // samples on the next frame, so the glass reacts at once.
  function now() {
    if (frame) return;
    if (wait) { clearTimeout(wait); wait = 0; }
    frame = root.requestAnimationFrame(run);
  }
  function rescan() { scrimsAt = -Infinity; now(); }
  // Transitions of page colours: sample as they start and when they end,
  // ignoring the glass's own transitions.
  function onTransition(e) {
    var t = e.target;
    if (t && t.closest && t.closest('[data-lgp-control], [data-lgp-group], [data-lgp-component]')) return;
    now();
  }
  var observer = null;
  function start() {
    root.addEventListener('scroll', schedule, { capture: true, passive: true });
    root.addEventListener('resize', rescan);
    root.addEventListener('transitionrun', onTransition, true);
    root.addEventListener('transitionend', onTransition, true);
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(rescan);
      // No 'style': pages animate inline styles on <html> per frame.
      var opts = { attributes: true, attributeFilter: ['class', 'data-theme', 'data-liquid-design-theme'] };
      observer.observe(document.documentElement, opts);
      if (document.body) observer.observe(document.body, opts);
    }
    // Content can change beneath fixed glass without any event here (an
    // iframe scrolling, a carousel); a slow poll keeps the reading honest.
    timer = setInterval(function () { if (!document.hidden) schedule(); }, 1500);
  }
  function stop() {
    root.removeEventListener('scroll', schedule, { capture: true });
    root.removeEventListener('resize', rescan);
    root.removeEventListener('transitionrun', onTransition, true);
    root.removeEventListener('transitionend', onTransition, true);
    if (observer) { observer.disconnect(); observer = null; }
    clearInterval(timer); timer = 0; clearTimeout(wait); wait = 0;
  }
  function watch(el) {
    if (!watched.size) start();
    var state = { tone: '', ink: '', first: true }; watched.set(el, state); schedule();
    return {
      refresh: schedule,
      destroy: function () {
        if (!watched.has(el)) return;
        watched.delete(el); clear(el, state);
        if (!watched.size) stop();
      }
    };
  }
  root.LiquidDesignBackdrop = { watch: watch, refresh: schedule };
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  'use strict';
  var instances = new Map();
  var serial = 0;
  var glyphSerial = 0;
  var NS = 'http://www.w3.org/2000/svg';
  function svg(name, attrs) {
    var el = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, attrs[key]); });
    return el;
  }
  function groups(scope) {
    var list = Array.from(scope.querySelectorAll('[data-liquid-cluster]'));
    if (scope.matches && scope.matches('[data-liquid-cluster]')) list.unshift(scope);
    return list;
  }
  // Keep SVG glyph defocus in SVG's own paint pipeline. Filtering an HTML
  // wrapper containing SVGs creates a separate compositor backing store. The
  // iPad recording's magenta seams coincide with that wrapper blur path.
  root.LiquidDesignGlyphBlur = function (content, amount, channel) {
    if (!content) return;
    var key = channel === 'morph' ? '_lgcMorphBlur' : channel === 'occlusion' ? '_lgcOcclusionBlur' : '_lgcSplitBlur';
    content[key] = Math.max(0, amount);
    var blur = Math.max(content._lgcMorphBlur || 0, content._lgcSplitBlur || 0, content._lgcOcclusionBlur || 0);
    content.querySelectorAll('svg').forEach(function (icon) {
      var effect = icon._lgcGlyphBlur;
      if (!effect && blur > .01) {
        var id = 'lgc-glyph-' + (++glyphSerial);
        var defs = svg('defs');
        var filter = svg('filter', { id: id, x: '-75%', y: '-75%', width: '250%', height: '250%', 'color-interpolation-filters': 'sRGB' });
        var gaussian = svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '0' });
        var ink = svg('g');
        Array.from(icon.children).forEach(function (node) { if (!node.matches('defs,title,desc')) ink.append(node); });
        filter.append(gaussian); defs.append(filter); icon.append(defs, ink);
        effect = icon._lgcGlyphBlur = { defs: defs, ink: ink, gaussian: gaussian, id: id };
      }
      if (!effect) return;
      effect.gaussian.setAttribute('stdDeviation', blur.toFixed(3));
      if (blur > .01) effect.ink.setAttribute('filter', 'url(#' + effect.id + ')');
      else effect.ink.removeAttribute('filter');
    });
  };
  function clearGlyphBlur(content) {
    content.querySelectorAll('svg').forEach(function (icon) {
      var effect = icon._lgcGlyphBlur;
      if (!effect) return;
      while (effect.ink.firstChild) icon.insertBefore(effect.ink.firstChild, effect.ink);
      effect.ink.remove(); effect.defs.remove(); delete icon._lgcGlyphBlur;
    });
    delete content._lgcMorphBlur; delete content._lgcSplitBlur; delete content._lgcOcclusionBlur;
  }
  function pill(b) {
    var x = b.x, y = b.y, w = b.w, h = b.h, r = b.r === undefined ? Math.min(w, h) / 2 : Math.min(b.r, w / 2, h / 2);
    var rx = Math.min(b.rx === undefined ? r : b.rx, w / 2);
    var ry = Math.min(b.ry === undefined ? r : b.ry, h / 2);
    if (b.tail) {
      var direction = b.tail > 0 ? 1 : -1, tail = Math.abs(b.tail);
      function p(px, py) { return px + ',' + (direction > 0 ? py : 2 * y + h - py); }
      var cx = x + w / 2;
      return 'M' + p(x + r, y) + 'L' + p(x + w - r, y) +
        'Q' + p(x + w, y) + ' ' + p(x + w, y + r) +
        'L' + p(x + w, y + h - r) +
        'C' + p(x + w, y + h) + ' ' + p(cx + w * .22, y + h) + ' ' + p(cx + w * .16, y + h + tail * .68) +
        'C' + p(cx + w * .10, y + h + tail) + ' ' + p(cx - w * .10, y + h + tail) + ' ' + p(cx - w * .16, y + h + tail * .68) +
        'C' + p(cx - w * .22, y + h) + ' ' + p(x, y + h) + ' ' + p(x, y + h - r) +
        'L' + p(x, y + r) + 'Q' + p(x, y) + ' ' + p(x + r, y) + 'Z';
    }
    return 'M' + (x + rx) + ',' + y + 'H' + (x + w - rx) + 'A' + rx + ',' + ry + ' 0 0 1 ' + (x + w) + ',' + (y + ry) +
      'V' + (y + h - ry) + 'A' + rx + ',' + ry + ' 0 0 1 ' + (x + w - rx) + ',' + (y + h) + 'H' + (x + rx) +
      'A' + rx + ',' + ry + ' 0 0 1 ' + x + ',' + (y + h - ry) + 'V' + (y + ry) + 'A' + rx + ',' + ry + ' 0 0 1 ' + (x + rx) + ',' + y + 'Z';
  }
  function create(group) {
    var id = 'lgc-' + (++serial);
    var material = document.createElement('div');
    material.className = 'lgc-material';
    material.setAttribute('aria-hidden', 'true');
    var drawing = svg('svg', { class: 'lgc-outline', 'aria-hidden': 'true' });
    var defs = svg('defs');
    var clip = svg('clipPath', { id: id + '-clip', clipPathUnits: 'userSpaceOnUse' });
    var shape = svg('path', { 'fill-rule': 'nonzero', 'clip-rule': 'nonzero' });
    clip.append(shape);
    var filter = svg('filter', { id: id + '-rim', x: '-5%', y: '-5%', width: '110%', height: '110%' });
    filter.append(svg('feMorphology', { in: 'SourceAlpha', operator: 'erode', radius: '.65', result: 'inside' }));
    filter.append(svg('feComposite', { in: 'SourceGraphic', in2: 'inside', operator: 'out' }));
    var gradient = svg('linearGradient', { id: id + '-light', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    [['0%', '.48'], ['12%', '.20'], ['40%', '.035'], ['62%', '.025'], ['88%', '.12'], ['100%', '.30']].forEach(function (s) {
      gradient.append(svg('stop', { offset: s[0], 'stop-color': '#ffffff', 'stop-opacity': s[1] }));
    });
    var edgeMask = svg('mask', { id: id + '-edge', maskUnits: 'userSpaceOnUse', 'mask-type': 'alpha' });
    var edgeShape = svg('path', { fill: 'white', filter: 'url(#' + id + '-rim)' });
    edgeMask.append(edgeShape);
    function outerBand(name, innerRadius, outerRadius) {
      var bandFilter = svg('filter', { id: id + '-' + name, x: '-10%', y: '-10%', width: '120%', height: '120%' });
      bandFilter.append(svg('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: outerRadius, result: 'outer' }));
      bandFilter.append(svg('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: innerRadius, result: 'inner' }));
      bandFilter.append(svg('feComposite', { in: 'outer', in2: 'inner', operator: 'out' }));
      var mask = svg('mask', { id: id + '-' + name + '-mask', maskUnits: 'userSpaceOnUse', 'mask-type': 'alpha' });
      var path = svg('path', { fill: 'white', filter: 'url(#' + id + '-' + name + ')' });
      mask.append(path);
      var surface = svg('rect', { class: 'lgc-' + name, mask: 'url(#' + id + '-' + name + '-mask)' });
      defs.append(bandFilter, mask);
      return { path: path, mask: mask, surface: surface };
    }
    var darkOuter = outerBand('outer-dark', 0, '.35');
    var brightOuter = outerBand('outer-bright', '.35', '.8');
    defs.append(clip, filter, gradient, edgeMask);
    var rim = svg('path', { class: 'lgc-rim', fill: 'url(#' + id + '-light)', mask: 'url(#' + id + '-edge)' });
    var triggerLight = svg('linearGradient', { id: id + '-trigger-light', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    [['0%', '.24'], ['25%', '0'], ['100%', '0']].forEach(function (s) {
      var stop = svg('stop', { offset: s[0], 'stop-color': 'white', 'stop-opacity': s[1] });
      stop.style.stopOpacity = s[1]; triggerLight.append(stop);
    });
    defs.append(triggerLight);
    var triggerRim = svg('path', { class: 'lgc-tools-trigger-rim', fill: 'none', stroke: 'url(#' + id + '-trigger-light)' });
    var toolsRims = [triggerRim];
    var border = svg('path', { class: 'lgc-border', mask: 'url(#' + id + '-edge)' });
    var contrastRim = svg('path', { class: 'lgc-contrast-rim', fill: 'none', 'stroke-width': '1.2' });
    var prismGradient = svg('linearGradient', { id: id + '-prism', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    [['0%', '#bda9f5', '.8'], ['22%', '#749fe0', '.65'], ['45%', '#ceb5f0', '.05'], ['72%', '#9684e1', '.55'], ['100%', '#b8d1ff', '.8']].forEach(function (s) {
      prismGradient.append(svg('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] }));
    });
    var prism = svg('path', { class: 'lgc-prism-rim', fill: 'none', stroke: 'url(#' + id + '-prism)', 'stroke-width': '1.8' });
    defs.append(prismGradient);
    drawing.append(defs, darkOuter.surface, brightOuter.surface, border, contrastRim, prism, rim);
    drawing.append(triggerRim);
    material.style.clipPath = 'url(#' + id + '-clip)';
    var lights = document.createElement('div');
    lights.className = 'lgc-lights';
    var highlights = document.createElement('span'); highlights.className = 'lgc-highlights'; highlights.setAttribute('aria-hidden', 'true');
    highlights.style.clipPath = material.style.clipPath;
    highlights.append(lights);
    if (group.classList.contains('lgd-chat-cluster')) {
      var glint = document.createElement('span');
      glint.className = 'lgc-generation-glint';
      var glintLane = document.createElement('span');
      glintLane.className = 'lgc-generation-lane';
      glintLane.append(glint); material.append(glintLane);
    }
    group.prepend(material, drawing, highlights);
    var colors = root.LiquidDesignColors && root.LiquidDesignColors.create(group, material, drawing);
    var refraction = root.LiquidDesignRefraction ? root.LiquidDesignRefraction.attach(material) : null;
    var backdrop = root.LiquidDesignBackdrop ? root.LiquidDesignBackdrop.watch(group) : null;
    var records = new Map();
    var cleanups = [];
    var frame = 0;
    var until = 0;
    var disposed = false;
    var animations = [];
    var ghosts = [];
    var menuPaint = null;
    var toolsPaint = null;
    var searchPaint = null;
    var unionKey = '', unionOutline = null;
    // Each arrival/rebound eases to a turning point instead of linearly
    // interpolating a densely sampled spring curve.
    var bounceStops = [
      { t: 0, p: 0 }, { t: .42, p: 1.12 },
      { t: .65, p: .955 }, { t: .82, p: 1.018 },
      { t: .93, p: .994 }, { t: 1, p: 1 },
    ];
    var bounceEase = 'cubic-bezier(0.4, 0, 0.2, 1)';
    function bounce(t) {
      if (t >= 1) return 1;
      for (var i = 1; i < bounceStops.length; i++) {
        var a = bounceStops[i - 1], b = bounceStops[i];
        if (t <= b.t) {
          var u = Math.max(0, (t - a.t) / (b.t - a.t));
          // Quintic ease-in-out has zero velocity and acceleration at both ends.
          var eased = u * u * u * (u * (u * 6 - 15) + 10);
          return a.p + (b.p - a.p) * eased;
        }
      }
      return 1;
    }
    function flights(from, to, exit) {
      var frames = [];
      bounceStops.forEach(function (stop) {
        var t = stop.t, p = stop.p;
        var dx = from.left + from.width / 2 - to.left - to.width / 2;
        var dy = from.top + from.height / 2 - to.top - to.height / 2;
        var sx = from.width / to.width, sy = from.height / to.height;
        var q = exit ? p : 1 - p;
        frames.push({ offset: t, easing: bounceEase, transform: 'translate(' + dx * q + 'px,' + dy * q + 'px) scale(' + Math.max(.15, 1 + (sx - 1) * q) + ',' + Math.max(.15, 1 + (sy - 1) * q) + ')', opacity: exit ? Math.max(0, 1 - t * 1.4) : 1 });
      });
      return frames;
    }
    function listen(el, type, callback) {
      el.addEventListener(type, callback);
      cleanups.push(function () { el.removeEventListener(type, callback); });
    }
    function visible(el) { return !el.closest('[hidden], [inert]') && el.getBoundingClientRect().width > 0; }
    function activation(el, callback) {
      var pointer = null, x = 0, y = 0, moved = false, cancelled = false;
      function track(e) {
        if (e.pointerId === pointer && Math.hypot(e.clientX - x, e.clientY - y) > 2) moved = true;
      }
      listen(el, 'pointerdown', function (e) {
        if (e.button !== 0 || pointer !== null) return;
        pointer = e.pointerId; x = e.clientX; y = e.clientY;
        moved = false; cancelled = false;
      });
      listen(el, 'pointermove', track);
      listen(el, 'pointerup', function (e) {
        if (e.pointerId !== pointer) return;
        track(e); cancelled = moved; pointer = null;
      });
      listen(el, 'pointercancel', function (e) {
        if (e.pointerId !== pointer) return;
        pointer = null; cancelled = true;
      });
      listen(el, 'click', function (e) {
        if (e.detail !== 0 && cancelled) { cancelled = false; return; }
        callback(e);
      });
    }
    function paint() {
      if (disposed) return;
      var rect = group.getBoundingClientRect();
      var boxes = [];
      // Read native hitboxes before writing any foreground transforms. Tools
      // reuse this snapshot for their flights and occlusion instead of forcing
      // layout again for every lobe (including hidden shell placeholders).
      var measurements = new Map();
      records.forEach(function (record, el) {
        if (el.closest('[hidden]') || (!toolsPaint && el.closest('[inert]'))) return;
        var bounds = el.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        measurements.set(el, { bounds: bounds, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) });
      });
      var dark = document.documentElement.classList.contains('dark');
      var stops = gradient.querySelectorAll('stop');
       var pluginMaterial = group.hasAttribute('data-lgp-component');
       (pluginMaterial ? [.275, .125, .015, .01, .05, .15] : [.12, .05, .006, .004, .0175, .06]).forEach(function (v, i) { stops[i].setAttribute('stop-opacity', v); });
       if (pluginMaterial) filter.querySelector('feMorphology').setAttribute('radius', String(parseFloat(getComputedStyle(group).getPropertyValue('--lgp-edge-width')) || 1.25));
      records.forEach(function (record, el) {
        var measured = measurements.get(el);
        if (!measured) { record.glow.style.opacity = 0; return; }
        var r = measured.bounds;
        var f = record.state;
        if (f && (!f.geometry.slabHalfWidth || !f.geometry.slabHalfHeight)) f = null;
        var x = r.left - rect.left, y = r.top - rect.top, w = r.width, h = r.height;
        var dx = 0, dy = 0, sx = 1, sy = 1;
        if (f) {
          dx = f.bounds.centerX - f.geometry.slabCenterX;
          dy = f.bounds.centerY - f.geometry.slabCenterY;
          sx = f.bounds.halfWidth / f.geometry.slabHalfWidth;
          sy = f.bounds.halfHeight / f.geometry.slabHalfHeight;
        }
        record.content.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
        var b = { x: x + w / 2 + dx - w * sx / 2, y: y + h / 2 + dy - h * sy / 2, w: w * sx, h: h * sy };
        {
          var glowDiameter = 184 * Math.sqrt(b.w * b.h) / 52;
          record.glow.style.width = glowDiameter + 'px'; record.glow.style.height = glowDiameter + 'px';
        }
        var declaredRadius = measured.radius;
        var restingRadius = Math.min(Number.isFinite(declaredRadius) ? declaredRadius : Math.min(w, h) / 2, w / 2, h / 2);
        b.rx = restingRadius * sx; b.ry = restingRadius * sy;
        if (pluginMaterial) {
          var gx = rect.width / 2 + (f ? f.lightPoint.x : 0), gy = rect.height / 2 + (f ? f.lightPoint.y : 0);
          record.glow.style.clipPath = 'path("' + pill({ x: b.x - gx + glowDiameter / 2,
            y: b.y - gy + glowDiameter / 2, w: b.w, h: b.h, rx: b.rx, ry: b.ry }) + '")';
          record.glow.style.zIndex = el.hasAttribute('data-lgp-front') ? '2' : '1';
        }
        boxes.push(b);
        record.glow.style.left = (rect.width / 2 + (f ? f.lightPoint.x : 0)) + 'px';
        record.glow.style.top = (rect.height / 2 + (f ? f.lightPoint.y : 0)) + 'px';
        record.glow.style.opacity = f ? f.touch : 0;
        if (pluginMaterial) {
          var inset = Math.min(b.w,b.h)*.25;
          var lx = Math.max(b.x+inset,Math.min(b.x+b.w-inset,rect.width/2+(f?f.lightPoint.x:0)));
          var ly = Math.max(b.y+inset,Math.min(b.y+b.h-inset,rect.height/2+(f?f.lightPoint.y:0)));
          record.glow.style.left=lx+'px'; record.glow.style.top=ly+'px';
          record.glow.style.clipPath='path("'+pill({x:b.x-lx+glowDiameter/2,y:b.y-ly+glowDiameter/2,w:b.w,h:b.h,rx:b.rx,ry:b.ry})+'")';
        }
       });
       // Compound menu sources (such as the chat corner pill) use one shared
       // motion solver. Their material already spans the full source group,
       // so the touch light must use that same full-group geometry rather than
       // the 44px button that happened to receive the pointer.
       var compoundSourceGroup = group.querySelector('[data-liquid-menu-source-group]');
       var compoundState = group._liquidCompoundSourceState;
       if (pluginMaterial && compoundSourceGroup && compoundState && compoundState.geometry &&
           compoundState.geometry.slabHalfWidth && compoundState.geometry.slabHalfHeight) {
         group.querySelectorAll('[data-liquid-menu-source]').forEach(function (el) {
           var sourceRecord = records.get(el);
           if (sourceRecord) sourceRecord.glow.style.opacity = '0';
         });
         var compoundRecord = records.get(group.querySelector('[data-liquid-menu-source]'));
         if (compoundRecord) {
           var sourceRect = compoundSourceGroup.getBoundingClientRect();
           var sourceX = sourceRect.left - rect.left;
           var sourceY = sourceRect.top - rect.top;
           var sourceW = sourceRect.width;
           var sourceH = sourceRect.height;
           var sourceDx = compoundState.bounds.centerX - compoundState.geometry.slabCenterX;
           var sourceDy = compoundState.bounds.centerY - compoundState.geometry.slabCenterY;
           var sourceSx = compoundState.bounds.halfWidth / compoundState.geometry.slabHalfWidth;
           var sourceSy = compoundState.bounds.halfHeight / compoundState.geometry.slabHalfHeight;
           var compoundBox = {
             x: sourceX + sourceW / 2 + sourceDx - sourceW * sourceSx / 2,
             y: sourceY + sourceH / 2 + sourceDy - sourceH * sourceSy / 2,
             w: sourceW * sourceSx,
             h: sourceH * sourceSy,
           };
           var compoundRadius = Math.min(sourceW, sourceH) / 2;
           compoundBox.rx = compoundRadius * sourceSx;
           compoundBox.ry = compoundRadius * sourceSy;
           var compoundGlowDiameter = 184 * Math.sqrt(compoundBox.w * compoundBox.h) / 52;
           var compoundGx = rect.width / 2 + compoundState.lightPoint.x;
           var compoundGy = rect.height / 2 + compoundState.lightPoint.y;
           var compoundInset = Math.min(compoundBox.w, compoundBox.h) * .25;
           var compoundLx = Math.max(compoundBox.x + compoundInset,
             Math.min(compoundBox.x + compoundBox.w - compoundInset, compoundGx));
           var compoundLy = Math.max(compoundBox.y + compoundInset,
             Math.min(compoundBox.y + compoundBox.h - compoundInset, compoundGy));
           compoundRecord.glow.style.width = compoundGlowDiameter + 'px';
           compoundRecord.glow.style.height = compoundGlowDiameter + 'px';
           compoundRecord.glow.style.left = compoundLx + 'px';
           compoundRecord.glow.style.top = compoundLy + 'px';
           compoundRecord.glow.style.clipPath = 'path("' + pill({
             x: compoundBox.x - compoundLx + compoundGlowDiameter / 2,
             y: compoundBox.y - compoundLy + compoundGlowDiameter / 2,
             w: compoundBox.w,
             h: compoundBox.h,
             rx: compoundBox.rx,
             ry: compoundBox.ry,
           }) + '")';
           compoundRecord.glow.style.zIndex = '2';
           compoundRecord.glow.style.opacity = compoundState.touch;
         }
       }
       ghosts.forEach(function (ghost) {
        var r = ghost.getBoundingClientRect();
        boxes.push({ x: r.left - rect.left, y: r.top - rect.top, w: r.width, h: r.height });
      });
      if (menuPaint) boxes = menuPaint(boxes, rect);
      if (toolsPaint) boxes = toolsPaint(boxes, rect, measurements);
       if (searchPaint) boxes = searchPaint(boxes, rect);
       if (pluginMaterial) boxes.forEach(function (b) {
         ['x','y','w','h','r','rx','ry'].forEach(function (key) {
           if (b[key] !== undefined) b[key] = root.LiquidDesignPluginSnap(b[key]);
         });
       });
       if (pluginMaterial && toolsPaint) {
         var foreground = [], index = 0;
         records.forEach(function (record, el) {
            if (!measurements.has(el)) return;
           var b = boxes[index++]; if (!b) return;
           foreground.push({ content: record.content, touch: record.state ? record.state.touch : 0,
             box: { x: rect.left + b.x, y: rect.top + b.y, w: b.w, h: b.h, rx: b.rx, ry: b.ry } });
         });
         root.LiquidDesignPluginOcclusion(group, foreground);
       }
      boxes = boxes.map(function (b) {
        if (!b.tail) return b;
        var originalY = b.y;
        var tail = b.tail;
        return Object.assign({}, b, { y: originalY + Math.min(0, tail), h: b.h + Math.abs(tail),
          tail: tail, silhouetteY: originalY, silhouetteH: b.h });
      });
       var blendRange = pluginMaterial ? 4 : (toolsPaint || searchPaint ? 5 : 22);
      // Blended shoulders can extend beyond either individual lobe. Include
      // that optical footprint in both the native backdrop and perimeter SVG.
      var blendPad = boxes.length > 1 ? blendRange : 0;
      var minX = boxes.length ? Math.min.apply(null, boxes.map(function (b) { return b.x; })) - blendPad : 0;
      var minY = boxes.length ? Math.min.apply(null, boxes.map(function (b) { return b.y; })) - blendPad : 0;
      var width = boxes.length ? Math.max.apply(null, boxes.map(function (b) { return b.x + b.w; })) - minX + blendPad : 1;
      var height = boxes.length ? Math.max.apply(null, boxes.map(function (b) { return b.y + b.h; })) - minY + blendPad : 1;
      boxes = boxes.map(function (b) {
        return { x: b.x - minX, y: (b.silhouetteY === undefined ? b.y : b.silhouetteY) - minY,
          w: b.w, h: b.silhouetteH === undefined ? b.h : b.silhouetteH, r: b.r, rx: b.rx, ry: b.ry, tail: b.tail };
      });
      [material, drawing, highlights].forEach(function (el) {
        el.style.left = minX + 'px'; el.style.top = minY + 'px';
        el.style.width = width + 'px'; el.style.height = height + 'px';
      });
      // A lone rounded lobe (collapsed share/back/menu triggers) gets the CSS
      // edge ring and lens refraction; blended or tailed contours keep the
      // SVG path rim.
      var lone = boxes.length === 1 && !boxes[0].tail && (boxes[0].rx || boxes[0].r) ? boxes[0] : null;
      var loneRx = lone ? (lone.rx || lone.r) : 0, loneRy = lone ? (lone.ry || lone.r || loneRx) : 0;
      material.toggleAttribute('data-lgp-lens', !!lone);
      if (lone) material.style.borderRadius = loneRx + 'px / ' + loneRy + 'px';
      else material.style.removeProperty('border-radius');
      lights.style.transform = 'translate(' + -minX + 'px,' + -minY + 'px)';
       var individualOutline = boxes.map(pill).join(' ');
       var d = individualOutline, count = 0;
      if (boxes.length > 1) {
        var key = blendRange + ':' + JSON.stringify(boxes);
        if (key !== unionKey) {
           unionOutline = pluginMaterial ? root.LiquidDesignPluginContours(boxes, blendRange, pill) : root.LiquidDesignUnion.outline(boxes, blendRange);
          unionKey = key;
        }
        count = unionOutline.connections;
        if (count) d = unionOutline.path;
      }
      if (refraction) {
        // Tailed lobes (speech-bubble pointers) have no rounded-box field yet.
        if (lone) refraction.update(width, height, loneRx, loneRy);
        else if (boxes.length && !boxes.some(function (b) { return b.tail; })) refraction.updateShape(width, height, boxes, count ? blendRange : 0);
        else refraction.disable();
      }
      shape.setAttribute('d', d);
      // HTML backdrop layers must own their clip locally. SVG fragment clips
      // can disappear across WebKit compositor layers during split/rejoin.
      material.style.clipPath = 'path("' + d + '")';
      highlights.style.clipPath = 'path("' + d + '")';
      // Chromium does not fully contain a backdrop-filter inside a compound
      // clip-path: the filtered backdrop of a multi-lobe contour leaks past the
      // necks and the far end while Tools expands, reading as a ghost outline
      // ahead of the glass. A matching alpha mask contains it exactly. Lone
      // lobes use border-radius and need no mask.
      var maskKey = lone ? '' : width + 'x' + height + ':' + d;
      if (maskKey !== material._lgcMaskKey) {
        material._lgcMaskKey = maskKey;
        var maskImage = lone ? '' : 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
          '" viewBox="0 0 ' + width + ' ' + height + '"><path d="' + d + '"/></svg>') + '")';
        ['maskImage', 'webkitMaskImage'].forEach(function (name) { material.style[name] = maskImage; });
        ['maskSize', 'webkitMaskSize'].forEach(function (name) { material.style[name] = lone ? '' : '100% 100%'; });
        ['maskRepeat', 'webkitMaskRepeat'].forEach(function (name) { material.style[name] = lone ? '' : 'no-repeat'; });
      }
       rim.setAttribute('d', d);
        // Each expanded lobe references its own contour bounds so the actions
        // and trigger carry the same local top reflection while deforming.
        var reflectTools = pluginMaterial && toolsPaint && group.closest('#glass-shell-chrome') && group.dataset.lgpTheme === 'dark' && group.dataset.expanded === 'true';
        if (reflectTools) while (toolsRims.length < boxes.length) {
          var reflection = triggerRim.cloneNode(false); drawing.append(reflection); toolsRims.push(reflection);
        }
        toolsRims.forEach(function (reflection, index) { reflection.setAttribute('d', reflectTools && boxes[index] ? pill(boxes[index]) : ''); });
       if (pluginMaterial) {
         rim.removeAttribute('mask'); rim.setAttribute('fill', 'none');
         rim.setAttribute('stroke', 'url(#' + id + '-light)'); rim.setAttribute('stroke-width', '1.1');
       }
      border.setAttribute('d', d);
      contrastRim.setAttribute('d', d);
      prism.setAttribute('d', d);
      var energy = 0, angle = 0;
      records.forEach(function (record) {
        var state = record.state;
        if (!state || !state.geometry.slabHalfWidth || !state.geometry.slabHalfHeight) return;
        var stretch = Math.abs(state.bounds.halfWidth / state.geometry.slabHalfWidth - 1) + Math.abs(state.bounds.halfHeight / state.geometry.slabHalfHeight - 1);
        var response = Math.min(1, Math.max(0, state.touch) + stretch * 2);
        if (response >= energy) { energy = response; angle = Math.atan2(state.lightPoint.y, state.lightPoint.x) * 180 / Math.PI; }
      });
      prism.style.opacity = 'calc(var(--liquid-design-prism-opacity, var(--lgp-prism-opacity, 0)) * ' + (.45 + energy * .55) + ')';
      prismGradient.setAttribute('gradientTransform', 'rotate(' + (angle * energy * .2) + ' .5 .5)');
       edgeShape.setAttribute('d', d);
      [darkOuter, brightOuter].forEach(function (band) {
        band.path.setAttribute('d', d);
        [band.mask, band.surface].forEach(function (el) {
          el.setAttribute('x', '-3'); el.setAttribute('y', '-3');
          el.setAttribute('width', width + 6); el.setAttribute('height', height + 6);
        });
      });
      edgeMask.setAttribute('x', '-2'); edgeMask.setAttribute('y', '-2');
      edgeMask.setAttribute('width', width + 4); edgeMask.setAttribute('height', height + 4);
       drawing.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
       if (pluginMaterial) drawing.setAttribute('preserveAspectRatio', 'none');
      material.dataset.connections = count;
      material.dataset.surfaces = boxes.length;
      if (colors) colors.paint(boxes, d);
    }
    function watch() {
      frame = 0;
      paint();
      if (performance.now() < until) frame = requestAnimationFrame(watch);
    }
    function refresh(duration) {
      if (disposed) return;
      until = Math.max(until, performance.now() + (duration || 0));
      if (!frame) frame = requestAnimationFrame(watch);
    }
    function enhance() {
      group.querySelectorAll('[data-liquid-button], [data-liquid-surface]').forEach(function (el) {
        if (el.closest('[data-liquid-cluster]') !== group || records.has(el)) return;
        var content = document.createElement('span');
        content.className = 'lgc-content';
        while (el.firstChild) content.append(el.firstChild);
        el.append(content);
        var glow = document.createElement('span');
        glow.className = 'lgc-glow';
        lights.append(glow);
        var record = { content: content, glow: glow };
        records.set(el, record);
        if (!el.closest('[data-liquid-menu]')) record.motion = root.LiquidDesignLiveDemo.create(group, {
          button: el, slab: el, track: group,
          staticMotion: document.documentElement.hasAttribute('data-glass-child') && !group.closest('.ov-nav,.ov-social-nav,[data-page="chat"]'),
          editableSurface: el.matches('[data-liquid-surface]'),
          releaseFrequency: 15,
          deformationScale: el.classList.contains('lgd-chat-composer') ? .33 : undefined,
          centerCoupling: el.classList.contains('lgd-chat-composer') ? .025 : undefined,
          centerLimit: el.classList.contains('lgd-chat-composer') ? 5 : undefined,
          render: function (state) { record.state = state; refresh(); },
        });
      });
      paint();
    }
    function reduced() { return root.matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.webdriver; }
    function transition(change) {
      animations.forEach(function (a) { a.cancel(); });
      animations = [];
      ghosts.forEach(function (ghost) { ghost.remove(); });
      ghosts = [];
      var before = new Map();
      records.forEach(function (_, el) { if (visible(el)) before.set(el, el.getBoundingClientRect()); });
      change();
         if (!reduced()) {
        var anchor = group.querySelector('[data-liquid-toggle], [data-liquid-search-open]');
        var anchorRect = anchor && anchor.getBoundingClientRect();
        var groupRect = group.getBoundingClientRect();
        before.forEach(function (from, el) {
          if (visible(el) || !anchorRect || !anchorRect.width) return;
          var ghost = document.createElement('span');
          ghost.className = 'lgc-exit';
          ghost.setAttribute('aria-hidden', 'true');
          ghost.style.left = (from.left - groupRect.left) + 'px';
          ghost.style.top = (from.top - groupRect.top) + 'px';
          ghost.style.width = from.width + 'px';
          ghost.style.height = from.height + 'px';
          var source = records.get(el).content.cloneNode(true);
          source.style.transform = 'none';
          // Inputs and IDs must not be duplicated into exit scenery.
          source.querySelectorAll('input, [id]').forEach(function (node) { node.remove(); });
          ghost.append(source);
          group.append(ghost);
          ghosts.push(ghost);
          var transform = 'translate(' + (anchorRect.left + anchorRect.width / 2 - from.left - from.width / 2) + 'px,' +
            (anchorRect.top + anchorRect.height / 2 - from.top - from.height / 2) + 'px) scale(' + anchorRect.width / from.width + ',' + anchorRect.height / from.height + ')';
          var flight = ghost.animate(flights(anchorRect, from, true), {
            duration: 1050, easing: bounceEase,
            fill: 'backwards',
          });
          animations.push(flight);
          flight.finished.then(function () {
            ghost.remove();
            ghosts = ghosts.filter(function (g) { return g !== ghost; });
            refresh();
          }, function () {});
        });
      }
      if (!reduced()) records.forEach(function (_, el) {
        if (!visible(el)) return;
        var to = el.getBoundingClientRect();
        var from = before.get(el);
        if (!from) {
          var trigger = group.querySelector('[data-liquid-toggle], [data-liquid-search-open]');
          from = trigger && visible(trigger) ? trigger.getBoundingClientRect() : before.values().next().value;
        }
        if (!from) return;
        var transform = 'translate(' + (from.left + from.width / 2 - to.left - to.width / 2) + 'px,' +
          (from.top + from.height / 2 - to.top - to.height / 2) + 'px) scale(' + from.width / to.width + ',' + from.height / to.height + ')';
        var keyframes = flights(from, to, false);
        animations.push(el.animate(keyframes, {
          duration: 1050, easing: bounceEase,
          fill: 'backwards',
        }));
      });
      records.forEach(function (record) { record.state = null; if (record.motion) record.motion.refresh(); });
      refresh(reduced() ? 0 : 1150);
    }
  function panelState(panel, open) { panel.hidden = !open; panel.inert = !open; }
    function splitResponse(initial, initialVelocity, target, elapsed) {
      var a = initial - target, b = (initialVelocity + 12 * a) / 12;
      var decay = Math.exp(-12 * elapsed), c = Math.cos(12 * elapsed), s = Math.sin(12 * elapsed);
      return { progress: target + decay * (a * c + b * s),
        velocity: decay * ((-12 * a + 12 * b) * c + (-12 * b - 12 * a) * s) };
    }
    function setupTools(trigger, panel) {
      var items = [trigger].concat(Array.from(panel.querySelectorAll('[data-liquid-button]')));
      var open = false, progress = 0, velocity = 0, target = 0;
      var started = 0, initial = 0, initialVelocity = 0;
      group.dataset.morphPhase = 'settled';
      function advance(now) {
        if (!started) return;
        var t = (now - started) / 1000;
        // One continuous damped response; reversal carries its actual velocity.
        var response = splitResponse(initial, initialVelocity, target, t);
        progress = response.progress; velocity = response.velocity;
        if (t > .3 && Math.abs(progress - target) < .001 && Math.abs(velocity) < .025) {
          progress = target; velocity = 0; started = 0;
          group.dataset.morphPhase = 'settled';
          if (!open) panelState(panel, false);
        }
      }
      function set(value, focus) {
        open = value; target = value ? 1 : 0;
        panel.hidden = false; panel.inert = !value;
        trigger.setAttribute('aria-expanded', String(value));
        group.dataset.expanded = String(value);
        initial = progress; initialVelocity = velocity;
        started = reduced() ? 0 : performance.now();
        if (reduced()) { progress = target; velocity = 0; panelState(panel, value); }
        group.dataset.morphPhase = started ? (value ? 'expand' : 'collapse') : 'settled';
        if (focus) trigger.focus({ preventScroll: true });
        paint(); refresh(started ? 1400 : 0);
      }
      toolsPaint = function (boxes, rect, measurements) {
        advance(performance.now());
        if (panel.hidden) return boxes;
        var activeItems = items.filter(function (el) { return measurements.has(el); });
        var native = activeItems.map(function (el) {
          var r = measurements.get(el).bounds;
          return { x: r.left - rect.left, y: r.top - rect.top, w: r.width, h: r.height };
        });
        if (!native.length) return boxes;
        var first = native[0], last = native[native.length - 1];
        // The trigger is the persistent identity. Actions emerge from its
        // fixed native center, never from the expanding toolbar's midpoint.
        var sourceX = first.x + first.w / 2;
        var p = progress, reveal = Math.max(0, Math.min(1, p));
        var fade = reveal * reveal * (3 - 2 * reveal);
        return native.map(function (b, i) {
          var r = records.get(activeItems[i]), f = r.state;
          if (f && (!f.geometry.slabHalfWidth || !f.geometry.slabHalfHeight)) f = null;
          var dx = f ? f.bounds.centerX - f.geometry.slabCenterX : 0;
          var dy = f ? f.bounds.centerY - f.geometry.slabCenterY : 0;
          var sx = f ? f.bounds.halfWidth / f.geometry.slabHalfWidth : 1;
          var sy = f ? f.bounds.halfHeight / f.geometry.slabHalfHeight : 1;
          // New surfaces begin inside the source, then grow into separate circles.
          var growth = i ? .45 + .55 * reveal : 1;
          var cx = sourceX + (b.x + b.w / 2 - sourceX) * p + dx;
          var cy = b.y + b.h / 2 + dy;
          var w = b.w * sx * growth, h = b.h * sy * growth;
          r.content.style.transform = 'translate(' + (cx - b.x - b.w / 2) + 'px,' + dy + 'px) scale(' + sx * growth + ',' + sy * growth + ')';
          r.content.style.opacity = i ? fade : 1;
          var blur = 3 * 4 * reveal * (1 - reveal);
          if (group.hasAttribute('data-lgp-component') && r.content.querySelector('svg')) {
            r.content.style.filter = 'none';
            root.LiquidDesignGlyphBlur(r.content, blur, 'split');
          } else r.content.style.filter = blur > .02 ? 'blur(' + blur + 'px)' : 'none';
          return { x: cx - w / 2, y: cy - h / 2, w: w, h: h,
            rx: Math.min(b.w, b.h) / 2 * sx * growth, ry: Math.min(b.w, b.h) / 2 * sy * growth };
        });
      };
      activation(trigger, function () { set(!open, false); });
      listen(group, 'keydown', function (e) {
        if (e.key === 'Escape' && open) { e.preventDefault(); set(false, true); }
      });
      cleanups.push(function () {
        items.forEach(function (el) { var r = records.get(el); r.content.style.opacity = ''; r.content.style.filter = ''; clearGlyphBlur(r.content); });
        panelState(panel, false);
      });
    }
    function setupMenu(trigger, panel) {
      var open = false, held = null, selected = null, suppressClick = false;
      var pressX = 0, pressY = 0, dragged = false;
      var start = 0, source = null, target = null, current = null, closing = false;
      var pathPill = null, pathMenu = null;
      var pathPosition = 0, pathFrom = 0, pathTo = 0, pathDuration = 370;
      var openingOffset = { x: 0, y: 0 };
      var morphFace = null;
      var menuState = null, menuPointer = null, ignoreReleaseClick = false;
      var holdOpened = false, holdTimer = 0, holdPoint = null;
      var menuStartX = 0, menuStartY = 0, menuDragged = false;
      var selectionPill = document.createElement('span');
      selectionPill.className = 'lgc-selection-pill';
      selectionPill.setAttribute('aria-hidden', 'true');
      panel.prepend(selectionPill);
      var menuMotion = root.LiquidDesignLiveDemo.create(group, {
        button: panel, slab: panel, track: group,
        // Rows are nested buttons. As a static-action surface the press on a
        // row lights the glass and a pull past the edge stretches the sheet,
        // while the row still activates on a stationary release. Without it
        // every row press returned early and the open menu never stretched.
        editableSurface: true, staticActionSurface: true,
        // A 220x144 sheet has ~3.4x a button's area resistance, applied to
        // both stretch gain and its limit, so a 140px pull moved the edge
        // ~3px. Cap it so the open sheet pulls like the site's surfaces.
        deformationScale: 1, centerCoupling: .045, centerLimit: 10, areaScaleLimit: 1.2, pullFromPress: true,
        measureRect: function () {
          // Never feed our stretched render transform back into the solver.
          var transform = panel.style.transform;
          panel.style.transform = 'none';
          var measured = panel.getBoundingClientRect();
          panel.style.transform = transform;
          return measured;
        },
        render: function (state) { menuState = state; if (open) refresh(); },
      });
      cleanups.push(function () { menuMotion.destroy(); });
      var items = Array.from(panel.querySelectorAll('button:not(:disabled)'));
      var sourceItems = Array.from(group.querySelectorAll('[data-liquid-menu-source]'));
      if (!sourceItems.length) sourceItems = [trigger];
      var sourceGroup = sourceItems.length > 1 ? sourceItems[0].closest('[data-liquid-menu-source-group]') : null;
      var sourceFace = sourceGroup && sourceGroup.querySelector('.chat-corner-actions-source-face');
      var sourceState = null;
      if (sourceGroup) {
        sourceItems.forEach(function (el) {
          var record = records.get(el);
          if (record && record.motion) { record.motion.destroy(); record.motion = null; record.state = null; }
        });
        var sourceMotion = root.LiquidDesignLiveDemo.create(group, {
          button: sourceGroup, slab: sourceGroup, track: group,
          editableSurface: true, staticActionSurface: true,
          releaseFrequency: 15,
          render: function (state) {
            sourceState = state;
            // The compound source has one shared light field. Keep the state
            // on the component so the outer paint pass can draw one highlight
            // over the complete capsule instead of one per icon.
            group._liquidCompoundSourceState = state;
            refresh();
          },
        });
        cleanups.push(function () {
          sourceMotion.destroy();
          delete group._liquidCompoundSourceState;
        });
      }
      group.dataset.morphPhase = 'settled';
      function box(el) {
        var a = el.getBoundingClientRect(), g = group.getBoundingClientRect();
        return { x: a.left - g.left, y: a.top - g.top, w: a.width, h: a.height, r: 26 };
      }
      function sourceBox() {
        var g = group.getBoundingClientRect();
        if (sourceGroup) {
          var sourceBounds = sourceGroup.getBoundingClientRect();
          return { x: sourceBounds.left - g.left, y: sourceBounds.top - g.top, w: sourceBounds.width,
            h: sourceBounds.height, r: Math.min(sourceBounds.width, sourceBounds.height) / 2 };
        }
        var bounds = sourceItems.map(function (el) { return el.getBoundingClientRect(); });
        var left = Math.min.apply(null, bounds.map(function (b) { return b.left; }));
        var top = Math.min.apply(null, bounds.map(function (b) { return b.top; }));
        var right = Math.max.apply(null, bounds.map(function (b) { return b.right; }));
        var bottom = Math.max.apply(null, bounds.map(function (b) { return b.bottom; }));
        return { x: left - g.left, y: top - g.top, w: right - left, h: bottom - top, r: Math.min(right - left, bottom - top) / 2 };
      }
      function sourceVisualBox() {
        // Compound sources own one shared motion solver. A single Options
        // trigger already has a normal button record, so reuse that record's
        // live geometry instead of replacing its moving glass with sourceBox().
        var triggerRecord = records.get(trigger);
        var native = sourceBox(), state = sourceState || (triggerRecord && triggerRecord.state);
        if (!state || !state.geometry.slabHalfWidth || !state.geometry.slabHalfHeight) {
          if (sourceFace) sourceFace.style.transform = 'none';
          return native;
        }
        var dx = state.bounds.centerX - state.geometry.slabCenterX;
        var dy = state.bounds.centerY - state.geometry.slabCenterY;
        var sx = state.bounds.halfWidth / state.geometry.slabHalfWidth;
        var sy = state.bounds.halfHeight / state.geometry.slabHalfHeight;
        var nativeCenterX = native.x + native.w / 2;
        var nativeCenterY = native.y + native.h / 2;
        if (sourceFace) sourceFace.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
        return { x: nativeCenterX + dx - native.w * sx / 2, y: nativeCenterY + dy - native.h * sy / 2,
          w: native.w * sx, h: native.h * sy, rx: native.r * sx, ry: native.r * sy, r: native.r };
      }
      function menuRadius() {
        // Highlight radius + its row inset + the sheet's outer padding.
        var padding = parseFloat(getComputedStyle(panel).paddingTop) || 0;
        // A menu whose rows are all disabled has no row to measure; use the
        // declared sheet radius instead of failing mid-open.
        if (!items.length) return parseFloat(getComputedStyle(group).getPropertyValue('--liquid-design-menu-radius')) || 18;
        return Math.max(0, items[0].offsetHeight - 8) / 2 + 4 + padding;
      }
      function mix(a, b, p) {
        var out = {};
        ['x', 'y', 'w', 'h', 'r'].forEach(function (key) { out[key] = a[key] + (b[key] - a[key]) * p; });
        out.w = Math.max(20, out.w); out.h = Math.max(20, out.h);
        return out;
      }
      function highlight(item) {
        if (selected === item) return;
        var hadSelection = !!selected;
        selected = item;
        items.forEach(function (el) { el.setAttribute('data-liquid-highlighted', String(el === item)); });
        if (item) {
          selectionPill.style.transition = hadSelection && !reduced() ? 'transform 180ms cubic-bezier(.4,0,.2,1), width 180ms cubic-bezier(.4,0,.2,1), height 180ms cubic-bezier(.4,0,.2,1), opacity 120ms linear' : 'opacity 120ms linear';
          selectionPill.style.opacity = '1';
          selectionPill.style.width = Math.max(0, item.offsetWidth - 8) + 'px';
          selectionPill.style.height = Math.max(0, item.offsetHeight - 8) + 'px';
          selectionPill.style.transform = 'translate(' + (item.offsetLeft + 4) + 'px,' + (item.offsetTop + 4) + 'px)';
        } else selectionPill.style.opacity = '0';
      }
      function needsUpwardOpening() {
        if (group.getAttribute('data-liquid-design-menu-direction') === 'up') return true;
        if (group.getAttribute('data-liquid-design-menu-direction') === 'down') return false;
        var anchor = trigger.getBoundingClientRect();
        var menuHeight = panel.hidden ? panel.scrollHeight : panel.offsetHeight;
        if (!menuHeight) {
          // Hidden panels have no box: measure without painting or exposing it.
          var wasHidden = panel.hidden, wasInert = panel.inert, visibility = panel.style.visibility;
          panel.style.visibility = 'hidden'; panel.hidden = false; panel.inert = true;
          menuHeight = panel.offsetHeight;
          panel.hidden = wasHidden; panel.inert = wasInert; panel.style.visibility = visibility;
        }
        var below = innerHeight - anchor.top - 12;
        var above = anchor.bottom - 12;
        return below < menuHeight;
      }
      function set(value, focus) {
        if (open === value) return;
        if (!value) {
          var beforeClose = new CustomEvent('liquid-design-before-close', { cancelable: true });
          if (!group.dispatchEvent(beforeClose)) return;
        }
        cancelHold();
        var interrupted = !!start;
        if (interrupted) paint();
        source = current || (open ? box(panel) : sourceBox());
        open = value; closing = !value;
        menuState = null;
        panelState(panel, value);
        if (!value && !reduced()) { panel.hidden = false; panel.inert = true; }
        panel.style.transform = 'none';
        if (value) {
          var anchor = trigger.getBoundingClientRect();
          var bounds = group.getBoundingClientRect();
          var menuHeight = panel.getBoundingClientRect().height;
          var below = innerHeight - anchor.top - 12;
          var above = anchor.bottom - 12;
          var up = needsUpwardOpening();
          var menuOffset = parseFloat(getComputedStyle(group).getPropertyValue('--liquid-design-menu-offset-y')) || 0;
          var top = up ? anchor.bottom - menuHeight : anchor.top + menuOffset;
          var styles = getComputedStyle(group);
          var gap = parseFloat(styles.getPropertyValue('--liquid-design-menu-gap'));
          if (Number.isFinite(gap)) top = up ? anchor.top - menuHeight - gap : anchor.bottom + gap;
          top = Math.max(12, Math.min(innerHeight - menuHeight - 12, top));
          var topBound = parseFloat(styles.getPropertyValue('--liquid-design-menu-top-bound'));
          var bottomBound = parseFloat(styles.getPropertyValue('--liquid-design-menu-bottom-bound'));
          if (Number.isFinite(topBound) && Number.isFinite(bottomBound)) top = Math.max(topBound, Math.min(bottomBound - menuHeight, top));
          panel.style.top = (top - bounds.top) + 'px';
          group.dataset.menuDirection = up ? 'up' : 'down';
        }
        trigger.setAttribute('aria-expanded', String(value));
        trigger.style.visibility = value ? 'hidden' : '';
        group.dataset.expanded = String(value);
        target = value ? box(panel) : sourceBox();
        target.r = value ? menuRadius() : target.r;
        if (value && (!interrupted || pathPosition === 0)) {
          if (!interrupted) { pathPill = sourceBox(); pathMenu = target; }
          openingOffset = { x: source.x + source.w / 2 - pathPill.x - pathPill.w / 2,
            y: source.y + source.h / 2 - pathPill.y - pathPill.h / 2 };
        }
        pathFrom = interrupted ? pathPosition : (value ? 0 : 1);
        pathTo = value ? 1 : 0;
        pathDuration = Math.max(100, (value ? 370 : 450) * Math.abs(pathTo - pathFrom));
        if (morphFace) morphFace.remove();
        if (!reduced()) {
          morphFace = document.createElement('span');
          morphFace.className = 'lgc-exit';
          morphFace.setAttribute('aria-hidden', 'true');
          if (sourceItems.length > 1) {
            morphFace.classList.add('lgc-compound-source-face');
            sourceItems.forEach(function (el) {
              var face = records.get(el).content.cloneNode(true);
              face.style.transform = 'none';
              // The resting originals are hidden while the menu is open. A
              // closing clone must not inherit that inline opacity, otherwise
              // its visible parent still contains two fully transparent icons.
              face.style.opacity = '1';
              face.style.filter = 'none';
              morphFace.append(face);
            });
          } else {
            var originalFace = records.get(trigger).content.cloneNode(true);
            originalFace.style.transform = 'none';
            // The live source is transparent while its menu is open. Do not
            // copy that resting state into the retracting face: single-icon
            // sources must return exactly like each icon in a compound source.
            originalFace.style.opacity = '1';
            originalFace.style.filter = 'none';
            morphFace.append(originalFace);
          }
           group.append(morphFace);
           trigger.style.visibility = 'hidden';
           // Message menus live in a root-level fixed cluster. During the
           // closing morph, the temporary circle must yield to the message
           // bubble it came from rather than painting over it.
           if (!value && group.hasAttribute('data-message-menu')) morphFace.classList.add('lgc-message-closing-face');
         }
        start = reduced() ? 0 : performance.now();
         group.dataset.morphPhase = reduced() ? 'settled' : (value ? 'expand' : 'collapse');
        if (focus) ((value && items[0]) || trigger).focus({ preventScroll: true });
        if (!value) highlight(null);
        paint(); refresh(reduced() ? 0 : pathDuration + (value ? 60 : 1200));
      }
      menuPaint = function (boxes, rect) {
        panel.style.transform = 'none';
        if (!open && !start) {
          current = sourceVisualBox();
          group.dataset.morphPhase = 'settled';
          material.dataset.menu = 'false';
          return [current];
        }
        var now = performance.now(), elapsed = start ? now - start : pathDuration + 1;
        if (open || start) {
          if (sourceFace) sourceFace.style.transform = 'none';
        }
        var progress = Math.min(1, elapsed / pathDuration);
        var easedProgress = interruptedEase(progress);
        var pathTime = start ? pathFrom + (pathTo - pathFrom) * easedProgress : (open ? 1 : 0);
        pathPosition = pathTime;
        var trajectory = pathPill && pathMenu ? root.LiquidDesignMenuMotion.frame(pathPill, pathMenu, pathTime,
          group.dataset.menuDirection === 'up' ? -1 : 1, !open) : null;
        var springMotion = null;
        if (trajectory && !open && start) {
          springMotion = root.LiquidDesignMenuMotion.closingSpring(pathPill, pathMenu,
            elapsed, pathDuration, group.dataset.menuDirection === 'up' ? -1 : 1, pathFrom);
          trajectory.y = springMotion.y - trajectory.h / 2;
        }
        if (trajectory && open && start) {
          var offsetDecay = Math.pow(1 - progress, 3);
          trajectory.x += openingOffset.x * offsetDecay;
          trajectory.y += openingOffset.y * offsetDecay;
        }
        // Plain icon sources still use the complete reverse morph, but stop at
        // its source frame. They have no resting glass control to receive the
        // extra spring tail, which otherwise reads as a detached end blob.
        var continueClosingSpring = springMotion && !springMotion.settled &&
          !group.hasAttribute('data-liquid-design-plain-source');
        if (elapsed < pathDuration || continueClosingSpring) {
          current = trajectory;
           group.dataset.morphPhase = open ? (elapsed < pathDuration ? 'expand' : 'overshoot') : 'collapse';
          if (!open && elapsed >= pathDuration) panelState(panel, false);
          if (morphFace) {
            morphFace.style.left = current.x + 'px'; morphFace.style.top = current.y + 'px';
            morphFace.style.width = current.w + 'px'; morphFace.style.height = current.h + 'px';
            // The source controls ride the exact material geometry while their
            // opacity follows the same morph clock as the scale transition.
            morphFace.style.opacity = sourceFaceOpacity(progress, trajectory);
          }
        } else {
          current = open ? box(panel) : sourceBox(); current.r = open ? menuRadius() : current.r;
          group.dataset.morphPhase = 'settled'; start = 0;
          if (morphFace) { morphFace.remove(); morphFace = null; }
          trigger.style.visibility = open ? 'hidden' : '';
          if (!open) panelState(panel, false);
        }
        if (open && menuState) {
            var m = menuState, base = current;
            var dx = m.bounds.centerX - m.geometry.slabCenterX;
            var dy = m.bounds.centerY - m.geometry.slabCenterY;
            var width = base.w * m.bounds.halfWidth / m.geometry.slabHalfWidth;
            var height = base.h * m.bounds.halfHeight / m.geometry.slabHalfHeight;
            current = { x: base.x + base.w / 2 + dx - width / 2,
              y: base.y + base.h / 2 + dy - height / 2, w: width, h: height,
              r: base.r, rx: base.r * width / base.w, ry: base.r * height / base.h };
        }
        if (morphFace) {
          var nativePill = pathPill || sourceBox();
          morphFace.style.left = nativePill.x + 'px'; morphFace.style.top = nativePill.y + 'px';
          morphFace.style.width = nativePill.w + 'px'; morphFace.style.height = nativePill.h + 'px';
          morphFace.style.transform = 'translate(' + (current.x + current.w / 2 - nativePill.x - nativePill.w / 2) + 'px,' +
            (current.y + current.h / 2 - nativePill.y - nativePill.h / 2) + 'px) scale(' + current.w / nativePill.w + ',' + current.h / nativePill.h + ')';
          morphFace.style.opacity = sourceFaceOpacity(progress, trajectory);
          if (!start) {
            morphFace.remove(); morphFace = null;
            trigger.style.visibility = open ? 'hidden' : '';
          }
        }
        var reveal = trajectory ? trajectory.reveal : (open ? 1 : 0);
        sourceItems.forEach(function (el) {
          var record = records.get(el);
          if (record) record.content.style.opacity = morphFace || open ? 0 : 1;
        });
        if (group.hasAttribute('data-lgp-component') && !open && start) {
          // Rows leave before the sheet becomes a circle; never squeeze stale
          // selection/text into the returning Options identity.
          var closingReveal = Math.max(0, Math.min(1, (pathTime - .48) / .32));
          reveal *= closingReveal * closingReveal * (3 - 2 * closingReveal);
        }
        var menuGlow = records.get(trigger).glow;
        if (open && menuState) {
          var menuGlowDiameter = 184 * Math.sqrt(current.w * current.h) / 52;
          menuGlow.style.width = menuGlowDiameter + 'px'; menuGlow.style.height = menuGlowDiameter + 'px';
          menuGlow.style.left = (rect.width / 2 + menuState.lightPoint.x) + 'px';
          menuGlow.style.top = (rect.height / 2 + menuState.lightPoint.y) + 'px';
          menuGlow.style.opacity = menuState.touch;
          if (group.hasAttribute('data-lgp-component')) {
            menuGlow.style.clipPath = 'path("' + pill({ x: current.x - (rect.width / 2 + menuState.lightPoint.x) + menuGlowDiameter / 2,
              y: current.y - (rect.height / 2 + menuState.lightPoint.y) + menuGlowDiameter / 2,
              w: current.w, h: current.h, r: current.r, rx: current.rx, ry: current.ry }) + '")';
          }
        } else {
          menuGlow.style.width = ''; menuGlow.style.height = '';
          if (!open && start) {
            // Hold-open retains the opener's contact spring. Its stale highlight
            // must not reappear inside the shrinking sheet during close.
            menuGlow.style.opacity = '0';
          }
        }
        panel.style.opacity = reduced() && open ? 1 : reveal;
        panel.style.filter = !reduced() ? 'blur(' + ((1 - reveal) * 5).toFixed(2) + 'px)' : 'none';
        paintPlainSourceReturn(progress);
        var panelBox = !panel.hidden ? box(panel) : null;
        if (panelBox) {
          panel.style.transform = 'translate(' + (current.x + current.w / 2 - panelBox.x - panelBox.w / 2) + 'px,' +
            (current.y + current.h / 2 - panelBox.y - panelBox.h / 2) + 'px) scale(' + current.w / panelBox.w + ',' + current.h / panelBox.h + ')';
          // Clip the evolving rows to the exact curved glass boundary. The
          // inverse scale matches the material's independently stretched axes.
          panel.style.clipPath = 'inset(0 round ' + ((current.rx === undefined ? current.r : current.rx) * panelBox.w / current.w) + 'px / ' +
            ((current.ry === undefined ? current.r : current.ry) * panelBox.h / current.h) + 'px)';
        }
        // Material lighting is local to this one shape, matching the Select pill.
        material.dataset.menu = String(open);
        return [current];
      };
      function interruptedEase(t) {
        // Opening retains its approved clock. Closing moves through the
        // reversed arrival promptly, then glides into the Options anchor.
        return open ? t : 1 - Math.pow(1 - t, 2);
      }
      function sourceFaceOpacity(progress, trajectory) {
        if (open) return trajectory ? trajectory.face : 0;
        // Keep the controls absent while the menu is still a large sheet.
        // Bring them back only once the material is visibly reforming into its
        // compact source capsule, then reach full opacity before it settles.
        var t = Math.max(0, Math.min(1, progress));
        var delayed = Math.max(0, Math.min(1, (t - .46) / .44));
        return delayed * delayed * (3 - 2 * delayed);
      }
      function paintPlainSourceReturn(progress) {
        if (!group.hasAttribute('data-liquid-design-plain-source')) return;
        if (open || !start) {
          material.style.removeProperty('opacity');
          drawing.style.removeProperty('opacity');
          highlights.style.removeProperty('opacity');
          return;
        }
        // Ordinary Options menus land on another glass control. A plain
        // source has no resting glass underneath, so blend away the compact
        // material instead of removing an opaque circle on the settle frame.
        var t = Math.max(0, Math.min(1, (progress - .68) / .32));
        var opacity = 1 - t * t * (3 - 2 * t);
        material.style.opacity = opacity;
        drawing.style.opacity = opacity;
        highlights.style.opacity = opacity;
      }
      function cancelHold() {
        clearTimeout(holdTimer); holdTimer = 0;
      }
      cleanups.push(cancelHold);
      listen(trigger, 'pointerdown', function (e) {
        if (e.button !== 0 || held !== null) return;
        held = e.pointerId;
        pressX = e.clientX; pressY = e.clientY; dragged = false;
        suppressClick = false;
        holdOpened = false;
        holdPoint = e;
        trigger.setPointerCapture(held);
        cancelHold();
        if (!open) holdTimer = setTimeout(function () {
          holdTimer = 0;
          if (held === null || dragged || open) return;
          set(true, false);
          holdOpened = true;
          highlight(null);
          menuMotion.beginGesture(holdPoint, { x: pressX, y: pressY });
        }, 260);
      });
      listen(trigger, 'pointermove', function (e) {
        if (e.pointerId !== held) return;
        holdPoint = e;
        if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 2) { dragged = true; cancelHold(); }
        if (!open) return;
        menuMotion.moveGesture(e);
        highlight(pointItem(e));
      });
      function release(e) {
        if (e.pointerId !== held) return;
        cancelHold();
        if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 2) dragged = true;
        var choice = selected;
        if (holdOpened) choice = dragged && e.type === 'pointerup' ? pointItem(e) : null;
        if (open) menuMotion.endGesture(e);
        held = null; holdPoint = null;
        suppressClick = holdOpened || dragged || e.type !== 'pointerup' || !!choice;
        if (trigger.hasPointerCapture(e.pointerId)) trigger.releasePointerCapture(e.pointerId);
        if (e.type === 'pointerup' && choice) choice.click();
        else if (e.type === 'pointerup' && open && items[0]) items[0].focus({ preventScroll: true });
        else if (e.type !== 'pointerup') set(false, false);
      }
      listen(trigger, 'pointerup', release);
      listen(trigger, 'pointercancel', release);
      listen(trigger, 'lostpointercapture', release);
      listen(trigger, 'click', function () {
        if (suppressClick) { suppressClick = false; return; }
        set(!open, true);
      });
      listen(panel, 'click', function (e) { if (e.target.closest('button')) set(false, true); });
      listen(panel, 'pointerleave', function () {
        highlight(null);
      });
      listen(panel, 'focusin', function (e) {
        var item = e.target.closest('button');
        if (open && items.indexOf(item) !== -1) highlight(item);
      });
      function pointItem(e) {
        return items.find(function (item) {
          var r = item.getBoundingClientRect();
          return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        }) || null;
      }
      function isNativeInteractiveTarget(target) {
        return !!target.closest('input,select,textarea,[data-liquid-native-interaction]');
      }
      listen(panel, 'pointerdown', function (e) {
        if (!open || start || e.button !== 0 || isNativeInteractiveTarget(e.target)) return;
        menuPointer = e.pointerId;
        menuStartX = e.clientX; menuStartY = e.clientY; menuDragged = false;
        ignoreReleaseClick = false;
        panel.setPointerCapture(menuPointer);
        highlight(pointItem(e));
      });
      listen(panel, 'pointermove', function (e) {
        if (isNativeInteractiveTarget(e.target)) return;
        if (e.pointerId === menuPointer && Math.hypot(e.clientX - menuStartX, e.clientY - menuStartY) > 2) menuDragged = true;
        if (open && (menuPointer === null || menuPointer === e.pointerId)) {
          var item = pointItem(e);
          highlight(item);
        }
      });
      listen(panel, 'pointerup', function (e) {
        if (isNativeInteractiveTarget(e.target)) return;
        if (e.pointerId !== menuPointer) return;
        var choice = pointItem(e);
        if (Math.hypot(e.clientX - menuStartX, e.clientY - menuStartY) > 2) menuDragged = true;
        menuPointer = null;
        ignoreReleaseClick = true;
        if (panel.hasPointerCapture(e.pointerId)) panel.releasePointerCapture(e.pointerId);
        if (choice) choice.click();
        else highlight(null);
      });
      listen(panel, 'pointercancel', function () { menuPointer = null; highlight(null); });
      function preventDuplicate(e) {
        if (ignoreReleaseClick && e.detail !== 0) {
          ignoreReleaseClick = false; e.preventDefault(); e.stopImmediatePropagation();
        }
      }
      panel.addEventListener('click', preventDuplicate, true);
      cleanups.push(function () { panel.removeEventListener('click', preventDuplicate, true); });
      listen(group, 'keydown', function (e) {
        if (e.key === 'Escape' && open) { e.preventDefault(); set(false, true); }
        if (e.target === trigger && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); set(true, true); }
        if (!open || !panel.contains(e.target) || !items.length) return;
        var index = items.indexOf(document.activeElement);
        var next = { ArrowDown: (index + 1) % items.length, ArrowUp: (index + items.length - 1) % items.length, Home: 0, End: items.length - 1 }[e.key];
        if (next !== undefined) { e.preventDefault(); items[next].focus(); highlight(items[next]); }
      });
      listen(document, 'pointerdown', function (e) { if (!group.contains(e.target) && open) set(false, false); });
      listen(document, 'focusin', function (e) { if (!group.contains(e.target) && open && held === null) set(false, false); });
        cleanups.push(function () {
          if (morphFace) morphFace.remove();
          selectionPill.remove();
          trigger.style.visibility = '';
          if (sourceFace) sourceFace.style.transform = '';
          sourceItems.forEach(function (el) { var record = records.get(el); if (record) record.content.style.opacity = ''; });
        });
    }
    group.querySelectorAll('[data-liquid-toggle]').forEach(function (trigger) {
      var panel = document.getElementById(trigger.getAttribute('data-liquid-toggle'));
      if (!panel || !group.contains(panel)) return;
      trigger.setAttribute('aria-controls', panel.id);
      trigger.setAttribute('aria-expanded', 'false');
      panelState(panel, false);
      var dropdown = panel.hasAttribute('data-liquid-menu');
      if (dropdown) { setupMenu(trigger, panel); return; }
      if (panel.classList.contains('lgd-tools')) { setupTools(trigger, panel); return; }
      function set(open, focus) {
        transition(function () {
          panelState(panel, open);
          trigger.setAttribute('aria-expanded', String(open));
          group.dataset.expanded = String(open);
        });
        if (focus) (open ? panel.querySelector('button:not(:disabled)') : trigger).focus();
      }
      activation(trigger, function () { set(panel.hidden, dropdown); });
      listen(group, 'keydown', function (e) {
        if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); set(false, true); }
        if (!dropdown) return;
        if (e.target === trigger && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); set(true, true); }
        if (panel.hidden || !panel.contains(e.target)) return;
        var items = Array.from(panel.querySelectorAll('button:not(:disabled)'));
        var index = items.indexOf(document.activeElement);
        var next = { ArrowDown: (index + 1) % items.length, ArrowUp: (index + items.length - 1) % items.length, Home: 0, End: items.length - 1 }[e.key];
        if (next !== undefined) { e.preventDefault(); items[next].focus(); }
      });
      if (dropdown) {
        listen(document, 'pointerdown', function (e) { if (!group.contains(e.target) && !panel.hidden) set(false, false); });
        listen(document, 'focusin', function (e) { if (!group.contains(e.target) && !panel.hidden) set(false, false); });
        listen(panel, 'click', function (e) { if (e.target.closest('button')) set(false, true); });
      }
    });
    var opener = group.querySelector('[data-liquid-search-open]');
    if (opener) {
      var search = group.querySelector('[data-liquid-search-panel]');
      var cancel = group.querySelector('[data-liquid-search-cancel]');
      var input = search.querySelector('input');
      opener.setAttribute('aria-controls', search.id);
      opener.setAttribute('aria-expanded', 'false');
      panelState(search, false);
      panelState(opener, true);
      var searchOpen = false, searchProgress = 0, searchVelocity = 0;
      var searchStart = 0, searchInitial = 0, searchInitialVelocity = 0;
      var searchSource = null, searchFace = null;
      var searchSurfaces = [search.querySelector('[data-liquid-surface]'), cancel];
      group.dataset.morphPhase = 'settled';
      function advanceSearch(now) {
        if (!searchStart) return;
        var t = (now - searchStart) / 1000, target = searchOpen ? 1 : 0;
        var response = splitResponse(searchInitial, searchInitialVelocity, target, t);
        searchProgress = response.progress; searchVelocity = response.velocity;
        if (t > .3 && Math.abs(searchProgress - target) < .001 && Math.abs(searchVelocity) < .025) {
          searchProgress = target; searchVelocity = 0; searchStart = 0;
          group.dataset.morphPhase = 'settled';
          if (!searchOpen) { panelState(search, false); panelState(opener, true); opener.focus({ preventScroll: true }); }
          if (searchFace) { searchFace.remove(); searchFace = null; }
        }
      }
      function setSearch(open) {
        advanceSearch(performance.now());
        if (!searchSource || (!searchOpen && !searchStart)) {
          var r = opener.getBoundingClientRect(), g = group.getBoundingClientRect();
          searchSource = { x: r.left - g.left, y: r.top - g.top, w: r.width, h: r.height };
        }
        searchOpen = open;
        var openerRecord = records.get(opener);
        if (openerRecord.motion) openerRecord.motion.reset();
        openerRecord.state = null;
        openerRecord.content.style.transform = 'none';
        panelState(opener, false);
        search.hidden = false; search.inert = !open;
        opener.setAttribute('aria-expanded', String(open));
        group.dataset.expanded = String(open);
        searchInitial = searchProgress; searchInitialVelocity = searchVelocity;
        searchStart = reduced() ? 0 : performance.now();
        if (reduced()) {
          searchProgress = open ? 1 : 0; searchVelocity = 0;
          panelState(search, open); panelState(opener, !open);
        } else if (!searchFace) {
          searchFace = document.createElement('button'); searchFace.className = 'lgc-exit lgc-search-morph-control';
          searchFace.type = 'button';
          activation(searchFace, function () { setSearch(!searchOpen); });
          var content = records.get(opener).content.cloneNode(true);
          content.style.transform = 'none'; searchFace.append(content); group.append(searchFace);
        }
        group.dataset.morphPhase = searchStart ? (open ? 'expand' : 'collapse') : 'settled';
        if (searchFace) {
          searchFace.setAttribute('aria-label', open ? 'Cancel search' : 'Open search');
          searchFace.setAttribute('aria-expanded', String(open));
        }
        records.forEach(function (record) { if (record.motion) record.motion.refresh(); });
        paint(); refresh(searchStart ? 1500 : 0);
        (open ? input : opener).focus({ preventScroll: true });
      }
      searchPaint = function (boxes, rect) {
        advanceSearch(performance.now());
        if (!searchOpen && !searchStart) {
          // Settlement changes visibility after the generic boxes were read.
          // Re-measure the newly restored circle within this same paint.
          if (boxes.length) return boxes;
          var resting = opener.getBoundingClientRect();
          return [{ x: resting.left - rect.left, y: resting.top - rect.top, w: resting.width, h: resting.height }];
        }
        var p = searchProgress, reveal = Math.max(0, Math.min(1, p));
        var fade = reveal * reveal * (3 - 2 * reveal), source = searchSource;
        var cx = source.x + source.w / 2, cy = source.y + source.h / 2;
        return searchSurfaces.map(function (el, index) {
          var r = el.getBoundingClientRect(), record = records.get(el), f = record.state;
          if (f && (!f.geometry.slabHalfWidth || !f.geometry.slabHalfHeight)) f = null;
          var dx = f ? f.bounds.centerX - f.geometry.slabCenterX : 0;
          var dy = f ? f.bounds.centerY - f.geometry.slabCenterY : 0;
          var sx = f ? f.bounds.halfWidth / f.geometry.slabHalfWidth : 1;
          var sy = f ? f.bounds.halfHeight / f.geometry.slabHalfHeight : 1;
          // One morph spring owns the returning identity. Fade out the native
          // press-release spring near absorption to avoid a second size wobble.
          var liveWeight = searchStart ? reveal * reveal : 1;
          dx *= liveWeight; dy *= liveWeight;
          sx = 1 + (sx - 1) * liveWeight; sy = 1 + (sy - 1) * liveWeight;
          var x = r.left - rect.left, y = r.top - rect.top;
          var centerX = cx + (x + r.width / 2 - cx) * p + dx;
          var centerY = cy + (y + r.height / 2 - cy) * p + dy;
          // Cancel is the persistent source identity. The field is an emerging
          // lobe, using the same .45 -> 1 growth as Tools' extra controls.
          var seedWidth = Math.min(source.w, r.width) * .45;
          var seedHeight = Math.min(source.h, r.height) * .45;
          var w = index ? Math.max(1, source.w + (r.width - source.w) * p) * sx : (seedWidth + (r.width - seedWidth) * reveal) * sx;
          var h = index ? Math.max(1, source.h + (r.height - source.h) * p) * sy : (seedHeight + (r.height - seedHeight) * reveal) * sy;
          record.content.style.transform = 'translate(' + (centerX - x - r.width / 2) + 'px,' +
            (centerY - y - r.height / 2) + 'px) scale(' + w / r.width + ',' + h / r.height + ')';
          record.content.style.opacity = fade;
          var blur = 3 * 4 * reveal * (1 - reveal);
          record.content.style.filter = blur > .02 ? 'blur(' + blur + 'px)' : 'none';
          if (index && searchFace) {
            searchFace.style.left = (centerX - source.w / 2) + 'px';
            searchFace.style.top = (centerY - source.h / 2) + 'px';
            searchFace.style.width = source.w + 'px'; searchFace.style.height = source.h + 'px';
            searchFace.style.transform = 'scale(' + w / source.w + ',' + h / source.h + ')';
            searchFace.style.opacity = 1 - fade;
            searchFace.style.filter = blur > .02 ? 'blur(' + blur + 'px)' : 'none';
          }
          // Match Tools' rubber corners: each axis follows its own spring,
          // rather than rebuilding a circular radius from the pulled height.
          var radius = index ? (source.h + (r.height - source.h) * p) / 2 : Math.min(w / sx, h / sy) / 2;
          return { x: centerX - w / 2, y: centerY - h / 2, w: w, h: h, rx: radius * sx, ry: radius * sy };
        });
      };
      activation(opener, function () { setSearch(true); });
      activation(cancel, function () { setSearch(false); });
      listen(group, 'keydown', function (e) { if (e.key === 'Escape' && !search.hidden) { e.preventDefault(); setSearch(false); } });
      cleanups.push(function () { if (searchFace) searchFace.remove(); });
    }
    enhance();
    var observer = new ResizeObserver(function () { records.forEach(function (r) { r.state = null; }); refresh(); });
    observer.observe(group);
    records.forEach(function (_, el) { observer.observe(el); });
    listen(root, 'resize', function () { refresh(); });
    return {
      refresh: function () { enhance(); records.forEach(function (r) { if (r.motion) r.motion.refresh(); }); refresh(100); },
      destroy: function () {
        disposed = true;
        cancelAnimationFrame(frame);
        animations.forEach(function (a) { a.cancel(); });
        ghosts.forEach(function (ghost) { ghost.remove(); });
        observer.disconnect();
        if (colors) colors.destroy();
        if (refraction) refraction.destroy();
        if (backdrop) backdrop.destroy();
        cleanups.forEach(function (fn) { fn(); });
        records.forEach(function (r, el) {
          if (r.motion) r.motion.destroy();
          if (r.content._lgpTextEffect) r.content._lgpTextEffect.filter.remove();
          while (r.content.firstChild) el.insertBefore(r.content.firstChild, r.content);
          r.content.remove();
        });
        group.querySelectorAll('[data-liquid-toggle], [data-liquid-search-open]').forEach(function (el) { el.setAttribute('aria-expanded', 'false'); });
        group.querySelectorAll('[data-liquid-menu], [data-liquid-search-panel]').forEach(function (el) { panelState(el, false); });
        group.querySelectorAll('[data-liquid-search-open]').forEach(function (el) { panelState(el, true); });
        material.remove(); drawing.remove(); highlights.remove();
      },
    };
  }
  root.LiquidDesignComponents = {
    init: function (scope) {
      scope = scope || document;
      groups(scope).forEach(function (group) {
        if (instances.has(group)) instances.get(group).refresh();
        else instances.set(group, create(group));
      });
    },
    destroy: function (scope) {
      scope = scope || document;
      groups(scope).forEach(function (group) {
        if (instances.has(group)) { instances.get(group).destroy(); instances.delete(group); }
      });
    },
  };
})(window);

(function (root) {
  'use strict';
  var records = new Map();
  var textSerial = 0;
  var gestureOwners = new WeakMap();
  root.LiquidDesignPluginClaim = function (host) {
    var group = host.closest('[data-lgp-group],[data-lgp-component]');
    var content = Array.from(host.children).find(function (el) { return el.matches('.lgp-content,.lgc-content'); });
    if (group && content) gestureOwners.set(group, content);
  };
  function snap(value) { return Math.round(value * 16) / 16; }
  root.LiquidDesignPluginSnap = snap;
  // Filter foreground glyphs only; never sample already-rendered glass.
  root.LiquidDesignPluginOcclusion = function (group, entries) {
    var owner = gestureOwners.get(group);
    var active = owner ? entries.find(function (item) {
      return item.content === owner && item.content.parentElement && item.content.parentElement.hasAttribute('data-lgp-front');
    }) || null : null;
    var defs = group.querySelector('svg defs');
    if (!defs) return;
    entries.forEach(function (item) {
      var content = item.content, effect = content._lgpTextEffect;
      if (!content.isConnected || !content.parentElement) return;
       function clear() {
         if (content.querySelector('svg')) root.LiquidDesignGlyphBlur(content, 0, 'occlusion');
        if (!effect) return;
        if (content.style.filter.indexOf(effect.id) !== -1) content.style.filter = effect.originalFilter;
        content.style.clipPath = effect.originalClip;
      }
      if (!active || item === active) { clear(); return; }
       var ownBox = item.box, box = active.box;
        if (box.x >= ownBox.x + ownBox.w || box.x + box.w <= ownBox.x || box.y >= ownBox.y + ownBox.h || box.y + box.h <= ownBox.y) { clear(); return; }
        if (group.dataset.lgpComponent === 'tools' && content.querySelector('svg')) {
          var overlapWidth = Math.min(box.x + box.w, ownBox.x + ownBox.w) - Math.max(box.x, ownBox.x);
          var overlapHeight = Math.min(box.y + box.h, ownBox.y + ownBox.h) - Math.max(box.y, ownBox.y);
          root.LiquidDesignGlyphBlur(content, 2 * Math.min(1, overlapWidth * overlapHeight / Math.max(1, ownBox.w * ownBox.h)), 'occlusion');
          return;
        }
       var rect = content.getBoundingClientRect();
      if (box.x >= rect.right || box.x+box.w <= rect.left || box.y >= rect.bottom || box.y+box.h <= rect.top) { clear(); return; }
      var matrix = new DOMMatrix(getComputedStyle(content).transform);
      var sx = Math.max(.01,Math.abs(matrix.a)), sy = Math.max(.01,Math.abs(matrix.d));
      if (!effect) {
        function node(tag, attrs) {
          var el=document.createElementNS('http://www.w3.org/2000/svg',tag);
          Object.keys(attrs).forEach(function(k){el.setAttribute(k,attrs[k]);}); return el;
        }
        var id='lgp-text-'+(++textSerial);
        var filter=node('filter',{id:id,filterUnits:'userSpaceOnUse',primitiveUnits:'userSpaceOnUse','color-interpolation-filters':'sRGB'});
        var coverParts=[];
        for(var part=0;part<2;part++) {
          var strip=node('feFlood',{'flood-color':'white',result:'strip'+part});filter.append(strip);coverParts.push(strip);
        }
        var circle='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="white"/></svg>');
        for(var corner=0;corner<4;corner++) {
          var cap=node('feImage',{href:circle,preserveAspectRatio:'none',result:'cap'+corner});filter.append(cap);coverParts.push(cap);
        }
        var maskMerge=node('feMerge',{result:'cover'});
        ['strip0','strip1','cap0','cap1','cap2','cap3'].forEach(function(name){maskMerge.append(node('feMergeNode',{in:name}));});
        filter.append(maskMerge,node('feComposite',{in:'SourceGraphic',in2:'cover',operator:'in',result:'inside'}),
          node('feGaussianBlur',{in:'inside',stdDeviation:'2',result:'soft'}),
          node('feComposite',{in:'soft',in2:'cover',operator:'in',result:'covered'}),
          node('feComposite',{in:'SourceGraphic',in2:'cover',operator:'out',result:'sharp'}));
        var merge=node('feMerge',{});merge.append(node('feMergeNode',{in:'sharp'}),node('feMergeNode',{in:'covered'}));filter.append(merge);defs.append(filter);
        effect={id:id,filter:filter,coverParts:coverParts,originalFilter:content.style.filter,originalClip:content.style.clipPath};content._lgpTextEffect=effect;
      }
      var width=content.offsetWidth,height=content.offsetHeight;
      effect.filter.setAttribute('x','-16');effect.filter.setAttribute('y','-16');
      effect.filter.setAttribute('width',width+32);effect.filter.setAttribute('height',height+32);
      var mx=snap((box.x-rect.left)/sx),my=snap((box.y-rect.top)/sy),mw=snap(box.w/sx),mh=snap(box.h/sy);
      var mrx=Math.min(mw/2,(box.rx===undefined?Math.min(box.w,box.h)/2:box.rx)/sx);
      var mry=Math.min(mh/2,(box.ry===undefined?Math.min(box.w,box.h)/2:box.ry)/sy);
      var regions=[[mx+mrx,my,Math.max(0,mw-2*mrx),mh],[mx,my+mry,mw,Math.max(0,mh-2*mry)],
        [mx,my,2*mrx,2*mry],[mx+mw-2*mrx,my,2*mrx,2*mry],
        [mx,my+mh-2*mry,2*mrx,2*mry],[mx+mw-2*mrx,my+mh-2*mry,2*mrx,2*mry]];
      effect.coverParts.forEach(function(part,i){['x','y','width','height'].forEach(function(k,j){part.setAttribute(k,snap(regions[i][j]));});});
      content.style.filter='url(#'+effect.id+')';
      // Contain blur output in the recipient's glass, with no backdrop layer.
      var own=item.box,x=snap((own.x-rect.left)/sx),y=snap((own.y-rect.top)/sy),w=snap(own.w/sx),h=snap(own.h/sy);
      var rx=snap((own.rx===undefined?Math.min(own.w,own.h)/2:own.rx)/sx),ry=snap((own.ry===undefined?Math.min(own.w,own.h)/2:own.ry)/sy);
      content.style.clipPath='path("M'+(x+rx)+','+y+'H'+(x+w-rx)+'A'+rx+','+ry+' 0 0 1 '+(x+w)+','+(y+ry)+'V'+(y+h-ry)+
        'A'+rx+','+ry+' 0 0 1 '+(x+w-rx)+','+(y+h)+'H'+(x+rx)+'A'+rx+','+ry+' 0 0 1 '+x+','+(y+h-ry)+
        'V'+(y+ry)+'A'+rx+','+ry+' 0 0 1 '+(x+rx)+','+y+'Z")';
    });
  };
  // Blend only genuinely adjacent lobes, never every surface in a group merely
  // because one unrelated button is being touched.
  root.LiquidDesignPluginContours = function (boxes, strength, exactPath) {
    var remaining = boxes.slice(), paths = [], connections = 0;
    while (remaining.length) {
      var cluster = [remaining.shift()], changed = true;
      while (changed) {
        changed = false;
        for (var i = remaining.length - 1; i >= 0; i--) {
          var b = remaining[i];
          if (cluster.some(function (a) {
            var dx = Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w);
            var dy = Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h);
            return Math.hypot(dx, dy) <= strength;
          })) { cluster.push(remaining.splice(i, 1)[0]); changed = true; }
        }
      }
      if (cluster.length === 1) paths.push(exactPath(cluster[0]));
      else {
        // The blend must begin at zero as the gap enters the proximity band.
        // A full-strength union at the threshold creates an instant broad neck.
        var closestGap = strength;
        for (var a = 0; a < cluster.length; a++) for (var b = a + 1; b < cluster.length; b++) {
          var dx = Math.max(0, cluster[a].x - cluster[b].x - cluster[b].w, cluster[b].x - cluster[a].x - cluster[a].w);
          var dy = Math.max(0, cluster[a].y - cluster[b].y - cluster[b].h, cluster[b].y - cluster[a].y - cluster[a].h);
          closestGap = Math.min(closestGap, Math.hypot(dx, dy));
        }
        var localStrength = Math.max(.1, strength - closestGap);
        var union = root.LiquidDesignUnion.outline(cluster, localStrength, true);
        paths.push(union.path); connections += union.connections;
      }
    }
    return { path: paths.join(' '), connections: connections };
  };
  function selected(scope, selector) {
    var list = Array.from(scope.querySelectorAll(selector));
    if (scope.matches && scope.matches(selector)) list.unshift(scope);
    return list;
  }
  function snapshot(el) {
    var names = ['style', 'class', 'hidden', 'inert', 'aria-hidden', 'aria-controls', 'aria-expanded', 'aria-haspopup',
      'data-liquid-cluster', 'data-liquid-button', 'data-liquid-toggle', 'data-liquid-menu', 'data-liquid-highlighted',
      'data-expanded', 'data-morph-phase', 'data-menu-direction', 'data-lgp-component', 'data-lgp-theme'];
    var values = names.map(function (name) { return el.getAttribute(name); });
    return function () { names.forEach(function (name, i) {
      if (values[i] === null) el.removeAttribute(name); else el.setAttribute(name, values[i]);
    }); };
  }
  root.LiquidDesignPluginComponents = {
    owns: function (el) { return !!el.closest('[data-lgp-component]'); },
    refresh: function (scope) {
      selected(scope, '[data-liquid-design-component]').forEach(function (group) {
        if (records.has(group)) { root.LiquidDesignComponents.init(group); return; }
        var kind = group.getAttribute('data-liquid-design-component');
        if (kind !== 'tools' && kind !== 'options') return;
        var trigger = group.querySelector('[data-liquid-design-toggle]');
        var panel = trigger && document.getElementById(trigger.getAttribute('data-liquid-design-toggle'));
        if (!panel || !group.contains(panel)) return;
        var restore = [group, trigger, panel].concat(Array.from(panel.querySelectorAll('[data-liquid-design]'))).map(snapshot);
        group.setAttribute('data-lgp-component', kind); group.setAttribute('data-liquid-cluster', '');
        var themeOwner = group.closest('[data-liquid-design-theme]');
        group.setAttribute('data-lgp-theme', themeOwner && themeOwner.getAttribute('data-liquid-design-theme') || 'auto');
        trigger.setAttribute('data-liquid-button', ''); trigger.setAttribute('data-liquid-toggle', panel.id);
        if (kind === 'options') { panel.setAttribute('data-liquid-menu', ''); trigger.setAttribute('aria-haspopup', 'true'); }
        else {
          panel.classList.add('lgd-tools');
          function positionTools() {
            if (trigger.getAttribute('aria-expanded') === 'true') return;
            var anchor = trigger.getBoundingClientRect(), g = group.getBoundingClientRect();
            var center = anchor.left + anchor.width / 2;
            var direction = center <= innerWidth / 2 ? 'right' : 'left';
            group.setAttribute('data-lgp-tools-direction', direction);
            var items = Array.from(panel.querySelectorAll('[data-liquid-design]'));
            var gap = parseFloat(getComputedStyle(group).getPropertyValue('--liquid-design-tools-gap'));
            if (!Number.isFinite(gap)) gap = 9;
            var offset = 0;
            items.forEach(function (item, i) {
              var style = getComputedStyle(item), width = parseFloat(style.width) || 52, height = parseFloat(style.height) || 52, x;
              if (direction === 'right') x = anchor.right - g.left + gap + offset;
              else x = anchor.left - g.left - gap - offset - width;
              item.style.left = x + 'px';
              item.style.top = anchor.top - g.top + (anchor.height - height) / 2 + 'px';
              offset += width + gap;
            });
          }
          positionTools();
          trigger.addEventListener('pointerdown', positionTools, true);
          trigger.addEventListener('click', positionTools, true);
          root.addEventListener('resize', positionTools);
          restore.push(function () {
            trigger.removeEventListener('pointerdown', positionTools, true); trigger.removeEventListener('click', positionTools, true);
            root.removeEventListener('resize', positionTools); group.removeAttribute('data-lgp-tools-direction');
          });
        }
        panel.querySelectorAll('[data-liquid-design]').forEach(function (el) { el.setAttribute('data-liquid-button', ''); });
        function blockUnavailable(event) {
          var control = event.target.closest('[data-liquid-button]');
          if (control && control.getAttribute('aria-disabled') === 'true') {
            event.preventDefault(); event.stopImmediatePropagation();
          }
        }
        function blockDrag(event) { event.preventDefault(); }
        var gesture = null, actionDragged = false;
        function pointerDown(event) {
          var control = event.target.closest('[data-liquid-button]');
          if (kind !== 'tools' || !control || control === trigger || event.button !== 0) return;
          gesture = { id: event.pointerId, el: control, x: event.clientX, y: event.clientY }; actionDragged = false;
        }
        function pointerMove(event) {
          if (gesture && gesture.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 2) actionDragged = true;
        }
        function guardAction(event) {
          if (gesture && event.target.closest('[data-liquid-button]') === gesture.el && event.detail !== 0 && actionDragged) {
            event.preventDefault(); event.stopImmediatePropagation(); actionDragged = false;
          }
        }
        group.addEventListener('pointerdown', pointerDown, true);
        group.addEventListener('pointermove', pointerMove, true);
        group.addEventListener('pointerup', pointerMove, true);
        group.addEventListener('click', guardAction, true);
        restore.push(function () {
          group.removeEventListener('pointerdown', pointerDown, true); group.removeEventListener('pointermove', pointerMove, true);
          group.removeEventListener('pointerup', pointerMove, true); group.removeEventListener('click', guardAction, true);
        });
        group.addEventListener('click', blockUnavailable, true);
        group.addEventListener('dragstart', blockDrag, true);
        restore.push(function () { group.removeEventListener('click', blockUnavailable, true); group.removeEventListener('dragstart', blockDrag, true); });
        records.set(group, { restore: restore }); root.LiquidDesignComponents.init(group);
      });
    },
    destroy: function (scope) {
      Array.from(records.keys()).forEach(function (group) {
        if (scope !== document && scope !== group && !scope.contains(group) && !group.contains(scope)) return;
        root.LiquidDesignComponents.destroy(group);
        records.get(group).restore.reverse().forEach(function (fn) { fn(); }); records.delete(group);
      });
    },
    prune: function () { Array.from(records.keys()).forEach(function (group) { if (!group.isConnected) root.LiquidDesignPluginComponents.destroy(group); }); },
  };
})(window);

(function (root) {
  'use strict';
  var controls = new Map(), groups = new Map(), serial = 0, paintFrame = 0, observer = null;
  var NS = 'http://www.w3.org/2000/svg';
  var colorMedia = root.matchMedia('(prefers-color-scheme: dark)');
  var layers = new Map();
  function layer(el) {
    if (layers.has(el)) return;
    var cleanup = [], originalZ = el.style.getPropertyValue('z-index'), originalPriority = el.style.getPropertyPriority('z-index');
    var timer = 0, active = false;
    function clear() {
      clearTimeout(timer); active = false; el.removeAttribute('data-lgp-front');
      if (originalZ) el.style.setProperty('z-index', originalZ, originalPriority); else el.style.removeProperty('z-index');
    }
    function front(event) {
      var target = event.target.closest('[data-lgp-control],[data-liquid-button],[data-liquid-menu]');
      if (target !== el && !el.matches('[data-lgp-group],[data-lgp-component]')) return;
      if (target === el && event.type === 'pointerdown') root.LiquidDesignPluginClaim(el);
      clearTimeout(timer); active = true; el.setAttribute('data-lgp-front', 'true');
       el.style.setProperty('z-index', 'var(--liquid-design-front-z, var(--z-chrome, 100))', 'important');
    }
    function release() {
      if (!active) return;
      clearTimeout(timer); timer = setTimeout(function () {
        if (el.contains(document.activeElement) || el.getAttribute('data-expanded') === 'true') return;
        clear();
      }, 1500);
    }
    listen(el, 'pointerdown', front, cleanup, true); listen(el, 'focusin', front, cleanup);
    listen(el, 'pointerup', release, cleanup); listen(el, 'pointercancel', release, cleanup);
    listen(el, 'lostpointercapture', release, cleanup); listen(el, 'focusout', release, cleanup);
    layers.set(el, function () { clear(); cleanup.forEach(function (fn) { fn(); }); });
  }
  function svg(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }
  function saveAttribute(el, name, value, owned) {
    var original = el.getAttribute(name);
    el.setAttribute(name, value);
    owned.push(function () {
      if (name !== 'data-lgp-theme' && el.getAttribute(name) !== value) return;
      if (original === null) el.removeAttribute(name); else el.setAttribute(name, original);
    });
  }
  function ownStyles(el, values, owned) {
    var empty = !el.hasAttribute('style');
    Object.keys(values).forEach(function (key) {
      var old = el.style.getPropertyValue(key), priority = el.style.getPropertyPriority(key);
      el.style.setProperty(key, values[key], 'important');
      owned.push(function () {
        if (el.style.getPropertyValue(key) !== values[key] || el.style.getPropertyPriority(key) !== 'important') return;
        if (old) el.style.setProperty(key, old, priority); else el.style.removeProperty(key);
      });
    });
    owned.unshift(function () { if (empty && !el.style.length) el.removeAttribute('style'); });
  }
  function listen(el, name, callback, cleanup, capture) {
    el.addEventListener(name, callback, !!capture);
    cleanup.push(function () { el.removeEventListener(name, callback, !!capture); });
  }
  // Writes only when the value changed. Any write to a glass layer's clip,
  // size or path invalidates its backdrop filter, and paint() runs on every
  // hover frame: unconditional writes re-blurred large panels (the chat
  // sidebar) each frame even when nothing moved.
  function setAttr(node, name, value) {
    value = String(value);
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function setStyle(node, name, value) {
    var cache = node._lgpStyle || (node._lgpStyle = {});
    if (cache[name] !== value) { cache[name] = value; node.style[name] = value; }
  }
  function theme(el) {
    var owner = el.closest('[data-liquid-design-theme]');
    var explicit = owner && owner.getAttribute('data-liquid-design-theme');
    if (explicit === 'dark' || explicit === 'light') return explicit;
    return el.closest('.dark') || colorMedia.matches ? 'dark' : 'light';
  }
  function schedule() {
    if (!paintFrame) paintFrame = root.requestAnimationFrame(function () {
      paintFrame = 0;
      Array.from(controls.values()).forEach(function (record) { if (!record.el.isConnected) removeControl(record); });
      groups.forEach(paint);
      document.querySelectorAll('[data-lgp-component]').forEach(function (el) { setAttr(el, 'data-lgp-theme', theme(el)); });
      root.LiquidDesignPluginComponents.prune();
      Array.from(layers.keys()).forEach(function (el) { if (!el.isConnected) { layers.get(el)(); layers.delete(el); } });
      detach();
    });
  }
  function createGroup(el) {
    var owned = [], id = 'lgp-' + (++serial);
    var style = getComputedStyle(el);
    ownStyles(el, { position: style.position === 'static' ? 'relative' : style.position, isolation: 'isolate' }, owned);
    saveAttribute(el, 'data-lgp-group', '', owned);
    saveAttribute(el, 'data-lgp-theme', theme(el), owned);
    var material = document.createElement('div'); material.className = 'lgp-material'; material.setAttribute('aria-hidden', 'true');
    var drawing = svg('svg', { 'class': 'lgp-outline', 'aria-hidden': 'true', focusable: 'false' });
    var defs = svg('defs');
    var clip = svg('clipPath', { id: id + '-clip', clipPathUnits: 'userSpaceOnUse' });
    var shape = svg('path'); clip.append(shape);
    var filter = svg('filter', { id: id + '-edge', x: '-5%', y: '-5%', width: '110%', height: '110%' });
    filter.append(svg('feMorphology', { in: 'SourceAlpha', operator: 'erode', radius: '1.1', result: 'inside' }));
    filter.append(svg('feComposite', { in: 'SourceGraphic', in2: 'inside', operator: 'out' }));
    var gradient = svg('linearGradient', { id: id + '-light', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    [['0%', '.275'], ['12%', '.125'], ['40%', '.015'], ['62%', '.01'], ['88%', '.05'], ['100%', '.15']].forEach(function (s) {
      gradient.append(svg('stop', { offset: s[0], 'stop-color': 'white', 'stop-opacity': s[1] }));
    });
    var edgeMask = svg('mask', { id: id + '-mask', maskUnits: 'userSpaceOnUse', 'mask-type': 'alpha' });
    var maskPath = svg('path', { fill: 'white', filter: 'url(#' + id + '-edge)' }); edgeMask.append(maskPath);
    var rim = svg('path', { 'class': 'lgp-rim', fill: 'none', stroke: 'url(#' + id + '-light)', 'stroke-width': '1.1' });
    var contrastRim = svg('path', { 'class': 'lgp-contrast-rim', fill: 'none', 'stroke-width': '1.2' });
    var prismGradient = svg('linearGradient', { id: id + '-prism', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    [['0%', '#bda9f5', '.8'], ['22%', '#749fe0', '.65'], ['45%', '#ceb5f0', '.05'], ['72%', '#9684e1', '.55'], ['100%', '#b8d1ff', '.8']].forEach(function (s) {
      prismGradient.append(svg('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] }));
    });
    var prism = svg('path', { 'class': 'lgp-prism-rim', fill: 'none', stroke: 'url(#' + id + '-prism)', 'stroke-width': '1.8' });
    defs.append(clip, filter, gradient, prismGradient, edgeMask); drawing.append(defs, contrastRim, prism, rim);
    material.style.clipPath = 'url(#' + id + '-clip)';
    var highlights = document.createElement('span'); highlights.className = 'lgp-highlights'; highlights.setAttribute('aria-hidden', 'true');
    highlights.style.clipPath = material.style.clipPath;
    el.prepend(material, drawing, highlights);
    var record = { el: el, owned: owned, material: material, highlights: highlights, drawing: drawing, shape: shape,
      maskPath: maskPath, mask: edgeMask, rim: rim, lightGradient: gradient, prism: prism,
      prismGradient: prismGradient, contrastRim: contrastRim, controls: new Set(), key: '', contour: null,
      refraction: root.LiquidDesignRefraction ? root.LiquidDesignRefraction.attach(material) : null,
      backdrop: root.LiquidDesignBackdrop ? root.LiquidDesignBackdrop.watch(el) : null };
    groups.set(el, record); return record;
  }
  function pathFor(b) {
    var x = b.x, y = b.y, w = b.w, h = b.h, rx = b.rx, ry = b.ry;
    if (rx < .01 || ry < .01) return 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + -w + 'Z';
    return 'M' + (x + rx) + ',' + y + 'H' + (x + w - rx) + 'A' + rx + ',' + ry + ' 0 0 1 ' + (x + w) + ',' + (y + ry) +
      'V' + (y + h - ry) + 'A' + rx + ',' + ry + ' 0 0 1 ' + (x + w - rx) + ',' + (y + h) + 'H' + (x + rx) +
      'A' + rx + ',' + ry + ' 0 0 1 ' + x + ',' + (y + h - ry) + 'V' + (y + ry) + 'A' + rx + ',' + ry + ' 0 0 1 ' + (x + rx) + ',' + y + 'Z';
  }
  function radii(el, w, h) {
    var bits = getComputedStyle(el).borderTopLeftRadius.split(/\s+/);
    function axis(s, size) { return s.indexOf('%') !== -1 ? parseFloat(s) * size / 100 : parseFloat(s) || 0; }
    var x = axis(bits[0], w), y = axis(bits[1] || bits[0], h);
    // CSS scales oversized radii uniformly; clamping axes independently makes
    // a 999px pill into an ellipse rather than semicircular-ended glass.
    var scale = Math.min(1, x ? w / (2 * x) : 1, y ? h / (2 * y) : 1);
    return { x: x * scale, y: y * scale };
  }
  function paint(group) {
    var anchor = group.el.getBoundingClientRect(), boxes = [], lights = [], foreground = [];
    // Nested controls inherit their editable parent's transform. Convert screen
    // measurements back to this group's local CSS space before painting, or the
    // child's material gets parent-scaled twice while its label scales once.
    // A rotated group (the chat rail's vertical toolbar pill) is measured
    // in its own unrotated frame; screen bounding boxes swap its axes.
    var frame = root.LiquidDesignFrame ? root.LiquidDesignFrame(group.el) : null;
    // The material follows a rotated control, but its reflected light remains
    // fixed to the page. Counter-rotate the gradients rather than the outline,
    // so the glass silhouette still turns with its host.
    var frameAngle = frame ? frame.angle : 0;
    if (frameAngle > 180) frameAngle -= 360;
    var lightRotation = frameAngle ? 'rotate(' + -frameAngle + ' .5 .5)' : '';
    if (group.lightGradient.getAttribute('gradientTransform') !== lightRotation) {
      group.lightGradient.setAttribute('gradientTransform', lightRotation);
    }
    function localRect(el) {
      if (!frame) return el.getBoundingClientRect();
      var r = el.getBoundingClientRect(), c = frame.toLocal(r.left + r.width / 2, r.top + r.height / 2);
      var w = el.offsetWidth * frame.scale, h = el.offsetHeight * frame.scale;
      return { left: c.x * frame.scale - w / 2, top: c.y * frame.scale - h / 2, width: w, height: h };
    }
    if (frame) anchor = { left: 0, top: 0, width: frame.width * frame.scale, height: frame.height * frame.scale };
    var ancestorScaleX = group.el.offsetWidth ? anchor.width / group.el.offsetWidth : 1;
    var ancestorScaleY = group.el.offsetHeight ? anchor.height / group.el.offsetHeight : 1;
    ancestorScaleX = Math.max(.01, ancestorScaleX); ancestorScaleY = Math.max(.01, ancestorScaleY);
    setAttr(group.el, 'data-lgp-theme', theme(group.el));
    group.controls.forEach(function (record) {
      // Host replacement may detach the wrapper before the adapter's queued
      // repair runs. Never paint stale foreground into this frame.
      if (record.content.parentNode !== record.el) return;
      var el = record.el, rect = localRect(el), f = record.state;
      setAttr(el, 'data-lgp-theme', theme(el));
      if (!rect.width || !rect.height || el.hidden || getComputedStyle(el).visibility === 'hidden') { record.glow.style.opacity = '0'; return; }
      var dx = 0, dy = 0, sx = 1, sy = 1;
      if (f && f.geometry.slabHalfWidth && f.geometry.slabHalfHeight) {
        dx = f.bounds.centerX - f.geometry.slabCenterX; dy = f.bounds.centerY - f.geometry.slabCenterY;
        sx = f.bounds.halfWidth / f.geometry.slabHalfWidth; sy = f.bounds.halfHeight / f.geometry.slabHalfHeight;
      }
      dx /= ancestorScaleX; dy /= ancestorScaleY;
      var localWidth = rect.width / ancestorScaleX, localHeight = rect.height / ancestorScaleY;
      record.content.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
      var radius = radii(el, localWidth, localHeight);
      // Constant highlight-to-surface area ratio; length scales by sqrt(area).
      // The 52px icon control retains the familiar 184px baseline footprint.
      var glowDiameter = 184 * Math.sqrt(localWidth * sx * localHeight * sy) / 52;
      record.glow.style.width = glowDiameter + 'px';
      record.glow.style.height = glowDiameter + 'px';
      boxes.push({ x: (rect.left - anchor.left) / ancestorScaleX + localWidth / 2 + dx - localWidth * sx / 2,
        y: (rect.top - anchor.top) / ancestorScaleY + localHeight / 2 + dy - localHeight * sy / 2,
        w: localWidth * sx, h: localHeight * sy, rx: radius.x * sx, ry: radius.y * sy,
        restW: localWidth, restH: localHeight });
      var last = boxes[boxes.length - 1];
      ['x','y','w','h','rx','ry'].forEach(function (key) { last[key] = root.LiquidDesignPluginSnap(last[key]); });
      foreground.push({ content: record.content, touch: f ? f.touch : 0,
        box: { x: anchor.left + last.x * ancestorScaleX, y: anchor.top + last.y * ancestorScaleY,
          w: last.w * ancestorScaleX, h: last.h * ancestorScaleY, rx: last.rx * ancestorScaleX, ry: last.ry * ancestorScaleY } });
      lights.push({ record: record, box: boxes[boxes.length - 1], diameter: glowDiameter,
        x: (anchor.width / 2 + (f ? f.lightPoint.x : 0)) / ancestorScaleX,
        y: (anchor.height / 2 + (f ? f.lightPoint.y : 0)) / ancestorScaleY, opacity: f ? f.touch : 0 });
    });
    root.LiquidDesignPluginOcclusion(group.el, foreground);
    // The chat sidebar action capsule already owns its exact inset geometry;
    // the generic multi-control contour expansion would add uneven-looking
    // outer space around the compact controls.
    // An explicit data-liquid-design-group is one shared piece of glass: its
    // lobes must melt across ordinary toolbar gaps (a 4px range left a 6px
    // flex gap as three separate pills). Automatic sibling groups keep the
    // narrow 4px range. --liquid-design-group-blend tunes the bridge.
    var blendRange = 4;
    if (group.el.matches('[data-page="chat"] .chat-sidebar-actions')) blendRange = 0;
    else if (group.el.hasAttribute('data-liquid-design-group')) {
      var customBlend = parseFloat(getComputedStyle(group.el).getPropertyValue('--liquid-design-group-blend'));
      blendRange = isFinite(customBlend) ? Math.max(0, customBlend) : 24;
    }
    var pad = boxes.length > 1 ? blendRange : 0;
    var minX = boxes.length ? Math.min.apply(null, boxes.map(function (b) { return b.x; })) - pad : 0;
    var minY = boxes.length ? Math.min.apply(null, boxes.map(function (b) { return b.y; })) - pad : 0;
    var w = boxes.length ? Math.max.apply(null, boxes.map(function (b) { return b.x + b.w; })) - minX + pad : 0;
    var h = boxes.length ? Math.max.apply(null, boxes.map(function (b) { return b.y + b.h; })) - minY + pad : 0;
    var cs = getComputedStyle(group.el);
    w = root.LiquidDesignPluginSnap(w); h = root.LiquidDesignPluginSnap(h);
    [group.material, group.drawing, group.highlights].forEach(function (layer) {
      setStyle(layer, 'left', (minX - (parseFloat(cs.borderLeftWidth) || 0)) + 'px');
      setStyle(layer, 'top', (minY - (parseFloat(cs.borderTopWidth) || 0)) + 'px');
      setStyle(layer, 'width', w + 'px'); setStyle(layer, 'height', h + 'px');
    });
    lights.forEach(function (light) {
      light.record.glow.style.left = light.x - minX + 'px'; light.record.glow.style.top = light.y - minY + 'px'; light.record.glow.style.opacity = light.opacity;
      var b = light.box;
      // Keep the bright center inside the curved face during long captured
      // pulls; an edge-clamped center was mostly clipped away at the corner.
      var inset = Math.min(b.w,b.h) * .25;
      light.x = Math.max(b.x+inset,Math.min(b.x+b.w-inset,light.x));
      light.y = Math.max(b.y+inset,Math.min(b.y+b.h-inset,light.y));
      light.record.glow.style.left = light.x-minX+'px';
      light.record.glow.style.top = light.y-minY+'px';
      light.record.glow.style.clipPath = 'path("' + pathFor({
        x: b.x - light.x + light.diameter / 2, y: b.y - light.y + light.diameter / 2,
        w: b.w, h: b.h, rx: b.rx, ry: b.ry
      }) + '")';
      light.record.glow.style.zIndex = light.record.el.hasAttribute('data-lgp-front') ? '2' : '1';
    });
    boxes.forEach(function (b) { b.x -= minX; b.y -= minY; });
    var individualOutline = boxes.map(pathFor).join(' ');
    var d = individualOutline, connections = 0;
    if (boxes.length > 1) {
      var key = blendRange + ':' + JSON.stringify(boxes);
      if (key !== group.key) { group.contour = root.LiquidDesignPluginContours(boxes, blendRange, pathFor); group.key = key; }
      connections = group.contour.connections;
      // Disconnected surfaces use exact SVG arcs, not sampled marching squares.
      // Only actual proximity/overlap needs a blended distance-field contour.
      if (connections) d = group.contour.path;
    }
    setAttr(group.shape, 'd', d);
    // An explicit local path avoids fragment-URL resolution differences when
    // layers are promoted or the page navigates to an anchor. The tinted fill
    // must share this contour too, otherwise an unresolved SVG clip paints a box.
    setStyle(group.material, 'clipPath', 'path("' + d + '")');
    // Rounded backdrop capture prevents a square blur tile showing through
    // outside an independent pill/circle's path-clipped material on desktop.
    setStyle(group.material, 'borderRadius', boxes.length === 1 ? boxes[0].rx + 'px / ' + boxes[0].ry + 'px' : '0px');
    // Single rounded shapes draw their edge light as a CSS ring (all browsers);
    // blended contours keep the SVG path rim.
    group.material.toggleAttribute('data-lgp-lens', boxes.length === 1);
    if (group.refraction) {
      if (boxes.length === 1) { var lens = boxes[0]; group.refraction.update(w, h, lens.rx, lens.ry, lens.restW, lens.restH); }
      // Rows and blended menus refract as one compound lens; the map follows
      // each lobe's rim, including the melted bridge between touching lobes.
      else group.refraction.updateShape(w, h, boxes, connections ? blendRange : 0);
    }
    setStyle(group.highlights, 'clipPath', 'path("' + d + '")');
    [group.maskPath, group.rim, group.contrastRim, group.prism].forEach(function (node) { setAttr(node, 'd', d); });
    var energy = 0, angle = 0;
    group.controls.forEach(function (record) {
      var state = record.state;
      if (!state || !state.geometry.slabHalfWidth || !state.geometry.slabHalfHeight) return;
      var stretch = Math.abs(state.bounds.halfWidth / state.geometry.slabHalfWidth - 1) + Math.abs(state.bounds.halfHeight / state.geometry.slabHalfHeight - 1);
      var response = Math.min(1, Math.max(0, state.touch) + stretch * 2);
      if (response >= energy) { energy = response; angle = Math.atan2(state.lightPoint.y, state.lightPoint.x) * 180 / Math.PI; }
    });
    setStyle(group.prism, 'opacity', 'calc(var(--liquid-design-prism-opacity, var(--lgp-prism-opacity, 0)) * ' + (.45 + energy * .55) + ')');
    var prismRotation = 'rotate(' + (angle * energy * .2 - frameAngle) + ' .5 .5)';
    if (group.prismGradient.getAttribute('gradientTransform') !== prismRotation) {
      group.prismGradient.setAttribute('gradientTransform', prismRotation);
    }
    setAttr(group.mask, 'x', '-2'); setAttr(group.mask, 'y', '-2'); setAttr(group.mask, 'width', w + 4); setAttr(group.mask, 'height', h + 4);
    setAttr(group.drawing, 'viewBox', '0 0 ' + Math.max(1, w) + ' ' + Math.max(1, h));
    setAttr(group.drawing, 'preserveAspectRatio', 'none');
    setAttr(group.material, 'data-surfaces', boxes.length); setAttr(group.material, 'data-connections', connections);
    if (!group.colors) group.colors = root.LiquidDesignColors.create(group.el, group.material, group.drawing);
    group.colors.paint(boxes, d);
  }
  function enhance(el) {
    if (controls.has(el) || el.matches('input, textarea, select, img, svg') || !el.isConnected) return;
    var independent = el.hasAttribute('data-liquid-design-independent');
    var container = !independent && el.parentElement && el.parentElement.closest('[data-liquid-design-group]');
    if (!independent && !container && el.parentElement && !el.parentElement.matches('body,form,[data-lgp-control="surface"],.lgp-content') && el.getAttribute('data-liquid-design') !== 'surface') {
      var peers = Array.from(el.parentElement.children).filter(function (peer) {
        return peer.hasAttribute('data-liquid-design') && peer.getAttribute('data-liquid-design') !== 'surface';
      });
      if (peers.length > 1) container = el.parentElement;
    }
    var group = groups.get(container || el) || createGroup(container || el);
    var owned = [], cleanup = [], cs = getComputedStyle(el);
    var surface = el.getAttribute('data-liquid-design') === 'surface';
    var content = document.createElement('span'); content.className = 'lgp-content';
    // Editable foreground (including native input glyphs/placeholders) shares
    // the material's exact X/Y transform, with a stable full-size layout box.
    if (surface) {
      content.style.width = '100%'; content.style.height = '100%';
      content.style.minHeight = '0'; content.style.boxSizing = 'border-box';
      content.style.flex = '1 1 auto';
    }
    content.style.display = surface ? (cs.display.indexOf('flex') !== -1 ? 'flex' : 'block') : 'inline-flex';
    if (independent) {
      content.style.display = cs.display.indexOf('grid') !== -1 ? cs.display : cs.display.indexOf('flex') !== -1 ? 'flex' : 'inline-block';
      if (cs.display.indexOf('flex') !== -1 || cs.display.indexOf('grid') !== -1) content.style.flex = '1 1 auto';
      ['gridTemplateColumns', 'gridTemplateRows', 'gridAutoFlow', 'columnGap', 'rowGap', 'textAlign'].forEach(function (key) { content.style[key] = cs[key]; });
    }
    if (!surface || cs.display.indexOf('flex') !== -1) {
      ['alignItems', 'justifyContent', 'flexDirection', 'flexWrap', 'gap'].forEach(function (key) { content.style[key] = cs[key]; });
    }
    // Leave padding, border widths, font, and dimensions owned by the host.
    ownStyles(el, { position: cs.position === 'static' ? 'relative' : cs.position,
      isolation: 'isolate', 'background-color': 'transparent', 'background-image': 'none',
       'border-color': 'transparent', 'box-shadow': 'var(--lgp-focus-shadow, none)', transform: independent ? 'var(--lg-site-layout-transform, none)' : 'none' }, owned);
    saveAttribute(el, 'data-lgp-control', surface ? 'surface' : 'button', owned);
    saveAttribute(el, 'data-lgp-theme', theme(el), owned);
    Array.from(el.childNodes).forEach(function (node) {
      if (node !== group.material && node !== group.drawing && node !== group.highlights) content.append(node);
    });
    el.append(content);
    var glow = document.createElement('span'); glow.className = 'lgp-glow'; group.highlights.append(glow);
    var record = { el: el, group: group, content: content, glow: glow, owned: owned, cleanup: cleanup, motion: null, state: null };
    controls.set(el, record); group.controls.add(record);
    var pointer = null, start = null, dragged = false;
    listen(el, 'dragstart', function (event) {
      if (!surface) event.preventDefault();
    }, cleanup, true);
    listen(el, 'pointerdown', function (event) {
      if (surface || event.button !== 0) return;
      pointer = event.pointerId; start = { x: event.clientX, y: event.clientY }; dragged = false;
    }, cleanup, true);
    listen(el, 'pointermove', function (event) {
      if (event.pointerId === pointer && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 2) dragged = true;
    }, cleanup, true);
    listen(el, 'pointerup', function (event) {
      if (event.pointerId !== pointer) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 2) dragged = true;
      pointer = null;
    }, cleanup, true);
    listen(el, 'pointercancel', function () { pointer = null; dragged = true; }, cleanup, true);
    listen(el, 'click', function (event) {
      if (surface && event.target.closest('button,a,input,textarea,select') !== el) return;
      if (el.getAttribute('aria-disabled') === 'true' || (event.detail !== 0 && dragged)) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
      dragged = false;
    }, cleanup, true);
    listen(el, 'keydown', function (event) {
      if (!surface && el.getAttribute('aria-disabled') === 'true' && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, cleanup, true);
    record.motion = root.LiquidDesignLiveDemo.create(group.el, {
      button: el, slab: el, track: group.el, editableSurface: surface,
      staticActionSurface: el.hasAttribute('data-liquid-design-static-actions'),
      staticMotion: !!navigator.webdriver || (document.documentElement.hasAttribute('data-glass-child') && !el.closest('.ov-nav,.ov-social-nav,.hero-search,[data-page="home"] .hero-profile,#hero-bar,#results-bar,#hero-search,#results-search,#ai-mode-toggle,[data-page="ai-home"],[data-page="liquid-docs"],[data-page="chat"],[data-page="word"]')),
      deformationScale: surface ? .33 : undefined, centerCoupling: surface ? .025 : undefined, centerLimit: surface ? 5 : undefined,
      render: function (state) { record.state = state; schedule(); },
    });
    if (el.matches('button[type="submit"],button:not([type])') && el.parentElement.closest('[data-lgp-control="surface"]')) {
      saveAttribute(el, 'data-lgp-pinned', 'true', owned);
      ownStyles(el, { 'z-index': 'var(--z-chrome, 100)' }, owned);
    }
    paint(group);
  }
  function removeControl(record) {
    record.motion.destroy(); record.cleanup.forEach(function (fn) { fn(); });
    record.glow.remove();
    if (record.content._lgpTextEffect) record.content._lgpTextEffect.filter.remove();
    // A host innerHTML/textContent replacement deliberately discards old content.
    if (record.content.parentNode === record.el) {
      while (record.content.firstChild) record.el.insertBefore(record.content.firstChild, record.content);
    }
    record.content.remove(); record.owned.slice().reverse().forEach(function (fn) { fn(); });
    controls.delete(record.el); record.group.controls.delete(record);
    if (!record.group.controls.size) {
      if (record.group.colors) record.group.colors.destroy();
      if (record.group.refraction) record.group.refraction.destroy();
      if (record.group.backdrop) record.group.backdrop.destroy();
      record.group.material.remove(); record.group.drawing.remove(); record.group.highlights.remove();
      record.group.owned.slice().reverse().forEach(function (fn) { fn(); });
      groups.delete(record.group.el);
    } else paint(record.group);
  }
  function attach() {
    if (observer || (!controls.size && !document.querySelector('[data-lgp-component]'))) return;
    observer = new MutationObserver(function (mutations) {
      if (mutations.some(function (mutation) {
        var target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (!target || target.closest('.lgp-material,.lgp-outline,.lgc-material,.lgc-outline')) return false;
        if (mutation.type === 'attributes') return target.matches('html,body') || !!target.closest('[data-lgp-control],[data-lgp-component]') || !!target.querySelector('[data-lgp-control],[data-lgp-component]');
        if (target.closest('[data-lgp-control],[data-lgp-component]')) return true;
        return Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).some(function (node) {
          return node.nodeType === 1 && (node.matches('[data-lgp-control],[data-lgp-component]') || node.querySelector('[data-lgp-control],[data-lgp-component]'));
        });
      })) schedule();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-liquid-design-theme'] });
    root.addEventListener('scroll', schedule, true); root.addEventListener('resize', schedule);
    colorMedia.addEventListener('change', schedule);
  }
  function detach() {
    if (controls.size || document.querySelector('[data-lgp-component]')) return;
    if (observer) observer.disconnect(); observer = null;
    root.removeEventListener('scroll', schedule, true); root.removeEventListener('resize', schedule);
    colorMedia.removeEventListener('change', schedule);
    root.cancelAnimationFrame(paintFrame); paintFrame = 0;
  }
  root.LiquidDesign = {
    menuFrame: root.LiquidDesignMenuMotion.frame,
    setGlyphBlur: function (content, amount) { root.LiquidDesignGlyphBlur(content, amount, 'morph'); },
    refresh: function (scope) {
      scope = scope || document;
      root.LiquidDesignPluginComponents.refresh(scope);
      var nodes = Array.from(scope.querySelectorAll('[data-liquid-design]'));
      if (scope.matches && scope.matches('[data-liquid-design]')) nodes.unshift(scope);
      nodes.forEach(function (el) { if (!root.LiquidDesignPluginComponents.owns(el)) enhance(el); });
      var selector = '[data-lgp-control],[data-lgp-group],[data-lgp-component],[data-lgp-component] [data-liquid-button],[data-lgp-component] [data-liquid-menu]';
      var surfaces = Array.from(scope.querySelectorAll(selector));
      if (scope.matches && scope.matches(selector)) surfaces.unshift(scope);
      surfaces.forEach(layer);
      controls.forEach(function (record) {
        if (!record.el.isConnected) removeControl(record);
        else if (scope === record.el || scope.contains(record.el)) {
          var el = record.el;
          if (record.content.parentNode !== el) {
            record.content.replaceChildren();
            Array.from(el.childNodes).forEach(function (node) {
              if (node !== record.group.material && node !== record.group.drawing && node !== record.group.highlights) record.content.append(node);
            });
            el.prepend(record.group.material, record.group.drawing, record.group.highlights); el.append(record.content);
          } else {
            Array.from(el.childNodes).forEach(function (node) {
              if (node !== record.content && node !== record.group.material && node !== record.group.drawing && node !== record.group.highlights) record.content.append(node);
            });
          }
          record.motion.refresh();
        }
      });
      attach(); schedule();
    },
    repaint: function (scope) {
      scope = scope || document;
      groups.forEach(function (group) {
        if (scope === document || scope === group.el || scope.contains(group.el)) paint(group);
      });
    },
    destroy: function (scope) {
      scope = scope || document;
      Array.from(layers.keys()).forEach(function (el) {
        if (scope === document || scope === el || scope.contains(el)) { layers.get(el)(); layers.delete(el); }
      });
      root.LiquidDesignPluginComponents.destroy(scope);
      Array.from(controls.values()).forEach(function (record) {
        if (scope === document || scope === record.el || scope.contains(record.el)) removeControl(record);
      });
      detach();
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { root.LiquidDesign.refresh(); }, { once: true });
  else root.LiquidDesign.refresh();
})(window);

(function (root) {
  'use strict';
  // Optional coordination for two existing, independently positioned components.
  var records = new Map();
  function refresh(scope) {
    var hosts = Array.from(scope.querySelectorAll('[data-liquid-design-navigation]'));
    if (scope.matches && scope.matches('[data-liquid-design-navigation]')) hosts.unshift(scope);
    hosts.forEach(function (host) {
      if (records.has(host)) return;
      var options = host.querySelector('[data-liquid-design-component="options"]');
      var tools = host.querySelector('[data-liquid-design-component="tools"]');
      if (!options || !tools) return;
      var menuTrigger = options.querySelector('[data-liquid-design-toggle]');
      var toolsTrigger = tools.querySelector('[data-liquid-design-toggle]');
      var menu = document.getElementById(menuTrigger.getAttribute('data-liquid-design-toggle'));
      var panel = document.getElementById(toolsTrigger.getAttribute('data-liquid-design-toggle'));
      var mover = options.closest('[data-liquid-design-move]') || options;
      var originalTransform = mover.style.transform;
      var originalOffset = options.style.getPropertyValue('--liquid-design-menu-offset-y');
      var originalTransition = mover.style.transition;
      var displaced = 0;
      if (navigator.webdriver || root.matchMedia('(prefers-reduced-motion: reduce)').matches) mover.style.transition = 'none';
      function arrange(toolOpen, menuOpen) {
        var anchor = toolsTrigger.getBoundingClientRect();
        var rect = mover.getBoundingClientRect();
        // Read the current transition offset, not its final target. Reversal or
        // reopening during the slide must keep the original layout anchor.
        var transform = getComputedStyle(mover).transform;
        var shift = transform === 'none' ? 0 : new DOMMatrix(transform).e;
        var left = rect.left - shift;
        var gap = parseFloat(getComputedStyle(host).getPropertyValue('--liquid-design-navigation-gap')) || 12;
        var actionLeft = anchor.left, actionRight = anchor.right;
        panel.querySelectorAll('[data-liquid-button]').forEach(function (item) {
          var r = item.getBoundingClientRect();
          actionLeft = Math.min(actionLeft, r.left); actionRight = Math.max(actionRight, r.right);
        });
        var collision = toolOpen && actionLeft < left + rect.width + gap && actionRight > left - gap;
        displaced = collision ? left + rect.width + gap : 0;
        mover.style.transform = displaced ? 'translateX(-' + displaced + 'px)' : originalTransform;
        var width = parseFloat(getComputedStyle(menu).width) || 200;
        var menuCollision = left + width + gap > anchor.left && left < anchor.right;
        options.style.setProperty('--liquid-design-menu-offset-y', menuOpen && menuCollision ? Math.max(0, anchor.bottom + gap - rect.top) + 'px' : originalOffset || '0px');
      }
      function closeTools() {
        if (toolsTrigger.getAttribute('aria-expanded') === 'true') toolsTrigger.click();
      }
      function prepare(event) {
        var target = event.target.closest('[data-liquid-design-toggle]');
        if (target === menuTrigger) {
          closeTools(); arrange(false, true);
        } else if (target === toolsTrigger && event.type === 'click') {
          arrange(toolsTrigger.getAttribute('aria-expanded') !== 'true', false);
        }
      }
      function key(event) {
        if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].indexOf(event.key) !== -1) prepare(event);
      }
      function update() {
        if (menuTrigger.getAttribute('aria-expanded') === 'true') closeTools();
        arrange(toolsTrigger.getAttribute('aria-expanded') === 'true', menuTrigger.getAttribute('aria-expanded') === 'true');
      }
      host.addEventListener('pointerdown', prepare, true);
      host.addEventListener('click', prepare, true);
      host.addEventListener('keydown', key, true);
      var observer = new MutationObserver(update);
      [menuTrigger, toolsTrigger].forEach(function (el) { observer.observe(el, { attributes: true, attributeFilter: ['aria-expanded'] }); });
      root.addEventListener('resize', update);
      records.set(host, function () {
        observer.disconnect(); root.removeEventListener('resize', update);
        host.removeEventListener('pointerdown', prepare, true); host.removeEventListener('click', prepare, true); host.removeEventListener('keydown', key, true);
        mover.style.transform = originalTransform; mover.style.transition = originalTransition;
        if (originalOffset) options.style.setProperty('--liquid-design-menu-offset-y', originalOffset);
        else options.style.removeProperty('--liquid-design-menu-offset-y');
      });
      update();
    });
  }
  var api = root.LiquidDesign;
  var originalRefresh = api.refresh, originalDestroy = api.destroy;
  api.refresh = function (scope) { scope = scope || document; originalRefresh(scope); refresh(scope); };
  api.destroy = function (scope) {
    scope = scope || document;
    records.forEach(function (cleanup, host) {
      if (scope === document || scope === host || scope.contains(host)) { cleanup(); records.delete(host); }
    });
    originalDestroy(scope);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { refresh(document); }, { once: true });
  else refresh(document);
})(window);

host.LiquidDesign=window.LiquidDesign;
})(window);
