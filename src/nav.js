(function () {
  'use strict';
  if (window.__ovNavInjected) return;
  window.__ovNavInjected = true;

  var cfg = window.NAV_CONFIG || {};

  var DEFAULT_LINKS = [
    { label: 'Home', href: '/index.html' },
    { label: 'Design', href: '/design.html' },
    { label: 'GitHub', href: 'https://github.com/ar12c' },
    { label: 'YouTube', href: 'https://www.youtube.com/@SochiVail' }
  ];
  var DEFAULT_PRIMARY = { label: 'Labs21', href: '/AI/index.html', icon: 'labs21' };

  var links = cfg.links || DEFAULT_LINKS;
  var primary = cfg.primary === null ? null : (cfg.primary || DEFAULT_PRIMARY);
  var showThemeToggle = cfg.showThemeToggle !== false;

  // Six inner SVG children from index.html (lines 475-480) — verbatim match:
  var LABS21_INNER =
    '<path d="M4.96,314.21l508.97,180.31v-94.71L28.54,6.09C19.12-5.79,0,.87,0,16.03v286.6c0,4.38,1.79,8.56,4.96,11.58Z"/>' +
    '<polygon points="513.93 561.2 0 684.2 0 395.8 513.93 522.5 513.93 561.2"/>' +
    '<path d="M4.96,765.79l508.97-180.31v94.71L28.54,1073.91C19.12,1085.79,0,1079.13,0,1063.97v-286.6c0-4.38,1.79-8.56,4.96-11.58Z"/>' +
    '<path d="M1075.04,314.21l-508.97,180.31v-94.71S1051.46,6.09,1051.46,6.09c9.42-11.88,28.54-5.22,28.54,9.94v286.6c0,4.38-1.79-8.56-4.96-11.58Z"/>' +
    '<polygon points="566.07 561.2 1080 684.2 1080 395.8 566.07 522.5 566.07 561.2"/>' +
    '<path d="M1075.04,765.79l-508.97-180.31v94.71s485.39,393.71,485.39,393.71c9.42,11.88,28.54,5.22,28.54-9.94v-286.6c0-4.38-1.79-8.56-4.96-11.58Z"/>';

  var LABS21_SVG =
    '<svg class="ov-nav__logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" aria-hidden="true">' +
    LABS21_INNER + '</svg>';

  var CHEVRON_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';

  var MOON_SVG =
    '<svg class="ov-nav__moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  var SUN_SVG =
    '<svg class="ov-nav__sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/>' +
    '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  function isExternal(href) { return /^https?:/i.test(href); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // Build the collapsible links, inserting the divider before the first external link.
  var linksHtml = '';
  var dividerDone = false;
  links.forEach(function (l) {
    if (isExternal(l.href) && !dividerDone) {
      linksHtml += '<span class="ov-nav__div" aria-hidden="true"></span>';
      dividerDone = true;
    }
    var ext = isExternal(l.href) ? ' target="_blank" rel="noopener"' : '';
    linksHtml += '<a href="' + esc(l.href) + '" class="ov-nav__link"' + ext + '>' + esc(l.label) + '</a>';
  });

  var primaryHtml = '';
  if (primary) {
    var picon = primary.icon === 'labs21' ? LABS21_SVG : '';
    var pext = isExternal(primary.href) ? ' target="_blank" rel="noopener"' : '';
    primaryHtml =
      '<a href="' + esc(primary.href) + '" class="skuo skuo-accent skuo-pill ov-nav__primary"' + pext + '>' +
      picon + '<span>' + esc(primary.label) + '</span></a>';
  }

  var themeHtml = showThemeToggle
    ? '<button type="button" class="ov-nav__theme skuo skuo-icon skuo-pill" aria-label="Toggle theme" title="Toggle theme">' +
      MOON_SVG + SUN_SVG + '</button>'
    : '';

  var barHtml =
    '<div class="ov-nav__bar" data-liquid-design="surface">' +
      '<button type="button" class="ov-nav__chevron" aria-label="Toggle navigation links" ' +
        'aria-controls="ov-nav-links" aria-expanded="true">' + CHEVRON_SVG + '</button>' +
      '<div class="ov-nav__links" id="ov-nav-links">' + linksHtml + '</div>' +
      primaryHtml + themeHtml +
    '</div>';

  // Opt-in landing navigation uses the portable Tools split/rejoin controller.
  var toolsWork = cfg.toolsWork || { label: 'Selected work', href: '#work' };
  var toolsSecondary = cfg.toolsSecondary || { label: 'Liquid Design', href: '/design.html' };
  var secondaryIcon = toolsSecondary.icon === 'home'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s-7 7-7 12a7 7 0 0 0 14 0c0-5-7-12-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/></svg>';
  var socialsHtml = '<div class="ov-nav__socials" data-liquid-design-component="options">' +
    '<button type="button" class="skuo skuo-icon ov-nav__socials-toggle" data-liquid-design ' +
      'data-liquid-design-toggle="ov-nav-socials" aria-controls="ov-nav-socials" aria-expanded="false" aria-label="Socials" title="Socials">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg></button>' +
    '<div id="ov-nav-socials" aria-label="Social links" hidden inert>' +
      '<button type="button" data-liquid-design data-social-href="https://github.com/ar12c">' +
        '<span>GitHub</span></button>' +
      '<button type="button" data-liquid-design data-social-href="https://www.youtube.com/@SochiVail">' +
        '<span>YouTube</span></button>' +
    '</div></div>';
  var toolsHtml = '<div class="ov-nav__toolkit" data-liquid-design-component="tools">' +
    '<button type="button" class="skuo skuo-neutral skuo-pill ov-nav__tools-toggle" data-liquid-design ' +
      'data-liquid-design-toggle="ov-nav-tools" aria-controls="ov-nav-tools" aria-expanded="false" aria-label="More"><svg class="ov-nav__tools-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></button>' +
    '<div id="ov-nav-tools" hidden inert>' +
      '<a href="' + esc(toolsWork.href) + '" class="skuo skuo-icon" data-liquid-design aria-label="' + esc(toolsWork.label) + '" title="' + esc(toolsWork.label) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 12h16"/></svg></a>' +
      '<a href="' + esc(toolsSecondary.href) + '" class="skuo skuo-icon" data-liquid-design aria-label="' + esc(toolsSecondary.label) + '" title="' + esc(toolsSecondary.label) + '">' +
        secondaryIcon + '</a>' +
      themeHtml + '</div></div>' +
      (primary ? '<a href="' + esc(primary.href) + '" class="skuo skuo-accent skuo-pill ov-nav__labs" aria-label="' + esc(primary.label) + '"><span>' + esc(primary.label) + '</span>' + (primary.icon === 'labs21' ? LABS21_SVG : '') + '</a>' : '');

  var pageMenuHtml = '<div class="ov-nav__page-menu" data-liquid-design-component="options">' +
    '<button type="button" class="skuo skuo-icon ov-nav__tools-toggle" data-liquid-design data-liquid-design-toggle="ov-nav-pages" aria-controls="ov-nav-pages" aria-expanded="false" aria-label="Open menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>' +
    '<div id="ov-nav-pages" aria-label="Labs21 pages" hidden inert>' +
    links.map(function (link) { return '<button type="button" data-liquid-design data-page-href="' + esc(link.href) + '"><span>' + esc(link.label) + '</span></button>'; }).join('') +
    '</div></div>' + themeHtml +
    (primary ? '<a href="' + esc(primary.href) + '" class="skuo skuo-accent skuo-pill ov-nav__labs">' + LABS21_SVG + '<span>' + esc(primary.label) + '</span></a>' : '');

  function mount() {
    if (!document.body) return;
    var nav = document.createElement('nav');
    nav.id = 'site-navigation-ready';
    nav.className = 'ov-nav';
    nav.setAttribute('aria-label', 'Primary');
    nav.innerHTML = cfg.variant === 'pages' ? pageMenuHtml : cfg.variant === 'tools' ? toolsHtml : barHtml;
    if (cfg.variant === 'tools' || cfg.variant === 'pages') nav.classList.add('ov-nav--tools');
    if (cfg.variant === 'pages') nav.classList.add('ov-nav--pages');
    document.body.insertBefore(nav, document.body.firstChild);
    var socialsNav;
    if (cfg.variant === 'tools') {
      socialsNav = document.createElement('nav');
      socialsNav.className = 'ov-social-nav';
      if (navigator.webdriver || window.matchMedia('(prefers-reduced-motion: reduce)').matches) socialsNav.style.transition = 'none';
      socialsNav.setAttribute('aria-label', 'Socials');
      socialsNav.innerHTML = socialsHtml;
      document.body.insertBefore(socialsNav, nav);
    }
    if (cfg.back) {
      var backNav = document.createElement('nav');
      backNav.className = 'ov-social-nav';
      backNav.setAttribute('aria-label', 'Back');
      backNav.innerHTML = '<a href="' + esc(cfg.back.href) + '" class="skuo skuo-icon ov-nav__back" data-liquid-design aria-label="' + esc(cfg.back.label) + '" title="' + esc(cfg.back.label) + '">' + CHEVRON_SVG + '</a>';
      document.body.insertBefore(backNav, nav);
    }

    var bar = nav.querySelector('.ov-nav__bar');
    var chevron = nav.querySelector('.ov-nav__chevron');
    var linkGroup = nav.querySelector('.ov-nav__links');
    var themeBtn = nav.querySelector('.ov-nav__theme');
    var mq = window.matchMedia('(max-width: 767px)');
    if (cfg.variant === 'tools' && themeBtn) themeBtn.setAttribute('data-liquid-design', '');
    if (bar && window.LiquidDesign) window.LiquidDesign.refresh(bar);

    // scroll morph
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });

    // theme toggle
    var vtSeq = 0;
    if (themeBtn) {
      themeBtn.addEventListener('click', function (e) {
        var apply = function () {
          var isDark = document.documentElement.classList.toggle('dark');
          try { localStorage.setItem('vail_theme', isDark ? 'dark' : 'light'); } catch (err) {}
        };
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!document.startViewTransition || reduce || navigator.webdriver) { apply(); return; }
        var x = (e && e.clientX) || window.innerWidth - 60;
        var y = (e && e.clientY) || 40;
        document.documentElement.style.setProperty('--theme-x', x + 'px');
        document.documentElement.style.setProperty('--theme-y', y + 'px');
        document.documentElement.classList.add('theme-reveal-active');
        var id = ++vtSeq;
        var vt = document.startViewTransition(apply);
        var cleanup = function () {
          if (id !== vtSeq) return; // a newer transition owns the class now
          document.documentElement.classList.remove('theme-reveal-active');
          document.documentElement.style.removeProperty('--theme-x');
          document.documentElement.style.removeProperty('--theme-y');
        };
        vt.finished.then(cleanup, cleanup); // handled on both paths — no unhandled rejection
      });
    }

    if (cfg.variant === 'pages') {
      if (window.LiquidDesign) window.LiquidDesign.refresh(nav);
      nav.querySelectorAll('[data-page-href]').forEach(function (button) {
        button.addEventListener('click', function () {
          var href = button.getAttribute('data-page-href');
          if (window.GlassPageBridge && window.parent.GlassShell) window.parent.GlassShell.navigate(new URL(href, location.href));
          else window.location.href = href;
        });
      });
      var pageToggle = nav.querySelector('.ov-nav__tools-toggle');
      new MutationObserver(function () {
        var open = pageToggle.getAttribute('aria-expanded') === 'true';
        pageToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        pageToggle.querySelector('path').setAttribute('d', 'M4 6h16M4 12h16M4 18h16');
      }).observe(pageToggle, { attributes: true, attributeFilter: ['aria-expanded'] });
      return;
    }

    if (cfg.variant === 'tools') {
      if (window.LiquidDesign) window.LiquidDesign.refresh(nav);
      if (window.LiquidDesign) window.LiquidDesign.refresh(socialsNav);
      var toolsToggle = nav.querySelector('.ov-nav__tools-toggle');
      var toolsPanel = nav.querySelector('#ov-nav-tools');
      var socialsToggle = socialsNav.querySelector('.ov-nav__socials-toggle');
      socialsToggle.addEventListener('pointerdown', closeTools);
      socialsToggle.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') closeTools();
      });
      socialsNav.querySelectorAll('[data-social-href]').forEach(function (button) {
        button.addEventListener('click', function () {
          window.open(button.getAttribute('data-social-href'), '_blank', 'noopener');
        });
      });
      function arrangeNavigation(expanded, socialsExpanded) {
        var toolkit = nav.querySelector('.ov-nav__toolkit');
        var groupBounds = toolkit.getBoundingClientRect();
        var anchor = toolsToggle.getBoundingClientRect();
        var gap = parseFloat(getComputedStyle(toolkit).getPropertyValue('--liquid-design-tools-gap')) || 9;
        var offset = gap;
        toolsPanel.querySelectorAll('[data-liquid-button]').forEach(function (action) {
          var width = parseFloat(getComputedStyle(action).width) || 52;
          action.style.left = (anchor.left - groupBounds.left - offset - width) + 'px';
          action.style.top = '0px';
          offset += width + gap;
        });
        var socialLeft = parseFloat(getComputedStyle(socialsNav).left);
        var socialSize = socialsToggle.offsetWidth;
        var rowBottom = anchor.bottom;
        var actionLeft = anchor.left - offset + gap;
        var moveCircle = expanded && actionLeft < socialLeft + socialSize + 12;
        socialsNav.style.transform = moveCircle ? 'translateX(-' + (socialLeft + socialSize + 12) + 'px)' : '';
        socialsNav.querySelector('.ov-nav__socials').style.setProperty('--liquid-design-menu-offset-y', socialsExpanded && window.innerWidth < 430 ? (rowBottom + 12 - socialsToggle.getBoundingClientRect().top) + 'px' : '0px');
      }
      // Apply layout before the engine measures its opening trajectory.
      socialsNav.addEventListener('pointerdown', function (event) {
        if (event.target.closest('.ov-nav__socials-toggle')) {
          closeTools();
          arrangeNavigation(false, true);
        }
      }, true);
      socialsNav.addEventListener('click', function (event) {
        if (event.target.closest('.ov-nav__socials-toggle')) arrangeNavigation(false, socialsToggle.getAttribute('aria-expanded') !== 'true');
      }, true);
      socialsNav.addEventListener('keydown', function (event) {
        if (event.target === socialsToggle && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].indexOf(event.key) !== -1) arrangeNavigation(false, true);
      }, true);
      nav.addEventListener('click', function (event) {
        if (event.target.closest('.ov-nav__tools-toggle')) arrangeNavigation(toolsToggle.getAttribute('aria-expanded') !== 'true', false);
      }, true);
      function updateToolsLabel() {
        var expanded = toolsToggle.getAttribute('aria-expanded') === 'true';
        var socialsExpanded = socialsToggle.getAttribute('aria-expanded') === 'true';
        arrangeNavigation(expanded, socialsExpanded);
        toolsToggle.setAttribute('aria-label', expanded ? 'Close' : 'More');
        toolsToggle.querySelector('.ov-nav__tools-arrow path').setAttribute('d', expanded ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6');
      }
      new MutationObserver(updateToolsLabel).observe(toolsToggle, { attributes: true, attributeFilter: ['aria-expanded'] });
      updateToolsLabel();
      window.addEventListener('resize', function () { requestAnimationFrame(updateToolsLabel); }, { passive: true });
      new MutationObserver(function () {
        if (socialsToggle.getAttribute('aria-expanded') === 'true') closeTools();
        updateToolsLabel();
      }).observe(socialsToggle, { attributes: true, attributeFilter: ['aria-expanded'] });
      function closeTools() {
        if (toolsToggle.getAttribute('aria-expanded') === 'true') toolsToggle.click();
      }
      nav.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !event.defaultPrevented) { closeTools(); toolsToggle.focus(); }
      });
      // Navigation captures the current glass shape. Do not retract the controls
      // just before the browser snapshots them for the destination morph.
      toolsPanel.querySelectorAll('a[href^="#"]').forEach(function (link) {
        link.addEventListener('click', closeTools);
      });
      document.addEventListener('click', function (event) {
        if (!nav.contains(event.target)) closeTools();
      });
      return;
    }

    // pop origin: animate from click point if available
    function popFrom(e) {
      if (!e) return;
      var rect = bar.getBoundingClientRect();
      var ox = ((e.clientX - rect.left) / rect.width * 100).toFixed(1) + '%';
      var oy = ((e.clientY - rect.top) / rect.height * 100).toFixed(1) + '%';
      bar.style.transformOrigin = ox + ' ' + oy;
    }

    // Space the links group can occupy inside the viewport-capped bar,
    // i.e. bar's max width minus its padding, gaps, and fixed siblings.
    function availWidth() {
      var cs = window.getComputedStyle(bar);
      var padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      var gap = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0;
      var used = 0, n = 0;
      var content = bar.querySelector(':scope > .lgp-content') || bar;
      Array.prototype.forEach.call(content.children, function (ch) {
        n++;
        if (ch !== linkGroup) used += ch.offsetWidth;
      });
      // .ov-nav__bar is capped at calc(100vw - 2rem); 2rem ≈ 32px.
      var cap = Math.min(document.documentElement.clientWidth, window.innerWidth) - 32;
      return Math.max(0, cap - padX - used - gap * (n - 1));
    }

    function applyExpandedWidth() {
      var full = linkGroup.scrollWidth;
      var avail = availWidth();
      linkGroup.style.maxWidth = Math.min(full, avail) + 'px';
      linkGroup.classList.toggle('is-scroll', full > avail + 1);
      updateScrollHints();
    }

    // Edge-fade affordance: fade whichever side has more links to scroll to,
    // so it's visible the row is scrollable. Removed once fully scrolled that way.
    function updateScrollHints() {
      if (!linkGroup.classList.contains('is-scroll')) {
        linkGroup.style.webkitMaskImage = '';
        linkGroup.style.maskImage = '';
        return;
      }
      var atStart = linkGroup.scrollLeft <= 1;
      var atEnd = linkGroup.scrollLeft + linkGroup.clientWidth >= linkGroup.scrollWidth - 1;
      var left = atStart ? '#000 0' : 'transparent 0, #000 16px';
      var right = atEnd ? '#000 100%' : '#000 calc(100% - 16px), transparent 100%';
      var mask = 'linear-gradient(to right, ' + left + ', ' + right + ')';
      linkGroup.style.webkitMaskImage = mask;
      linkGroup.style.maskImage = mask;
    }

    function setCollapsed(collapsed, opts) {
      opts = opts || {};
      var animate = opts.animate !== false;
      bar.classList.toggle('collapsed', collapsed);
      chevron.setAttribute('aria-expanded', String(!collapsed));
      if (collapsed) {
        linkGroup.classList.remove('is-scroll');
        linkGroup.style.maxWidth = '0px';
      } else {
        applyExpandedWidth();
      }
      if (animate) {
        popFrom(opts.event || null);
        bar.classList.remove('pop');
        void bar.offsetWidth;
        bar.classList.add('pop');
      }
    }

    linkGroup.addEventListener('scroll', updateScrollHints, { passive: true });

    setCollapsed(mq.matches, { animate: false });

    chevron.addEventListener('click', function (e) {
      e.stopPropagation();
      setCollapsed(!bar.classList.contains('collapsed'), { event: e });
    });

    // Outside taps retract the capsule; page links retain its snapshot geometry.
    document.addEventListener('click', function (e) {
      if (mq.matches && !bar.contains(e.target)) setCollapsed(true, { animate: false });
    });

    // recompute expanded width on resize / orientation change (mobile clip fix)
    function recompute() {
      if (!bar.classList.contains('collapsed')) {
        applyExpandedWidth();
      }
    }
    window.addEventListener('resize', recompute, { passive: true });
    window.addEventListener('orientationchange', recompute);
  }

  if (!document.body) {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
