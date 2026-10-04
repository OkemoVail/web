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
