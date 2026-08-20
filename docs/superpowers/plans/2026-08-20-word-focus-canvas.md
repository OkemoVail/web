# Okemo Word Focus Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Okemo Word into a quiet editorial workspace with a dominant writing canvas, an always-visible floating formatting capsule, and Oaky collapsed behind an accessible edge tab by default.

**Architecture:** Preserve the page's existing self-contained vanilla HTML/JavaScript architecture and localStorage format. Reorganize semantic markup and small UI-state functions in `word/index.html`, replace only the scoped `[data-page="word"]` presentation in `src/site.css`, and add a focused Playwright contract harness for structure, behavior, and responsive layout.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, existing shared Okemo design tokens and `.skuo` controls, Font Awesome CSS masks, Playwright, Node.js.

---

## File Map

- Create `test-word-focus.mjs`: self-contained static server and Playwright contract checks for Word's hierarchy, interactions, accessibility state, persistence, responsive layout, and console health.
- Modify `word/index.html`: Focus Canvas markup, accessible document menu, Oaky edge tab, compact status cluster, existing feature wiring, and responsive UI state.
- Modify `src/site.css:6470-7304`: all Word-specific layout, editorial typography, floating toolbar, panel, menu, mobile, reduced-motion, and print presentation.
- Modify `CLAUDE.md`: record the new Word layout and its implementation invariants for future work.

The large inline script and scoped CSS section remain in place because that is the established architecture for this page. No unrelated module split is included.

### Task 1: Add the Focus Canvas contract harness

**Files:**
- Create: `test-word-focus.mjs`

- [ ] **Step 1: Write the failing Focus Canvas contract test**

Create a Node script that serves the repository root on an ephemeral port, launches Chromium, captures page and console errors, and checks the approved structure and behavior. Use this complete test shape:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const browser = await chromium.launch();

