# Skeuomorphic Buttons — Design Spec

**Date:** 2026-06-30
**Topic:** Site-wide bold/glossy skeuomorphic button restyle

## Goal

Restyle buttons across **all 14 HTML pages** to a bold, glossy *skeuomorphic* look:
a **top highlight** (wet-glass sheen + bevel line) and an **inner vertical gradient**,
driven by the site's **accent color**. Both light and dark themes.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Scope | **Every page** (all 14 HTML files) |
| Intensity | **Bold / glossy** (classic Aqua / Web-2.0 gloss, not subtle) |
| Color | **Follow accent color** for primary buttons; neutral surfaces for secondary |
| Icon buttons | **Glossy too** — gloss scales with button size so 28–34px buttons read as glossy chips, not bubbles |
| Rollout | **All pages**, prominent + icon buttons |

## Architecture

All 14 pages link the single shared stylesheet **`src/design-tokens.css`**. That file
already (a) defines the accent tokens (`--accent` / `--accent-light`, dark-swapped under
`.dark`) and (b) owns a global `:active` press gradient that resolves the accent chain
`--accent-color (chat app) → --accent (token pages) → #c96478 (fallback)`.

**Therefore the entire glossy system is authored once in `src/design-tokens.css`.** No
per-page CSS duplication. Pages opt in by class. The two button classes that already exist
get upgraded in-place so their buttons transform with **zero markup change**:

- `.skuomorphic-btn` — used throughout `AI/chat.html` (send button, settings, personality, memory, theme/lang pickers)
- `.skuomorphic-button` — used on `AI/index.html` (landing CTAs, Discord button)

Approach **A (shared glossy class system)** was chosen over a blanket `button {}` override
(B, breaks transparent icon buttons) and per-page bespoke styling (C, duplication/drift).

## The glossy anatomy

Each glossy button stacks four layers, all accent-aware:

1. **Inner vertical gradient (fill)** — `linear-gradient(180deg, lighten(base,16%), base, darken(base,12%))` via `color-mix`.
2. **Top highlight** — a `::before` pseudo-element gloss over the top ~50% (wet-glass reflection), **plus** a crisp bevel line `inset 0 1px 0 rgba(255,255,255,.5)`.
3. **Bevel + lift shadow** — `inset 0 -1px 1px rgba(0,0,0,.18)` bottom inner shadow + outer drop shadow `0 1px 2px rgba(0,0,0,.18), 0 4px 10px -3px rgba(0,0,0,.25)` so the button sits above the surface.
4. **Border** — `1px solid darken(base, ~18%)` for a defined glossy edge.

### States

- **Hover** — `translateY(-1px)`, brighter top gloss, deeper drop shadow.
- **Active/press** — `translateY(1px)`, gloss dims, inner shadow deepens; the existing global `:active` accent gradient still layers on top (unchanged).
- **Disabled** — gloss + lift removed, reduced opacity, no pointer.
- **Focus-visible** — accent focus ring (`box-shadow` outline) for accessibility; gloss preserved.

## Variants (class API)

Authored in `src/design-tokens.css`:

| Class | Meaning | Gradient base |
|---|---|---|
| `.skuo` | Base glossy mixin (neutral) | adaptive surface (light: near-white → grey; dark: elevated greys) |
| `.skuo.skuo-accent` | Primary/CTA glossy | resolved **accent** color |
| `.skuo.skuo-neutral` | Explicit neutral glossy | adaptive surface |
| `.skuo.skuo-icon` | Compact icon button | inherits variant; reduced radius, gloss intensity scaled down, no `translateY` jump |

**Existing classes are aliased to the system** so they upgrade automatically:

- `.skuomorphic-button` → behaves as `.skuo.skuo-accent` (landing CTAs are accent pills).
- `.skuomorphic-btn` → behaves as `.skuo` (neutral by default). The chat **send button** (`#send-btn.skuomorphic-btn`) additionally gets `.skuo-accent` semantics via an existing-selector rule, since it's the primary action.

### Accent resolution

Reuse the existing chain verbatim so chat (`--accent-color`) and token pages (`--accent`) both work:

```
var(--accent-color, var(--accent, #c96478))
```

Define a private convenience var at `:root` and `.dark`:

```css
--skuo-accent: var(--accent-color, var(--accent, #c96478));
```

## Dark mode

Under `.dark`: top highlight opacity drops (`~.5 → ~.18`), inner/bevel shadows deepen,
neutral base shifts to elevated greys, accent base uses the dark-swapped accent. All via
the existing `.dark` selector — no JS, no per-page work.

## Rollout (markup changes)

The shared CSS does the heavy lifting; markup edits are only adding classes where buttons
don't already carry `.skuomorphic-btn` / `.skuomorphic-button`.

| Page | Action |
|---|---|
| `AI/chat.html` | `.skuomorphic-btn` upgrades automatically. Add `.skuo-accent` to send button. Add `.skuo.skuo-icon` to icon buttons (`.sb-icon-btn`, `.sb-mini-btn`, `.history-action-btn`) — or restyle those classes to consume the glossy treatment. Tabs (`.Cadance-tab-btn`), `.sb-new-chat-btn`, `.mem-consent-*` get glossy variants. |
| `AI/index.html` | `.skuomorphic-button` upgrades automatically (accent). |
| `index.html` (landing) | Add `.skuo.skuo-accent` / `.skuo-neutral` to the ~8 prominent buttons/CTAs. |
| `AI/editor.html` | Add `.skuo`/`.skuo-icon` to `.toolbar-btn` + header buttons. |
| `AI/manage.html`, `AI/research.html`, `AI/goals.html`, `AI/version.html` | Add `.skuo`/`.skuo-accent` to prominent text buttons. |
| `AI/privacy.html`, `AI/tos.html` | Add `.skuo` to any back/nav buttons. |
| `Themes/Themes.html` | Add `.skuo.skuo-neutral` to the "Back" pill (currently Tailwind utilities). |
| `whitename.html`, `word/index.html` | Add `.skuo` to action buttons. |

Tailwind-utility buttons keep their utility classes (sizing/radius) and simply gain `.skuo*`
for the glossy fill; the glossy CSS uses `background-image` + `box-shadow` so it composes
with Tailwind sizing without conflict. Where a Tailwind `bg-*` would fight the gradient, the
glossy rule wins via specificity (class on element) — verify per button during implementation.

## Non-goals (YAGNI)

- No JS changes, no new build step (pure CSS in the already-shared file).
- No redesign of button *layout*, sizing, or labels — only surface treatment.
- No new color tokens beyond the one `--skuo-accent` convenience var.
- No changes to the existing global `:active` press gradient (kept, it layers on top).

## Testing / verification

- Open each page in browser, both **light and dark** (`vail_theme` light/dark/system).
- Verify: top highlight visible, gradient reads top-light→bottom-dark, hover lifts, press sinks, accent buttons use accent color, icon buttons read as glossy chips not bubbles.
- Change accent color in chat Settings → confirm accent buttons retint live.
- Confirm no regression on transparent/ghost areas and that text contrast on accent fills stays readable (uses `--accent-contrast` where text sits on accent).
