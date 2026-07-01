# Universal Floating Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put `index.html`'s floating "glass" nav on every page in the repo, driven by one shared self-injecting script, with per-page link config and a fix for the mobile clipping bug.

**Architecture:** A single `src/nav.js` reads an optional `window.NAV_CONFIG`, builds the nav DOM, injects it as the first child of `<body>`, and wires all behavior (chevron collapse, scroll morph, theme toggle, mobile re-collapse, resize recompute). All nav styling lives in a namespaced `.ov-nav*` block in `src/design-tokens.css`. The injected markup uses **only** `.ov-nav*` classes plus the shared `.skuo*` classes — never Tailwind utilities — so it renders identically on pages that load compiled `output.css` instead of the Tailwind CDN.

**Tech Stack:** Vanilla JS (no modules, no bundler), CSS custom properties in `src/design-tokens.css`, plain `<script>`/`<link>` tags. Verification is by opening HTML files in a browser (no test runner exists).

## Global Constraints

- **No Tailwind-utility dependence** in the injected nav markup or its CSS. Use only `.ov-nav*` and the shared `.skuo` / `.skuo-accent` / `.skuo-icon` / `.skuo-pill` classes (all defined in `design-tokens.css`).
- **Nav link hrefs are absolute from site root** (`/index.html`, `/AI/index.html`, `/design.html`, `https://…` for external). Only the `<script src>` / `<link href>` tag paths are relative to the page's folder depth (`src/nav.js` at root, `../src/nav.js` under `AI/`, `word/`, `Themes/`).
- **Theme:** localStorage key is `vail_theme` with values `'dark'` / `'light'`. The `.dark` class is toggled on `document.documentElement`.
- **Every page keeps its existing early inline theme `<script>` in `<head>`** (anti-FOUC). Do not remove or consolidate those.
- `nav.js` must be **idempotent** (guard against double injection) and must not throw if `localStorage` is unavailable.
- Preserve accessibility attributes: `aria-label`, `aria-controls`, `aria-expanded` on the chevron; `aria-label`/`title` on theme + primary buttons; `prefers-reduced-motion` handling for the pop animation.

---

## File Structure

- **Create** `src/nav.js` — the entire nav component (config parsing, markup, injection, behavior). One responsibility: render + wire the floating nav.
- **Modify** `src/design-tokens.css` — append one namespaced `.ov-nav*` style block (moved out of `index.html`).
- **Modify** every page — remove the page's old header/nav + duplicate theme toggle, add an optional `NAV_CONFIG` inline script + the `nav.js` tag.

---

## Task 1: Create the shared nav CSS + `src/nav.js`

**Files:**
- Modify: `src/design-tokens.css` (append `.ov-nav*` block at end)
- Create: `src/nav.js`

**Interfaces:**
- Consumes: `window.NAV_CONFIG` (optional) — shape:
  `{ links?: Array<{label:string, href:string}>, primary?: {label:string, href:string, icon?:'labs21'}|null, showThemeToggle?: boolean }`.
- Produces: injects `<nav class="ov-nav">…</nav>` as `document.body`'s first child. Sets `window.__ovNavInjected = true`. No other globals.

- [ ] **Step 1: Append the `.ov-nav*` CSS block to `src/design-tokens.css`**

Append exactly this at the end of `src/design-tokens.css`:

