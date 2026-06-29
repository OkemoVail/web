# Index Page — Swiss Minimal Reinvention

Date: 2026-06-29
Target file: `web/index.html` (single self-contained file, rewritten)

## Goal

Full reinvention of the OkemoVail landing page in a **Swiss minimal** style, with a
**floating pill nav island** replacing the current full-width pinned bar. No new files,
no build step — Tailwind CDN + existing `src/design-tokens.css` tokens.

## Decisions (locked)

- Floating pill nav: **centered**, detached from edges.
- Hero profile photo: **dropped** for maximum minimalism.
- Single accent color: **rosewood** (`var(--accent)`), used sparingly.
- Dark mode: keep existing `vail_theme` localStorage logic; add a working sun/moon toggle.
- Grain overlay: removed for flat Swiss cleanliness.

## Visual system

- Monochrome base: near-black ink on off-white parchment, inverted in dark mode (via tokens).
- Strong left-aligned grid, generous whitespace, hairline rules (`var(--border)`).
- Numbered sections `01 / 02 / 03` in JetBrains Mono — Swiss signature.
- Type: large tight **Satoshi** for headlines; **Century serif** kept only for quotes;
  **JetBrains Mono** for section numbers and small labels.
- Entrance + scroll-reveal animations kept but subtler.

## Floating pill nav

- Single rounded-full island, `~1.25rem` from top, horizontally centered, `z-50`.
- Glassy: `backdrop-blur`, semi-transparent parchment bg, hairline border, soft shadow.
- Contents: `okemovail.` brand (left) · nav buttons `Projects / OkemoAI / GitHub` ·
  theme toggle (sun/moon) (right).
- Scroll behavior: tightens padding + strengthens shadow after `scrollY > 20`.
- Mobile: collapses to brand + compact menu (links remain reachable).

## Sections

1. **Hero** — eyebrow `Hey, I'm OkemoVail`, oversized statement `I make everything.`,
   accent rule, two restrained buttons (Explore Projects → `#work`, GitHub Profile).
2. **`01` Projects** — Swiss index list replacing the table. Big numbered rows:
   - Pisces — AI chat + deep research → `/AI/index.html`
   - Okemo Word — minimal writing tool → `/word/index.html`
   - OkemoAI Labs — agentic/autonomous (Coming Soon, disabled)
   Each row: number, title, description in a grid column, hover reveals arrow + accent.
3. **`02` Words** — the two quotes (Steve Jobs, Google) as a minimal two-column serif band
   with hairline divider.
4. **`03` About + links** — short bio blurb + GitHub / OkemoAI links. Footer with year.

## Kept destinations / behavior

- All current links preserved (`/AI/index.html`, `/word/index.html`, GitHub `ar12c`).
- Theme system, fonts (`Fonts/Satoshi-*`), Tailwind config color aliases.

## Out of scope

- No changes to `AI/` pages, no new routes, no backend work.

## Success criteria

- Opens standalone in a browser, light + dark both clean.
- Floating centered pill nav works, toggles theme, tightens on scroll.
- Fully responsive (pill collapses, sections stack) on mobile.
