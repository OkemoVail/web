# User Memory — Consent Card + Streaming Bug Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `<remember>` tag content showing during streaming, and replace the auto-save memory flow with a consent card that floats above the input bar.

**Architecture:** Two targeted changes — a streaming display filter in `streaming.js`, and a consent card UI replacing the auto-save logic already in `chat.html`. All memory data functions (`addMemory`, `deleteMemory`, `renderMemoriesTab`) remain untouched.

**Tech Stack:** Vanilla JS, HTML/CSS — no framework, no bundler.

---

## File Map

| File | Change |
|---|---|
| `AI/js/streaming.js` | Strip `<remember>` content from display during streaming (non-final and final) |
| `AI/chat.html` | Add `#memory-consent-stack` container + CSS; rewrite `summarizeAndSaveMemory` to show consent card instead of auto-saving |

---

## Task 1: Filter `<remember>` content during streaming

**Files:**
- Modify: `AI/js/streaming.js` — `updateAssistantDisplay` function (lines ~63–74)

**Context:** `updateAssistantDisplay` renders content via `marked.parse()`. The `<remember>` tag stripping only happens when `isFinal=true` (lines 11–31). During streaming, raw `<remember>text</remember>` appears in the typewriter output. We need to filter it in every render, not just the final one.

- [ ] **Step 1: Open `AI/js/streaming.js` and locate the content rendering block**

Find this block (around line 69):

```js
if (content.trim()) {
    const displayContent = !isFinal ? window.ensureClosedCodeBlocks(window.sanitizeText(content)) : window.sanitizeText(content);
    mainContentDiv.innerHTML = marked.parse(displayContent);
    window.applyContentFeatures(mainContentDiv);
}
```

- [ ] **Step 2: Add a helper that strips `<remember>` content**

Add this one-liner immediately before the `if (content.trim())` block:

```js
const visibleContent = content
    .replace(/<remember>[\s\S]*?<\/remember>/gi, '')
    .replace(/<remember>[^]*$/i, '')
    .trim();
```

- `/<remember>[\s\S]*?<\/remember>/gi` removes complete tags
- `/<remember>[^]*$/i` removes a partial open tag that hasn't closed yet (mid-stream)

- [ ] **Step 3: Replace `content` with `visibleContent` in the render block**

Change the block to:

```js
if (visibleContent) {
    const displayContent = !isFinal
        ? window.ensureClosedCodeBlocks(window.sanitizeText(visibleContent))
        : window.sanitizeText(visibleContent);
    mainContentDiv.innerHTML = marked.parse(displayContent);
    window.applyContentFeatures(mainContentDiv);
}
```

- [ ] **Step 4: Manual verify — open `AI/chat.html` in a browser**

Send a message that causes the model to emit a `<remember>` tag. Confirm:
- The `<remember>` tag text never appears in the chat during or after streaming
- The rest of the response renders normally

- [ ] **Step 5: Commit**

```bash
git add AI/js/streaming.js
git commit -m "fix: hide <remember> tag content during streaming"
```

---

## Task 2: Add `#memory-consent-stack` container and CSS

**Files:**
- Modify: `AI/chat.html` — add container HTML around line 3158; add CSS around line 1599

**Context:** The consent card needs a fixed container that sits above the input bar. The outer input wrapper is at line 3156: `<div class="px-5 md:px-0 w-full max-w-2xl mx-auto relative group">`. The consent stack goes inside this div, before `.input-box-wrap`.

- [ ] **Step 1: Add the consent stack container in `AI/chat.html`**

Find this line (around line 3158):

```html
            <div
                class="input-box-wrap mb-2 transition-all duration-300 group focus-within:ring-0 focus-within:outline-none rounded-2xl relative flex flex-col !overflow-visible pointer-events-auto">
```

Insert immediately before it:

```html
            <div id="memory-consent-stack" class="flex flex-col gap-2 mb-2 w-full"></div>
```

- [ ] **Step 2: Add CSS for the consent card**

Find the end of the memory CSS block (after the `mpc-blink` keyframe, around line 1599). Add immediately after:

```css
        /* ── Memory consent card (above input bar) ─────────────────── */
        .mem-consent-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 10px 14px;
            border-radius: 14px;
            background: var(--input-bg, #f4f4f5);
            border: 1px solid color-mix(in srgb, var(--accent-color) 30%, transparent);
            animation: mem-consent-in 0.22s cubic-bezier(0.16,1,0.3,1) forwards;
            pointer-events: auto;
        }
        .dark .mem-consent-card {
            background: #27272a;
        }
        @keyframes mem-consent-in {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes mem-consent-out {
            from { opacity: 1; transform: translateY(0); max-height: 60px; margin-bottom: 0; }
            to   { opacity: 0; transform: translateY(4px); max-height: 0; margin-bottom: -8px; }
        }
        .mem-consent-card.dismissing {
            animation: mem-consent-out 0.18s ease-in forwards;
        }
        .mem-consent-label {
            font-size: 13px;
            color: #71717a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
            min-width: 0;
        }
        .mem-consent-label strong {
            color: #18181b;
            font-weight: 600;
        }
        .dark .mem-consent-label strong {
            color: #f4f4f5;
        }
        .mem-consent-btns {
            display: flex;
            gap: 6px;
            flex-shrink: 0;
        }
        .mem-consent-save {
            padding: 5px 14px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 700;
            color: white;
            background: var(--accent-color);
            cursor: pointer;
            border: none;
            transition: opacity 0.15s;
        }
        .mem-consent-save:hover { opacity: 0.85; }
        .mem-consent-dismiss {
            padding: 5px 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            color: #71717a;
            background: transparent;
            border: 1px solid #d4d4d8;
            cursor: pointer;
            transition: background 0.15s;
        }
        .dark .mem-consent-dismiss { border-color: #3f3f46; }
        .mem-consent-dismiss:hover { background: #f4f4f5; }
        .dark .mem-consent-dismiss:hover { background: #3f3f46; }
```

