# Astra Cosmic Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Cosmic Clarity polish for Astra with accessible interactions, privacy-safe result identity, resilient loading, and responsive visual refinement.

**Architecture:** Keep the existing vanilla page and API flow. Add a small UMD-style pure helper file for deterministic behavior and dependency-free Node tests; keep DOM behavior in `astra.js` and appearance in the search section of `site.css`.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node built-in `assert`, existing backend APIs.

---

### Task 1: Pure Helpers And Test Harness

**Files:**
- Create: `search/astra-helpers.js`
- Create: `test-astra.mjs`
- Modify: `search/index.html`

- [ ] Write failing Node tests for hostname normalization, deterministic monogram letters and palette index, route tab normalization, citation linking, and plain-text fallback.
- [ ] Run `node test-astra.mjs` and verify it fails because `search/astra-helpers.js` is absent.
- [ ] Implement a UMD-style `AstraHelpers` object exposing `domainIdentity`, `normalizeTab`, `linkifyCitations`, and `renderAssistantHtml`.
- [ ] Load `astra-helpers.js` before `astra.js`; use text escaping and feature-detect `marked.parse` in `renderAssistantHtml`.
- [ ] Run `node test-astra.mjs` and verify all helper tests pass.

### Task 2: Accessible Search, Tabs, And Status Contracts

**Files:**
- Modify: `test-astra.mjs`
- Modify: `search/index.html`
- Modify: `search/astra.js`

- [ ] Add failing static-contract tests for combobox/listbox attributes, tablist/tab/panel relationships, polite status regions, dialog semantics, and external-link disclosure class.
- [ ] Run `node test-astra.mjs` and verify the new contract assertions fail.
- [ ] Add semantic attributes and a visually hidden shared status region in `index.html`.
- [ ] Update suggestion rendering to synchronize `aria-expanded`, `aria-activedescendant`, option IDs, `aria-selected`, and close state.
- [ ] Update tab painting and keyboard handling to synchronize `aria-selected`, roving `tabindex`, and panel visibility.
- [ ] Add status helpers that set `aria-busy` and announce search completion/errors without announcing token deltas.
- [ ] Update the AI toggle accessible label to state whether AI answers are on or off.
- [ ] Run `node test-astra.mjs` and verify all contracts pass.

### Task 3: Privacy-Safe Results And Loading States

**Files:**
- Modify: `test-astra.mjs`
- Modify: `search/astra.js`
- Modify: `src/site.css`

- [ ] Add failing tests proving result identity never uses a Google URL and maps the same hostname to the same monogram data.
- [ ] Run `node test-astra.mjs` and verify failure against current favicon behavior.
- [ ] Replace favicon images with local monogram spans using `AstraHelpers.domainIdentity`.
- [ ] Add result-link screen-reader disclosure and ellipsis-safe breadcrumbs.
- [ ] Add initial web-result skeleton rows and reduced-motion styling.
- [ ] Add actionable empty-state controls for editing the query and opening Images.
- [ ] Run `node test-astra.mjs` and verify helper and contract tests pass.

### Task 4: Hybrid Load More And Citation Orientation

**Files:**
- Modify: `test-astra.mjs`
- Modify: `search/astra.js`
- Modify: `src/site.css`

- [ ] Add failing contract tests for a real load-more button and citation-target highlight class.
- [ ] Run `node test-astra.mjs` and verify failure.
- [ ] Render the sentinel as a button with busy text/state; wire both click and IntersectionObserver to the same guarded loader.
- [ ] Preserve the button as retry after page failure and replace it with end copy only when done.
- [ ] Add temporary citation target highlighting, focus-safe orientation, and reduced-motion behavior.
- [ ] Run `node test-astra.mjs` and verify all tests pass.

### Task 5: AI Provenance, Sources, And Rendering Resilience

**Files:**
- Modify: `test-astra.mjs`
- Modify: `search/index.html`
- Modify: `search/astra.js`
- Modify: `src/site.css`

- [ ] Add failing tests for safe plain-text output when Marked is unavailable and source-chip markup contracts.
- [ ] Run `node test-astra.mjs` and verify failure.
- [ ] Add a concise AI provenance line and a source-chip container.
- [ ] Render up to five grounding source chips on each seed search and clear them on new searches.
- [ ] Route all streamed/final AI rendering through `AstraHelpers.renderAssistantHtml`.
- [ ] Preserve the existing first-token `hideThinking()` handoff and typewriter behavior.
- [ ] Run `node test-astra.mjs` and verify all tests pass.

### Task 6: Accessible Overlay Focus Management

**Files:**
- Modify: `test-astra.mjs`
- Modify: `search/index.html`
- Modify: `search/astra.js`
- Modify: `src/site.css`

- [ ] Add failing static tests for dialog roles, labels, expanded state, and focusable close controls.
- [ ] Run `node test-astra.mjs` and verify failure.
- [ ] Add shared layer helpers for stored focus, initial focus, Tab trapping, inert background, body lock, and focus restoration.
- [ ] Apply helpers to image preview and fullscreen AI, keeping Escape top-layer behavior.
- [ ] Set image-preview alt text from the result title and synchronize fullscreen button title/expanded state.
- [ ] Make narrow preview actions wrap/stack and respect bottom safe-area padding.
- [ ] Run `node test-astra.mjs` and verify all tests pass.

### Task 7: Cosmic Clarity Responsive Polish

**Files:**
- Modify: `search/index.html`
- Modify: `search/astra.js`
- Modify: `src/site.css`

- [ ] Add the approved desktop source-chip/result hierarchy without resting depth effects.
- [ ] At `max-width: 768px`, stack `.r-top`, center `.r-logo`, and place the full-width search bar underneath.
- [ ] Refine monograms, skeletons, empty states, loader, citation highlight, and focus-visible states in light and dark themes.
- [ ] Pause placeholder ghost display while inputs are focused and avoid concurrent decorative motion.
- [ ] Verify no resting shadow, blur, hover lift, or unapproved gradient was introduced.

### Task 8: Verification And Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] Run `node test-astra.mjs` and confirm all tests pass with clean output.
- [ ] Run `node --check search/astra-helpers.js` and `node --check search/astra.js`.
- [ ] Run `git diff --check`.
- [ ] Browser-smoke desktop and 375px mobile: search, suggestion arrows/Enter/Escape, tabs, skeletons, load button, citation highlight, AI stop/follow-up, image dialog, fullscreen dialog, dark mode, and reduced motion.
- [ ] Confirm mobile logo is centered above the search bar and no horizontal scrolling occurs at 320px.
- [ ] Confirm no requests are made to `google.com/s2/favicons` and Marked failure degrades to plain text.
- [ ] Update `CLAUDE.md` with the new Astra accessibility, monogram, hybrid-loader, mobile-header, and test-harness facts.
- [ ] Request final spec-compliance and code-quality reviews, fix all critical/important findings, and repeat verification.
