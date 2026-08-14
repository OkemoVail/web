# Site-Wide Motion System — Design Spec

**Date:** 2026-08-14
**Status:** approved design, pre-plan
**Scope:** global motion layer + 4 priority pages (home, ai-home, chat, Astra search)

## 1. Goal & context

The user asked to "transition the site to React for the nice animations." In brainstorming we established the actual goal is **nicer animations, site-wide** — React is not required for that and a rewrite was explicitly rejected (no-build vanilla architecture stays, per CLAUDE.md convention). What shipped features already exist and stay: anime.js in chat, the WAAPI storybook leaf-turn on `AI/index.html`, CSS springs on buttons/chat rows, the book-flip generation indicator, Astra's thinking row.

The site's motion voice was chosen from a live two-recipe demo (`.superpowers/brainstorm/` sampler):

- **Recipe B — "silky + gentle spring": premium, but fun.** A smooth expo workhorse for ~90% of motion, plus a gentle spring (whisper of overshoot, never bouncy) for presses, pops, and entrances.
- **"A lot of smooth transition effects"** — transitions on everything interactive; pages morph instead of hard-cutting.
- The chat send animation must be **seamless, iMessage-style** — the bubble is born from the input bar, no visible cut. Applies to **both** Oaky chat and Astra's search interface (details §5).

## 2. Motion tokens (go in `src/site.css` §2)

```css
:root {
  /* easings */
  --ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);   /* workhorse: hovers, fades, rises, expands, page transitions */
  --ease-soft:   cubic-bezier(0.34, 1.3, 0.64, 1);  /* gentle spring: presses, pops, entrances — the "fun" */
  /* durations */
  --dur-1: 140ms;  --dur-2: 220ms;  --dur-3: 360ms;  --dur-4: 560ms;
  /* entrances */
  --stagger: 45ms;
  --rise: 10px;
}
```

All new motion rules consume these tokens — re-tuning the site's feel later means editing ~6 lines. The existing hard-overshoot spring (`cubic-bezier(0.34, 1.56, 0.64, 1)`, used by `.history-btn-container` rows and the New-chat button) is **re-tuned to `--ease-soft`** so the site speaks one register. Buttons keep the no-recolor-on-press convention; press = gentle scale (~0.96) on `--ease-soft`.

## 3. Architecture

- **`src/site.css` §2** gains the motion token block. Page-specific animation rules go in that page's `[data-page="..."]` section (standard convention).
- **`src/motion.js`** — one dependency-free script (~100 lines), loaded site-wide like `src/nav.js`. Two jobs:
  1. **Scroll reveals** — IntersectionObserver over `[data-reveal]` elements; optional `data-reveal-delay` (ms) for staggers. Adds `.revealed` (transition: opacity 0→1, translateY(var(--rise))→0, `--ease-smooth`, `--dur-3`).
  2. **FLIP helper** — `window.motionFlip(el, mutate, opts)` for layout-shift animations where a page needs one (the chat/Astra morph is built on a purpose-tuned version of this, §5).
- **Safety invariants (hard requirements):**
  - transform/opacity only for recurring animation (no layout-thrash properties); the one-shot morph ghost may animate left/top/width/border-radius (single element, single run).
  - Content is **never hidden by default**: reveal styles only apply under `html.motion-ready`, which `motion.js` adds before observing. No/slow JS → fully visible page.
  - `@media (prefers-reduced-motion: reduce)` collapses all durations to ~0 and disables reveals, the morph (falls back to instant insert), view transitions, and the theme-reveal.

## 4. Global layer (every page, free via site.css + motion.js)

1. **Buttons** (`.skuo` family): hovers on `--ease-smooth`/`--dur-2`, presses scale ~0.96 on `--ease-soft`.
2. **Cross-page View Transitions** — `@view-transition { navigation: auto }` in site.css (both pages need the rule; the unified stylesheet makes this one edit). Content cross-fades + rises `--dur-2`. The floating nav capsule gets `view-transition-name: site-nav` so it holds steady while content morphs beneath it. Progressive enhancement: Chrome/Edge/Safari 18+ animate; Firefox navigates normally.
3. **Theme toggle** — circular reveal from the toggle (same-document `document.startViewTransition` around the `.dark` flip) instead of an instant repaint.
4. **Scroll reveals** wherever a page opts in with `data-reveal`.

