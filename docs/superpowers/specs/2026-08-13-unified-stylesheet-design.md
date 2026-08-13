# Unified Stylesheet — Design

**Date:** 2026-08-13
**Status:** Approved (pending spec review)

## Problem

The site's hand-written CSS is scattered across ~5,900 lines of inline `<style>`
blocks in 14+ pages (`chat.html` alone holds ~3,450; `word` ~850; `AI/index`
~390), plus `src/design-tokens.css` (732 lines, shared), `src/styles.css`
(Themes only), dead `AI/thing.css`, and a Satoshi `@font-face` duplicated into
~10 pages. Icons come from third-party CDNs (Font Awesome on 11 pages,
feather-icons in chat) and are not editable. There is no single place to open,
edit, and restyle the site.

## Goals

- **One literal, hand-editable stylesheet** — `src/site.css` (~7k lines) —
  containing all hand-written CSS: design tokens, themes (light/dark + accent
  system), shared components, and every page's local styles. No build step.
- **Icons become local**: Font Awesome glyphs re-implemented as CSS mask icons
  *inside* `site.css`; feather-icons replaced by a tiny self-hosted script with
  the same API. All icon CDN links removed.
- **Rendering unchanged.** This is a reorganization, not a redesign.
- Every page links `site.css` (plus keeps its existing Tailwind — compiled
  `output.css` on root pages, CDN on AI/word pages).

## Non-goals

- Removing or replacing Tailwind (CDN or compiled). Chat's canvas feature
  instructs the AI to emit Tailwind markup; the CDN is load-bearing.
- Restyling anything. No visual changes, no refactors of CSS logic.
- Self-hosting Google Fonts (Outfit, JetBrains Mono) — those stay CDN links.
- Touching `backend/`, chat JS logic, or `src/nav.js` behavior.

## Decisions (from brainstorming)

1. **Keep Tailwind, unify custom CSS.** Runtime Tailwind CDN cannot live in a
   file; it stays. All hand-written CSS merges into `site.css`.
2. **One local SVG icon system.** FA → CSS masks; feather → local JS shim.
3. **One literal file, no build.** Matches the site's no-bundler workflow.
4. **Page-scoped sections** (`<body data-page="...">`) so merging 14 isolated
   style contexts into one file is collision-safe *by construction* — no
   cross-page leakage possible, no collision audit whack-a-mole.

## Architecture

### `src/site.css` — table of contents

```
/* 0. TABLE OF CONTENTS */
/* 1. FONTS — @font-face Satoshi (declared once, not per-page) */
/* 2. DESIGN TOKENS — colors, accent system, light/dark, chrome recipe */
/* 3. SHARED COMPONENTS — .skuo, .ui-*, .card, inputs, .ov-nav, .discord */
/* 4. ICONS — .fa-* mask-icon re-implementations */
/* 5+. PAGE SECTIONS — one per page, alphabetized, scoped [data-page="..."] */
```

- **Sections 1–4 are global.** Content of `design-tokens.css` moves verbatim;
  `@font-face` deduplicated to one declaration.
- **Page sections** are scoped: `[data-page="chat"] .header-island { ... }`.
  Each page's `<style>` content moves verbatim (declarations untouched; only
  selectors gain the scope prefix), preserving source order within the section
  so cascade behavior is unchanged.
- **Cascade order between page sections is irrelevant by construction** —
  scoped selectors can never match another page's elements.
- **New styles rule:** page-local goes in that page's section; shared by many
  pages graduates to §3.

### Page inventory → `data-page` values

| Page | data-page | Inline CSS lines | Notes |
|---|---|---|---|
| `index.html` | `home` | ~250 | keeps `output.css` |
| `design.html` | `design` | ~63 | keeps `output.css` |
| `design-lab.html` | `design-lab` | ~139 | dev scratch; migrated so it doesn't break |
| `Themes/Themes.html` | `themes` | 0 (uses `styles.css`) | `styles.css` absorbed; dead devicons link dropped |
| `word/index.html` | `word` | ~852 | |
| `search/index.html` | `search` | ~178 | |
| `AI/chat.html` | `chat` | ~3,453 | 4 style blocks; biggest risk |
| `AI/index.html` | `ai-home` | ~388 | |
| `AI/manage.html` | `manage` | ~40 | |
| `AI/editor.html` | `editor` | ~219 | |
| `AI/research.html` | `research` | ~118 | |
| `AI/tos.html` | `tos` | ~32 | |
| `AI/privacy.html` | `privacy` | ~32 | |
| `AI/goals.html` | `goals` | ~41 | |
| `AI/version.html` | `version` | ~70 | |
| `AI/debug_test.html` | — | 0 | no styles, no design-tokens link today; **unchanged** |
| `whitename.html` | `whitename` | 0 | links design-tokens only |

