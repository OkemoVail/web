# Flat Design Language — Design

**Date:** 2026-08-15
**Status:** Shipped 2026-08-19 (design sheet approved; Phases 1–3 executed)

## Problem

The site's "refined" surface (spec 2026-06-30, revised 2026-07-01) is a
semi-3D language: every control carries a whisper top→bottom gradient, a
hairline `inset 0 1px 0 white` top highlight, a soft multi-layer lift shadow,
and — on accent surfaces — a colored glow. Hover *lifts* (`translateY(-1px)`)
and press *insets*. Inputs are recessed with an inner shadow; cards are raised
with inset highlights and drop shadows; the nav capsule is translucent glass
with blur. We are replacing this with a **flat** language.

## Goals

- **Solid fills, 1px borders, zero depth on resting surfaces.** No gradients
  on controls, no inset highlights, no lift shadows, no accent glows.
- **Hierarchy by color, not depth.** Primary/selected = solid accent fill;
  neutral = grey surface step + border. This preserves the existing rule
  "important things accent, everything else grey".
- **One functional depth budget.** A single soft shadow token,
  `--shadow-float`, is reserved *exclusively* for layers that physically float
  above the page: the nav capsule, modals, dropdowns, popovers, toasts. It is
  never used on resting controls (buttons, badges, cards, inputs, segmented,
  checkboxes).
- **Motion stays; lifting goes.** Hover = color/border shift only (no
  translate). Press = fill deepens + `scale(0.97)` on `var(--ease-soft)` — the
  tactile press survives because it's motion language, not a 3D surface cue.
- **Dark-mode parity** via the existing token system; every rule has a
  `.dark` counterpart where today's rules have one.

## Non-goals

- Decorative **color** effects are not depth and stay: the chat input bar's
  animated conic border, Astra's rainbow-conic AI panel + gradient wordmark,
  star fields, the book page-flip generation indicator, the AI-landing 3D
  storybook (an illustration, not UI chrome), text gradients.
- The motion system (tokens, send-morph, view transitions, reveals) is
  untouched except where a transition references a removed property.
- Accent palette, fonts, radii, spacing, layout — all unchanged.
- Tailwind (CDN or compiled) untouched.

## The flat recipe (replaces `--chrome-*` values, keeps the names)

The per-element `--chrome-*` wiring pattern is kept **exactly** (declared on
the consumer elements, never `:root` — see the 2026-07-01 frozen-inheritance
bug in CLAUDE.md). Only the values change, plus fills become *colors* instead
of gradients, so consumers switch from `background-image` to
`background-color`.

Light mode:

```
--chrome-border:      color-mix(in srgb, var(--skuo-surface, #eceae2), black 14%);
--chrome-fill:        var(--skuo-surface, #eceae2);                                  /* solid */
--chrome-fill-hover:  color-mix(in srgb, var(--skuo-surface, #eceae2), black 5%);    /* darken */
--chrome-fill-active: color-mix(in srgb, var(--skuo-surface, #eceae2), black 10%);
--chrome-shadow:        none;
--chrome-shadow-hover:  none;
--chrome-shadow-active: none;
```

Dark mode (`--chrome-fill-hover`/`active` **lighten** with `white 8%` /
`white 13%`; border `rgba(0,0,0,0.5)` as today).

`--skuo-glow` is retired: `.skuo-accent` sets it `transparent` like everyone
else; the token stays declared (transparent) so stray consumers don't break.

New token (on `:root` / `.dark`, since it embeds no per-element vars):

```
--shadow-float: 0 12px 32px -12px rgba(0, 0, 0, 0.28);   /* light */
--shadow-float: 0 12px 32px -12px rgba(0, 0, 0, 0.6);    /* .dark */
```

### Consumer changes (§3)

