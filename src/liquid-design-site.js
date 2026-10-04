(function (root) {
  'use strict';
  if (root.LiquidDesignSite || !root.LiquidDesign) return;
  var selector = 'button,a.skuo,a.skuomorphic-button,a.skuomorphic-btn,a[role="button"],a.ov-nav__link,a.ov-nav__primary,a[data-liquid-design]';
  var records = new Map(), pending = new Set(), frame = 0, observer = null;
  // Production pages resolve their own explicit theme; OS preference is only
  // a fallback for the portable engine, never an override of that page state.
  function syncTheme() {
    document.documentElement.setAttribute('data-liquid-design-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }
  syncTheme();
  var sizeObserver = new ResizeObserver(function (entries) {
    entries.forEach(function (entry) { if (records.has(entry.target)) queue(entry.target); });
  });
  var ignoredStyles = new Set(['position', 'isolation', 'background-color', 'background-image', 'border-color', 'box-shadow', 'transform', 'z-index', '--lg-site-inline-tint']);
  function inlineTint(el, record) {
    var value = el.style.getPropertyValue('background-color');
    if (value === 'transparent' && el.style.getPropertyPriority('background-color') === 'important') return false;
    record.background = [value, el.style.getPropertyPriority('background-color')];
    if (value && value !== 'transparent') el.style.setProperty('--lg-site-inline-tint', 'color-mix(in srgb, ' + value + ', transparent 25%)');
    else el.style.removeProperty('--lg-site-inline-tint');
    el.style.setProperty('background-color', 'transparent', 'important');
    return true;
  }
  function signature(el) {
    return Array.from(el.style).filter(function (name) { return !ignoredStyles.has(name); }).map(function (name) {
      return name + ':' + el.style.getPropertyValue(name) + ':' + el.style.getPropertyPriority(name);
    }).join(';');
  }
  function decoration(node) {
    return node.nodeType === 1 && !!node.closest('.lgp-material,.lgp-outline,.lgp-highlights,.lgc-material,.lgc-outline,.lgc-highlights');
  }
  function queue(el) {
    if (!el) return;
    pending.add(el);
    if (!frame) frame = root.requestAnimationFrame(flush);
  }
  function enhance(el) {
    if (el.closest('[data-liquid-design-component]')) return;
    if (records.has(el) || !el.isConnected || !el.matches(selector)) return;
    var saved = ['data-liquid-design', 'data-liquid-design-independent', 'data-lg-site'].map(function (name) { return [name, el.getAttribute(name)]; });
    // The portable plugin retains grouped demos. Production never shares a face.
    if (el.hasAttribute('data-lgp-control')) root.LiquidDesign.destroy(el);
    var layoutStyle = getComputedStyle(el), originalLayout = el.style.getPropertyValue('--lg-site-layout-transform');
    // Absolute/fixed control transforms often center a native hitbox. Retain
    // only their positional component; discard legacy hover/press scaling.
    if ((layoutStyle.position === 'absolute' || layoutStyle.position === 'fixed') && layoutStyle.transform !== 'none') {
      var matrix = new DOMMatrix(layoutStyle.transform);
      if (matrix.e || matrix.f) el.style.setProperty('--lg-site-layout-transform', 'translate(' + matrix.e + 'px,' + matrix.f + 'px)');
    }
    if (layoutStyle.position === 'absolute' || layoutStyle.position === 'fixed') {
      // Tailwind Play may publish these variables after boot. Keep percentage
      // translation live and omit its hover/press scale/rotation components.
      el.style.setProperty('--lg-site-layout-transform', 'translate(var(--tw-translate-x, 0px), var(--tw-translate-y, 0px)) ' +
        (el.style.getPropertyValue('--lg-site-layout-transform') || ''));
      if (Array.from(el.classList).some(function (name) { return /(^|:)\-?translate-[xy]-/.test(name); })) {
        el.style.setProperty('--lg-site-layout-transform', 'translate(var(--tw-translate-x, 0px), var(--tw-translate-y, 0px))');
      }
    }
    el.setAttribute('data-liquid-design-independent', ''); el.setAttribute('data-liquid-design', ''); el.setAttribute('data-lg-site', '');
    var record = { saved: saved, signature: '', background: null, layout: originalLayout, tint: el.style.getPropertyValue('--lg-site-inline-tint') };
    var background = el.style.getPropertyValue('background-color');
    root.LiquidDesign.refresh(el);
    if (background && background !== 'transparent') {
      el.style.setProperty('--lg-site-inline-tint', 'color-mix(in srgb, ' + background + ', transparent 25%)');
    }
    record.signature = signature(el);
    records.set(el, record); sizeObserver.observe(el);
  }
  function scan(scope) {
    if (!scope || !scope.isConnected && scope !== document) return;
    if (scope.matches && scope.matches(selector)) enhance(scope);
    if (scope.querySelectorAll) scope.querySelectorAll(selector).forEach(enhance);
  }
  function remove(el) {
    var record = records.get(el);
    sizeObserver.unobserve(el); root.LiquidDesign.destroy(el);
    if (record.background) {
      if (record.background[0]) el.style.setProperty('background-color', record.background[0], record.background[1]);
      else el.style.removeProperty('background-color');
    }
    if (record.tint) el.style.setProperty('--lg-site-inline-tint', record.tint); else el.style.removeProperty('--lg-site-inline-tint');
    if (record.layout) el.style.setProperty('--lg-site-layout-transform', record.layout); else el.style.removeProperty('--lg-site-layout-transform');
    record.saved.forEach(function (entry) {
      if (entry[1] === null) el.removeAttribute(entry[0]); else el.setAttribute(entry[0], entry[1]);
    }); records.delete(el);
  }
  function flush() {
    frame = 0;
    Array.from(records.keys()).forEach(function (el) { if (!el.isConnected) remove(el); });
    var scopes = Array.from(pending); pending.clear();
    scopes.forEach(function (scope) {
      if (!scope.isConnected && scope !== document) return;
      if (records.has(scope)) root.LiquidDesign.refresh(scope);
      else scan(scope);
    });
  }
  function changed(mutations) {
    mutations.forEach(function (mutation) {
      if (decoration(mutation.target)) return;
      var target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      if (!target) return;
      if (mutation.type === 'attributes') {
        if (target === document.documentElement && mutation.attributeName === 'class') syncTheme();
        var record = records.get(target);
        if (mutation.attributeName === 'style' && record) {
          var changedTint = inlineTint(target, record);
          var next = signature(target);
          if (next === record.signature && !changedTint) return;
          record.signature = next;
        }
        // Inherited theme/accent changes are CSS-driven. ResizeObserver handles
        // ancestor layout changes, without scanning buttons on every class toggle.
        if (record || target.matches(selector)) queue(target);
        return;
      }
      var host = target.closest('[data-lg-site]');
      if (host && records.has(host)) {
        // Plugin wrapping/repair moves the very same content nodes. Only refresh
        // if a decoration is missing or new host content sits outside its wrapper.
        var wrapper = Array.from(host.children).find(function (el) { return el.classList.contains('lgp-content'); });
        var broken = !wrapper || !host.querySelector(':scope > .lgp-material') || !host.querySelector(':scope > .lgp-outline');
        var external = Array.from(host.childNodes).some(function (node) { return node !== wrapper && !decoration(node); });
        if (broken || external || target !== host && !decoration(target)) queue(host);
      }
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1 || decoration(node) || node.classList.contains('lgp-content')) return;
        queue(node);
      });
      if (mutation.removedNodes.length && !host) {
        mutation.removedNodes.forEach(function (node) {
          if (node.nodeType === 1 && !decoration(node) && (records.has(node) || node.querySelector('[data-lg-site]'))) queue(node);
        });
      }
    });
  }
  function start(scope) {
    if (!observer) {
      observer = new MutationObserver(changed);
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'disabled', 'aria-disabled', 'aria-pressed', 'aria-selected', 'aria-checked', 'role', 'data-liquid-design-theme'] });
    }
    scan(scope || document);
  }
  root.LiquidDesignSite = {
    refresh: start,
    destroy: function () {
      if (observer) observer.disconnect(); observer = null;
      root.cancelAnimationFrame(frame); frame = 0; pending.clear(); sizeObserver.disconnect();
      Array.from(records.keys()).forEach(remove);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { start(); }, { once: true });
  else start();
})(window);
