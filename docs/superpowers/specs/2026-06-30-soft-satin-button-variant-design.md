# Soft / satin button variant (`.skuo-soft`) — design

Date: 2026-06-30
Status: Approved (design)

## Problem

The `design.html` showcase demonstrates the site's skeuomorphic button system.
The user wants the **button style** seen on YouTube's video action bar — a soft
top-edge highlight that melts into a smooth, even gradient down the body — added
as a **reusable component**, not as a one-off on the showcase page.

The existing `.skuo` buttons already use a light-top → dark-bottom gradient, but
their sheen is a pronounced "wet-glass" blob (`::before` at 46% height, white at
0.55 opacity). YouTube's pills read flatter and calmer: a thin, soft top
highlight over a smooth satin gradient — glossy replaced by matte.

## Goal

Add one new **reusable, accent-tinted** modifier to the shared skuo button family
in `src/design-tokens.css`, then demonstrate it on `design.html`.

## Non-goals (YAGNI)

- No like/dislike grouping, vertical divider segment, or count badge — only the
  button *surface style* was requested.
- No literal dark-charcoal neutral. The variant stays **accent-tinted** so it
  belongs in the existing design language ("hierarchy by intensity, not hue").
- No changes to the existing `.skuo` / `.skuomorphic-btn` / `.skuomorphic-button`
  default look — `.skuo-soft` is purely additive.

## Design

### New class: `.skuo-soft`

A **surface-treatment modifier**, not a standalone button. It is applied
alongside the base class and composes with the existing modifiers:

```html
<button class="skuo skuo-soft skuo-pill">Share</button>
<button class="skuo skuo-soft skuo-accent skuo-pill">Subscribe</button>
<button class="skuo skuo-soft skuo-icon">⋯</button>
```

It reuses the existing `--skuo-surface` recipe (so it inherits accent tint, theme
awareness, and the `--chrome-*` machinery) and overrides only the three things
that make YouTube's pills read as satin instead of glossy:

1. **Sheen (`::before`)** — thinner and softer: reduce height (~46% → ~38%) and
   drop the top white stop (~0.55 → ~0.32 in light, ~0.20 → ~0.12 in dark) with a
   gentler falloff, so it reads as a delicate top-edge highlight rather than a
   glossy blob.
2. **Fill** — a smoother, lower-contrast top→bottom gradient (less white at the
   top, less black at the bottom than `--chrome-fill`), giving an even satin
   wash. Provide matching `:hover` fill.
3. **Shadow** — a slightly softer lift so the button reads matte, not raised
   glass. Keep the accent glow.

All overrides are expressed against the same `--skuo-surface` custom property, so
the variant automatically tracks accent and dark mode with no extra dark-mode
rules beyond a softened `::before` opacity (mirroring how `.dark .skuo::before`
is already handled).

### Composition guarantees

- `.skuo-soft` + `.skuo-accent` → satin treatment over the deep accent surface,
  white text (accent border/contrast inherited unchanged).
- `.skuo-soft` + `.skuo-neutral` (or bare `.skuo`) → satin over the pale-accent
  neutral surface, dark text.
- `.skuo-soft` + `.skuo-pill` → fully rounded, matching YouTube's pills.
- `.skuo-soft` + `.skuo-icon` → compact satin icon button.
- Hover / active / focus-visible / disabled states inherit from `.skuo`; only the
  hover *fill* is re-pointed at the soft gradient.

### Placement in `src/design-tokens.css`

Add the `.skuo-soft` rules in the skuo section, after `.skuo-neutral` and before
`.skuo-icon`, plus a `.dark .skuo-soft::before` opacity tweak in the dark-mode
block. No changes to existing rules.

## Showcase (`design.html`)

Add one new `<section class="dsc">` card titled **"Soft / Satin Buttons"** that
arranges the variant like the YouTube action bar: a row of pills
(neutral "Share", neutral "Save", neutral "Download") plus an accent pill and a
soft icon button, all using `skuo skuo-soft …`. This makes the surface style
immediately legible next to the existing "Buttons" card for comparison.

## Documentation

Update `CLAUDE.md`'s button section to note `.skuo-soft` as a satin/soft surface
modifier in the skuo family (accent-tinted, composes with existing modifiers).

## Verification

- Open `design.html` in light and dark mode; confirm the soft card renders a thin
  top highlight + smooth gradient, distinct from the glossier default buttons.
- Toggle the theme button; confirm accent tint and dark-mode inversion both apply.
- Confirm existing buttons elsewhere are visually unchanged (purely additive CSS).
```

## Files touched

- `src/design-tokens.css` — add `.skuo-soft` rules + dark-mode `::before` tweak.
- `design.html` — add the "Soft / Satin Buttons" showcase card.
- `CLAUDE.md` — document the new modifier.
