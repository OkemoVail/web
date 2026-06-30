# Unified Design System + Showcase Page — Design

**Date:** 2026-06-30
**Status:** Approved (pending spec review)

## Summary

Extend the site's shared design system beyond buttons to cover **inputs** and
**cards**, and build a polished, public-facing **showcase page** (`design.html`)
that displays the full unified system in one place. All style work lands in the
existing shared stylesheet `src/design-tokens.css` (already linked by all 14
pages). No new CSS file, no bundler/build change.

This builds on the existing skeuomorphic glossy **button** system (already unified
in `design-tokens.css`). See `2026-06-30-skeuomorphic-buttons-design.md`.

## Goals

1. Inputs/textareas across the site share one unified parchment/recessed look.
2. A single `.card` class gives any panel/box a unified skeuomorphic surface.
3. A public `design.html` showcases buttons, inputs, cards, and color tokens —
   rendered live from `design-tokens.css` so it stays truthful.
4. The showcase is reachable from the site nav.

## Non-Goals (YAGNI)

- No tables, tooltips, modals, toggles, scrollbar restyling, or code-block theming
  (explicitly out of scope — minimal element set only).
- No refactor of unrelated page-specific designs.
- No new build step or CSS file.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Overall goal | Extend unification across pages **and** build a showcase page |
| Element scope | Minimal: **inputs + cards** on top of existing buttons |
| Showcase audience | **Public-facing**, polished, linked from site nav |
| Input unification mechanism | **Global** element styling (not opt-in classes) |
| Card hook | A single **`.card` class** convention (global styling anchored on it) |

## Architecture

All additions go into `src/design-tokens.css`:

1. **Global input/textarea styling** — low-specificity element selectors so bare
   inputs across the site pick up the unified look automatically, while any page
   with its own input styling (chat, word, editor) overrides without effort.
2. **`.card` class** — global skeuomorphic raised surface, dark-mode aware.

Plus one new page, `design.html`, at repo root.

### 1. Inputs / textareas (global, low specificity)

Target only text-like form controls — never buttons, checkboxes, radios, or ranges:

```
input[type="text"], input[type="email"], input[type="search"],
input[type="password"], input[type="number"], input[type="url"],
input[type="tel"], textarea, select
```

Styling:
- Fill: `var(--bg-elevated)`
- Border: `1px solid var(--border-strong)`
- Recessed feel: soft `inset` shadow (skeuomorphic, pressed-in)
- Radius: `10px`
- Color: `var(--text-primary)`; placeholder `var(--text-tertiary)`
- Focus: accent ring via `var(--skuo-accent)` (border + subtle glow)
- Dark mode: inherits from token swap under `.dark` (no extra rules needed
  unless a value reads poorly — adjust inline if so)

**Specificity rule:** keep these at single element-attribute selector specificity
(`input[type="text"]`). Any page rule using a class or id (chat input bar, word
`#doc-title` / `#ai-input`, editor inputs) automatically wins. This is the
mitigation for the "global could clobber" risk the user accepted.

### 2. Cards (`.card`)

A raised skeuomorphic surface anchored on a single class:
- Fill: `var(--bg-white)` (light) / elevated dark surface under `.dark`
- Border: `1px solid var(--border)`
- Top highlight: `inset 0 1px 0 rgba(255,255,255,0.7)`
- Drop shadow: soft, e.g. `0 1px 2px` + `0 8px 24px -12px rgba(0,0,0,0.25)`
- Radius: `14px`
- Optional `.card-pad` modifier: adds internal padding (~1.25rem) so `.card` is
  composable with existing layouts that already manage their own padding.

### 3. Showcase page (`design.html`)

Public page at repo root. Links `src/design-tokens.css`. Structure:

- Parchment background; near-black in dark mode (shared tokens).
- The floating liquid-glass nav copied from `index.html`, with a **Design** link.
- A dark-mode toggle (reads/writes `vail_theme`, toggles `.dark` on `<html>` —
  match the existing pattern used by other pages).
- Sections:
  1. **Buttons** — every variant: `.skuo`, `.skuo.skuo-accent`, `.skuo-neutral`,
     `.skuo-icon`, `.skuo-pill`; show normal/hover/active where practical.
  2. **Inputs** — text input, textarea, select, focus state, disabled.
  3. **Cards** — two or three `.card` / `.card.card-pad` examples.
  4. **Color tokens** — swatches for accent (`--accent`/`--accent-light`) and
     surfaces (`--bg`, `--bg-elevated`, `--bg-white`, `--border`, etc.).

Everything renders live from `design-tokens.css` — no hardcoded duplicate styles —
so the page stays an accurate mirror of the system.

### 4. Nav link

Add `Design → /design.html` to `index.html`:
- desktop floating nav (`.nav-wrap`)
- mobile menu (`.mobile-link`)
- footer link list

Use the existing link classes so it matches surrounding items.

## Error / Risk Handling

- **Global input regression:** the chosen global approach can affect inputs on
  pages with their own styles. Mitigation: element-selector specificity (above)
  lets page rules win. Verification: spot-check chat, word, and editor inputs
  render unchanged; if any regress, fix with a one-line page-level override — no
  design change required.
- **Cards on pages not yet using `.card`:** `.card` is opt-in by class name, so
  no page changes appearance until `.card` is added. Zero blast radius.

## Testing / Verification

1. Open `design.html` — buttons, inputs, cards, tokens all render; light/dark
   toggle works.
2. Open `index.html` — new Design nav link present in desktop, mobile, footer.
3. Spot-check `AI/chat.html`, `word/index.html`, `AI/editor.html` — inputs look
   unchanged (page styles still win).
4. Toggle dark mode on `design.html` and one content page — surfaces/inputs/cards
   adapt correctly.

## Files Touched

- `src/design-tokens.css` — add input/textarea rules + `.card` / `.card-pad`.
- `design.html` — new showcase page.
- `index.html` — add Design nav link (3 places).
- `CLAUDE.md` — document inputs/cards additions + showcase page under the
  design-system section.
