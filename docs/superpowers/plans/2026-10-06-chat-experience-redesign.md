# Chat Experience Redesign Implementation Plan

> **For agentic workers:** Execute inline using executing-plans; do not delegate or commit without user instruction.

**Goal:** Deliver the approved unified light/dark chat design using the current palette.
**Architecture:** Preserve existing feature modules and IDs. Use one final chat presentation block, a semantic settings shell, and common dialog focus wiring.
**Tech Stack:** HTML, CSS, vanilla JS, Liquid Design, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-06-chat-experience-redesign-design.md`

## Global Constraints
- Keep storage, APIs, custom accent, translation and native editing intact.
- Use current parchment/charcoal/rosewood tokens and Satoshi typography.
- Retain floating sidebar/internal rail, visible title, New/More, roomy composer.
- Support native/shell Chromium/WebKit and accessibility preferences.

### Task 1: Conversation foundations
**Files:** `src/site.css`, `AI/js/chat-glass.js`, `test-chat-liquid-glass.mjs`.
- [ ] Map canvas/library/material colors to current tokens; normalize type and spacing.
- [ ] Make secondary commands quiet sidebar rows and message actions compact shared controls.
- [ ] Preserve real glass on floating controls and native growing composer.

### Task 2: Settings and personalization
**Files:** `AI/chat.html`, `AI/js/settings.js`, `src/site.css`.
- [ ] Create `role="dialog"` settings shell with a header, category navigation, and scrollable content. Desktop uses `grid-template-columns:180px minmax(0,1fr)`; mobile uses one column with horizontally scrollable categories.
- [ ] Set category `aria-selected` and labelled tab panels in `openSettingsTab()`.
- [ ] Normalize grouped rows, fields, segmented controls, memory states, Personality and Memories sheets with shared palette/type/spacing.

### Task 3: Menus and dialogs
**Files:** `AI/js/chat-glass.js`, `AI/js/modals.js`, `src/site.css`.
- [ ] Group More actions by purpose with separators and add Settings access.
- [ ] Give custom confirm/prompt dialogs labelled dialog semantics, Escape handling, focus trapping/restoration, and pending-confirm protection.
- [ ] Apply common visual styling and keyboard handling to settings and personalization dialogs.

### Task 4: Verify delivery
**Files:** `test-chat-liquid-glass.mjs`, `CLAUDE.md`.
- [ ] Extend real browser checks to settings category navigation, personalization dialog bounds, focus restoration, and current palette.
- [ ] Run `node test-chat-liquid-glass.mjs` and `$env:LIQUID_BROWSER='webkit'; node test-chat-liquid-glass.mjs`.
- [ ] Inspect populated chat and settings light/dark screenshots. Record completed design and verification.
