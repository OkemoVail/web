# Attached Chat Workspace Implementation Plan

> **For agentic workers:** Use executing-plans to implement these tasks inline, with verification checkpoints.

**Goal:** Replace detached chat chrome with an attached workspace and persistent glass edges.

**Architecture:** Retain the existing chat globals and DOM IDs. A flex column reserves header and composer rows around a shrinking, independently scrollable thread; the sidebar occupies its own attached column. The existing material engine paints functional surface rims.

**Tech Stack:** HTML, page-scoped CSS, vanilla JavaScript, Liquid Design, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-attached-chat-workspace-design.md`

## Global Constraints

- Preserve functional DOM IDs and native textarea editing.
- Keep Satoshi typography and rosewood accent.
- Support native/shell Chromium and WebKit at desktop/tablet/mobile sizes.
- Keep reduced motion, reduced transparency, increased contrast, and forced colors.
- Do not commit unless the user requests it.

### Task 1: Attached layout and regression contracts

**Files:** `AI/chat.html`, `src/site.css`, `test-chat-liquid-glass.mjs`.

**Interfaces:** Existing `#top-left-chat-title`, `#chat-container`, `#chat-composer-dock`, and `#sidebar` remain functional anchors.

- [x] Replace floating assertions with `thread.bottom <= dock.top + 1`, `thread.top >= title.bottom - 1`, and full-height sidebar bounds; run `node test-chat-liquid-glass.mjs` to verify failure.
- [x] Make header and composer non-shrinking relative-positioned rows and thread `flex: 1; min-height: 0; height: auto`. Make desktop sidebar full-height with zero inset/margin. Put mobile sidebar trigger in the header row.
- [x] Preserve composer inner width and two-row controls; use a full-width composer region with centered constrained contents. Apply a shared engine-owned header surface and persistent pane edge treatments.

### Task 2: Layout ownership and viewport integration

**Files:** `AI/js/chat-glass.js`, `src/site.css`.

**Interfaces:** Existing root-level title menu and `window.toggleSidebar()` remain unchanged.

- [x] Remove dock/title bound measurement and synthetic scroll-edge construction. Center welcome content inside the thread's real bounds.
- [x] Synchronize mobile available height with `visualViewport.height + visualViewport.offsetTop`, capped to `innerHeight`, on resize/scroll. Keep desktop sizing unchanged.
- [x] Verify textarea growth shrinks thread without moving header or overlapping composer; ensure title menus and Add menu remain reachable.

### Task 3: Verification and project notes

**Files:** `test-chat-liquid-glass.mjs`, `CLAUDE.md`.

- [x] Run `node test-chat-liquid-glass.mjs` and `$env:LIQUID_BROWSER='webkit'; node test-chat-liquid-glass.mjs`.
- [x] Inspect generated desktop/mobile light/dark screenshots and fix visible geometry/material problems.
- [x] Record attached layout and verification in `CLAUDE.md`; report exact verification results.
