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