```css
/* ── Universal floating nav (.ov-nav) ─────────────────────────────
   Shared by every page via src/nav.js. Styling only — no Tailwind
   utilities so it renders identically on output.css pages. */
.ov-nav {
  position: fixed;
  top: 1.1rem;
  left: 0;
  right: 0;
  margin: 0 auto;
  max-width: 64rem;
  padding: 0 1.5rem;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  pointer-events: none; /* only the bar is interactive; lets page corners through */
}

.ov-nav__bar {
  pointer-events: auto;
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.34rem;
  border-radius: 999px;
  max-width: calc(100vw - 2rem); /* mobile clip fix: never exceed viewport */
  background-image: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg-elevated), white 7%),
    color-mix(in srgb, var(--bg-elevated), black 7%)
  );
  border: 1px solid color-mix(in srgb, var(--bg-elevated), black 14%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 1px 2px -1px rgba(0, 0, 0, 0.12),
    0 6px 22px -8px rgba(0, 0, 0, 0.18);
  transition: box-shadow 0.4s ease, background 0.4s ease;
}

.ov-nav.scrolled .ov-nav__bar {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 2px 4px -1px rgba(0, 0, 0, 0.14),
    0 10px 30px -8px rgba(0, 0, 0, 0.24);
}

.dark .ov-nav__bar {
  background-image: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg-elevated), white 8%),
    color-mix(in srgb, var(--bg-elevated), black 8%)
  );
  border-color: rgba(0, 0, 0, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 8px 28px -8px rgba(0, 0, 0, 0.55);
}

.dark .ov-nav.scrolled .ov-nav__bar {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 2px 4px rgba(0, 0, 0, 0.45),
    0 12px 34px -8px rgba(0, 0, 0, 0.6);
}

.ov-nav__chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 999px;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: color 0.25s ease, background-color 0.25s ease, transform 0.12s ease;
}

.ov-nav__chevron:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--text-primary) 7%, transparent);
}

.ov-nav__chevron:active { transform: scale(0.9); }

.ov-nav__chevron svg { transition: transform 0.55s cubic-bezier(0.34, 1.28, 0.64, 1); }
.ov-nav__bar:not(.collapsed) .ov-nav__chevron svg { transform: rotate(180deg); }

.ov-nav__links {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  overflow-x: auto;              /* mobile clip fix: scroll instead of overflowing the bar */
  scrollbar-width: none;
  max-width: 0;                  /* expanded width set in JS from scrollWidth */
  opacity: 1;
  transition:
    max-width 0.55s cubic-bezier(0.34, 1.28, 0.64, 1),
    opacity 0.3s ease;
}
.ov-nav__links::-webkit-scrollbar { display: none; }

.ov-nav__bar.collapsed .ov-nav__links { opacity: 0; }

@keyframes ovNavPop {
  0%   { transform: scaleX(1)     scaleY(1); }
  40%  { transform: scaleX(1.035) scaleY(1.006); }
  100% { transform: scaleX(1)     scaleY(1); }
}

.ov-nav__bar.pop { animation: ovNavPop 0.5s cubic-bezier(0.34, 1.28, 0.64, 1); }

@media (prefers-reduced-motion: reduce) {
  .ov-nav__bar.pop { animation: none; }
}

.ov-nav__div {
  flex: none;
  width: 1px;
  height: 1.05rem;
  margin: 0 0.3rem;
  background: color-mix(in srgb, var(--text-primary) 16%, transparent);
}

.ov-nav__link {
  position: relative;
  z-index: 1;
  font-family: 'Satoshi', 'Inter', sans-serif;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  white-space: nowrap;
  text-decoration: none;
  transition: color 0.25s ease, background-color 0.25s ease, transform 0.12s ease;
}

.ov-nav__link:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--text-primary) 7%, transparent);
}

.ov-nav__link:active { transform: scale(0.94); }

/* primary accent pill — replaces the old Tailwind px-4 py-2 inline-flex utils */
.ov-nav__primary {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  white-space: nowrap;
  text-decoration: none;
}

.ov-nav__logo {
  width: 15px;
  height: 15px;
  fill: currentColor;
  flex-shrink: 0;
}

/* icon buttons inside the bar sit flush with the pill height */
.ov-nav .skuo-icon {
  width: 2.3rem;
  height: 2.3rem;
  padding: 0;
  flex: none;
}

/* theme icon swap */
.ov-nav__sun { display: none; }
.dark .ov-nav__sun { display: block; }
.dark .ov-nav__moon { display: none; }

@media (max-width: 767px) {
  .ov-nav { top: 0.9rem; padding: 0 1rem; }
  .ov-nav__bar { gap: 0.1rem; padding: 0.34rem; }
  .ov-nav__links { gap: 0.05rem; }
  .ov-nav__link { font-size: 0.82rem; padding: 0.52rem 0.78rem; }
  .ov-nav__chevron { width: 2.2rem; height: 2.2rem; }
  .ov-nav .skuo-icon { width: 2.4rem; height: 2.4rem; }
  .ov-nav__div { margin: 0 0.24rem; }
  .ov-nav__primary { padding: 0.52rem 1.1rem; font-size: 0.85rem; }
}
```

- [ ] **Step 2: Create `src/nav.js` with the full component**

Create `src/nav.js` with exactly this content. **One manual step:** where marked, paste the six inner SVG elements verbatim from `index.html` (currently lines 475–480, the `<path>`/`<polygon>` children of the Labs21 `<svg>`) into the `LABS21_INNER` string.

