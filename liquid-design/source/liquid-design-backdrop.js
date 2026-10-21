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
  function rescan() { scrimsAt = -Infinity; schedule(); }
  function start() {
    root.addEventListener('scroll', schedule, { capture: true, passive: true });
    root.addEventListener('resize', rescan);
    root.addEventListener('transitionend', schedule, true);
    // Content can change beneath fixed glass without any event here (an
    // iframe scrolling, a carousel); a slow poll keeps the reading honest.
    timer = setInterval(function () { if (!document.hidden) schedule(); }, 1500);
  }
  function stop() {
    root.removeEventListener('scroll', schedule, { capture: true });
    root.removeEventListener('resize', rescan);
    root.removeEventListener('transitionend', schedule, true);
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
