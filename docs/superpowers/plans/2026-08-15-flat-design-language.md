# Flat Design Language — Plan

**Date:** 2026-08-15
**Spec:** `docs/superpowers/specs/2026-08-15-flat-design-language-design.md`
**Status:** Phase 0 only, until the design sheet is approved

## Phase 0 — Design sheet (review artifact)

Repurpose `design-lab.html` into the single flat design sheet:

1. Replace the `[data-page="design-lab"]` section of `src/site.css`
   (~lines 5138–5281) with:
   - the lab frame styles (kept: `.lab-frame/.lab-top/.lab-title/.lab-sub/
     .lab-grid/.lab-col/.note/.stack/.row/.icn/.swatches`),
   - a **flat override block** = the exact CSS from the spec's "flat recipe"
     + consumer changes, scoped under `[data-page="design-lab"]` (and
     `.dark [data-page="design-lab"]` mirrors),
   - styles for two mock extras: `.mock-nav` (an `.ov-nav__bar` lookalike)
     and `.mock-drop` (a dropdown showing `--shadow-float`).
2. Rewrite `design-lab.html` as one sheet using the **real shared classes**:
   buttons (accent/neutral/pill/icon/disabled), badges, segmented,
   checkbox/radio, text input + textarea, card, mock nav, mock dropdown.
   Keep the `vail_theme` dark toggle script. Title: "Flat Design Sheet".
3. No other files touched. Tailwind rebuild not needed (no utilities used).

**Verify:** open `design-lab.html`, toggle dark, hover/press/type/focus-tab
through every control → no gradients, no lift, no glow, crisp focus rings.

## Phase 1 — Core recipe swap (`src/site.css` §2–§3)

1. §2 light/dark token blocks: retire `--skuo-glow` to `transparent`, add
   `--shadow-float` to `:root` and `.dark`.
2. Replace the two per-element recipe blocks (light + dark) with the flat
   values from the spec (fills as colors; shadows `none`; add
   `--chrome-fill-active`).
3. §3 consumers: switch `background-image: var(--chrome-fill)` →
   `background-color:`; hover/active per spec; remove `.skuo:hover` lift +
   `filter`; press = `scale(0.97)`; delete the vestigial `::before` block;
   flatten `.ui-badge`, `.ui-opt`, `.ui-seg button.on`, `.card`, inputs.
4. `.ov-nav__bar`: solid surface + border + `--shadow-float`, drop
   `backdrop-filter`.

**Verify:** `design.html` renders the new system; spot-check chat + landing.

## Phase 2 — Page-section & inline audit

1. Grep `src/site.css` page sections and inline `<style>` blocks for
   `box-shadow`, `linear-gradient` (on control surfaces), `inset 0 1px`,
   `backdrop-filter`, `translateY(-1px)`.
2. Flatten per spec: floating layers → `var(--shadow-float)`; resting panels
   → border-defined; remove panel blurs; keep decorative color effects
   (chat conic input border, Astra conic panel/wordmark, book-flip, stars).
3. Update the `.chat-capsule` recipe copy in `AI/chat.html` and the
   `.header-island` copies in `AI/editor.html`, `AI/manage.html`,
   `AI/version.html`.
4. `design.html`: update copy describing the surface language.

## Phase 3 — Sync & docs

1. `okemollm/index.html` is a byte-identical copy of `web/index.html` —
   re-sync if the landing markup changed (it shouldn't in this rollout).
2. Update `CLAUDE.md`: replace the "Skeuomorphic glossy buttons / Soft
   gradient / Refined surface" sections with the flat language description;
   note the design sheet at `design-lab.html`.
3. Final sweep: light + dark, hover/press/focus on chat, landing, design,
   search, word, editor, Themes.
