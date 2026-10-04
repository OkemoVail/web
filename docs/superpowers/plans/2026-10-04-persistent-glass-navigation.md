# Persistent Glass Navigation Implementation Plan

> **For agentic workers:** Use executing-plans to implement inline, task by task.

**Goal:** Preserve real glass nodes, pointer capture, spring motion and native blur while page documents slide beneath them.
**Architecture:** An early bridge establishes explicit same-origin child mode. A persistent parent hosts page frames and persistent controls; child nav provides configuration and geometry. Route loading is token-owned and history/focus/theme are coordinated.
**Tech Stack:** Vanilla browser JS, existing LiquidDesign engine, native iframe/History APIs, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-04-persistent-glass-navigation-design.md`

## Global constraints
- Preserve user changes; no commits unless requested.
- Keep original native URLs and direct page initialization.
- Keep pointer ID and springs alive; do not replace/reparent held controls.
- Use 12px native blur and existing appearance tokens.
- Reduced-motion/webdriver guards remain; live tests override webdriver explicitly.
- Keep maximum two page frames, abort stale destinations, restore history/scroll.
- Do not hide failed loads behind a blank shell.

## File responsibilities
- `src/glass-navigation.js`: early frame bridge and script loading.
- `src/glass-shell.js`: parent route/history/loading/page-slide lifecycle.
- `src/glass-shell-controls.js`: persistent role controls and spring-driven geometry.
- `src/nav.js`: child geometry/config publication after nav mount.
- `src/site.css`: shell/frame layout and owned chrome layout.
- `test-persistent-glass.mjs`: native identity, held navigation, real blur, history and failure behavior.

### Task 1: Shell routing vertical slice
- [ ] Add Playwright Home→AI test storing the native primary node, initiating a held drag, calling shell navigation, and verifying identity/capture afterward.
```js
await page.evaluate(()=>window.held=document.querySelector('[data-glass-role="primary"]'));
await page.mouse.down();
await page.evaluate(()=>GlassShell.navigate('/AI/index.html'));
await page.waitForFunction(()=>GlassShell.currentURL.pathname==='/AI/index.html');
assert.equal(await page.evaluate(()=>held===document.querySelector('[data-glass-role="primary"]')),true);
```
- [ ] Run `node test-persistent-glass.mjs`, observe missing-shell failure.
- [ ] Implement explicit child query marker, parent frame load/ready token, native fallbacks and two-frame lifecycle. Publish geometry through the child nav after layout.
- [ ] Run test and inspect frame/control identity.

### Task 2: Persistent role geometry and menus
- [ ] Extend held test to move after commit and assert material bounds change; release and wait for rebound.
- [ ] Implement `GlassShellControls.update(descriptors)` and `destroy()`; descriptors have role, rect, label, href, glyph, menuItems. Keep nodes/controllers alive. Integrate damped spring target motion with existing plugin deformation.
```js
const acceleration=230*(target-position)-30*velocity;
velocity+=acceleration*dt;position+=velocity*dt;
```
- [ ] Keep original content wrappers, replace only glyph/label nodes inside them. Use one options component per menu role with native controls; defer menu item changes while held/open.
- [ ] Verify live material and pointer capture while layout springs retarget.

### Task 3: Routes, bridge, theme and native actions
- [ ] Extend tests for Back/Forward, query/fragment routes, modified links and aborted load.
- [ ] Bridge capture-phase native links/GET search and child history changes. Mirror titles and explicit theme; keep current child route mutations inside its document.
- [ ] Child publish native search slots; parent persistent input delegates value/input/keyboard events to active slot, retains selection/composition, and proxies visible suggestion content/actions accessibly.
- [ ] Verify real Home/Astra search and application harnesses with framed runtime.

### Task 4: Readiness, failure and accessibility
- [ ] Test delayed/failed frame load without active-page disappearance, latest-route ownership, focus restoration and reduced motion.
- [ ] Wait for bridge/engine/layout readiness, expose retry/native fallback on timeout, inert outgoing content, announce title, dispose Lumen before frame removal.
- [ ] Render stripe background inside child through shell glass; compare pixel contrast with filter disabled.
- [ ] Run `node test-persistent-glass.mjs`, `node test-glass-home.mjs`, `node test-ai-home-base.mjs`, `node test-astra-liquid-glass.mjs`, `node test-chat-liquid-glass.mjs`, `node test-z-index.mjs`; inspect live frame sequences in Chromium and WebKit.

## Review checklist
All spec areas map to Tasks 1–4. Do not claim site-wide completion from the first vertical slice. Runtime interfaces remain explicit; no snapshot identities are used for shell-owned chrome. Existing tests may need child-frame targeting for live mode but normal webdriver pages retain native mode to keep existing harness contracts.