```js
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

  // Paste the six inner SVG children from index.html (lines 475-480) here verbatim:
  var LABS21_INNER =
    '<path d="M4.96,314.21l508.97,180.31v-94.71L28.54,6.09C19.12-5.79,0,.87,0,16.03v286.6c0,4.38,1.79,8.56,4.96,11.58Z"/>' +
    '<polygon points="513.93 561.2 0 684.2 0 395.8 513.93 522.5 513.93 561.2"/>' +
    '<path d="M4.96,765.79l508.97-180.31v94.71L28.54,1073.91C19.12,1085.79,0,1079.13,0,1063.97v-286.6c0-4.38,1.79-8.56,4.96-11.58Z"/>' +
    '<path d="M1075.04,314.21l-508.97,180.31v-94.71S1051.46,6.09,1051.46,6.09c9.42-11.88,28.54-5.22,28.54,9.94v286.6c0,4.38,1.79-8.56,4.96-11.58Z"/>' +
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
        var isDark = !document.documentElement.classList.contains('dark');
        document.documentElement.classList.toggle('dark', isDark);
        try { localStorage.setItem('vail_theme', isDark ? 'dark' : 'light'); } catch (e) {}
      });
    }

    function popFrom(event) {
      if (event && typeof event.clientX === 'number') {
        var r = bar.getBoundingClientRect();
        var cx = Math.max(0, Math.min(r.width, event.clientX - r.left));
        var y = Math.max(0, Math.min(r.height, event.clientY - r.top));
        var x = r.width / 2 + (cx - r.width / 2) * 0.35;
        bar.style.transformOrigin = x + 'px ' + y + 'px';
      } else {
        bar.style.transformOrigin = '50% 50%';
      }
    }

    function setCollapsed(collapsed, opts) {
      opts = opts || {};
      var animate = opts.animate !== false;
      bar.classList.toggle('collapsed', collapsed);
      chevron.setAttribute('aria-expanded', String(!collapsed));
      linkGroup.style.maxWidth = collapsed ? '0px' : linkGroup.scrollWidth + 'px';
      if (animate) {
        popFrom(opts.event || null);
        bar.classList.remove('pop');
        void bar.offsetWidth;
        bar.classList.add('pop');
      }
    }

    setCollapsed(mq.matches, { animate: false });

    chevron.addEventListener('click', function (e) {
      e.stopPropagation();
      setCollapsed(!bar.classList.contains('collapsed'), { event: e });
    });

    linkGroup.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (mq.matches) setCollapsed(true, { event: e });
      });
    });

    document.addEventListener('click', function (e) {
      if (mq.matches && !bar.contains(e.target)) setCollapsed(true, { event: e });
    });

    // recompute expanded width on resize / orientation change (mobile clip fix)
    function recompute() {
      if (!bar.classList.contains('collapsed')) {
        linkGroup.style.maxWidth = linkGroup.scrollWidth + 'px';
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
```

