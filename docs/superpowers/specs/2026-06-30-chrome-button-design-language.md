# Chrome (Chromify) Button Design Language — Design Spec

**Date:** 2026-06-30
**Status:** Approved, pending implementation plan
**Scope:** Site-wide button restyle in `src/design-tokens.css` + per-page override blocks + showcase

## Goal

Restyle every button on the site into a unified **"Chrome" / Chromify** design language:
glossy metallic surfaces with strong light play, a soft beveled bottom lip, and a subtle
blurred glow beneath — driven by **our accent color** rather than neutral silver.

Reference look (user-provided Chromify UI): vertical metallic gradient, bright top
highlight, glassy bottom rim, soft drop shadow, and a faint colored halo under the main CTA.

## Decisions (locked)

- **Everything is accent-tinted chrome (Option A).** The whole site reads as one
  accent-metal family. Neutral and primary buttons both carry the accent tint; they
  differ by **intensity**, not hue, to preserve hierarchy.
- **Rewrite the shared formula in place.** No parallel `.chrome` class family. The
  existing shared selectors stay the single entry point; all 14 pages inherit.

## Existing architecture (unchanged)

All buttons funnel through three shared selectors in `src/design-tokens.css`:
`.skuo`, `.skuomorphic-btn`, `.skuomorphic-button`, plus modifiers `.skuo-accent`,
`.skuo-neutral`, `.skuo-icon`, `.skuo-pill`. A small number of pages append their own
glossy override blocks (source-order wins): chat (`AI/chat.html`, ~L3304 + settings
tabs), landing (`index.html`, ~L415), editor (`AI/editor.html`), version
(`AI/version.html`), word (`word/index.html`). The accent resolves via `--skuo-accent`
(`--accent-color` → `--accent` → rosewood fallback).

14 pages link the shared file: AI/chat, AI/editor, AI/goals, AI/index, AI/manage,
AI/privacy, AI/research, AI/tos, AI/version, design, index, Themes/Themes,
whitename (no buttons), word/index.

## The chrome formula

Translate the reference's "light + blur" to accent tint. Applied to the shared `.skuo*`
base:

1. **Metallic gradient (chrome double-light).** Multi-stop vertical gradient:
   bright highlight band at top → mid accent-metal (`--skuo-surface`) → a subtly darker
   accent band near the bottom → a brighter bottom **lip**. Surface stays pale/metallic
   (accent mixed heavily with white), never a flat color block.
2. **Inset highlights.** Keep `inset 0 1px 0` top highlight **and** add a faint
   `inset 0 -1px 0` bottom-lip highlight (the glassy rim seen on "Generate"), paired with
   the existing inner bottom shadow above it.
3. **Accent glow ("a bit of blur").** A soft, blurred accent-colored halo beneath each
   button. Implemented via a new `::after` pseudo-element (or an extra colored
   `box-shadow` layer) using `--skuo-accent` at low alpha; it **intensifies on hover** and
   fades on active. This is the visible "blur" in the reference.
4. **Light-play sheen.** Keep the existing `::before` wet-glass reflection over the top
   half (the `z-index:-1` sheen). No change to its mechanic.
5. **Interaction.** Hover: lift (`translateY(-1px)`) + brighten + larger glow. Active:
   sink (`translateY(1px)`) into a recessed read with reduced glow. Focus-visible: accent
   ring (existing behavior, retuned to match). Disabled: flat, no glow.

### Tint hierarchy (intensity, not hue)

- **Neutral** (`.skuo` / `.skuomorphic-btn` default): pale accent-metal — accent mixed
  with white (~80% white), **dark text** (`--text-primary`).
- **Primary** (`.skuo-accent`): deeper, more saturated accent chrome, **white text**
  (`--accent-contrast`).
- **`.skuo-neutral`:** explicit pale-accent neutral (overrides accent if both present).
- **`.skuo-icon`:** compact chip — scaled-down gloss + smaller glow.
- **`.skuo-pill`:** `border-radius: 9999px` on button + pseudo-elements.

### Dark mode

Same formula with a **dark accent-metal surface** (deep accent mixed with charcoal),
lighter inset top highlight, dimmer-but-present glow. Mirrors the existing `.dark .skuo*`
block structure.

## Files to change

1. **`src/design-tokens.css`** — rewrite the `.skuo*` base block (gradient, box-shadow,
   new `::after` glow), the `::before` sheen if needed, hover/active/focus/disabled, the
   variant modifiers, and the `.dark .skuo*` block. Neutral default `--skuo-surface`
   becomes a pale accent-metal mix.
2. **Per-page override blocks** — refresh so they match the new chrome rather than the old
   gloss: `AI/chat.html` (chat-specific buttons + settings tabs), `index.html` (landing
   CTAs/icons), `AI/editor.html`, `AI/version.html`, `word/index.html`. Goal: visual
   parity with the shared formula; do not reintroduce the old flat gloss.
3. **`design.html`** — verify the showcase renders the new chrome live; adjust any
   swatch/label copy describing the button system.
4. **`CLAUDE.md`** — update the "Skeuomorphic glossy buttons" section to document the
   chrome language (accent-tinted, glow `::after`, tint-by-intensity hierarchy).

## Constraints

- **No `!important`** on the shared input/card rules (per existing house rule); not needed
  for buttons either.
- Preserve the existing class contract — no renames. `.skuomorphic-button` stays NOT
  auto-aliased to accent (pages use it as a neutral pill); it becomes neutral accent-chrome.
- Keep accent resolution via `--skuo-accent` so per-page accents (chat accent, token-page
  accent, rosewood fallback) all flow through unchanged.
- Text contrast: neutral buttons keep dark text on pale surface; primary keeps white text
  on deep accent. Verify legibility for both light and dark accents.

## Out of scope

- Toggles / segmented controls / recessed "track" components (`.ui-seg`) — the second
  reference's recessed pill track is noted but **not** part of this change; buttons only.
- Inputs and cards — unchanged.
- No new button classes; no per-page button markup changes beyond CSS.

## Success criteria

- Every button across all 14 pages reads as accent-tinted chrome with visible light play
  and a soft glow, in both light and dark mode.
- Primary vs neutral hierarchy remains legible (intensity difference).
- No page-level button regresses to the old flat gloss; `design.html` showcase reflects
  the new look.
