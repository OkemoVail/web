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
    '<div class="ov-nav__bar">' +
      '<button type="button" class="ov-nav__chevron" aria-label="Toggle navigation links" ' +
        'aria-controls="ov-nav-links" aria-expanded="true">' + CHEVRON_SVG + '</button>' +
      '<div class="ov-nav__links" id="ov-nav-links">' + linksHtml + '</div>' +
      primaryHtml + themeHtml +
    '</div>';

  function mount() {
    if (!document.body) return;
    var nav = document.createElement('nav');
    nav.className = 'ov-nav';
    nav.setAttribute('aria-label', 'Primary');
    nav.innerHTML = barHtml;
    document.body.insertBefore(nav, document.body.firstChild);

    var bar = nav.querySelector('.ov-nav__bar');
    var chevron = nav.querySelector('.ov-nav__chevron');
    var linkGroup = nav.querySelector('.ov-nav__links');
    var themeBtn = nav.querySelector('.ov-nav__theme');
    var mq = window.matchMedia('(max-width: 767px)');

    // scroll morph
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });

    // theme toggle
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        var isDark = document.documentElement.classList.toggle('dark');
        try { localStorage.setItem('vail_theme', isDark ? 'dark' : 'light'); } catch (e) {}
      });
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
      Array.prototype.forEach.call(bar.children, function (ch) {
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

    // Auto-collapse (tapping a link, or tapping anywhere outside the bar) closes
    // silently — only the chevron toggle plays the pop/scale animation.
    linkGroup.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        if (mq.matches) setCollapsed(true, { animate: false });
      });
    });

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
