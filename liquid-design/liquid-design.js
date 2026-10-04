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
    var centerCoupling = clamp(config.centerCoupling, 0.05, 0.08);
    var stretchGain = clamp(Number(config.fluidStretchGain) || 1, 1, 3);
    var stretchRatio = clamp(Number(config.fluidStretchRatio) || 0.55, 0.1, 0.7);
    var facingShare = 0.88;
    var oppositeShare = 1 - facingShare;
    // stretchLimit is the maximum facing-edge extension in CSS pixels.
    var horizontalFacingLimit = Math.min(config.stretchLimit, width * stretchRatio);
    var verticalFacingLimit = Math.min(config.stretchLimit, height * stretchRatio);
    var horizontalPressure = Math.abs(rubberBand(
      input.pointerDx,
      centerCoupling * 3 * stretchGain,
      horizontalFacingLimit / facingShare,
    ));
    var verticalPressure = Math.abs(rubberBand(
      input.pointerDy,
      centerCoupling * 3 * stretchGain,
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
    var reduced = !!options.staticMotion || root.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    });
    var attack = Object.assign({}, Physics.IPAD_FLUID_SPRING, {
      springFrequency: 23, springDamping: 0.42,
    });
    var release = Object.assign({}, Physics.IPAD_FLUID_SPRING, {
      springFrequency: options.releaseFrequency || 15, springDamping: 0.40,
    });
    var lightSpringConfig = Object.assign({}, Physics.IPAD_FLUID_SPRING, {
      springFrequency: 42, springDamping: 0.48,
    });

    function measure() {
      var rect = options.measureRect ? options.measureRect() : slab.getBoundingClientRect();
      var radius = parseFloat(getComputedStyle(slab).borderTopLeftRadius);
      restingRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        radius: Number.isFinite(radius) ? radius : Math.min(rect.width, rect.height) / 2 };
      trackRect = track.getBoundingClientRect();
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

    function tick(time) {
      frameId = 0;
      measure();
      var dt = lastTime ? Math.min((time - lastTime) / 1000, 1 / 30) : 1 / 60;
      lastTime = time;
      releaseElapsed = pressing ? 0 : releaseElapsed + dt;
      var outside = pointerId !== null ? Physics.pointerOutsideGlass(pointerX, pointerY, restingRect) : { x: 0, y: 0 };
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
        target.centerOffsetX = Physics.rubberBand(pointerX - startX, options.centerCoupling || 0.06, options.centerLimit || 14);
        target.centerOffsetY = Physics.rubberBand(pointerY - startY, options.centerCoupling || 0.06, options.centerLimit || 14);
        var horizontal = Math.abs(outside.x);
        var vertical = Math.abs(outside.y);
        // Smooth axis preference suppresses squeeze at diagonal crossover.
        // Contact adds .24/.36 of its amplitude to full height/width, so
        // compensate that bulge as the facing-edge stretch grows.
        var xWeight = Math.max(0, horizontal - vertical) / Math.max(1, horizontal);
        var yWeight = Math.max(0, vertical - horizontal) / Math.max(1, vertical);
        target.compressionY += (7.68 + geometry.slabHalfHeight * .16) * (1 - Math.exp(-horizontal / 48)) * xWeight;
        target.compressionX += (11.52 + geometry.slabHalfWidth * .12) * (1 - Math.exp(-vertical / 48)) * yWeight;
      }
      var motion = pressing ? attack : release;
      springNames.forEach(function (name) {
        springs[name] = Physics.stepSpring(springs[name], target[name], dt, motion);
      });
      contact = Physics.stepSpring(contact, pressing && !reduced ? 32 : 0, dt, motion);
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
      if (!reduced && contact.x < 12) contact = { x: 12, velocity: 0 };
      if (!reduced) {
        // Give the stored deformation a return-directed impulse. Signed springs
        // then cross rest naturally, so the rebound goes opposite to the pull.
        springNames.forEach(function (name) {
          var spring = springs[name];
          if (Math.abs(spring.x) < 0.1) return;
          spring.velocity = -spring.x * release.springFrequency * 0.55;
        });
      }
      if (button.hasPointerCapture(captured)) button.releasePointerCapture(captured);
      wake();
    }

    listen(button, 'pointerdown', function (event) {
      if (button.disabled || event.button !== 0 || pointerId !== null) return;
      if (options.editableSurface && event.target.closest('button, a')) return;
      if (options.editableSurface && event.target.closest('input, textarea, select, [contenteditable]')) {
        // Let the native field place its caret/select text until the pointer
        // leaves the resting glass. Then hand that same gesture to the spring.
        measure();
        editingPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        startX = pointerX = event.clientX; startY = pointerY = event.clientY;
        pressing = !reduced; releaseElapsed = 0; touchTarget = reduced ? 0 : 1;
        lastTouchPoint = { x: event.clientX - trackRect.left - trackRect.width / 2,
          y: event.clientY - trackRect.top - trackRect.height / 2 };
        wake();
        return;
      }
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
        var outside = Physics.pointerOutsideGlass(event.clientX, event.clientY, restingRect);
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
        if (!reduced && contact.x < 12) contact = { x: 12, velocity: 0 };
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
      if (!reduced && contact.x < 12) contact = { x: 12, velocity: 0 };
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
            var strength = .072 * proximity;
            var color = source.getAttribute('data-liquid-color-source') || style.backgroundColor;
            if (!root.CSS.supports('color', color)) return;
            var spill = document.createElement('span'); spill.className = 'lg-color-spill';
            var rx = Math.min(180, Math.max(65, s.width)), ry = Math.min(180, Math.max(65, s.height));
            // Broad along the object's facing edge; shorter across the glass.
            if (x === b.x || x === b.x+b.w) { rx=85; ry=Math.min(180,Math.max(65,s.height*1.3)); }
            else { ry=85; rx=Math.min(180,Math.max(65,s.width*1.3)); }
            spill.style.cssText = 'position:absolute;pointer-events:none;inset:0;opacity:'+strength+';background:radial-gradient(ellipse '+rx+'px '+ry+'px at '+x+'px '+y+'px,'+color+' 0%,transparent 100%)';
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
  var instances = new Map();
  var serial = 0;
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
      var dark = document.documentElement.classList.contains('dark');
      var stops = gradient.querySelectorAll('stop');
       var pluginMaterial = group.hasAttribute('data-lgp-component');
       (pluginMaterial ? [.55, .25, .03, .02, .10, .30] : [.24, .10, .012, .008, .035, .12]).forEach(function (v, i) { stops[i].setAttribute('stop-opacity', v); });
       if (pluginMaterial) filter.querySelector('feMorphology').setAttribute('radius', '1.1');
      records.forEach(function (record, el) {
        if (!visible(el)) { record.glow.style.opacity = 0; return; }
        var r = el.getBoundingClientRect();
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
        if (pluginMaterial) {
          var glowDiameter = 184 * Math.sqrt(b.w * b.h) / 52;
          record.glow.style.width = glowDiameter + 'px'; record.glow.style.height = glowDiameter + 'px';
        }
        var declaredRadius = parseFloat(getComputedStyle(el).borderTopLeftRadius);
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
      ghosts.forEach(function (ghost) {
        var r = ghost.getBoundingClientRect();
        boxes.push({ x: r.left - rect.left, y: r.top - rect.top, w: r.width, h: r.height });
      });
      if (menuPaint) boxes = menuPaint(boxes, rect);
      if (toolsPaint) boxes = toolsPaint(boxes, rect);
       if (searchPaint) boxes = searchPaint(boxes, rect);
       if (pluginMaterial) boxes.forEach(function (b) {
         ['x','y','w','h','r','rx','ry'].forEach(function (key) {
           if (b[key] !== undefined) b[key] = root.LiquidDesignPluginSnap(b[key]);
         });
       });
       if (pluginMaterial && toolsPaint) {
         var foreground = [], index = 0;
         records.forEach(function (record, el) {
           if (!visible(el)) return;
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
      shape.setAttribute('d', d);
      highlights.style.clipPath = 'path("' + d + '")';
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
          staticMotion: document.documentElement.hasAttribute('data-glass-child') && !group.closest('.ov-nav,.ov-social-nav'),
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
      toolsPaint = function (boxes, rect) {
        advance(performance.now());
        if (panel.hidden) return boxes;
        var native = items.map(function (el) {
          var r = el.getBoundingClientRect();
          return { x: r.left - rect.left, y: r.top - rect.top, w: r.width, h: r.height };
        });
        var first = native[0], last = native[native.length - 1];
        // The trigger is the persistent identity. Actions emerge from its
        // fixed native center, never from the expanding toolbar's midpoint.
        var sourceX = first.x + first.w / 2;
        var p = progress, reveal = Math.max(0, Math.min(1, p));
        var fade = reveal * reveal * (3 - 2 * reveal);
        return native.map(function (b, i) {
          var r = records.get(items[i]), f = r.state;
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
          r.content.style.filter = blur > .02 ? 'blur(' + blur + 'px)' : 'none';
          return { x: cx - w / 2, y: cy - h / 2, w: w, h: h,
            rx: Math.min(b.w, b.h) / 2 * sx * growth, ry: Math.min(b.w, b.h) / 2 * sy * growth };
        });
      };
      activation(trigger, function () { set(!open, false); });
      listen(group, 'keydown', function (e) {
        if (e.key === 'Escape' && open) { e.preventDefault(); set(false, true); }
      });
      cleanups.push(function () {
        items.forEach(function (el) { var r = records.get(el); r.content.style.opacity = ''; r.content.style.filter = ''; });
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
        deformationScale: .28, centerCoupling: .045, centerLimit: 10,
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
      group.dataset.morphPhase = 'settled';
      function box(el) {
        var a = el.getBoundingClientRect(), g = group.getBoundingClientRect();
        return { x: a.left - g.left, y: a.top - g.top, w: a.width, h: a.height, r: 26 };
      }
      function menuRadius() {
        // Highlight radius + its row inset + the sheet's outer padding.
        var padding = parseFloat(getComputedStyle(panel).paddingTop) || 0;
        return Math.max(0, items[0].offsetHeight - 8) / 2 + 4 + padding;
      }
      function mix(a, b, p) {
        var out = {};
        ['x', 'y', 'w', 'h', 'r'].forEach(function (key) { out[key] = a[key] + (b[key] - a[key]) * p; });
        out.w = Math.max(20, out.w); out.h = Math.max(20, out.h);
        return out;
      }
      function highlight(item) {
        selected = item;
        items.forEach(function (el) { el.setAttribute('data-liquid-highlighted', String(el === item)); });
        if (item) {
          selectionPill.style.opacity = '1';
          selectionPill.style.width = Math.max(0, item.offsetWidth - 8) + 'px';
          selectionPill.style.height = Math.max(0, item.offsetHeight - 8) + 'px';
          selectionPill.style.transform = 'translate(' + (item.offsetLeft + 4) + 'px,' + (item.offsetTop + 4) + 'px)';
        } else selectionPill.style.opacity = '0';
      }
      function needsUpwardOpening() {
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
        cancelHold();
        var interrupted = !!start;
        if (interrupted) paint();
        source = current || box(open ? panel : trigger);
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
          top = Math.max(12, Math.min(innerHeight - menuHeight - 12, top));
          panel.style.top = (top - bounds.top) + 'px';
          group.dataset.menuDirection = up ? 'up' : 'down';
        }
        trigger.setAttribute('aria-expanded', String(value));
        trigger.style.visibility = value ? 'hidden' : '';
        group.dataset.expanded = String(value);
        target = box(value ? panel : trigger);
        target.r = value ? menuRadius() : 26;
        if (value && (!interrupted || pathPosition === 0)) {
          if (!interrupted) { pathPill = box(trigger); pathMenu = target; }
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
          var originalFace = records.get(trigger).content.cloneNode(true);
          originalFace.style.transform = 'none';
          morphFace.append(originalFace);
          group.append(morphFace);
          trigger.style.visibility = 'hidden';
        }
        start = reduced() ? 0 : performance.now();
        group.dataset.morphPhase = reduced() ? 'settled' : 'expand';
        if (focus) (value ? items[0] : trigger).focus({ preventScroll: true });
        if (!value) highlight(null);
        paint(); refresh(reduced() ? 0 : pathDuration + (value ? 60 : 1200));
      }
      menuPaint = function (boxes, rect) {
        panel.style.transform = 'none';
        if (!open && !start) {
          current = boxes[0] || box(trigger);
          group.dataset.morphPhase = 'settled';
          material.dataset.menu = 'false';
          return [current];
        }
        var now = performance.now(), elapsed = start ? now - start : pathDuration + 1;
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
        if (elapsed < pathDuration || (springMotion && !springMotion.settled)) {
          current = trajectory;
          group.dataset.morphPhase = elapsed < pathDuration ? 'expand' : 'overshoot';
          if (!open && elapsed >= pathDuration) panelState(panel, false);
          if (morphFace) {
            morphFace.style.left = current.x + 'px'; morphFace.style.top = current.y + 'px';
            morphFace.style.width = current.w + 'px'; morphFace.style.height = current.h + 'px';
            morphFace.style.opacity = trajectory.face;
          }
        } else {
          current = box(open ? panel : trigger); current.r = open ? menuRadius() : 26;
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
          var nativePill = pathPill || box(trigger);
          morphFace.style.left = nativePill.x + 'px'; morphFace.style.top = nativePill.y + 'px';
          morphFace.style.width = nativePill.w + 'px'; morphFace.style.height = nativePill.h + 'px';
          morphFace.style.transform = 'translate(' + (current.x + current.w / 2 - nativePill.x - nativePill.w / 2) + 'px,' +
            (current.y + current.h / 2 - nativePill.y - nativePill.h / 2) + 'px) scale(' + current.w / nativePill.w + ',' + current.h / nativePill.h + ')';
          morphFace.style.opacity = trajectory ? trajectory.face : (open ? 0 : 1);
          if (!start) {
            morphFace.remove(); morphFace = null;
            trigger.style.visibility = open ? 'hidden' : '';
          }
        }
        var reveal = trajectory ? trajectory.reveal : (open ? 1 : 0);
        if (group.hasAttribute('data-lgp-component') && !open && start) {
          // Rows leave before the sheet becomes a circle; never squeeze stale
          // selection/text into the returning Options identity.
          var closingReveal = Math.max(0, Math.min(1, (pathTime - .48) / .32));
          reveal *= closingReveal * closingReveal * (3 - 2 * closingReveal);
        }
        var menuGlow = records.get(trigger).glow;
        if (open && menuState) {
          var menuGlowDiameter = group.hasAttribute('data-lgp-component') ? 184 * Math.sqrt(current.w * current.h) / 52 : 260;
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
        else if (e.type === 'pointerup' && open) items[0].focus({ preventScroll: true });
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
      function pointItem(e) {
        return items.find(function (item) {
          var r = item.getBoundingClientRect();
          return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        }) || null;
      }
      listen(panel, 'pointerdown', function (e) {
        if (!open || start || e.button !== 0) return;
        menuPointer = e.pointerId;
        menuStartX = e.clientX; menuStartY = e.clientY; menuDragged = false;
        ignoreReleaseClick = false;
        panel.setPointerCapture(menuPointer);
        highlight(pointItem(e));
      });
      listen(panel, 'pointermove', function (e) {
        if (e.pointerId === menuPointer && Math.hypot(e.clientX - menuStartX, e.clientY - menuStartY) > 2) menuDragged = true;
        if (open && (menuPointer === null || menuPointer === e.pointerId)) {
          var item = pointItem(e);
          highlight(item);
        }
      });
      listen(panel, 'pointerup', function (e) {
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
        if (!open || !panel.contains(e.target)) return;
        var index = items.indexOf(document.activeElement);
        var next = { ArrowDown: (index + 1) % items.length, ArrowUp: (index + items.length - 1) % items.length, Home: 0, End: items.length - 1 }[e.key];
        if (next !== undefined) { e.preventDefault(); items[next].focus(); highlight(items[next]); }
      });
      listen(document, 'pointerdown', function (e) { if (!group.contains(e.target) && open) set(false, false); });
      listen(document, 'focusin', function (e) { if (!group.contains(e.target) && open && held === null) set(false, false); });
        cleanups.push(function () { if (morphFace) morphFace.remove(); selectionPill.remove(); trigger.style.visibility = ''; });
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
        if (!effect) return;
        if (content.style.filter.indexOf(effect.id) !== -1) content.style.filter = effect.originalFilter;
        content.style.clipPath = effect.originalClip;
      }
      if (!active || item === active) { clear(); return; }
      var rect = content.getBoundingClientRect(), box = active.box;
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
      el.style.setProperty('z-index', 'var(--z-chrome, 100)', 'important');
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
      document.querySelectorAll('[data-lgp-component]').forEach(function (el) { el.setAttribute('data-lgp-theme', theme(el)); });
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
    [['0%', '.55'], ['12%', '.25'], ['40%', '.03'], ['62%', '.02'], ['88%', '.10'], ['100%', '.30']].forEach(function (s) {
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
      maskPath: maskPath, mask: edgeMask, rim: rim, prism: prism, prismGradient: prismGradient, contrastRim: contrastRim, controls: new Set(), key: '', contour: null };
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
    var ancestorScaleX = group.el.offsetWidth ? anchor.width / group.el.offsetWidth : 1;
    var ancestorScaleY = group.el.offsetHeight ? anchor.height / group.el.offsetHeight : 1;
    ancestorScaleX = Math.max(.01, ancestorScaleX); ancestorScaleY = Math.max(.01, ancestorScaleY);
    group.el.setAttribute('data-lgp-theme', theme(group.el));
    group.controls.forEach(function (record) {
      // Host replacement may detach the wrapper before the adapter's queued
      // repair runs. Never paint stale foreground into this frame.
      if (record.content.parentNode !== record.el) return;
      var el = record.el, rect = el.getBoundingClientRect(), f = record.state;
      el.setAttribute('data-lgp-theme', theme(el));
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
        w: localWidth * sx, h: localHeight * sy, rx: radius.x * sx, ry: radius.y * sy });
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
    var blendRange = 4;
    var pad = boxes.length > 1 ? blendRange : 0;
    var minX = boxes.length ? Math.min.apply(null, boxes.map(function (b) { return b.x; })) - pad : 0;
    var minY = boxes.length ? Math.min.apply(null, boxes.map(function (b) { return b.y; })) - pad : 0;
    var w = boxes.length ? Math.max.apply(null, boxes.map(function (b) { return b.x + b.w; })) - minX + pad : 0;
    var h = boxes.length ? Math.max.apply(null, boxes.map(function (b) { return b.y + b.h; })) - minY + pad : 0;
    var cs = getComputedStyle(group.el);
    w = root.LiquidDesignPluginSnap(w); h = root.LiquidDesignPluginSnap(h);
    [group.material, group.drawing, group.highlights].forEach(function (layer) {
      layer.style.left = (minX - (parseFloat(cs.borderLeftWidth) || 0)) + 'px';
      layer.style.top = (minY - (parseFloat(cs.borderTopWidth) || 0)) + 'px';
      layer.style.width = w + 'px'; layer.style.height = h + 'px';
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
    group.shape.setAttribute('d', d);
    // An explicit local path avoids fragment-URL resolution differences when
    // layers are promoted or the page navigates to an anchor. The tinted fill
    // must share this contour too, otherwise an unresolved SVG clip paints a box.
    group.material.style.clipPath = 'path("' + d + '")';
    group.highlights.style.clipPath = 'path("' + d + '")';
    group.maskPath.setAttribute('d', d);
    group.rim.setAttribute('d', d);
    group.contrastRim.setAttribute('d', d);
    group.prism.setAttribute('d', d);
    var energy = 0, angle = 0;
    group.controls.forEach(function (record) {
      var state = record.state;
      if (!state || !state.geometry.slabHalfWidth || !state.geometry.slabHalfHeight) return;
      var stretch = Math.abs(state.bounds.halfWidth / state.geometry.slabHalfWidth - 1) + Math.abs(state.bounds.halfHeight / state.geometry.slabHalfHeight - 1);
      var response = Math.min(1, Math.max(0, state.touch) + stretch * 2);
      if (response >= energy) { energy = response; angle = Math.atan2(state.lightPoint.y, state.lightPoint.x) * 180 / Math.PI; }
    });
    group.prism.style.opacity = 'calc(var(--liquid-design-prism-opacity, var(--lgp-prism-opacity, 0)) * ' + (.45 + energy * .55) + ')';
    group.prismGradient.setAttribute('gradientTransform', 'rotate(' + (angle * energy * .2) + ' .5 .5)');
    group.mask.setAttribute('x', '-2'); group.mask.setAttribute('y', '-2'); group.mask.setAttribute('width', w + 4); group.mask.setAttribute('height', h + 4);
    group.drawing.setAttribute('viewBox', '0 0 ' + Math.max(1, w) + ' ' + Math.max(1, h));
    group.drawing.setAttribute('preserveAspectRatio', 'none');
    group.material.dataset.surfaces = boxes.length; group.material.dataset.connections = connections;
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
      staticMotion: !!navigator.webdriver || (document.documentElement.hasAttribute('data-glass-child') && !el.closest('.ov-nav,.ov-social-nav,.hero-search,#hero-bar,#results-bar,[data-page="ai-home"]')),
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
