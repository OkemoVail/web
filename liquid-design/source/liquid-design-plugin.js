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
