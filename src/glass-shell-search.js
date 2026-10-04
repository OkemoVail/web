(function () {
  'use strict';
  var owner = null, mounted = new WeakSet();
  function update(win) {
    owner = win;
    // Search belongs to the child's scroll tree. A fixed parent replica cannot
    // follow compositor scrolling synchronously with the rest of the document.
    var hosts = win.document.querySelectorAll('.hero-search, #hero-bar, #results-bar');
    hosts.forEach(function (host) {
      if (mounted.has(host)) return;
      mounted.add(host);
      host.setAttribute('data-glass-native-search', '');
      host.removeAttribute('data-glass-search-slot');
      var touch = null;
      host.addEventListener('touchstart', function (event) {
        if (event.touches.length !== 1) { touch = null; return; }
        var p = event.touches[0];
        touch = { x: p.clientX, y: p.clientY, lastY: p.clientY,
          started: performance.now(), mode: event.target.closest('button') ? 'stretch' : null };
      }, { passive: true });
      host.addEventListener('touchmove', function (event) {
        if (!touch || event.touches.length !== 1) return;
        var p = event.touches[0], dx = p.clientX - touch.x, dy = p.clientY - touch.y;
        if (!touch.mode && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
          touch.mode = performance.now() - touch.started >= 180 || Math.abs(dx) >= Math.abs(dy) ? 'stretch' : 'scroll';
        }
        if (touch.mode === 'scroll') {
          event.preventDefault();
          win.scrollBy({ top: touch.lastY - p.clientY, behavior: 'instant' });
        }
        touch.lastY = p.clientY;
      }, { passive: false });
      host.addEventListener('touchend', function () { touch = null; });
      host.addEventListener('touchcancel', function () { touch = null; });
    });
  }
  function closeSuggestions() {
    if (!owner) return;
    owner.document.querySelectorAll('.suggest').forEach(function (list) { list.hidden = true; });
    owner.document.querySelectorAll('[aria-expanded="true"][role="combobox"]').forEach(function (input) { input.setAttribute('aria-expanded', 'false'); });
  }
  window.GlassShellSearch = { update: update, closeSuggestions: closeSuggestions };
})();