- [ ] **Step 3: Rebuild the stylesheet (design-tokens.css is source; ensure it's served)**

`design-tokens.css` is a hand-authored shared file (not Tailwind-generated), so no build is required for it. Confirm the file saved without syntax errors:

Run: `npx --yes csslint src/design-tokens.css 2>NUL || echo "csslint not available - skipping"`
Expected: either lint output with no fatal parse error, or the skip message. (csslint is optional; the real check is the browser render in later tasks.)

- [ ] **Step 4: Commit**

```bash
git add src/nav.js src/design-tokens.css
git commit -m "feat(nav): add shared floating nav component (src/nav.js + .ov-nav CSS)"
```

---

## Task 2: Convert `index.html` (extract to shared files + mobile fix)

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `src/nav.js`, `.ov-nav*` CSS from Task 1.
- Produces: `index.html` renders the nav from the shared component (no inline nav style/markup/script).

- [ ] **Step 1: Remove the inline nav CSS**

In `index.html`, delete the floating-nav CSS rules from the `<style>` block — the contiguous run beginning at the comment `/* ── Unified floating nav (single refined-surface capsule) ────── */` (the `.nav-wrap { … }` rule) through the end of the `#labs21-link` mobile rule inside the `@media (max-width: 767px)` block. Concretely, remove every rule whose selector starts with `.nav-wrap`, `.glass`, `.nav-chevron`, `.nav-links`, `.nav-div`, `.g-link`, `#labs21-link`, `.icon-sun`, `.icon-moon`, and the `@keyframes navPop`. Leave all other `<style>` rules (hero, work-row, reveal, focus-visible, fonts) intact. Also remove the `#labs21-link` line inside the mobile `@media` block.

- [ ] **Step 2: Replace the nav markup with config + script**

Replace the entire `<nav id="nav" class="nav-wrap" aria-label="Primary"> … </nav>` block (the `<!-- ── Unified floating nav ── -->` region) with nothing (delete it). The nav is now injected by the script.

- [ ] **Step 3: Remove the inline nav JS and add the config + script tag**

In the bottom `<script>` block, delete the nav-related handlers: the "Glass nav morph on scroll" listener, the "Theme toggle" `getElementById('theme-toggle')` handler, and the entire "Chevron: collapse/expand" section (`bar`, `navToggle`, `navLinks`, `mq`, `popFrom`, `setCollapsed`, and the listeners through the outside-click handler). **Keep** the "Scroll reveal" IntersectionObserver block.

Then, immediately before the closing `</body>`, add:

```html
  <script>
    window.NAV_CONFIG = {
      links: [
        { label: 'Work', href: '#work' },
        { label: 'Design', href: '/design.html' },
        { label: 'GitHub', href: 'https://github.com/ar12c' },
        { label: 'YouTube', href: 'https://www.youtube.com/@SochiVail' }
      ]
      // primary + theme toggle use defaults (Labs21 pill + theme button)
    };
  </script>
  <script src="src/nav.js"></script>
```

Note: on the landing page the first link is the in-page `#work` anchor (not external), so the divider correctly falls before GitHub.

- [ ] **Step 4: Verify in a browser (desktop + mobile + theme)**

Open `index.html` in a browser.
Expected:
- Nav capsule appears top-right, visually identical to before.
- Chevron collapses/expands the Work·Design·GitHub·YouTube group with the pop animation; divider sits before GitHub.
- Labs21 accent pill + theme toggle present; theme toggle flips light/dark and persists after reload.
- At ~360px width (devtools device mode): the capsule does **not** clip past the right edge; expanded links scroll within the capsule if too wide; rotating/resizing does not leave a stale width.
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(nav): use shared nav on index.html + fix mobile clipping"
```

---

## Task 3: Convert the AI info pages (`AI/index`, `tos`, `privacy`, `goals`, `research`)

**Files:**
- Modify: `AI/index.html`, `AI/tos.html`, `AI/privacy.html`, `AI/goals.html`, `AI/research.html`

**Interfaces:**
- Consumes: `src/nav.js` (loaded as `../src/nav.js`).
- Produces: each page shows the shared nav with the AI-section link set.

- [ ] **Step 1: Remove the old `<nav>` header on each page**

On each of the five pages, delete the existing top `<nav … > … </nav>` header block (the sticky bar containing the logo, the Goals/Research/Privacy/TOS links, and the "Join Discord" button). Do not touch the `<head>` inline theme script or Tailwind config.

- [ ] **Step 2: Add config + script before `</body>` on each page**

On each of the five pages, insert immediately before `</body>`:

```html
  <script>
    window.NAV_CONFIG = {
      links: [
        { label: 'Goals', href: '/AI/goals.html' },
        { label: 'Research', href: '/AI/research.html' },
        { label: 'Privacy', href: '/AI/privacy.html' },
        { label: 'TOS', href: '/AI/tos.html' }
      ],
      primary: { label: 'Labs21', href: '/AI/index.html', icon: 'labs21' }
    };
  </script>
  <script src="../src/nav.js"></script>
```

(These four links are internal, so no divider appears — matching the fact that this set has no external links. That is expected.)

- [ ] **Step 3: Adjust top spacing if needed**

If removing the old sticky nav causes the page's first content to sit under the floating nav, add top padding to the main content container (e.g. add `padding-top: 5rem;` via the page's existing content wrapper class, matching how `index.html` uses `pt-40`). Check visually in Step 4 and only adjust if content is obscured.

- [ ] **Step 4: Verify each page in a browser**

Open each of `AI/index.html`, `AI/tos.html`, `AI/privacy.html`, `AI/goals.html`, `AI/research.html`.
Expected: floating nav appears with Goals·Research·Privacy·TOS + Labs21 pill + theme toggle; links navigate to the right pages; theme toggle works; first content not hidden behind the nav; no console errors. Check light + dark and ~360px.

- [ ] **Step 5: Commit**

```bash
git add AI/index.html AI/tos.html AI/privacy.html AI/goals.html AI/research.html
git commit -m "refactor(nav): adopt shared floating nav on AI info pages"
```

---

## Task 4: Convert `AI/version.html` and `AI/manage.html`

**Files:**
- Modify: `AI/version.html`, `AI/manage.html`

**Interfaces:**
- Consumes: `src/nav.js` (as `../src/nav.js`).
- Produces: shared nav present; the header-island back link is replaced by the nav's Home/links; `connectStorage()`-style app buttons are preserved.

- [ ] **Step 1: Trim the header-island on each page**

- `AI/version.html`: remove the `<header>` region's **Back to Chat** link and the **theme toggle** button (`onclick="toggleTheme()"`). If the `<header>`/`header-island` then has no remaining children, remove the empty `<header>` too.
- `AI/manage.html`: remove the **Back to Research** link. **Keep** the `#connect-btn` "Connect Storage" button. If keeping it, leave its `header-island`/`<header>` in place (it's app-functional).

- [ ] **Step 2: Add config + script before `</body>`**

Insert on both pages before `</body>`:

```html
  <script>
    window.NAV_CONFIG = {
      links: [
        { label: 'Home', href: '/index.html' },
        { label: 'Chat', href: '/AI/chat.html' },
        { label: 'Research', href: '/AI/research.html' }
      ],
      primary: { label: 'Labs21', href: '/AI/index.html', icon: 'labs21' }
    };
  </script>
  <script src="../src/nav.js"></script>
```

- [ ] **Step 3: If `toggleTheme()` becomes unused on `AI/version.html`, remove it**

Search `AI/version.html` for other callers of `toggleTheme`:
Run: `grep -n "toggleTheme" AI/version.html`
If the only remaining reference is the function definition itself (no `onclick`/call sites left after Step 1), delete the `function toggleTheme() { … }` definition. If any caller remains, leave it.

- [ ] **Step 4: Verify in a browser**

Open both pages. Expected: floating nav present + working theme toggle; on `manage.html` the "Connect Storage" button still works (opens its flow); no orphaned/empty header bar; no console errors. Check light + dark and mobile.

- [ ] **Step 5: Commit**

```bash
git add AI/version.html AI/manage.html
git commit -m "refactor(nav): shared floating nav on version + manage pages"
```

---

## Task 5: Convert `design.html` and `Themes/Themes.html`

**Files:**
- Modify: `design.html`, `Themes/Themes.html`

**Interfaces:**
- Consumes: `src/nav.js` (as `src/nav.js` for `design.html`, `../src/nav.js` for `Themes/Themes.html`).
- Produces: shared nav present; each page's bespoke theme toggle / header link is replaced by the nav.

- [ ] **Step 1: `design.html` — remove the standalone theme toggle, keep the breadcrumb**

In `design.html`, remove the `#theme-toggle` button and its click-handler `<script>` logic (the `getElementById('theme-toggle').addEventListener('click', …)` block). **Keep** the `.ui-crumb` breadcrumb nav (it's page content, not chrome). Keep the page's own `.dark`/`vail_theme` early script if present.

- [ ] **Step 2: `design.html` — add config + script before `</body>`**

```html
  <script>
    window.NAV_CONFIG = {
      links: [
        { label: 'Home', href: '/index.html' },
        { label: 'GitHub', href: 'https://github.com/ar12c' },
        { label: 'YouTube', href: 'https://www.youtube.com/@SochiVail' }
      ],
      primary: { label: 'Labs21', href: '/AI/index.html', icon: 'labs21' }
    };
  </script>
  <script src="src/nav.js"></script>
```

- [ ] **Step 3: `Themes/Themes.html` — remove the header, add config + script**

Remove the `<header class="w-full z-10 fixed top-0 left-0 …">` block (Back link + "OkemoVail" branding + GitHub "hub" link). Then before `</body>` add:

```html
  <script>
    window.NAV_CONFIG = {
      links: [
        { label: 'Home', href: '/index.html' },
        { label: 'GitHub', href: 'https://github.com/ar12c' }
      ],
      primary: { label: 'Labs21', href: '/AI/index.html', icon: 'labs21' }
    };
  </script>
  <script src="../src/nav.js"></script>
```

- [ ] **Step 4: Verify both pages in a browser**

Open `design.html` and `Themes/Themes.html` (both load `output.css`, **not** the Tailwind CDN — this is the key test that the nav has no Tailwind-utility dependence). Expected: nav renders **identically** to the landing nav (capsule shape, padding, Labs21 pill sizing, icon sizes all correct); theme toggle works; breadcrumb still present on `design.html`; no clipped/oversized pill; no console errors. Check light + dark + mobile.

- [ ] **Step 5: Commit**

```bash
git add design.html Themes/Themes.html
git commit -m "refactor(nav): shared floating nav on design + Themes (output.css pages)"
```

---

## Task 6: Convert `AI/editor.html` (app page — Phase 2)

**Files:**
- Modify: `AI/editor.html`

**Interfaces:**
- Consumes: `src/nav.js` (as `../src/nav.js`).
- Produces: shared nav present; editor's Back link + theme toggle removed; Connect/Publish preserved.

- [ ] **Step 1: Trim the editor `<header>`**

In the `<header>` block: remove the **Back** link (`href="research.html"`) and the **theme toggle** button (`onclick="toggleTheme()"`). **Keep** the `#connect-btn` "Connect" (`onclick="connectStorage()"`) and "Publish" (`onclick="publishBlog()"`) buttons.

- [ ] **Step 2: Ensure the nav does not overlap the kept header buttons**

The floating nav is fixed top-right; Connect/Publish are on the right of the editor header. Give the header's right-side button group right padding so it clears the nav. Add to the editor's inline `<style>`:

```css
/* clear space for the floating nav on the right */
header .toolbar-right, header > div:last-child { padding-right: 12.5rem; }
```

If the header's right group has a different selector, use that selector instead (inspect the header markup). Verify visually in Step 4; adjust the `padding-right` value so buttons and nav don't overlap at desktop and mobile.

- [ ] **Step 3: Add config + script before `</body>` and clean up `toggleTheme` if unused**

```html
  <script>
    window.NAV_CONFIG = {
      links: [
        { label: 'Home', href: '/index.html' },
        { label: 'Research', href: '/AI/research.html' }
      ],
      primary: { label: 'Labs21', href: '/AI/index.html', icon: 'labs21' }
    };
  </script>
  <script src="../src/nav.js"></script>
```

Then: `grep -n "toggleTheme" AI/editor.html` — if no call sites remain (only the definition), delete the `function toggleTheme() { … }` (the light→dark→system cycler). If other callers exist, leave it.

- [ ] **Step 4: Verify in a browser**

Open `AI/editor.html`. Expected: floating nav present + theme toggle works; Connect and Publish buttons still visible, not overlapped by the nav, and still function; editor typing area unaffected; no console errors. Check light + dark + mobile (~360px: confirm nav and header buttons don't collide — reduce content or wrap as needed).

- [ ] **Step 5: Commit**

```bash
git add AI/editor.html
git commit -m "refactor(nav): shared floating nav on editor; keep Connect/Publish"
```

---

## Task 7: Convert `word/index.html` (app page — Phase 2)

**Files:**
- Modify: `word/index.html`

**Interfaces:**
- Consumes: `src/nav.js` (as `../src/nav.js`).
- Produces: shared nav present; `.ow-logo` home affordance + `#theme-btn` removed; doc title/word-count/New/Save/Export/Print/AI-toggle preserved.

- [ ] **Step 1: Trim `.ow-header`**

In `.ow-header`: remove the `#theme-btn` button (`onclick="toggleTheme()"`, the moon icon). Remove the `.ow-logo` element **only if** it is purely a home/brand affordance (no doc functionality). Keep `#doc-title`, `#hdr-word-count`, New/Save/Export/Print buttons, and `#ai-toggle-btn`.

- [ ] **Step 2: Clear space so the nav doesn't overlap header controls**

`.ow-header` is a full-width 52px sticky bar; the nav is fixed top-right. Add right padding to `.ow-header` so its right-side buttons clear the nav. In the page's inline `<style>`, update the `.ow-header` rule (or add):

```css
.ow-header { padding-right: 13rem; }
```

Verify visually and tune the value; on mobile (≤767px) the nav is smaller and the header buttons may already wrap — confirm no overlap.

- [ ] **Step 3: Remove the now-unused `toggleTheme()` and `updateThemeBtn()` if orphaned**

Run: `grep -n "toggleTheme\|updateThemeBtn\|#theme-btn\|theme-btn" word/index.html`
- If `toggleTheme` has no remaining callers (the `#theme-btn` onclick was its only caller), delete the `function toggleTheme() { … }` definition.
- If `updateThemeBtn()` is only called from `toggleTheme()` / on-load to update the removed button's icon, delete it and any call to it. If it does anything else still needed, leave it.
Be conservative: only delete a function when grep shows no live caller.

- [ ] **Step 4: Add config + script before `</body>`**

```html
  <script>
    window.NAV_CONFIG = {
      links: [
        { label: 'Home', href: '/index.html' },
        { label: 'Design', href: '/design.html' }
      ],
      primary: { label: 'Labs21', href: '/AI/index.html', icon: 'labs21' }
    };
  </script>
  <script src="../src/nav.js"></script>
```

- [ ] **Step 5: Verify in a browser**

Open `word/index.html`. Expected: floating nav present + theme toggle flips theme (and no leftover broken `#theme-btn`); doc title editing, word count, New/Save/Export/Print, and AI toggle all still work; header buttons not overlapped by the nav; no console errors (especially none about missing `toggleTheme`/`updateThemeBtn`). Check light + dark + mobile.

- [ ] **Step 6: Commit**

```bash
git add word/index.html
git commit -m "refactor(nav): shared floating nav on word editor; keep doc controls"
```

---

## Task 8: Convert `AI/chat.html` (most complex app page — Phase 2)

**Files:**
- Modify: `AI/chat.html`

**Interfaces:**
- Consumes: `src/nav.js` (as `../src/nav.js`).
- Produces: shared nav present; existing `#menu-toggle-btn` (sidebar) and settings-modal theme controls preserved; no z-index / pointer-events regressions.

- [ ] **Step 1: Add config + script before `</body>` (no header removal)**

Chat's mobile `<header>` only contains `#menu-toggle-btn` (sidebar toggle, app-functional) and has no theme toggle (theme lives in the settings modal). Keep the header. Insert before `</body>`:

```html
  <script>
    window.NAV_CONFIG = {
      links: [
        { label: 'Home', href: '/index.html' },
        { label: 'Research', href: '/AI/research.html' }
      ],
      primary: { label: 'Labs21', href: '/AI/index.html', icon: 'labs21' }
    };
  </script>
  <script src="../src/nav.js"></script>
```

- [ ] **Step 2: Prevent collision with the sidebar toggle**

The sidebar `#menu-toggle-btn` sits top-left (mobile) and the nav sits top-right, so they should not collide. Confirm visually. If the chat header or any full-height sidebar has a `z-index` ≥ 50 that covers the nav, either raise the nav locally on this page only via an inline rule (`.ov-nav { z-index: 60; }`) or confirm the nav is still clickable. Only add the override if a real overlap is observed.

- [ ] **Step 3: Verify in a browser (desktop + mobile)**

Open `AI/chat.html`. Expected: floating nav appears top-right and is clickable; the nav theme toggle flips theme and stays consistent with the settings-modal theme buttons (both write `vail_theme`); sidebar toggle still opens/closes the sidebar; sending a message still works; the nav does not cover chat controls or the composer; no console errors. Test at desktop and ~360px, light + dark.

- [ ] **Step 4: Commit**

```bash
git add AI/chat.html
git commit -m "refactor(nav): add shared floating nav to chat page"
```

---

## Final verification (all pages)

- [ ] **Step 1: Sweep every converted page**

Open each page and confirm: nav renders identically, chevron + pop animation work, theme toggle persists across reload, links navigate correctly, no clipping at ~360px, app-functional controls intact, zero console errors. Pages: `index.html`, `design.html`, `Themes/Themes.html`, `AI/index.html`, `AI/tos.html`, `AI/privacy.html`, `AI/goals.html`, `AI/research.html`, `AI/version.html`, `AI/manage.html`, `AI/editor.html`, `word/index.html`, `AI/chat.html`.

- [ ] **Step 2: Update CLAUDE.md**

Add a short subsection documenting the shared nav: `src/nav.js` + `.ov-nav*` in `design-tokens.css` is the single source of truth for the floating nav on every page; per-page links via `window.NAV_CONFIG` (defaults: Home·Design·GitHub·YouTube + Labs21 pill + theme toggle); markup uses only `.ov-nav*`/`.skuo*` (no Tailwind utilities) so it works on `output.css` pages; each page keeps its own early inline theme script.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document shared floating nav (src/nav.js + NAV_CONFIG)"
```
