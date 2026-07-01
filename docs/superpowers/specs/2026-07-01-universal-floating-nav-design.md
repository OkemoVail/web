# Universal Floating Nav — Design

**Date:** 2026-07-01
**Status:** Approved (pending spec review)

## Problem

The refined floating navigation capsule ("glass" nav) currently exists only on
`index.html`. Every other page (info/static pages and the full "app" pages) has
its own ad-hoc header or nav bar, or none. We want the single floating nav on
**every** page, driven from one source of truth, with per-page link
customization — and we want to fix a mobile clipping bug in the current
`index.html` nav along the way.

## Goals

- One floating nav, visually identical to today's `index.html` capsule, on every
  page in the repo.
- Single source of truth for the nav's markup, CSS, and JS — future edits happen
  in one place.
- Per-page link customization via a small config object, with sensible defaults.
- Unify the theme toggle behavior behind the nav's own toggle.
- Fix the mobile clipping bug on the current nav.

## Non-goals

- Rewriting or restyling the app-specific functional controls (title input,
  print, AI toggle, Connect/Publish, sidebar toggle, chat tabs). Those stay.
- Changing the design-token system, color tokens, or the `.skuo` button system.
- Adding a build step / module bundler. The site remains no-bundler vanilla JS.

## Architecture

### Shared files (single source of truth)

1. **`src/nav.js`** — a self-injecting script. On load it reads an optional
   `window.NAV_CONFIG`, builds the nav DOM, injects it as the first element of
   `<body>`, and wires up all behavior (chevron collapse/expand, scroll morph,
   theme toggle, mobile re-collapse, resize recompute). It attaches nothing to
   globals beyond what it needs; it is idempotent (guards against double-inject).

2. **`src/design-tokens.css`** — gains a namespaced `.ov-nav*` block containing
   all nav styling (the capsule "glass" surface, chevron, link group animation,
   dividers, icon buttons, theme-icon swap, mobile rules). This is moved out of
   `index.html`'s inline `<style>`.

### Hard constraint: no Tailwind-utility dependence

`word/index.html`, `design.html`, and `Themes/Themes.html` load compiled
`src/output.css`, **not** the Tailwind CDN. The current nav markup uses Tailwind
utility classes on the Labs21 pill (`px-4 py-2 inline-flex items-center gap-2`,
`w-[15px] h-[15px] fill-current shrink-0`). Those utilities do not exist on
non-CDN pages. Therefore the shared nav markup produced by `nav.js` must be
styled **entirely by its own `.ov-nav*` classes** in `design-tokens.css`, with
zero reliance on Tailwind utility classes. The `.skuo` / `.skuo-accent` /
`.skuo-icon` / `.skuo-pill` classes ARE shared (they live in
`design-tokens.css`) and may be used.

### Link paths

All default and config link paths are **absolute from site root**
(`/index.html`, `/AI/index.html`, `/design.html`, …) so one config works
regardless of the page's folder depth (root vs `AI/` vs `word/` vs `Themes/`).
The `src` of the `<script>` and `<link>` tags is the only path that must be
relative to page depth (`src/nav.js` at root, `../src/nav.js` under `AI/` etc.).

## Per-page config

`nav.js` ships a **sensible default** nav. A page customizes by declaring
`window.NAV_CONFIG` **before** the `nav.js` script tag. Shape:

```js
window.NAV_CONFIG = {
  // Collapsible link group (left of the divider). Omit to use defaults.
  links: [
    { label: 'Home',    href: '/index.html' },
    { label: 'Design',  href: '/design.html' },
    // external links get target=_blank rel=noopener automatically when href is absolute http(s)
    { label: 'GitHub',  href: 'https://github.com/ar12c' },
    { label: 'YouTube', href: 'https://www.youtube.com/@SochiVail' },
  ],
  // The always-visible accent pill. Set to null to hide it.
  primary: { label: 'Labs21', href: '/AI/index.html', icon: 'labs21' },
  // Show the theme-toggle icon button (default true).
  showThemeToggle: true,
};
```

Defaults (when `NAV_CONFIG` is absent or a field is omitted):
- `links`: Home · Design · GitHub · YouTube
- `primary`: Labs21 pill → `/AI/index.html`, with the Labs21 logo icon
- `showThemeToggle`: `true`

`icon: 'labs21'` maps to the inline Labs21 SVG baked into `nav.js`. This is the
only built-in icon; the primary pill without an icon renders text only.

### Per-page link sets

- **`index.html` (landing):** `links` includes `#work` (in-page anchor) instead
  of Home, plus Design/GitHub/YouTube; primary Labs21. (Matches today.)
- **AI info pages** (`AI/index`, `tos`, `privacy`, `goals`, `research`,
  `version`, `manage`): links = Goals · Research · Privacy · TOS (the current
  AI-section nav set), primary Labs21 or Home as appropriate.
- **`design.html`, `Themes/Themes.html`, `word/index.html`, app pages:** default
  set (Home · Design · GitHub · YouTube) unless a page clearly needs otherwise;
  finalized in the implementation plan per page.

The exact per-page link list is enumerated in the implementation plan.

## Theme toggle unification

- The nav's own theme-toggle button is the single toggle handler for all pages:
  on click it flips `document.documentElement.classList` `.dark` and writes
  `localStorage['vail_theme']` = `'dark'`/`'light'`. This is the existing
  `index.html` handler, moved into `nav.js`.
