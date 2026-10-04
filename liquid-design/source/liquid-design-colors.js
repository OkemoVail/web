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
