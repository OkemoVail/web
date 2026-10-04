(function () {
  'use strict';
  var roles = new Map(), frame = 0, last = 0, pending = null;
  function moving(state) { return Math.abs(state.target - state.x) > .03 || Math.abs(state.v) > .1; }
  function step(state, dt) {
    GlassShellMotion.step(state, dt);
    if (!moving(state)) { state.x = state.target; state.v = 0; }
  }
  function rect(el) { var b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }
  function glyph(el) {
    var content = el.querySelector(':scope > .lgp-content,:scope > .lgc-content') || el;
    return Array.from(content.children).filter(function (node) { return node.matches('svg,i,img'); }).map(function (node) { return node.outerHTML; }).join('');
  }
  function descriptors(win, config) {
    var doc = win.document, nav = doc.querySelector('.ov-nav'), result = [];
    function add(role, el, opts) {
      if (!el) return; var b = rect(el); if (!b.w || !b.h) return;
      result.push(Object.assign({ role: role, key: el.getAttribute('data-glass-key') || role, morphTo: el.getAttribute('data-glass-to'), rect: b, label: el.getAttribute('aria-label') || el.textContent.trim(), glyph: glyph(el), href: el.getAttribute('href'), circle: b.w < b.h * 1.3 }, opts || {}));
    }
    if (nav) {
      var primary = nav.querySelector('.ov-nav__labs,.ov-nav__primary');
      add('primary', primary, { label: config && config.primary ? config.primary.label : primary && primary.textContent.trim(), iconAfter: config && config.variant === 'tools' });
      var menu = nav.querySelector('.ov-nav__tools-toggle,.ov-nav__chevron');
      var tools = config && config.variant === 'tools';
      add('menu', menu, { key: menu && menu.getAttribute('data-glass-key') || 'menu', component: tools ? 'tools' : 'options', label: tools ? 'More' : 'Open menu', items: tools ? [
        Object.assign({ glyph: '<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M9 7V5h6v2M4 12h16"/></svg>' }, config.toolsWork || { label: 'Selected work', href: '#work' }),
        Object.assign({ glyph: '<svg viewBox="0 0 24 24"><path d="M12 3s-7 7-7 12a7 7 0 0 0 14 0c0-5-7-12-7-12Z"/></svg>' }, config.toolsSecondary || { label: 'Liquid Design', href: '/design.html' }),
        { label: 'Toggle theme', action: 'theme', glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' }
      ] : config && config.links || [{ label: 'Home', href: '/index.html' }, { label: 'Design', href: '/design.html' }], glyph: tools ? '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>' });
      var theme = nav.querySelector('.ov-nav__theme');
      if (!tools) {
        var themeIcon = theme && theme.querySelector(doc.documentElement.classList.contains('dark') ? '.ov-nav__sun' : '.ov-nav__moon');
        add('theme', theme, Object.assign({ label: 'Toggle theme' }, themeIcon ? { glyph: themeIcon.outerHTML } : {}));
      }
    }
    var leading = doc.querySelector('.ov-nav__back,.ov-nav__socials-toggle');
    add('leading', leading, leading && leading.matches('.ov-nav__socials-toggle') ? { label: 'Socials', items: [{ label: 'GitHub', href: 'https://github.com/ar12c' }, { label: 'YouTube', href: 'https://www.youtube.com/@SochiVail' }] } : { label: 'Back' });
    if (!leading) result.push({ role: 'leading', rect: { x: 24, y: 24, w: 44, h: 44 }, circle: true, label: 'Home', href: '/index.html', glyph: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>' });
    return result;
  }
  function create(d) {
    var wrapper = document.createElement('div'); wrapper.className = 'glass-shell-control';
    var button = document.createElement('button'); button.type = 'button'; button.dataset.glassRole = d.role;
    button.className = 'skuo skuo-pill' + (d.role === 'primary' ? ' skuo-accent' : ' skuo-icon');
    button.setAttribute('data-liquid-design', ''); button.setAttribute('data-liquid-design-independent', '');
    var face = document.createElement('span'); face.className = 'glass-shell-face'; button.append(face);
    wrapper.append(button);
      var panel = null;
    if (d.items || d.role === 'leading') {
      if (d.items) {
        wrapper.setAttribute('data-liquid-design-component', d.component || 'options');
        button.setAttribute('data-liquid-design-toggle', 'glass-role-panel-' + (d.key || d.role));
      }
      panel = document.createElement('div'); panel.id = 'glass-role-panel-' + (d.key || d.role); panel.hidden = true; panel.inert = true;
      for (var i = 0; i < 8; i++) { var item = document.createElement('button'); item.type = 'button'; item.setAttribute('data-liquid-design', ''); panel.append(item); }
      wrapper.append(panel);
    }
    document.querySelector('#glass-shell-chrome').append(wrapper);
    var record = { wrapper: wrapper, button: button, face: face, panel: panel, held: false, d: d, states: {} };
    ['x', 'y', 'w', 'h'].forEach(function (key) { record.states[key] = { x: d.rect[key], v: 0, target: d.rect[key] }; });
    updateFace(record, d); apply(record); LiquidDesign.refresh(d.items ? wrapper : button);
    if (panel) {
      function placeMenu() {
        if (record.d.component === 'tools') return;
        var b = wrapper.getBoundingClientRect();
        var width = parseFloat(getComputedStyle(panel).width) || 220;
        panel.style.left = Math.max(12, Math.min(innerWidth - width - 12, b.left)) - b.left + 'px';
        if (record.d.label === 'Socials') {
          var primary = GlassShellControls.get('primary');
          if (primary) {
            var row = primary.button.getBoundingClientRect();
            var top = innerWidth < 430 ? row.bottom + 12 : row.top;
            wrapper.style.setProperty('--liquid-design-menu-offset-y', (top - button.getBoundingClientRect().top) + 'px');
          }
        }
      }
      button.addEventListener('pointerdown', placeMenu, true);
      button.addEventListener('click', placeMenu, true);
      button.addEventListener('keydown', placeMenu, true);
      Array.from(panel.querySelectorAll('button')).forEach(function (item, index) {
        item.addEventListener('click', function () {
          var choice = record.d.items && record.d.items[index]; if (!choice) return;
          if (choice.action === 'theme') { GlassShell.toggleTheme(); return; }
          if (record.d.component === 'tools') record.button.click();
          var url = new URL(choice.href, GlassShell.currentURL); if (url.origin === location.origin) GlassShell.navigate(url); else window.open(url.href, '_blank', 'noopener');
        });
      });
      new MutationObserver(function () {
        if (record.d.component === 'tools') {
          var open = button.getAttribute('aria-expanded') === 'true';
          button.setAttribute('aria-label', open ? 'Close' : 'More');
          morphFace(record, Object.assign({}, record.d, { glyph: '<svg viewBox="0 0 24 24"><path d="' + (open ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6') + '"/></svg>' }));
          arrange();
        }
        if (button.getAttribute('aria-expanded') === 'false' && record.next && !record.held) { var next = record.next; record.next = null; updateFace(record, next); }
      }).observe(button, { attributes: true, attributeFilter: ['aria-expanded'] });
    }
    button.addEventListener('pointerdown', function () { record.held = true; });
    function release() { record.held = false; if (record.next) { var next = record.next; record.next = null; updateFace(record, next); } }
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release);
    button.addEventListener('click', function () {
      var descriptor = record.d;
      if (d.role === 'theme') { GlassShell.toggleTheme(); return; }
      if (descriptor.items) { if (!record.panel) openMenu(record); return; }
      if (descriptor.href) { var url = new URL(descriptor.href, GlassShell.currentURL); if (url.origin !== location.origin) window.open(url.href, '_blank', 'noopener'); else GlassShell.navigate(url); }
    });
    roles.set(d.key || d.role, record); updateFace(record, d); return record;
  }
  function updateFace(record, d) {
    if (record.held || record.panel && record.button.getAttribute('aria-expanded') === 'true') { record.next = d; return; }
    var component = d.items ? d.component || 'options' : null;
    var changedComponent = component !== (record.d.items ? record.d.component || 'options' : null);
    if (changedComponent) {
      LiquidDesign.destroy(record.wrapper);
      // Component teardown restores its initialization-time style snapshot.
      // Restore live shell geometry before the next controller measures it.
      apply(record);
      record.wrapper.removeAttribute('data-liquid-design-component');
      record.button.removeAttribute('data-liquid-design-toggle');
      if (component) {
        record.wrapper.setAttribute('data-liquid-design-component', component);
        record.button.setAttribute('data-liquid-design-toggle', record.panel.id);
      }
    }
    record.d = d; record.button.setAttribute('aria-label', d.label || d.role);
    record.button.title = d.label || d.role;
    if (record.panel) Array.from(record.panel.querySelectorAll('button')).forEach(function (item, index) {
      var choice = d.items && d.items[index]; item.hidden = !choice;
      var content = item.querySelector('.lgc-content') || item;
      if (d.component === 'tools') { content.innerHTML = choice ? choice.glyph || '' : ''; item.setAttribute('aria-label', choice ? choice.label : ''); item.title = choice ? choice.label : ''; }
      else content.textContent = choice ? choice.label : '';
    });
    if (changedComponent) LiquidDesign.refresh(component ? record.wrapper : record.button);
    morphFace(record, d);
  }
  function morphFace(record, d) {
    var signature = d.glyph + (d.role === 'primary' ? d.label + d.iconAfter : '');
    if (signature !== record.signature) {
      var existing = record.signature !== undefined;
      record.signature = signature;
      clearTimeout(record.swapTimer);
      if (record.pop) record.pop.cancel();
      if (record.blur) record.blur.cancel();
      function swap() {
        record.face.innerHTML = d.role === 'primary' && d.iconAfter ? '<span></span>' + (d.glyph || '') : (d.glyph || '') + (d.role === 'primary' ? '<span></span>' : '');
        if (d.role === 'primary') record.face.querySelector('span').textContent = d.label || '';
      }
      var reduced = navigator.webdriver || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!existing || reduced) swap();
      else {
        // Pop the complete live button first, keeping its old face legible.
        // Separate scale leaves the pointer solver's transforms untouched.
        var easing = getComputedStyle(record.wrapper).getPropertyValue('--ease-soft').trim() || 'ease-in-out';
        record.pop = record.wrapper.animate([{ scale: '1' }, { scale: '1.08', offset: .3 }, { scale: '1' }], { duration: 400, easing: easing });
        record.blur = record.face.animate([{ filter: 'blur(0px)' }, { filter: 'blur(4px)' }], { delay: 120, duration: 100, easing: easing, fill: 'forwards' });
        record.swapTimer = setTimeout(function () {
          swap(); record.blur.cancel();
          record.blur = record.face.animate([{ filter: 'blur(4px)' }, { filter: 'blur(0px)' }], { duration: 180, easing: easing });
        }, 220);
      }
    }
  }
  function apply(record) {
    var s = record.states;
    record.wrapper.style.left = s.x.x + 'px'; record.wrapper.style.top = s.y.x + 'px';
    if (record.panel) { record.wrapper.style.width = Math.max(1, s.w.x) + 'px'; record.wrapper.style.height = Math.max(1, s.h.x) + 'px'; }
    record.button.style.width = Math.max(1, s.w.x) + 'px'; record.button.style.height = Math.max(1, s.h.x) + 'px';
    record.button.style.borderRadius = Math.min(s.w.x, s.h.x) / 2 + 'px';
  }
  function arrange() {
    var tools = null, socials = null;
    roles.forEach(function (r) { if (r.retiring) return; if (r.d.component === 'tools') tools = r; if (r.d.label === 'Socials') socials = r; });
    if (!socials) return;
    var expanded = tools && tools.button.getAttribute('aria-expanded') === 'true';
    var gap = innerWidth <= 767 ? 6 : 9, size = innerWidth <= 767 ? 44 : 52;
    var left = tools ? tools.states.x.x - 3 * (size + gap) : innerWidth;
    var collision = expanded && left < socials.states.x.x + socials.states.w.x + 12;
    socials.wrapper.style.transform = collision ? 'translateX(-' + (socials.states.x.x + socials.states.w.x + 12) + 'px)' : '';
  }
  function tick(now) {
    frame = 0; var dt = GlassShellMotion.elapsed(now, last); last = now; var active = false;
    roles.forEach(function (record) { Object.keys(record.states).forEach(function (key) { step(record.states[key], dt); if (moving(record.states[key])) active = true; }); apply(record); }); arrange();
    if (active) frame = requestAnimationFrame(tick); else last = 0;
  }
  function update(ds) {
    pending = ds;
    var matched = new Set();
    ds.forEach(function (d) {
      var key = d.key || d.role, record = roles.get(key);
      if (!record) roles.forEach(function (candidate) { if (!record && !matched.has(candidate) && candidate.d.morphTo === key) record = candidate; });
      var fresh = !record; if (!record) record = create(d);
      matched.add(record); updateFace(record, d); record.retiring = false;
      record.button.dataset.glassRole = d.role;
      if (record.fade) { record.fade.cancel(); record.fade = null; }
      var returning = record.wrapper.hidden; record.wrapper.hidden = false; record.button.inert = false;
      if ((fresh || returning) && !navigator.webdriver && !matchMedia('(prefers-reduced-motion: reduce)').matches) record.wrapper.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      Object.keys(record.states).forEach(function (key) { record.states[key].target = d.rect[key]; if (navigator.webdriver || matchMedia('(prefers-reduced-motion: reduce)').matches) { record.states[key].x = d.rect[key]; record.states[key].v = 0; } });
    });
    roles.forEach(function (record) {
      if (matched.has(record) || record.retiring) return;
      record.retiring = true; if (!record.held) record.button.inert = true;
      clearTimeout(record.swapTimer); record.signature = undefined;
      if (record.pop) record.pop.cancel(); if (record.blur) record.blur.cancel();
      delete record.button.dataset.glassRole;
      var finish = function () { if (record.retiring && !record.held) record.wrapper.hidden = true; };
      if (navigator.webdriver || matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
      else { record.fade = record.wrapper.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }); record.fade.finished.then(finish, function () {}); }
    });
    if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
  }
  var menu = null, menuOrigin = null;
  function closeMenu(focus) { if (!menu) return; LiquidDesign.destroy(menu); menu.remove(); menu = null; if (focus && menuOrigin) menuOrigin.button.focus(); }
  function openMenu(record) {
    if (menu && menuOrigin === record) { closeMenu(true); return; } closeMenu(); menuOrigin = record;
    menu = document.createElement('div'); menu.className = 'glass-shell-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('data-liquid-design', 'surface');
    var b = record.button.getBoundingClientRect(); menu.style.left = Math.max(12, Math.min(innerWidth - 232, b.right - 220)) + 'px'; menu.style.top = b.bottom + 12 + 'px';
    record.d.items.forEach(function (item) { var button = document.createElement('button'); button.type = 'button'; button.textContent = item.label; button.setAttribute('role', 'menuitem'); button.addEventListener('click', function () { closeMenu(); var url = new URL(item.href, GlassShell.currentURL); if (url.origin === location.origin) GlassShell.navigate(url); else window.open(url.href, '_blank', 'noopener'); }); menu.append(button); });
    document.querySelector('#glass-shell-chrome').append(menu); LiquidDesign.refresh(menu); menu.querySelector('button').focus();
  }
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (menu) { event.preventDefault(); closeMenu(true); return; }
    roles.forEach(function (r) { if (!r.retiring && r.panel && r.button.getAttribute('aria-expanded') === 'true' && !r.held) { event.preventDefault(); r.button.click(); r.button.focus(); } });
  });
  document.addEventListener('pointerdown', function (event) { if (menu && !menu.contains(event.target) && !menuOrigin.button.contains(event.target)) closeMenu(); });
  function dismiss() { closeMenu(); roles.forEach(function (r) { if (r.panel && r.button.getAttribute('aria-expanded') === 'true' && !r.held) r.button.click(); }); }
  window.GlassShellControls = { descriptors: descriptors, update: update, closeMenu: dismiss, get: function (role) { var found = null; roles.forEach(function (r) { if (r.d.role === role && !r.retiring) found = r; }); return found; }, destroy: function () { cancelAnimationFrame(frame); closeMenu(); roles.forEach(function (r) { clearTimeout(r.swapTimer); if (r.pop) r.pop.cancel(); if (r.blur) r.blur.cancel(); LiquidDesign.destroy(r.wrapper); r.wrapper.remove(); }); roles.clear(); } };
})();