## 5. Per-page inventory

### `index.html` (home)
- Hero entrance: pfp/name row → `.hero-search` pill stagger in on load (`--dur-3`, `--stagger`).
- `.hero-search` focus: pill smoothly expands/glows (existing focus styles gain transitions).
- Below-fold sections: `data-reveal`.
- **Search handoff morph:** the hero pill carries `view-transition-name: site-search`; the Astra results bar carries the same name. On submit, the pill travels/morphs into the compact bar during the page transition. (Firefox: normal navigation.)

### `AI/index.html` (ai-home)
- Storybook eases in (rise+fade, `--dur-4` smooth) before the first leaf turn; leaf-turn logic untouched.
- Headline/CTA stagger; below-fold sections `data-reveal`.

### `AI/chat.html` (chat)
- **iMessage morph send** — the seam killer. On send: the real user bubble is inserted hidden to measure its target rect; a ghost bubble (accent fill, the typed text) starts exactly over the input capsule and WAAPI-animates left/top/width/border-radius to the target over 420ms `--ease-soft`; on finish the real bubble is revealed and the ghost removed. Input clears at animation start. Streaming replies are unaffected. Applies to **new sends only** — edit-resend and regenerated messages keep the plain path.
- AI bubble entrance: container rises + fades (`--dur-3`) before the typewriter starts; typewriter cadence unchanged.
- Modals (settings/account/confirm): scale 0.96→1 + fade, `--ease-soft`, `--dur-2`.
- Sidebar row hover/press: keep transform behavior, re-tuned to `--ease-soft` (§2); hover backgrounds cross-fade on `--ease-smooth`.
- Book-flip generation indicator: unchanged (already fades out).

### `search/index.html` (Astra)
- Result rows stagger in on load, **stagger capped at the first 8 rows** so long pages don't trail.
- All ⇄ Images tab switch: content cross-fade (`--dur-2`).
- Images tab: masonry items fade-rise as each image loads; preview sheet slides up (mobile) / in from the right (desktop) on `--ease-smooth` `--dur-3`.
- **AI panel morph composer** — follow-up questions get the exact chat morph (ghost travels from the panel composer to the right-aligned follow-up bubble).
- Infinite-scroll batches: new rows fade-rise as they enter.
- Thinking row / conic shimmer: unchanged.

## 6. Verification

- The Playwright snapshot harness (`tools/snapshot.mjs` + `visual-diff.mjs`) keeps passing — its 1.5s settle outlasts every entrance (max `--dur-4` + capped stagger ≈ 1s). Any flake → fix the animation, not the threshold.
- Per-page manual checklist in light + dark, **including a `prefers-reduced-motion` pass** (everything instant, nothing hidden).
- No-JS / slow-JS check: throttle network, confirm content never stays hidden.
- Performance: no jank on a mid-tier laptop (entrances stay on the compositor; the morph ghost is one element, one run).
- Chat functional pass: send, stop, edit, regenerate, switch chats mid-stream — morph must not break `render()` rebuilds (ghost is removed on finish; a render during travel removes the ghost and reveals the real bubble immediately).

## 7. Rollout order (smallest-first, like the stylesheet plan)

1. Motion tokens + `src/motion.js` + reduced-motion guard.
2. Global layer: buttons, nav page-transitions, theme reveal.
3. `index.html` (home) incl. search handoff morph.
4. `AI/index.html` (ai-home).
5. `search/index.html` (Astra) incl. AI-panel morph composer.
6. `AI/chat.html` (chat) — biggest surface, last.

Each step ships independently behind the same invariants; visual snapshots before/after per page.

## 8. Explicitly out of scope

- React / any framework, any build step.
- Per-page extras for the other 12 pages (manage, editor, research, info pages, Themes, word, design*) — they get the global layer for free; page-specific passes are a future spec.
- The storybook leaf-turn, book-flip indicator, thinking row, conic input shimmer (already good).
- Edit/resend message morphing (chat) — plain path for now.
- Backend changes of any kind.