- **Each page keeps its existing early inline theme script** (the one in
  `<head>` that reads `vail_theme` and applies `.dark` before paint). This
  prevents flash-of-wrong-theme and is out of scope to consolidate.
- Duplicate theme-toggle buttons living in page headers are **removed** (see app
  pages below). `design.html`'s `#theme-toggle` and `word`'s `#theme-btn`
  (`toggleTheme()`) are removed in favor of the nav toggle. `toggleTheme()` in
  `word` is removed if it becomes unused (verify no other caller).
- Chat's theme is set via its settings modal (`#btn-theme-*`); that stays. The
  nav toggle simply provides an additional always-visible toggle. No conflict —
  both write the same `vail_theme` key and `.dark` class.

## Per-page changes

### Landing — `index.html`
Extract the existing nav markup, `<style>` nav rules, and nav `<script>` into the
shared files. The page then loads `src/design-tokens.css` (already does) + a
`NAV_CONFIG` + `src/nav.js`. Behavior identical to today, **plus** the mobile
clipping fix. Net: page shrinks; no visual change on desktop.

### Info / static pages (low risk)
`AI/index`, `AI/tos`, `AI/privacy`, `AI/goals`, `AI/research`, `AI/version`,
`AI/manage`, `design.html`, `Themes/Themes.html`:
- Remove the page's current header/nav bar element.
- Add `<script>window.NAV_CONFIG = {…}</script>` + `<script src="…/nav.js"></script>`
  before `</body>`.
- Remove any now-duplicate theme toggle.
- Adjust top padding if the removed header reserved vertical space.

### App pages (higher risk) — "nav replaces header controls"
Concrete interpretation: the floating nav supplies **all navigational chrome**
(home/cross-links/theme). We remove the **duplicated navigational bits** from
each app's existing header and **keep the app-functional controls**. The floating
nav and the slimmed functional header coexist without duplication.

- **`AI/editor.html`** (`<header>` fixed full-width): remove the **Back** link
  and the **theme-toggle** icon button. Keep **Connect** and **Publish**
  (app-functional). Add nav (config: Back→Research or Home, primary Labs21).
- **`word/index.html`** (`.ow-header`): remove the **logo-home** link and
  **`#theme-btn`** (`toggleTheme()`). Keep `#doc-title`, `#hdr-word-count`,
  New/Save/Export/Print, `#ai-toggle-btn`. Add nav. Ensure the fixed nav (top,
  right-aligned) does not overlap the functional buttons on the right of
  `.ow-header`; if it would, the header's right-side controls are given right
  padding equal to the nav's footprint, or the nav is offset. Resolved visually
  during implementation.
- **`AI/chat.html`**: mobile `<header>` has `#menu-toggle-btn` (sidebar toggle,
  app-functional) — kept. Theme is in the settings modal — kept. Add the floating
  nav; ensure it does not overlap the sidebar toggle or chat header tabs
  (position/offset resolved visually). Chat is the most complex surface; treat
  with care and verify no z-index / pointer-events regressions.

## Mobile clipping fix

**Root cause:** `.nav-wrap` is `position: fixed; right: 0; left: 0` with
`padding: 0 1rem` on mobile and is right-aligned (`justify-content: flex-end`).
The `.glass` capsule's expanded width is driven by JS setting
`nav-links.style.maxWidth = scrollWidth + 'px'`. On narrow viewports the fully
expanded capsule can exceed available width and clip past the right edge.

**Fix:**
- Constrain the capsule: `.glass { max-width: calc(100vw - 2rem); }` (accounting
  for wrap padding) so it can never exceed the viewport.
- Allow the link group to degrade gracefully within the capsule on very small
  widths (e.g. permit horizontal scroll within `.nav-links` rather than
  overflowing the capsule), so links remain reachable without clipping.
- Recompute the expanded `max-width` on `resize` and `orientationchange` (today
  it's only computed on toggle), so rotating or resizing doesn't leave a stale
  width.
- Verify live in a browser at mobile widths (~360px) before finishing.

## Rollout

Two phases to contain risk:

- **Phase 1:** Create `src/nav.js` + `.ov-nav*` CSS in `design-tokens.css`;
  convert `index.html` (extract + mobile fix) and all info/static pages. Ship and
  verify.
- **Phase 2:** Convert the three app pages (`editor`, `word`, `chat`), verifying
  each individually.

## Edge cases & risks

- **Path depth:** `src`/`href` of the injected `<script>`/`<link>` differ by
  folder; nav link hrefs are absolute so unaffected. Each page's script tag path
  must be correct for its depth.
- **Compiled-CSS pages** must not rely on Tailwind utilities (covered above).
- **Double-inject / re-entry:** `nav.js` guards so it injects once.
- **Reduced motion:** preserve the existing `prefers-reduced-motion` handling for
  the pop animation.
- **z-index/pointer-events on app pages:** the nav must sit above content but not
  block app controls; verify per app page.
- **Accessibility:** preserve `aria-label`, `aria-controls`, `aria-expanded` on
  the chevron and labels on the theme/primary buttons.

## Testing / verification

- Open `index.html`, an info page, and each app page in a browser (light + dark),
  desktop and ~360px mobile.
- Confirm: nav renders identically to today's landing nav; chevron collapse/
  expand + pop animation work; theme toggle flips and persists; links navigate;
  no clipping at 360px; app-functional controls still work; no console errors.