- [ ] **Step 3: Manual verify — open `AI/chat.html` in a browser**

Open DevTools, confirm `#memory-consent-stack` exists in the DOM above `.input-box-wrap`. No visual change yet (stack is empty).

- [ ] **Step 4: Commit**

```bash
git add AI/chat.html
git commit -m "feat: add memory consent stack container and CSS"
```

---

## Task 3: Replace auto-save with consent card

**Files:**
- Modify: `AI/chat.html` — rewrite `window.summarizeAndSaveMemory` (around line 3961)

**Context:** `summarizeAndSaveMemory` currently: (1) injects a pending entry into `#memories-list`, (2) calls the API to summarize, (3) auto-saves via `addMemory`. We replace this with: show a consent card above the input bar containing the raw `<remember>` text. [Save] calls `addMemory`. [Dismiss] removes the card. No extra API call needed — the model already writes concise facts in the tag.

- [ ] **Step 1: Find the existing `summarizeAndSaveMemory` function in `AI/chat.html`**

Locate (around line 3960):

```js
        // ── Memory summarization + animation ────────────────────────
        window.summarizeAndSaveMemory = async function (rawText) {
```

The function ends around line 4059 (after the streaming API reader). Select the entire function body.

- [ ] **Step 2: Replace the entire function with the consent card version**

Replace from `// ── Memory summarization + animation` through the closing `};` of `summarizeAndSaveMemory` with:

```js
        // ── Memory consent card ──────────────────────────────────────
        window.summarizeAndSaveMemory = function (rawText) {
            window.showMemoryConsent(rawText);
        };

        window.showMemoryConsent = function (text) {
            const stack = document.getElementById('memory-consent-stack');
            if (!stack) return;

            // Normalise: replace leading "user" with "You"
            const display = text.replace(/^user\b/i, 'You');

            const card = document.createElement('div');
            card.className = 'mem-consent-card';
            card.innerHTML =
                '<span class="mem-consent-label">🧠 Remember: <strong>' +
                display.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
                '</strong></span>' +
                '<div class="mem-consent-btns">' +
                '<button class="mem-consent-save">Save</button>' +
                '<button class="mem-consent-dismiss">Dismiss</button>' +
                '</div>';

            const dismiss = () => {
                card.classList.add('dismissing');
                card.addEventListener('animationend', () => card.remove(), { once: true });
            };

            card.querySelector('.mem-consent-save').addEventListener('click', () => {
                window.addMemory(display, 'model');
                dismiss();
            });
            card.querySelector('.mem-consent-dismiss').addEventListener('click', dismiss);

            stack.appendChild(card);
        };
```

- [ ] **Step 3: Manual verify — trigger a memory**

Open `AI/chat.html`. Send a message like "I have a cat named Mineek". When the model responds with a `<remember>` tag, confirm:
- No `<remember>` text appears in the chat
- A consent card appears above the input bar: `🧠 Remember: You have a cat named Mineek`
- Clicking **Save** adds it to the Memories tab in Settings and card disappears
- Clicking **Dismiss** removes the card without saving

- [ ] **Step 4: Verify multiple memories stack**

If the model emits two `<remember>` tags in one response, confirm two cards stack above the input bar and each can be saved/dismissed independently.

- [ ] **Step 5: Commit**

```bash
git add AI/chat.html
git commit -m "feat: show memory consent card above input instead of auto-saving"
```

---

## Self-Review

**Spec coverage:**
- ✅ `<remember>` hidden during streaming — Task 1
- ✅ Consent card floats above input bar — Tasks 2 & 3
- ✅ Card text uses "You" not "user" — Task 3, `display` normalisation
- ✅ [Save] saves to `window.settings.memories` via existing `addMemory` — Task 3
- ✅ [Dismiss] discards without saving — Task 3
- ✅ Stacks for multiple memories — Task 3 (appends per call)
- ✅ Settings Memory section already exists — no work needed
- ✅ Manual add in settings already exists — no work needed

**No new file needed** — all memory functions are already inline in `chat.html`. The spec's `memory.js` was based on incomplete context about what was already built.
