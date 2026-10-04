(function () {
  'use strict';
  var internal = new URL(location.href).searchParams.get('__glass_page') === '1';
  var eligible = /^https?:$/.test(location.protocol) && !navigator.webdriver && !new URL(location.href).searchParams.has('__glass_native');
  if (internal && window.parent !== window) {
    document.documentElement.setAttribute('data-glass-child', '');
    window.GlassPageBridge = { child: true };
    function publicURL() { var url = new URL(location.href); url.searchParams.delete('__glass_page'); return url; }
    function parentShell() { try { return parent.GlassShell; } catch (_) { return null; } }
    function report() {
      var shell = parentShell(); if (!shell || !document.body) return;
      shell.childReady(window, publicURL(), window.NAV_CONFIG || null);
    }
    window.GlassPageBridge.report = report;
    document.addEventListener('DOMContentLoaded', function () { requestAnimationFrame(function () { requestAnimationFrame(report); }); });
    addEventListener('load', report);
    new MutationObserver(function () { var shell = parentShell(); if (shell) shell.childTitle(window, document.title); }).observe(document.querySelector('title') || document.head, { subtree: true, childList: true, characterData: true });
    addEventListener('resize', report);
    document.addEventListener('pointerdown', function () { var shell = parentShell(); if (shell) shell.dismissPopovers(); }, true);
    addEventListener('scroll', function () { var shell = parentShell(); if (shell) shell.childLayout(window); }, { passive: true });
    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var link = event.target.closest('a[href]'); if (!link || link.hasAttribute('download') || link.target && link.target !== '_self') return;
      var url = new URL(link.href, location.href), current = publicURL(), shell = parentShell();
      if (!shell || !shell.accepts(url)) return;
      if (url.pathname === current.pathname && url.search === current.search && url.hash) { event.preventDefault(); try { document.querySelector(url.hash)?.scrollIntoView(); } catch (_) {} history.pushState(null, '', url.href); return; }
      event.preventDefault(); shell.navigate(url);
    });
    document.addEventListener('submit', function (event) {
      var form = event.target, shell = parentShell();
      if (event.defaultPrevented || !shell || form.method.toLowerCase() !== 'get' || form.target && form.target !== '_self') return;
      var url = new URL(form.action, location.href); if (!shell.accepts(url)) return;
      new FormData(form).forEach(function (value, key) { if (typeof value === 'string') url.searchParams.set(key, value); });
      event.preventDefault(); shell.navigate(url);
    });
    ['pushState', 'replaceState'].forEach(function (name) {
      var native = history[name].bind(history);
      history[name] = function (state, title, url) {
        if (url !== undefined && url !== null) { var next = new URL(url, location.href); next.searchParams.set('__glass_page', '1'); url = next.href; }
        native(state, title, url); var shell = parentShell(); if (shell) shell.childRoute(window, publicURL(), name === 'replaceState');
        requestAnimationFrame(report);
      };
    });
    window.GlassPageBridge.route = function (url) {
      var next = new URL(url); next.searchParams.set('__glass_page', '1');
      // Suppress outward history notification for parent-driven Back/Forward.
      var native = History.prototype.replaceState;
      native.call(history, history.state, '', next.href);
      dispatchEvent(new PopStateEvent('popstate', { state: history.state })); requestAnimationFrame(report);
    };
    new MutationObserver(function () { var shell = parentShell(); if (shell) shell.childTheme(window, document.documentElement.classList.contains('dark')); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return;
  }
  if (eligible) {
    // Enter a dedicated parent before page application scripts initialize. The
    // original scripts run once, in their child document, never on removed DOM.
    var source = new URL(location.href);
    location.replace(new URL('../glass-shell.html?url=' + encodeURIComponent(source.href), document.currentScript.src).href);
    return;
  }
  // Register in the head, before deferred engines or DOMContentLoaded. The
  // browser may dispatch pagereveal before those scripts initialize.
  function navigate(event) {
    var transition = event.viewTransition, html = document.documentElement;
    function cleanup() { html.classList.remove('glass-navigation-transition', 'glass-search-transition'); }
    if (!transition) { if (event.type === 'pagereveal') cleanup(); return; }
    if (navigator.webdriver || matchMedia('(prefers-reduced-motion: reduce)').matches) { transition.skipTransition(); return; }
    html.classList.add('glass-navigation-transition');
    var from = event.activation && event.activation.from;
    var to = event.activation && event.activation.entry;
    if (event.type === 'pagereveal' && window.navigation && navigation.activation) {
      from = navigation.activation.from; to = navigation.currentEntry;
    }
    function searchPage(entry) {
      if (!entry || !entry.url) return false;
      var url = new URL(entry.url, location.href);
      return url.origin === location.origin && (/^\/(?:index\.html)?$/.test(url.pathname) || /^\/search\/(?:index\.html)?$/.test(url.pathname));
    }
    if (searchPage(from) && searchPage(to)) html.classList.add('glass-search-transition');
    if (event.type === 'pagereveal') document.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('revealed'); });
    transition.finished.then(cleanup, cleanup);
  }
  addEventListener('pageswap', navigate);
  addEventListener('pagereveal', navigate);
})();
