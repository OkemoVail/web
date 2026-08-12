# Astra v2.1 — Layout Redesign (Google-classic results + tightened hero) — Design Spec

**Date:** 2026-08-12
**Status:** Approved (brainstorming complete, pending implementation plan)
**Builds on:** `2026-08-12-astra-keyless-cosmic-redesign-design.md` (v2)

## What

Pure layout/CSS redesign of `search/index.html` — no markup changes, no JS
changes, no backend changes. The v2 "cosmic playground" skin (parchment canvas,
rainbow-conic AI panel, tilted favicon chips, wavy link hovers, stars) stays;
only the **geometry** changes, with deliberately different desktop and mobile
modes (mode breakpoint: **768px**).

Mockups: `.superpowers/brainstorm/60967-1786540027/content/`
(`results-layout.html` = option A approved, `hero-layout.html` = option C
approved).

## Results page

### Desktop mode (> 768px) — Google-classic left rail

- `.results` loses its centered `max-width: 680px` column; becomes full-width
  with `padding-left: clamp(1rem, 12vw, 180px)` (Google's wide left margin,
  fluid between 769–1200px, fixed-feeling above).
- `.r-top` (logo + bar) anchors top-**left** at that same inset; bar caps at
  ~560px. Existing right-padding clearance for the fixed theme toggle carries
  over.
- `#result-list` and `.ai-panel` left-align under the bar in a
  `max-width: 640px` column — results and panel share the same left edge.
- Result internals unchanged (favicon chip + site/breadcrumb + title +
  snippet), gap-spaced as now.

### Mobile mode (≤ 768px)

- `.r-top` becomes a compact row: small ✦ Astra logo + full-width bar (bar
  takes remaining width, search button icon-first).
- `#result-list` goes **full-bleed**: gap-spacing replaced by hairline
  `border-top` dividers between rows (Google mobile style), rows padded
  vertically; grid/favicon/tilt unchanged.
- `.ai-panel` full-width card.
- `.r-meta` keeps its left alignment with the column.

## Hero (both modes) — tightened current composition

Approved direction C: keep the dead-center composition, compress it into one
unit.

- Wordmark `clamp(2.2rem, 6vw, 3.4rem)` → **`clamp(1.8rem, 5vw, 2.6rem)`**.
- `.hero` gap `14px` → **`8px`**; tagline/hint margins tightened to match.
- Mobile (≤ 768px): wordmark ~`1.5rem`, bar full-width, `.hero-btns` pills go
  icon-first (short labels), hint shortened, constellation nudged/hidden if it
  collides.

## Kept (do not regress)

Parchment canvas (`#fdf9f4` / `#1e1a18` page-local), stars + twinkle,
constellation SVG, rainbow-conic `.ai-panel` border + wave, tilted favicon
chips, wavy `.r-title` underline, fixed theme toggle + its results-bar
clearance, `prefers-reduced-motion` coverage, all of `astra.js`, all backend
endpoints.

## Out of scope

No new features (no tabs, pagination, knowledge panels). No JS behavior
changes. No backend changes. No changes to `src/design-tokens.css`.

## Testing

No frontend test infra (repo convention). Manual checklist:

1. Desktop >1200px and ~900px: results/panel/bar share the left inset; column
   640px; bar ≤560px; theme toggle never overlaps the bar.
2. ≤768px: top row compact, results full-bleed with dividers, no horizontal
   scroll at 375px; hero compressed, pills icon-first.
3. Light + dark both modes; `prefers-reduced-motion` still disables
   twinkle/ring/panel.
4. Functional smoke against local backend: search → results + streaming AI +
   citation jumps + cosmic button + suggest dropdown.
5. Backend suite still green: `cd backend && .venv/bin/python -m pytest tests/ -v`
   (36 passed) — untouched, just confirming.
