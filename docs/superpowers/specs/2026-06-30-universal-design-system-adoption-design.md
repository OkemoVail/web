# Universal Design System Adoption — Design

**Date:** 2026-06-30
**Status:** Approved (pending spec review)

## Problem

`src/design-tokens.css` is linked by every page and `design.html` showcases the
shared component library (`.skuo*` buttons, element-level inputs, `.card`,
`.ui-*` badges/tabs/etc.). But most pages still define their *own* button
classes (`.g-cta`, `.btn-*`, `.toolbar-btn`, `.hdr-btn`, `.btn-primary`,
`.sb-new-chat-btn`, `.tb-btn`, `.control-btn`, `.Cadance-tab-btn`, …) whose
appearance is hand-written (or re-derived via per-page "glossy override" recipe
blocks) in each page's inline `<style>`. Inputs/cards are partly unified, partly
duplicated.

Result: changing a control's look is NOT a single-file edit — it requires
touching each page's inline CSS. The goal is to make `src/design-tokens.css` the
single source of truth for the appearance of every button, input, card, and
badge/tab/misc control on every page.

## Goal

Every interactive control on every page renders using the shared classes from
`design.html` / `src/design-tokens.css`. Editing that one file restyles every
control — appearance AND structure — site-wide. Page inline `<style>` blocks
retain only *layout* (sizing, grid/flex placement, page-specific spacing), never
control appearance.

## Non-Goals

- No visual redesign. The shared classes already define the intended look; this
  is an adoption/consolidation pass, not a restyle.
- No build-system changes (Tailwind CDN vs `output.css` left as-is).
- No extraction of the 3353-line `AI/chat.html` inline CSS into separate files
  beyond removing the now-redundant button/input/card appearance rules.
- No refactoring unrelated to control appearance.

## Core Principle: Separate Appearance from Layout

For each page-local control class:

1. **Markup:** apply the correct shared class(es) to the element.
2. **CSS:** remove only the *appearance* declarations (background / background-image /
   gradient, border, box-shadow, color on the base + `:hover` + `:active`,
   border-radius where the shared class sets it) from the page's inline `<style>`.
   Keep layout declarations (width, height, display, flex/grid, margin, page-specific
   padding, position).
3. **Class name:** **remove the page-local class entirely where the shared class
   covers everything.** Keep the page-local name only when it still carries layout
   that has nowhere else to live; in that case it becomes a layout-only class.
4. **Recipe blocks:** delete the per-page "glossy override" blocks (the appended
   `--chrome-*`-consuming overrides on chat, landing, editor, version, word) — they
   become redundant once the element uses `.skuo` directly.

## Class Mapping Reference

| Page-local intent | Shared replacement |
|---|---|
| Primary/CTA button (filled, white text) | `skuo skuo-accent` (+ `skuo-pill` if rounded) |
| Secondary/neutral button | `skuo skuo-neutral` or `skuo` |
| Icon-only button | `skuo skuo-icon` |
| Satin/matte button | add `skuo-soft` |
| Text/ghost link-button | leave as-is if not a skuo surface, else `skuo skuo-neutral` |
| Tab / pill toggle group | `ui-seg` (with `.on` on active) |
| Badge / tag / chip | `ui-badge` (+ `--accent` / `--tiny`) |
| Breadcrumb | `ui-crumb` |
| Collapsible `<details>` | `ui-accordion` |
| Avatar/list row | `ui-cell` |
| Card/panel surface | `card` (+ `card-pad` for internal padding) |
| Text input / textarea / select | no class needed — styled globally by element selector; remove page-local appearance overrides |

## Per-Surface Plan

### Buttons
Map every `<button>` / button-like `<a>` to the `.skuo` family per the table.
Remove page-local button appearance CSS and recipe override blocks. Affected
page-local classes include: `g-cta`, `btn-ink`, `btn-line`, `g-icon` (index);
`toolbar-btn`, `control-btn` (editor); `hdr-btn`, `tb-btn` (word);
`btn-primary`, `btn-*` (version); `sb-new-chat-btn`, `Cadance-tab-btn`,
`mem-consent-*`, `skuomorphic-btn` (chat); plus any button classes on
`AI/index.html`, `goals`, `manage`, `privacy`, `research`, `tos`.

### Inputs & Selects
Bare `input[type=...] / textarea / select` are already styled at element-attribute
specificity in `design-tokens.css`. For each page: remove inline `<style>` rules
that override input/textarea/select **appearance** (background, border, ring,
shadow). Keep layout-only rules. No `!important`. Confirm chat input bar, word
`#doc-title`/`#ai-input`, and editor inputs inherit the shared look.

### Cards & Containers
Add `.card` (+ `.card-pad` where internal padding is wanted) to card/panel
containers. Strip duplicated card appearance (background, border, radius, shadow,
dark-mode variants) from page CSS, keeping layout.

### Badges / Tabs / Misc `ui-*`
Swap page-local equivalents to `.ui-badge`, `.ui-seg`, `.ui-crumb`,
`.ui-accordion`, `.ui-cell` wherever a page has a matching component.

### Gap Fix
Add `<link rel="stylesheet" href="../src/design-tokens.css">` to
`AI/debug_test.html` (currently the only page not linking it).

## Rollout Order (each page independent; verify after each)

Simplest → hardest:

1. `AI/debug_test.html` (add link)
2. `AI/goals.html`
3. `AI/manage.html`
4. `AI/privacy.html`
5. `AI/tos.html`
6. `AI/research.html`
7. `AI/version.html`
8. `AI/editor.html`
9. `index.html`
10. `word/index.html`
11. `AI/index.html`
12. `AI/chat.html` (largest inline CSS — last)

`whitename.html` (no buttons) and `design.html` (already canonical) need no change
beyond a final consistency check.

## Verification

After each page's swap, open it in a browser in **both light and dark mode** and
confirm:
- Buttons render with the shared gradient/shadow/hover/press, correct accent vs
  neutral hierarchy, and correct layout (no overflow/misalignment).
- Inputs/selects show the recessed parchment look + accent focus ring.
- Cards/badges/tabs match the `design.html` reference.
- No control reverted to an unstyled/native appearance (would indicate a removed
  rule with no shared replacement).

A regression to native/unstyled control = a missing shared class on that element;
fix before moving to the next page.

## Acceptance Criteria

- Every page links `src/design-tokens.css`.
- No page's inline `<style>` defines button/input/card/badge **appearance**; only
  layout remains.
- All per-page "glossy override" recipe blocks removed.
- Changing a value in `src/design-tokens.css` (e.g. `--chrome-fill`, an accent
  token, a `.skuo` rule) visibly changes the corresponding control on every page.
- All pages verified in light + dark mode.

## Risks & Mitigations

- **Layout regressions** when stripping CSS: mitigated by removing *only*
  appearance declarations and keeping layout; verify each page in-browser.
- **Specificity conflicts** (page rule still overriding shared class): resolved by
  deleting the page rule rather than adding `!important`.
- **chat.html scale** (3353 lines): handled last, in isolation, button-by-button.

## Documentation

Update `CLAUDE.md` after completion: note that page-local button classes were
removed in favor of direct `.skuo` usage, and that inline `<style>` blocks are now
layout-only for controls.
