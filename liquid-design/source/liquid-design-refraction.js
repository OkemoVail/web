(function (root) {
  'use strict';
  // Lens refraction for glass material. A displacement map, generated once per
  // resting shape in a small canvas and cached, bends the backdrop behind the
  // glass: flat in the middle, strongest at the rim, like a convex edge.
  // Only Chromium can feed an SVG filter into backdrop-filter; everything else
  // (all of iOS) keeps the existing blur + lens-highlight material.
  var NS = 'http://www.w3.org/2000/svg';
  var maps = new Map(), MAP_LIMIT = 48, MAP_MAX = 512, serial = 0, host = null;
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
  function field(w, h, boxes, blend, bezel) {
    var key = w + 'x' + h + 'b' + bezel + 'm' + blend + ':' + boxes.map(function (b) { return [b.x, b.y, b.w, b.h, b.r].join(','); }).join(';');
    if (maps.has(key)) { var hit = maps.get(key); maps.delete(key); maps.set(key, hit); return hit; }
    // Full resolution up to MAP_MAX: a downscaled map stair-steps the rim.
    var k = Math.min(1, MAP_MAX / Math.max(w, h));
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
          var build = function () {
            readStrength();
            var url = field(bw, bh, shape, Math.round(blend), bezel); image.setAttribute('href', url); key = next; built = performance.now();
            material.style.setProperty('--lgp-refraction-map', 'url("' + url + '")');
          };
          if (!key || now - built > 90) build(); else pending = setTimeout(build, 90);
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