- **`.skuo` / `.skuomorphic-btn` / `.skuomorphic-button`** —
  `background-color: var(--chrome-fill)` (was `background-image`);
  `border: 1px solid var(--chrome-border)` (unchanged); `box-shadow: none`.
  Hover: `background-color: var(--chrome-fill-hover)`, **no transform, no
  filter**. Active: `background-color: var(--chrome-fill-active)` +
  `transform: scale(0.97)` (was translateY + inset shadow). Focus-visible:
  crisp flat ring `0 0 0 3px color-mix(in srgb, var(--skuo-accent),
  transparent 55%)` (kept — it's an a11y indicator, not depth). Disabled:
  `opacity 0.55`, no shadow. The vestigial `::before` sheen pseudo-element is
  deleted outright.
- **`.skuo-icon`** — same flattening; hover no longer translates.
- **`.discord`** — already solid; keep.
- **`.ui-badge` / `--accent` / `--tiny`** — bordered chips:
  `background-color: var(--chrome-fill)`, `box-shadow: none`.
- **`.ui-opt input`** (checkbox/radio) — unchecked: neutral solid + border,
  no shadow; checked: solid accent + white SVG check / radial dot (unchanged
  glyphs); focus ring kept.
- **`.ui-seg button.on`** — solid accent fill, white text, **no** inset
  highlight / shadow.
- **Inputs** (`input[type=…]`, `textarea`, `select`) — background becomes
  `var(--bg-white)` (white fields on parchment light; `--bg-white` =
  `--bg-elevated` in dark so dark is unchanged); **inset recessed shadow
  removed**; border `--border-strong`; focus = accent border + flat ring
  `0 0 0 3px color-mix(in srgb, var(--skuo-accent), transparent 78%)`.
- **`.card`** — `background: var(--bg-white)` (dark: `--bg-elevated`),
  `border: 1px solid var(--border)` (dark `--border-strong`), radius 14px,
  **no shadow, no inset highlight**.
- **`.ov-nav__bar`** (and its clones) — solid surface `var(--bg-white)`
  (dark `--bg-elevated`), 1px `--border-strong`, `box-shadow:
  var(--shadow-float)`, **backdrop-filter removed**. Its clones must be
  updated in the same pass: `.chat-capsule` (inline in `AI/chat.html`),
  `.header-island` (editor / manage / version inline copies).

### Page-section audit (§5+ and inline `<style>` blocks)

After the §2/§3 swap, grep-audit every page section for now-orphaned depth
cues and flatten: `box-shadow` (drop/inset), `linear-gradient` on control
surfaces, `translateY(-1px)` hover lifts on rows/cards (e.g. chat
`.history-btn-container` hover keeps `scale(1.015)` but drops the lift).
Surfaces that *float* (modals, menus, dropdowns, the settings panel) adopt
`var(--shadow-float)`; resting panels (`.Cadance-card`, `.mem-consent-card`,
sidebar) become border-defined flat. Backdrop blurs on **panels** are removed;
the chat modal scrim keeps its dim (opacity is not depth).

## The design sheet (review artifact)

`design-lab.html` is repurposed as **the** flat design sheet — a single
language, not a bake-off. It renders the *real* shared classes (`.skuo`,
`.skuo-accent`, `.ui-badge`, `.ui-opt`, `.ui-seg`, bare inputs, `.card`, a
mock `.ov-nav__bar`, a mock dropdown for `--shadow-float`) under a page-local
override block in the `[data-page="design-lab"]` section of `site.css` that
contains **exactly** the CSS the rollout will move into §2/§3 — so the sheet
is a live preview of the finished system, in light and dark, and doubles as
the copy-paste source for phase 1 of the plan. The old `.flat`/`.neu`/`.ref`
comparison columns are deleted.

## Invariants (do not break)

- `--chrome-*` recipe stays on the consumer-element selector list, never
  `:root`. Add new consumers to that list, including its `.dark` copy.
- No `!important` on the global input rules.
- `:focus-visible` rings survive on every interactive control (WCAG).
- Motion keeps consuming `--ease-*` / `--dur-*` tokens; `prefers-reduced-motion`
  + `navigator.webdriver` guards unchanged.
- `whitename.html` has no buttons; Astra (`search/index.html`) has no nav.js
  and its own parchment tokens — its controls follow via the shared file,
  page-local conic/gradient *color* effects stay.
- `design.html` showcase is updated in the same rollout (it renders the
  shared classes, so mostly it Just Works; the copy that describes the
  surface as "refined/skeuomorphic" must be rewritten).
- CLAUDE.md design sections are updated to describe the flat language.
