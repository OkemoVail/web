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
