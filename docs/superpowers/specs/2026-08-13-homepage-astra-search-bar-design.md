# Homepage Astra search bar — design

**Date:** 2026-08-13
**Scope:** `index.html` only. No changes to Astra, `src/nav.js`, or `src/design-tokens.css`.

## Summary

Turn the homepage hero into a front door for Okemo Astra. The two hero CTA
buttons ("Selected work", "GitHub profile") are replaced by a single pill
search bar. Submitting it navigates to `/search/?q=<query>`, which Astra's
existing router already reads (`search/astra.js` builds state from
`URLSearchParams`).

## Decisions (from brainstorm)

- **What it does:** real web search via Astra — not site search, not a nav
  link.
- **Placement:** in the hero, *replacing* the CTA buttons.
- **Button fate:** dropped entirely. Both duplicate links that already exist
  in the floating nav (Work, GitHub) and the About/footer sections.
- **Alignment:** the bar is **horizontally centered** in the hero column
  (not left-aligned); the rest of the hero (pfp, eyebrow, headline) keeps
  its current left alignment.
- **No autocomplete dropdown** on the homepage (YAGNI — Astra has
  suggestions once you land).

## Approach

Native form GET — chosen over a JS redirect or inline results:

```html
<form action="/search/" method="get" class="hero-search load d4" role="search">
  <input type="text" name="q" aria-label="Search the web"
         enterkeyhint="search" autocomplete="off" spellcheck="false">
  <button type="submit" class="skuo skuo-accent">Search</button>
</form>
```

The browser itself navigates to `/search/?q=<input>`. Zero new JS; works
with JS disabled. Empty query navigates to `/search/?q=` which renders the
Astra hero — a sensible "just open Astra" fallback, so no empty-guard and
no `required` attribute (avoids native validation bubbles).

The form keeps the `load d4` fade-in class so it enters exactly like the
buttons it replaces.

## Styling

All CSS goes in `index.html`'s existing inline `<style>` block (layout and
local scoping only, per the universal-adoption rule — the submit button
uses the shared `.skuo skuo-accent`, no new button appearance is authored).

`.hero-search` mirrors the Astra `.bar` pattern but in the homepage's
parchment voice (no cosmic gradients):

- Pill container: `border-radius: 999px`, `background: var(--bg-elevated)`,
  `1px solid var(--border-strong)`, soft lift shadow.
- Focus: `:focus-within` → accent border + accent ring via
  `color-mix(in srgb, var(--accent), transparent 80%)` (same recipe Astra
  uses).
- Size: `width: min(560px, 100%)`, `margin-inline: auto` (centers it in
  the hero column), height ~48px, `gap` between input and button.
- Inner input: local reset of the global unified-input styling (transparent
  background, no border/box-shadow, full height) — the same scoping
  `.bar input` uses in Astra. The global focus ring must be disabled inside
  the pill since the container carries focus styling.
- Button: `.skuo skuo-accent`, pill radius, sized to sit inside the bar
  (like `.bar .skuo` in Astra).

Dark mode comes free from the design tokens; no `.dark` overrides expected.

## Data flow

1. User types a query, presses Enter (or clicks Search).
2. Browser GETs `/search/?q=<encoded query>`.
3. Astra's router reads `?q=`, runs the search, streams the AI answer.

## Error handling

- **Empty query:** navigates to `/search/?q=` → Astra hero. Intentional.
- **Backend down:** surfaced by Astra's own status card (📡), not the
  homepage's concern.
- **No JS:** works — the feature is a plain form.

## Testing

No test suite exists for static pages; verify manually:

1. Open `index.html`, type a query, press Enter → lands on
   `/search/?q=<query>` with results + AI answer.
2. Click the Search button → same.
3. Submit empty → Astra hero renders.
4. Focus the input → accent ring on the pill, no double ring on the input.
5. Mobile width (~375px): bar is full-width, centered, no overflow; Enter
   key shows "search".
6. Toggle dark mode → bar uses elevated surface + strong border, readable.
7. Reduced motion: no new animation added; existing `load d4` fade is
  already covered by the global reduced-motion rule.

## Out of scope

- Autocomplete/suggestions on the homepage.
- Changes to Astra, the floating nav, or `src/design-tokens.css`.
- Restyling or realigning any other hero element.
