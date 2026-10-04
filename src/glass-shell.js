(function () {
  'use strict';
  if (window.GlassShell || window.GlassPageBridge) return;
  var routes = ['/index.html', '/AI/index.html', '/AI/chat.html', '/AI/goals.html', '/AI/privacy.html', '/AI/tos.html', '/AI/research.html', '/AI/manage.html', '/AI/editor.html', '/AI/version.html', '/design.html', '/Themes/Themes.html', '/word/index.html', '/search/index.html', '/whitename.html'];
  var active = null, pending = null, outgoing = null, serial = 0, started = false, sequence = 0, slideFrame = 0, slideTime = 0;
  var pageOrder = [];
  function settled(record) {
    if (!record || record.settled) return;
    record.settled = true;
    var win = record.frame.contentWindow;
    win.__glassPageSettled = true;
    win.dispatchEvent(new win.Event('glasspagesettled'));
  }
  function slide(now) {
    slideFrame = 0; var dt = GlassShellMotion.elapsed(now, slideTime); slideTime = now; var moving = false;
    [active, outgoing].forEach(function (record) {
      if (!record || !record.slide) return;
      var s = record.slide;
      GlassShellMotion.step(s, dt);
      if (Math.abs(s.target - s.x) < .1 && Math.abs(s.v) < 1) { s.x = s.target; s.v = 0; } else moving = true;
      record.frame.style.transform = 'translateX(' + s.x + 'px)';
    });
    if (moving) slideFrame = requestAnimationFrame(slide);
    else { slideTime = 0; if (outgoing) { dispose(outgoing); outgoing = null; } settled(active); }
  }
  function clean(url) { url = new URL(url, location.href); url.searchParams.delete('__glass_page'); return url; }
  function canonical(url) { var p = url.pathname; if (p === '/') return '/index.html'; if (p.endsWith('/')) return p + 'index.html'; return p; }
  function accepts(url) { url = clean(url); return url.origin === location.origin && routes.indexOf(canonical(url)) !== -1; }
  function frameFor(win) { return [active, pending].find(function (record) { return record && record.frame.contentWindow === win; }); }
  function dispose(record) { if (!record) return; clearTimeout(record.timer); try { record.frame.contentWindow.LumenHero?.destroy(); } catch (_) {} record.frame.remove(); }
  function announce(text) { document.querySelector('#glass-shell-status').textContent = text; }
  function boot() {
    if (started || !document.body || !window.LiquidDesign || !window.GlassShellControls) return;
    started = true; var initialURL = clean(window.__glassShellEntry ? new URL(location.href).searchParams.get('url') || '/index.html' : location.href), config = window.NAV_CONFIG || null;
    var descriptors = window.__glassShellEntry ? [] : GlassShellControls.descriptors(window, config);
    try { window.LumenHero?.destroy(); window.LiquidDesignSite?.destroy(); LiquidDesign.destroy(); } catch (_) {}
    document.body.replaceChildren(); document.body.setAttribute('data-glass-shell', '');
    document.body.removeAttribute('data-page'); document.body.className = 'home-base';
    var viewport = document.createElement('div'); viewport.id = 'glass-shell-pages';
    var chrome = document.createElement('nav'); chrome.id = 'glass-shell-chrome'; chrome.setAttribute('aria-label', 'Site navigation');
    var status = document.createElement('div'); status.id = 'glass-shell-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    document.body.append(viewport, chrome, status); GlassShellControls.update(descriptors); GlassShell.currentURL = initialURL;
    history.replaceState({ glassShell: true, index: 0, scroll: 0 }, '', initialURL);
    navigate(initialURL, { initial: true, replace: true });
  }
  function navigate(value, options) {
    options = options || {}; var url = clean(value);
    if (!accepts(url)) { location.href = url.href; return Promise.resolve(false); }
    if (!started) return Promise.resolve(false);
    if (pending) { dispose(pending); pending.resolve(false); pending = null; }
    if (outgoing) { dispose(outgoing); outgoing = null; }
    if (active && active.url.href === url.href && !options.initial) return Promise.resolve(true);
    if (active && canonical(active.url) === canonical(url) && active.url.search === url.search && url.hash && !options.history) {
      try { active.frame.contentDocument.querySelector(url.hash)?.scrollIntoView(); } catch (_) {}
      active.url = url; GlassShell.currentURL = url; sequence++;
      history.pushState({ glassShell: true, index: sequence, scroll: active.frame.contentWindow.scrollY }, '', url);
      return Promise.resolve(true);
    }
    if (active && options.history && canonical(active.url) === canonical(url) && active.frame.contentWindow.GlassPageBridge?.route) {
      active.url = url; GlassShell.currentURL = url; active.frame.contentWindow.GlassPageBridge.route(url); return Promise.resolve(true);
    }
    if (active && !options.history) { var scroll = active.frame.contentWindow.scrollY; history.replaceState(Object.assign({}, history.state, { scroll: scroll }), '', location.href); }
    document.querySelectorAll('.glass-shell-error').forEach(function (el) { el.remove(); });
    var record = { url: url, token: ++serial, frame: document.createElement('iframe'), options: options };
    record.frame.dataset.glassPage = ''; record.frame.title = 'Loading ' + url.pathname;
    record.frame.setAttribute('allow', 'clipboard-read; clipboard-write; microphone; autoplay; fullscreen');
    record.frame.className = 'glass-page glass-page--pending'; record.frame.inert = true;
    record.frame.setAttribute('aria-hidden', 'true');
    var source = new URL(url); source.searchParams.set('__glass_page', '1'); record.frame.src = source.href;
    pending = record; announce('Loading page');
    var promise = new Promise(function (resolve) { record.resolve = resolve; });
    record.timer = setTimeout(function () { if (pending !== record) return; dispose(record); pending = null; announce('Could not load page.'); showFailure(url); record.resolve(false); }, 15000);
    record.frame.addEventListener('load', function () {
      try {
        var bridge = record.frame.contentWindow.GlassPageBridge;
        if (bridge) bridge.report();
        else if (pending === record) { dispose(record); pending = null; showFailure(url); record.resolve(false); }
      } catch (_) { if (pending === record) { dispose(record); pending = null; showFailure(url); record.resolve(false); } }
    });
    document.querySelector('#glass-shell-pages').append(record.frame); return promise;
  }
  function showFailure(url) {
    var box = document.createElement('div'); box.className = 'glass-shell-error'; box.textContent = 'This page could not load. ';
    var retry = document.createElement('button'); retry.className = 'skuo'; retry.textContent = 'Retry'; retry.onclick = function () { box.remove(); navigate(url); };
    var native = document.createElement('a'); var target = new URL(url); target.searchParams.set('__glass_native', '1'); native.href = target.href; native.textContent = 'Open page'; box.append(retry, native); document.body.append(box);
  }
  function childReady(win, url, config) {
    var record = frameFor(win); if (!record) return;
    if (record === active) { childLayout(win); return; }
    if (pending !== record || !win.document.body || !win.LiquidDesign || win.document.readyState === 'loading') return;
    var nav = win.document.querySelector('.ov-nav'); if (config && !nav) return;
    clearTimeout(record.timer); pending = null;
    var previous = active; active = record; record.url = clean(url);
    GlassShell.currentURL = record.url; GlassShell.ready = true;
    document.title = win.document.title; record.frame.title = win.document.title;
    GlassShellControls.update(GlassShellControls.descriptors(win, config));
    GlassShellSearch.update(win);
    var dark = document.documentElement.classList.contains('dark'); win.document.documentElement.classList.toggle('dark', dark);
    win.document.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('revealed'); el.style.transition = 'none'; });
    record.frame.inert = false; record.frame.removeAttribute('aria-hidden'); record.frame.classList.remove('glass-page--pending');
    var state = record.options;
    var pageKey = canonical(record.url), pageIndex = pageOrder.indexOf(pageKey);
    if (!state.history && pageIndex !== -1 && pageIndex < pageOrder.length - 1) state.back = true;
    if (pageIndex !== -1) pageOrder = pageOrder.slice(0, pageIndex + 1);
    else pageOrder.push(pageKey);
    if (!state.history && !state.initial) { sequence++; history[state.replace ? 'replaceState' : 'pushState']({ glassShell: true, index: sequence, scroll: 0 }, '', record.url); }
    else if (state.initial) history.replaceState({ glassShell: true, index: sequence, scroll: 0 }, '', record.url);
    var direction = state.back ? -1 : 1;
    var reduced = navigator.webdriver || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (previous) {
      outgoing = previous;
      previous.frame.contentWindow.LumenHero?.setActive(false);
      previous.frame.inert = true; previous.frame.setAttribute('aria-hidden', 'true');
      if (!reduced) {
        // Retarget from actual position/velocity, including a mid-flight route
        // change. Page movement never restarts an independent keyframe clock.
        previous.slide = previous.slide || { x: 0, v: 0, target: 0 };
        previous.slide.target = -direction * innerWidth * .28;
        record.slide = { x: direction * innerWidth, v: previous.slide.v, target: 0 };
        record.frame.style.transform = 'translateX(' + record.slide.x + 'px)';
        if (!slideFrame) { slideTime = performance.now(); slideFrame = requestAnimationFrame(slide); }
      } else { dispose(previous); outgoing = null; settled(record); }
    }
    else settled(record);
    if (state.scroll) win.scrollTo(0, state.scroll);
    else if (record.url.hash) { try { win.document.querySelector(record.url.hash)?.scrollIntoView(); } catch (_) {} }
    if (!state.initial && !Array.from(document.querySelectorAll('[data-glass-role]')).some(function (el) { return el.hasPointerCapture && el.hasPointerCapture(1); })) {
      var main = win.document.querySelector('main,h1'); if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
    }
    announce(win.document.title); record.resolve(true);
  }
  function childLayout(win) { if (active && active.frame.contentWindow === win) { GlassShellControls.update(GlassShellControls.descriptors(win, win.NAV_CONFIG || null)); GlassShellSearch.update(win); } }
  function childRoute(win, url, replace) {
    if (!active || active.frame.contentWindow !== win) return;
    active.url = clean(url); GlassShell.currentURL = active.url;
    if (!replace) sequence++;
    history[replace ? 'replaceState' : 'pushState']({ glassShell: true, index: sequence, scroll: win.scrollY }, '', active.url);
    document.title = win.document.title;
  }
  function childTheme(win, dark) { if (!active || active.frame.contentWindow !== win) return; document.documentElement.classList.toggle('dark', dark); document.documentElement.setAttribute('data-liquid-design-theme', dark ? 'dark' : 'light'); }
  function childTitle(win, title) { if (active && active.frame.contentWindow === win) { document.title = title; active.frame.title = title; } }
  function dismissPopovers() { GlassShellControls.closeMenu(); GlassShellSearch.closeSuggestions(); }
  function toggleTheme() {
    var dark = document.documentElement.classList.toggle('dark'); localStorage.setItem('vail_theme', dark ? 'dark' : 'light');
    if (active) active.frame.contentDocument.documentElement.classList.toggle('dark', dark);
    document.documentElement.setAttribute('data-liquid-design-theme', dark ? 'dark' : 'light');
    if (active) childLayout(active.frame.contentWindow);
  }
  window.GlassShell = { navigate: navigate, accepts: accepts, ready: false, currentURL: clean(location.href), childReady: childReady, childLayout: childLayout, childRoute: childRoute, childTheme: childTheme, childTitle: childTitle, toggleTheme: toggleTheme, dismissPopovers: dismissPopovers };
  addEventListener('popstate', function (event) { var index = event.state?.index || 0, back = index < sequence; sequence = index; navigate(location.href, { history: true, back: back, scroll: event.state?.scroll || 0 }); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