try {
  for (const viewport of [
    { name: 'mobile', width: 320, height: 720 },
    { name: 'tablet', width: 768, height: 900 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('vail_theme', 'light');
    });
    await page.goto(`http://127.0.0.1:${port}/word/index.html`, { waitUntil: 'load' });

    assert.equal(await page.locator('.wordmark').count(), 1, `${viewport.name}: wordmark`);
    assert.equal(await page.locator('.format-capsule').count(), 1, `${viewport.name}: format capsule`);
    assert.equal(await page.locator('#document-menu-btn[aria-haspopup="menu"]').count(), 1);
    assert.equal(await page.locator('#ai-toggle-btn[aria-controls="ai-panel"]').count(), 1);
    assert.equal(await page.locator('#ai-edge-tab[aria-controls="ai-panel"]').count(), 1);
    assert.equal(await page.locator('#workspace-status[aria-live="polite"]').count(), 1);
    assert.equal(await page.locator('.ai-quick-actions button').count(), 9);
    assert.equal(await page.locator('.ai-quick-actions').getByText(/[✨➡️📝✔️📏📖💡👔😊]/).count(), 0);

    const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(bodyOverflow <= 1, `${viewport.name}: horizontal overflow ${bodyOverflow}px`);

    if (viewport.width > 768) {
      await assertPanelState(page, false);
      await page.locator('#ai-edge-tab').click();
      await assertPanelState(page, true);
      await page.locator('#ai-toggle-btn').click();
      await assertPanelState(page, false);
    } else {
      await page.locator('#ai-fab').click();
      await assertPanelState(page, true);
      await page.locator('.ai-mobile-close').click();
      await assertPanelState(page, false);
      const paper = await page.locator('.editor-paper').boundingBox();
      assert.ok(paper && paper.width >= viewport.width - 2, `${viewport.name}: edge-to-edge paper`);
    }

    await page.locator('#document-menu-btn').click();
    assert.equal(await page.locator('#document-menu').getAttribute('aria-hidden'), 'false');
    assert.equal(await page.locator('#document-menu-btn').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#document-menu').getAttribute('aria-hidden'), 'true');

    await page.locator('#editor').fill('A focused document with four words.');
    await page.locator('#save-btn').click();
    assert.match(await page.locator('#st-save').textContent(), /^Saved /);
    assert.equal(await page.locator('#hdr-word-count').textContent(), '6 words');

    assert.deepEqual(errors, [], `${viewport.name}: browser errors`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

async function assertPanelState(page, open) {
  assert.equal(await page.locator('#ai-panel').getAttribute('aria-hidden'), String(!open));
  assert.equal(await page.locator('#ai-toggle-btn').getAttribute('aria-expanded'), String(open));
  assert.equal(await page.locator('#ai-edge-tab').getAttribute('aria-expanded'), String(open));
}

console.log('word focus canvas contracts passed');
```

- [ ] **Step 2: Run the contract test and confirm it fails for the old layout**

Run: `node test-word-focus.mjs`

Expected: FAIL on the missing `.wordmark`, `.format-capsule`, or `#document-menu-btn` contract. A failure proves the test distinguishes the current layout from Focus Canvas.

- [ ] **Step 3: Capture baseline Word screenshots**

Run: `node tools/snapshot.mjs before word`

Expected: `shot word-light` and `shot word-dark`, with PNGs under `tools/snapshots/before/`. These artifacts are ignored and are for visual comparison only.

- [ ] **Step 4: Commit the failing contract harness**

```bash
git add test-word-focus.mjs
git commit -m "test(word): add focus canvas contracts"
```

### Task 2: Rebuild the page shell and accessible UI state

**Files:**
- Modify: `word/index.html:47-218`
- Modify: `word/index.html:226-333`
- Modify: `word/index.html:492-569`

- [ ] **Step 1: Replace the header with the compact document bar**

Keep the existing IDs used by persistence and stats, but use this hierarchy:

```html
<header class="ow-header" aria-label="Document controls">
  <div class="wordmark" aria-label="Okemo Word"><span aria-hidden="true">W</span></div>
  <input id="doc-title" type="text" value="Untitled Document" aria-label="Document title"
    spellcheck="false" onblur="saveDoc(true)" oninput="markUnsaved()">
  <div class="document-state" id="workspace-status" aria-live="polite">
    <span id="hdr-word-count">0 words</span><span aria-hidden="true">·</span><span id="st-save">Not saved</span>
  </div>
  <div class="document-actions">
    <button class="hdr-btn skuo skuo-icon" onclick="newDoc()" title="New document" aria-label="New document"><i class="fa-regular fa-file"></i></button>
    <button class="hdr-btn skuo skuo-icon" id="save-btn" onclick="saveDoc()" title="Save document" aria-label="Save document"><i class="fa-regular fa-floppy-disk"></i></button>
    <button class="hdr-btn skuo skuo-icon" id="document-menu-btn" onclick="toggleDocumentMenu(event)"
      title="Document actions" aria-label="Document actions" aria-haspopup="menu" aria-controls="document-menu" aria-expanded="false">
      <span class="menu-dots" aria-hidden="true">•••</span>
    </button>
    <button class="hdr-btn skuo skuo-icon" id="ai-toggle-btn" onclick="toggleAIPanel()"
      title="Open Oaky writing assistant" aria-label="Open Oaky writing assistant"
      aria-controls="ai-panel" aria-expanded="false"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
    <div id="hdr-profile" class="hdr-profile" aria-label="Profile"></div>
  </div>
</header>
```

- [ ] **Step 2: Turn the existing toolbar into the floating capsule**

Add `format-capsule` to `.ow-toolbar`, retain every existing control and ID, and add state semantics to toggle controls. Example:

```html
<div class="ow-toolbar format-capsule" role="toolbar" aria-label="Formatting">
  <select class="tb-select" id="fmt-select" title="Paragraph style" aria-label="Paragraph style"
    onchange="formatBlock(this.value); this.blur();">
    <!-- retain the existing p, h1, h2, h3, blockquote, and pre options -->
  </select>
  <!-- retain all existing formatting groups -->
  <button class="tb-btn skuo skuo-icon" id="tb-bold" onclick="fmt('bold')"
    title="Bold (Ctrl+B)" aria-label="Bold" aria-pressed="false"><b aria-hidden="true">B</b></button>
</div>
```

Apply `aria-label` to every icon-only formatting control and `aria-pressed="false"` to controls represented in `TB_CMDS`.

- [ ] **Step 3: Replace the export popover with one document menu**

Keep `export-menu` as a compatibility class only if needed by CSS; use the new ID and include print:

```html
<div id="document-menu" role="menu" aria-hidden="true">
  <button class="export-item skuo" role="menuitem" onclick="exportHTML()"><i class="fa-brands fa-html5"></i>Export as HTML</button>
  <button class="export-item skuo" role="menuitem" onclick="exportText()"><i class="fa-regular fa-file-lines"></i>Export as text</button>
  <button class="export-item skuo" role="menuitem" onclick="copyAsHTML()"><i class="fa-regular fa-copy"></i>Copy HTML</button>
  <button class="export-item skuo" role="menuitem" onclick="copyAsText()"><i class="fa-solid fa-clipboard"></i>Copy text</button>
  <div class="menu-separator" role="separator"></div>
  <button class="export-item skuo" role="menuitem" onclick="printDoc(); closeDocumentMenu()"><i class="fa-solid fa-print"></i>Print</button>
</div>
```

- [ ] **Step 4: Add the Oaky edge tab and consolidate status markup**

Place the edge tab immediately before `#ai-panel`, start the panel collapsed, move the old status details into a compact floating cluster, and keep all stat IDs unique:

```html
<button id="ai-edge-tab" class="skuo skuo-accent" onclick="toggleAIPanel()"
  aria-label="Open Oaky writing assistant" aria-controls="ai-panel" aria-expanded="false">
  <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>Oaky</span>
</button>
<aside id="ai-panel" class="collapsed" aria-label="Oaky writing assistant" aria-hidden="true">
  <!-- existing AI content -->
</aside>
<div class="ow-status" aria-label="Document statistics">
  <span id="st-words">0 words</span><span class="dot" aria-hidden="true">·</span>
  <span id="st-chars">0 characters</span><span class="dot" aria-hidden="true">·</span>
  <span id="st-read">&lt; 1 min read</span>
</div>
```

- [ ] **Step 5: Replace emoji quick actions with text and existing mask icons**

Use the existing Font Awesome icon classes and preserve each `quickPrompt()` key:

```html
<div class="ai-quick-actions" aria-label="Writing shortcuts">
  <button class="skuo skuo-pill" onclick="quickPrompt('improve')"><i class="fa-solid fa-wand-magic-sparkles"></i>Improve</button>
  <button class="skuo skuo-pill" onclick="quickPrompt('continue')"><i class="fa-solid fa-arrow-turn-down"></i>Continue</button>
  <button class="skuo skuo-pill" onclick="quickPrompt('summarize')"><i class="fa-regular fa-file-lines"></i>Summarize</button>
  <button class="skuo skuo-pill" onclick="quickPrompt('grammar')"><i class="fa-solid fa-text-slash"></i>Fix grammar</button>
  <button class="skuo skuo-pill" onclick="quickPrompt('shorter')">Shorter</button>
  <button class="skuo skuo-pill" onclick="quickPrompt('expand')">Expand</button>
  <button class="skuo skuo-pill" onclick="quickPrompt('suggest')"><i class="fa-regular fa-file-pen"></i>Suggest edits</button>
  <button class="skuo skuo-pill" onclick="quickPrompt('professional')">Professional</button>
  <button class="skuo skuo-pill" onclick="quickPrompt('casual')">Casual</button>
</div>
```

- [ ] **Step 6: Implement accessible menu and panel state functions**

Replace `showExportMenu`, `closeExportMenu`, and the current panel initialization with state setters that update classes and ARIA together:

```js
let aiPanelOpen = false;

function setAIPanel(open) {
  aiPanelOpen = open;
  const panel = document.getElementById('ai-panel');
  const toggle = document.getElementById('ai-toggle-btn');
  const edgeTab = document.getElementById('ai-edge-tab');
  const fab = document.getElementById('ai-fab');
  panel.classList.toggle('collapsed', !open);
  panel.setAttribute('aria-hidden', String(!open));
  toggle.setAttribute('aria-expanded', String(open));
  edgeTab.setAttribute('aria-expanded', String(open));
  toggle.classList.toggle('skuo-accent', open);
  fab.classList.toggle('hidden', open);
}

function toggleAIPanel() {
  setAIPanel(!aiPanelOpen);
}

function toggleDocumentMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('document-menu');
  const open = menu.getAttribute('aria-hidden') === 'true';
  menu.setAttribute('aria-hidden', String(!open));
  document.getElementById('document-menu-btn').setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector('[role="menuitem"]').focus();
}

function closeDocumentMenu() {
  document.getElementById('document-menu').setAttribute('aria-hidden', 'true');
  document.getElementById('document-menu-btn').setAttribute('aria-expanded', 'false');
}
```

In `DOMContentLoaded`, call `setAIPanel(false)` for every viewport. Replace the outside-click listener with `if (!event.target.closest('#document-menu, #document-menu-btn')) closeDocumentMenu();`. Add Escape handling that closes the document menu first, then Oaky, and restores focus to the corresponding trigger. Update each export/copy function to call `closeDocumentMenu()`.

- [ ] **Step 7: Synchronize pressed state and correct the word-count expectation**

Update `syncToolbar()` so each stateful control exposes the same state to assistive technology:

```js
const active = document.queryCommandState(cmd);
el.classList.toggle('skuo-accent', active);
el.setAttribute('aria-pressed', String(active));
```

The harness sentence contains six whitespace-separated words, so retain the expected `6 words` assertion.

- [ ] **Step 8: Run the contract to expose remaining presentation failures**

Run: `node test-word-focus.mjs`

Expected: markup, menu, panel, and persistence assertions pass; mobile edge-to-edge or overflow assertions may still fail until Tasks 3 and 4.

- [ ] **Step 9: Commit the semantic shell**

```bash
git add word/index.html
git commit -m "feat(word): build focus canvas shell"
```

### Task 3: Implement the quiet editorial desktop presentation

**Files:**
- Modify: `src/site.css:6470-7249`

- [ ] **Step 1: Restyle the shell as a document-first workspace**

Replace the header, main-area, and desk rules with the following geometry and token usage:

```css
[data-page="word"] #app { display:flex; flex-direction:column; height:100dvh; }
[data-page="word"] .ow-header {
  min-height:64px; display:flex; align-items:center; gap:10px;
  padding:0 13rem 0 20px; background:var(--bg-elevated);
  border-bottom:1px solid var(--border); z-index:var(--z-chrome);
}
[data-page="word"] .wordmark {
  width:32px; height:32px; display:grid; place-items:center; flex:0 0 auto;
  border:1px solid var(--border-strong); border-radius:9px;
  background:var(--bg-white); color:var(--accent); font-weight:700;
}
[data-page="word"] #doc-title {
  min-width:120px; width:min(32vw,360px); padding:6px 8px; border:0;
  background:transparent; color:var(--text-primary); font:600 15px/1.2 inherit;
}
[data-page="word"] .document-state {
  display:flex; align-items:center; gap:7px; color:var(--text-tertiary);
  font-size:11px; white-space:nowrap;
}
[data-page="word"] .document-actions { margin-left:auto; display:flex; align-items:center; gap:5px; }
[data-page="word"] .ow-main { position:relative; display:flex; flex:1; min-height:0; overflow:hidden; }
[data-page="word"] .doc-scroll {
  flex:1; overflow:auto; padding:86px 40px 80px; background:var(--bg);
  scrollbar-width:thin; scrollbar-color:var(--border-strong) transparent;
}
[data-page="word"] .editor-paper {
  width:min(100%,816px); min-height:1056px; margin:0 auto; padding:78px 92px;
  border:1px solid var(--border-strong); border-radius:2px;
  background:var(--bg-elevated); box-shadow:none;
}
.dark [data-page="word"] .editor-paper { background:var(--surface-dark); }
```

- [ ] **Step 2: Make the toolbar a floating capsule**

```css
[data-page="word"] .format-capsule {
  position:fixed; top:76px; left:50%; transform:translateX(-50%);
  width:max-content; max-width:min(760px,calc(100vw - 32px));
  display:flex; align-items:center; gap:2px; padding:6px;
  overflow-x:auto; scrollbar-width:none; background:var(--bg-elevated);
  border:1px solid var(--border-strong); border-radius:13px;
  box-shadow:var(--shadow-float); z-index:var(--z-popover);
}
[data-page="word"] .format-capsule::-webkit-scrollbar { display:none; }
[data-page="word"] .tb-btn { width:32px; height:32px; flex:0 0 32px; border-radius:8px; }
[data-page="word"] .tb-select { width:112px; height:32px; flex:0 0 112px; font-size:12px; }
[data-page="word"] .tb-sep { width:1px; height:20px; margin:0 4px; background:var(--border-strong); flex:0 0 1px; }
```

The fixed capsule is a root-level floating layer, so `--shadow-float` and `--z-popover` are valid. Do not introduce another shadow or numeric page-level z-index.

- [ ] **Step 3: Improve editorial type and remove the animated caret**

Delete `@keyframes rainbow-caret` and the `animation` declaration. Use:

```css
[data-page="word"] #editor {
  min-height:900px; outline:none; color:var(--text-primary);
  font-family:'Satoshi','Inter',sans-serif; font-size:17px;
  line-height:1.7; letter-spacing:-0.006em; caret-color:var(--accent);
  overflow-wrap:anywhere;
}
[data-page="word"] #editor p { margin:0 0 .85em; }
[data-page="word"] #editor h1 { margin:0 0 .65em; font-size:2.35em; line-height:1.12; letter-spacing:-.035em; }
[data-page="word"] #editor h2 { margin:1.5em 0 .5em; font-size:1.65em; line-height:1.2; letter-spacing:-.025em; }
[data-page="word"] #editor h3 { margin:1.35em 0 .45em; font-size:1.25em; line-height:1.3; }
[data-page="word"] #editor blockquote { margin:1.2em 0; padding:.2em 0 .2em 1.1em; border-left:3px solid var(--accent); color:var(--text-secondary); }
```

Retain the existing list, link, rule, inline-code, preformatted-code, and table styling, adjusting only spacing or contrast where needed to match the new measure.

- [ ] **Step 4: Restyle the Oaky edge tab and panel**

```css
[data-page="word"] #ai-edge-tab {
  position:absolute; top:50%; right:0; transform:translateY(-50%);
  display:flex; align-items:center; gap:7px; min-height:44px; padding:10px 9px;
  writing-mode:vertical-rl; border-radius:10px 0 0 10px;
  z-index:var(--z-popover); box-shadow:var(--shadow-float);
}
[data-page="word"] #ai-edge-tab[aria-expanded="true"] { opacity:0; pointer-events:none; }
[data-page="word"] #ai-panel {
  width:340px; min-width:340px; display:flex; flex-direction:column;
  border-left:1px solid var(--border-strong); background:var(--bg-elevated);
  transform:translateX(0); opacity:1;
  transition:transform var(--dur-3) var(--ease-smooth),opacity var(--dur-2) var(--ease-smooth),width var(--dur-3) var(--ease-smooth),min-width var(--dur-3) var(--ease-smooth);
  z-index:var(--z-chrome);
}
[data-page="word"] #ai-panel.collapsed {
  width:0; min-width:0; transform:translateX(100%); opacity:0;
  overflow:hidden; pointer-events:none;
}
[data-page="word"] .ai-header {
  display:flex; align-items:center; justify-content:space-between; padding:12px 14px;
  color:var(--text-primary); background:var(--bg-elevated); border-bottom:1px solid var(--border);
}
[data-page="word"] .ai-icon-ring { color:var(--accent); background:color-mix(in srgb,var(--accent),transparent 88%); }
```

Keep message surfaces flat: solid user accent, neutral AI background, 1px borders, and no resting shadows.

- [ ] **Step 5: Restyle status, menus, and prompt surfaces**

```css
[data-page="word"] .ow-status {
  position:fixed; left:18px; bottom:16px; display:flex; align-items:center; gap:8px;
  min-height:30px; padding:0 10px; border:1px solid var(--border-strong);
  border-radius:999px; background:var(--bg-elevated); color:var(--text-tertiary);
  font-size:11px; box-shadow:var(--shadow-float); z-index:var(--z-chrome);
}
[data-page="word"] #document-menu {
  position:fixed; top:58px; right:13rem; min-width:190px; padding:6px;
  border:1px solid var(--border-strong); border-radius:10px;
  background:var(--bg-elevated); box-shadow:var(--shadow-float); z-index:var(--z-popover);
}
[data-page="word"] #document-menu[aria-hidden="true"] { display:none; }
[data-page="word"] .menu-separator { height:1px; margin:5px 7px; background:var(--border); }
[data-page="word"] .ai-input-wrap { background:var(--bg-white); border:1px solid var(--border-strong); box-shadow:none; }
[data-page="word"] .ai-quick-actions button { display:inline-flex; align-items:center; gap:5px; }
```

- [ ] **Step 6: Run the contract test**

Run: `node test-word-focus.mjs`

Expected: desktop structure and interaction checks pass. If mobile assertions still fail, proceed to Task 4 without weakening them.

- [ ] **Step 7: Commit the desktop presentation**

```bash
git add src/site.css
git commit -m "feat(word): style quiet editorial workspace"
```

### Task 4: Finish responsive, reduced-motion, and print behavior

**Files:**
- Modify: `src/site.css:6470-7304`
- Modify: `word/index.html:235-310`

- [ ] **Step 1: Add tablet overlay behavior**

At 1024px and below, prevent Oaky from squeezing the document and simplify secondary chrome:

```css
@media (max-width:1024px) {
  [data-page="word"] .ow-header { padding-right:14px; }
  [data-page="word"] .hdr-profile { display:none; }
  [data-page="word"] #ai-panel {
    position:absolute; inset:0 0 0 auto; width:min(360px,100%); min-width:min(360px,100%);
    box-shadow:var(--shadow-float); z-index:var(--z-dialog);
  }
  [data-page="word"] #ai-panel.collapsed { width:min(360px,100%); min-width:min(360px,100%); }
  [data-page="word"] .doc-scroll { padding-inline:28px; }
}
```

The panel is promoted to `--z-dialog` because it overlays the workspace at this breakpoint.

- [ ] **Step 2: Add the edge-to-edge mobile canvas**

```css
@media (max-width:768px) {
  [data-page="word"] .ow-header { min-height:58px; padding:0 10px; gap:6px; }
  [data-page="word"] .wordmark,.document-state #hdr-word-count,.document-state > span[aria-hidden="true"] { display:none; }
  [data-page="word"] #doc-title { min-width:0; width:auto; flex:1; font-size:14px; }
  [data-page="word"] .hdr-btn { width:44px; height:44px; }
  [data-page="word"] .document-actions .hdr-btn:first-child { display:none; }
  [data-page="word"] .format-capsule {
    top:66px; left:8px; right:8px; transform:none; width:auto; max-width:none;
    border-radius:11px; overscroll-behavior-inline:contain;
  }
  [data-page="word"] .tb-btn { width:44px; height:44px; flex-basis:44px; }
  [data-page="word"] .tb-select { height:44px; }
  [data-page="word"] .doc-scroll { padding:70px 0 58px; }
  [data-page="word"] .editor-paper {
    width:100%; min-height:100%; padding:38px 22px; border-left:0; border-right:0; border-radius:0;
  }
  [data-page="word"] #editor { min-height:calc(100dvh - 210px); font-size:16px; line-height:1.68; }
  [data-page="word"] #ai-edge-tab { display:none; }
  [data-page="word"] #ai-panel {
    position:fixed; top:58px; right:0; bottom:0; left:0;
    width:100%; min-width:100%; border-left:0; box-shadow:none; z-index:var(--z-dialog);
  }
  [data-page="word"] #ai-panel.collapsed { width:100%; min-width:100%; transform:translateY(100%); }
  [data-page="word"] #ai-fab { display:flex; width:52px; height:52px; bottom:16px; right:14px; }
  [data-page="word"] .ow-status { left:10px; bottom:10px; }
  [data-page="word"] #st-chars,[data-page="word"] #st-chars + .dot { display:none; }
  [data-page="word"] #document-menu { top:54px; right:10px; }
}
```

- [ ] **Step 3: Initialize panel state consistently across viewport changes**

Retain `setAIPanel(false)` at boot. Add a resize listener only to close an open panel when crossing between mobile and desktop modes, avoiding duplicate DOM or separate components:

```js
let mobileLayout = window.matchMedia('(max-width: 768px)').matches;
window.addEventListener('resize', () => {
  const nextMobileLayout = window.matchMedia('(max-width: 768px)').matches;
  if (nextMobileLayout !== mobileLayout) {
    mobileLayout = nextMobileLayout;
    setAIPanel(false);
  }
});
```

- [ ] **Step 4: Add reduced-motion and print safeguards**

```css
@media (prefers-reduced-motion:reduce) {
  [data-page="word"] #ai-panel,
  [data-page="word"] #ai-fab,
  [data-page="word"] #ow-toast { transition:none; }
  [data-page="word"] .thinking-dots span { animation:none; opacity:.65; transform:none; }
}
@media print {
  [data-page="word"] .ow-header,
  [data-page="word"] .format-capsule,
  [data-page="word"] .ow-status,
  [data-page="word"] #ai-panel,
  [data-page="word"] #ai-edge-tab,
  [data-page="word"] #ai-fab,
  [data-page="word"] #ow-toast,
  [data-page="word"] #document-menu,
  [data-page="word"] .ov-nav { display:none !important; }
  html:has(>body[data-page="word"]),[data-page="word"],[data-page="word"] #app,[data-page="word"] .ow-main { height:auto !important; overflow:visible !important; }
  [data-page="word"] .doc-scroll { overflow:visible !important; padding:0 !important; }
  [data-page="word"] .editor-paper { min-height:auto !important; padding:0 !important; border:0 !important; }
}
```

- [ ] **Step 5: Run responsive contracts and z-index regression checks**

Run: `node test-word-focus.mjs`

Expected: `word focus canvas contracts passed`.

Run: `node test-z-index.mjs`

Expected: the z-index regression harness exits successfully with no arbitrary page-level z-index violations.

- [ ] **Step 6: Commit responsive behavior**

```bash
git add word/index.html src/site.css
git commit -m "feat(word): finish responsive focus canvas"
```

### Task 5: Harden AI response actions and complete visual verification

**Files:**
- Modify: `word/index.html:621-744`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Make generation state explicit and action-safe**

At generation start, set busy state and disable sending. In a `finally` block, always restore both. Only append insertion actions when a non-error response exists:

```js
const panel = document.getElementById('ai-panel');
panel.setAttribute('aria-busy', 'true');
document.getElementById('ai-send-btn').disabled = true;
let requestFailed = false;

try {
  // retain the existing fetch and SSE parsing loop
} catch (error) {
  requestFailed = true;
  accumulated = 'Could not reach Oaky. Check your connection and try again.';
} finally {
  isGenerating = false;
  panel.setAttribute('aria-busy', 'false');
  document.getElementById('ai-send-btn').disabled = false;
}

const cleanOutput = accumulated.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '').trim();
if (txtEl) {
  txtEl.textContent = cleanOutput || '(No response)';
  txtEl.classList.toggle('is-error', requestFailed);
}
if (!requestFailed && cleanOutput) {
  responseMap[id] = cleanOutput;
  appendResponseActions(aiDiv, id);
}
```

Extract the existing Insert Below and Replace button creation into `appendResponseActions(aiDiv, id)` without changing its selection and replacement behavior. Do not store error text in `responseMap`.

- [ ] **Step 2: Extend the contract harness for failed AI recovery**

Before navigation, route the completion endpoint to fail, then verify recovery after sending:

```js
await page.route('**/v1/chat/completions', route => route.fulfill({ status:500, body:'failure' }));
await page.locator('#ai-input').fill('Improve this');
await page.locator('#ai-send-btn').click();
await page.locator('.msg-ai-bubble.is-error').waitFor();
assert.equal(await page.locator('#ai-send-btn').isEnabled(), true);
assert.equal(await page.locator('#ai-panel').getAttribute('aria-busy'), 'false');
assert.equal(await page.locator('.msg-ai .msg-insert-btn').count(), 0);
```

Place this check once in the desktop branch after opening Oaky and before closing it, so the harness does not repeat network assertions at every viewport.

- [ ] **Step 3: Document the new Word invariants**

Add this concise section to `CLAUDE.md`:

```markdown
### Okemo Word Focus Canvas

`word/index.html` uses the Focus Canvas layout: a slim document bar, always-visible floating `.format-capsule`, centered editorial `.editor-paper`, and Oaky collapsed by default behind `#ai-edge-tab`. At `<=1024px` Oaky overlays instead of squeezing the document; at `<=768px` the sheet is edge-to-edge and Oaky is full-screen. Word page styles remain in the `[data-page="word"]` section of `src/site.css`; retain all existing editor/formatting IDs because the inline script and `test-word-focus.mjs` depend on them. Use semantic z-index tokens and reserve `--shadow-float` for the capsule, menus, status chip, and other genuinely floating layers. Run `node test-word-focus.mjs` and `node test-z-index.mjs` after Word changes.
```

- [ ] **Step 4: Run all automated verification**

Run: `node test-word-focus.mjs`

Expected: `word focus canvas contracts passed`.

Run: `node test-z-index.mjs`

Expected: PASS.

Run: `node test-astra.mjs`

Expected: all Astra contracts pass, proving the shared stylesheet changes did not regress that page.

- [ ] **Step 5: Capture final screenshots and inspect both themes**

Run: `node tools/snapshot.mjs after word`

Expected: `shot word-light` and `shot word-dark`.

Open `tools/snapshots/after/word-light.png` and `tools/snapshots/after/word-dark.png` and check:

- The document is the strongest visual surface.
- The formatting capsule is centered, fully visible, and does not collide with the universal nav.
- The collapsed Oaky tab is discoverable without covering document text.
- The page uses no resting-surface shadows or gradients.
- Text, borders, active formatting, and focus states remain legible in both themes.

- [ ] **Step 6: Perform the manual interaction pass**

Serve the repository with `python3 -m http.server 8901`, then inspect `/word/index.html` at 320px, 768px, 1024px, and 1440px. Verify create, edit, autosave, reload, new document, every formatting group, keyboard shortcuts, menu Escape dismissal, export HTML/text, copy HTML/text, print preview, Oaky open/close, quick prompts, insert below, replace selection, and replace document.

Expected: no console errors, no horizontal page overflow, print preview contains document content only, and all retained workflows behave as before.

- [ ] **Step 7: Commit hardening and documentation**

```bash
git add word/index.html test-word-focus.mjs CLAUDE.md
git commit -m "fix(word): harden focus canvas interactions"
```

### Task 6: Final review

**Files:**
- Review: `word/index.html`
- Review: `src/site.css`
- Review: `test-word-focus.mjs`
- Review: `CLAUDE.md`

- [ ] **Step 1: Inspect the complete implementation diff**

Run: `git diff HEAD~4 -- word/index.html src/site.css test-word-focus.mjs CLAUDE.md`

Expected: only Focus Canvas markup, scoped Word styling, its contract harness, and documentation are present. Confirm no localStorage keys, AI endpoint, formatting command names, or unrelated page selectors changed.

- [ ] **Step 2: Re-run the final verification set from a clean browser state**

```bash
node test-word-focus.mjs
node test-z-index.mjs
node test-astra.mjs
```

Expected: all commands exit 0.

- [ ] **Step 3: Check repository status**

Run: `git status --short`

Expected: no uncommitted Focus Canvas files. Existing unrelated user changes may remain and must not be modified or reverted.
