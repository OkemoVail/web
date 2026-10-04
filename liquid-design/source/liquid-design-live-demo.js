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
