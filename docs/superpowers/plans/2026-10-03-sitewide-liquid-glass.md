# Site-wide Liquid Glass Implementation Plan

> **For agentic workers:** Execute independent page tasks with user-requested subagents; review integration before completion.

**Goal:** Adopt approved liquid glass on every production button.
**Architecture:** Portable plugin plus one production lifecycle/tint adapter, loaded by every page. Page agents own disjoint HTML/application files; shared files have one owner.
**Tech Stack:** Vanilla JS, CSS, dependency-free plugin, Playwright/Node.
**Spec:** `docs/superpowers/specs/2026-10-03-sitewide-liquid-glass-design.md`

## Global constraints
- Preserve tints, accents, actions, node identity, dimensions, disabled and focus.
- No playground objects; all production buttons are separate glass surfaces,
  with no automatic grouping, unions or connecting necks.
- Reduced motion/webdriver retain stable glass.
- No commits; preserve all pre-existing changes.

## Task 1: Shared runtime (one agent)
- [ ] Read the approved plugin sources and build script in the liquid-glass worktree.
- [ ] Add a failing browser fixture proving dynamic insertion, tint updates, content replacement and cleanup fail without the adapter.
- [ ] Transfer/build the approved portable bundle and create `src/liquid-glass-site.js`.
- [ ] Batch scoped mutation enhancement, suppress own-mutation loops, handle replaced contents and disposed resources.
- [ ] Add shared CSS overrides in `src/site.css` for accent/red/brand/selected tints and crisp focus; disable legacy transforms on enhanced controls.
- [ ] Run adapter browser test and plugin portability contracts.

## Task 2: Page integration (one agent for each listed production page)
- [ ] Read the page, related scripts and direct-child/content replacement assumptions.
- [ ] Load `liquid-glass/liquid-glass.css`, `liquid-glass/liquid-glass.js`, `src/liquid-glass-site.js` with correct depth-relative URLs in that order.
- [ ] Preserve actions and adapt only concrete wrapper/content-update conflicts. Shared adapter marks buttons, not individual page agents.
- [ ] Run existing page contracts where present and inspect native actions/mobile layout.
- [ ] Return changed files, verification and integration concerns.

## Task 3: Coordinator verification
- [ ] Review all page diffs and shared runtime lifecycle together.
- [ ] Run page contracts: `node test-astra.mjs`, `node test-word-focus.mjs`, `node test-z-index.mjs`, `node test-titles.mjs`, `node test-backend-url.mjs`.
- [ ] Browser smoke each production page with offline API/CDN requests handled, verify all buttons enhanced and no console exceptions from the new integration.
- [ ] Synchronize adjacent deployed landing only after examining its local changes.
- [ ] Update CLAUDE.md to document production adoption; run `git diff --check`.