Each page: remove `<style>` block(s), remove `design-tokens.css`/`styles.css`
links, add `<link rel="stylesheet" href=".../src/site.css">` (depth-relative)
**after** `output.css` where present, add `data-page` to `<body>`.
Anti-FOUC theme scripts in `<head>` stay untouched.

### Deleted/absorbed files

- `src/design-tokens.css` → absorbed into §1–§3, file deleted.
- `src/styles.css` → absorbed into the Themes page section, file deleted.
- `AI/thing.css` → dead (nothing links it), deleted.
- devicons CDN link in `Themes.html` → unused, removed.

### Icon system

**Font Awesome → CSS mask icons in `site.css` §4.** The ~58 used `fa-*` class
names are re-implemented with identical names, so all ~123 HTML instances and
~9 JS-generated ones work with **zero markup changes**:

```css
.fa-solid.fa-xmark, .fa-xmark {
  display: inline-block; width: 1em; height: 1em; background: currentColor;
  -webkit-mask: url("data:image/svg+xml,...") center / contain no-repeat;
          mask: url("data:image/svg+xml,...") center / contain no-repeat;
}
```

`1em` sizing + `currentColor` preserves FA's existing contract (sizes with
`font-size`, colors with `color`). SVG path data from the official FA free set.
The FA CDN `<link>` is removed from all 11 pages. Brand glyphs (e.g. Discord)
are monochrome in FA's free font anyway, so mask rendering is equivalent.

**feather-icons → `src/feather-local.js`.** Feather's 39 used icons are
stroke-based line art; CSS masks would render them as solid blobs. A small
self-hosted script ships the official SVG source for those 39 icons and exposes
the same API chat already uses: `window.feather.replace()` and
`window.feather.icons.<name>.toSvg()`. All existing JS (`account-modal.js`,
etc.) works unchanged; only chat's CDN `<script>` tag is swapped for the local
file. (These 39 icons live in JS, not the stylesheet — masks can't represent
stroke art. Recoloring still flows through CSS `color`/`stroke` inheritance.)

**Inline SVGs (~17)** stay inline — already local and editable.

### Runtime/dynamic styles — the "don't break" list

- **Accent system:** chat's `#dynamic-accent-styles` block is rewritten by the
  accent picker at runtime — it **stays inline** (a live element is the
  mechanism). Everything it overrides consumes `var(--accent)` from `site.css`.
- **Theme toggle:** all `.dark` rules move into `site.css` alongside their
  light counterparts (page sections keep their own scoped `.dark` overrides).
- **JS-injected styles** (`canvas.js`, `chat-actions.js`): audited; static
  rules move into the chat section; genuinely dynamic injection stays.
- **`src/nav.js`** styling moves verbatim into §3; nav.js itself unchanged.

## Verification

1. Verbatim extraction: declarations are never rewritten, only selectors gain
   the scope prefix — minimal regression surface.
2. Selector-coverage audit: scripted check that every moved selector still
   matches the same elements on its page (and that global sections' selectors
   are unchanged).
3. Manual smoke pass: open every page in the inventory table, light and dark; check
   nav, buttons, badges, icons (present, correctly sized/colored), and chat
   thoroughly (sidebar, bubbles, thought blocks, book-flip animation, modals,
   accent picker).
4. `CLAUDE.md` updated: `src/site.css` is the single place to edit styles.

## Risks

- **`chat.html` is ~60% of the inline CSS** (3,453 of ~5,900 lines, 4 blocks,
  feather + FA + dynamic accent). It gets its own careful pass, last.
- **Specificity flip:** `[data-page="x"]` adds 0-1-0 specificity. If a page
  rule currently *loses* to a shared rule on purpose, scoping could flip it.
  Mitigation: shared sections stay global and early; audit the known override
  sites (documented in CLAUDE.md: element-attribute input specificity,
  page-level class overrides).
- **Missed dynamic selector:** a rule targeting JS-injected markup could be
  mis-scoped if the injected node lives outside `<body data-page>` (all page
  JS injects inside body, so scoping holds; the nav injects as first child of
  body and its styles are global §3 — unaffected).

## Out of scope (future)

- De-Tailwinding the site.
- Splitting `site.css` into partials + concat build (rejected: no build step).
- Reducing/consolidating the page-section CSS itself (dedupe of near-identical
  per-page rules) — possible later cleanup, explicitly not now.
