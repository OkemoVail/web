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
