# Adaptive Typewriter + Slam-Free Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Oaky's streaming display track the model's generation speed (adaptive typewriter) and finish without the end-of-generation text slam (deferred in-place finalize, no whole-chat rebuild).

**Architecture:** Three small edits. `streaming.js` gets a backlog-aware drain rate and calls a new `finalizeLastAIMessage()` when the queue drains after generation ends. `chat-actions.js` stops slamming the DOM at `[DONE]` (bookkeeping only), replaces the remaining queue with the sanitized remainder so the typewriter converges to the final text, and gains `finalizeLastAIMessage()` (book-flip lane fade + actions row + scroll). `chat.html` gains a `.book-flip-lane.done` fade-out rule. Spec: `docs/superpowers/specs/2026-08-11-adaptive-typewriter-design.md`.

**Tech Stack:** Vanilla JS (no modules, `window.*` globals), CSS in `chat.html`. No JS test suite exists in this repo (per CLAUDE.md) — automated verification is a framework-free Node simulation of the drain formula; the rest is scripted/manual browser verification.

**Commit style:** conventional, lowercase, scoped (e.g. `feat(chat): ...`). All commits user-approved.

---

### Task 1: Adaptive drain in `streaming.js`

**Files:**
- Modify: `AI/js/streaming.js` (`window.startTypewriter`, lines 81–108)

Current code being replaced:

```js
window.startTypewriter = () => {
    if (window.typeInterval) return;
    window.typeInterval = setInterval(() => {
        if (window.streamQueue.length === 0) {
            if (!window.isGenerating) {
                clearInterval(window.typeInterval);
                window.typeInterval = null;
                window.updateAssistantDisplay(window.typedResponseText, true);
            }
            return;
        }
        const speed = window.isInsideThought(window.typedResponseText) ? window.TYPE_SPEED_THOUGHT : window.TYPE_SPEED_MAIN;
        window.charAccu += speed / 20;
        let charsAdded = 0;
        while (window.charAccu >= 1 && window.streamQueue.length > 0) {
            window.typedResponseText += window.streamQueue[0];
            window.streamQueue = window.streamQueue.substring(1);
            window.charAccu -= 1;
            charsAdded++;
        }
        if (charsAdded > 0) {
            if (window.chatHistory.length > 0) {
                window.chatHistory[window.chatHistory.length - 1][1] = window.typedResponseText;
            }
            window.updateAssistantDisplay(window.typedResponseText);
        }
    }, 50);
};
```

- [ ] **Step 1: Write the failing formula check — `/tmp/typewriter-rate-check.mjs`**

A framework-free simulation of the drain loop against a 250 chars/s arrival rate (Gemma 3 4B on M2 Max). It imports nothing — it re-implements the tick formula EXACTLY as the new code will (copy from the new implementation below) and asserts the invariants:

```js
// Simulates the adaptive typewriter tick against a token arrival stream.
// Run: node /tmp/typewriter-rate-check.mjs — exits non-zero on failure.

function makeTick() {
  let queue = "", typed = "", charAccu = 0;
  return {
    // one 50ms tick; `arriving` = chars that arrived this tick
    tick(arriving, speedFloor = 80) {
      queue += arriving;
      if (queue.length === 0) return { typedLen: typed.length, backlog: 0 };
      const perTick = Math.min(Math.max(speedFloor / 20, queue.length / 6), 50);
      charAccu += perTick;
      while (charAccu >= 1 && queue.length > 0) {
        typed += queue[0]; queue = queue.substring(1); charAccu -= 1;
      }
      return { typedLen: typed.length, backlog: queue.length };
    },
  };
}

// Scenario: 250 chars/s arrival (= 12.5 chars/tick) for 10s, then stream ends.
const t = makeTick();
let maxBacklog = 0;
for (let i = 0; i < 200; i++) {
  const { backlog } = t.tick("x".repeat(12.5));
  maxBacklog = Math.max(maxBacklog, backlog);
}
if (maxBacklog > 150) {
  console.error(`FAIL: backlog grew unbounded (max ${maxBacklog} chars)`);
  process.exit(1);
}
// Stream ends: the backlog must drain within 0.5s (10 ticks).
let drainTicks = 0;
while (t.tick("", 80).backlog > 0 && drainTicks < 100) drainTicks++;
if (drainTicks > 10) {
  console.error(`FAIL: backlog took ${drainTicks} ticks to drain after stream end (>10)`);
  process.exit(1);
}

// Slow-model sanity: 60 chars/s must never fall behind either (backlog -> ~0).
const slow = makeTick();
for (let i = 0; i < 200; i++) {
  const { backlog } = slow.tick("x".repeat(3));
  if (backlog > 12) {
    console.error(`FAIL: slow model accumulated backlog ${backlog}`);
    process.exit(1);
  }
}
console.log(`PASS: maxBacklog=${maxBacklog} drainTicksAfterEnd=${drainTicks}`);
```

- [ ] **Step 2: Run it to verify it fails against the OLD formula**

Run: `node /tmp/typewriter-rate-check.mjs` after temporarily editing its `perTick` line to the old formula (`const perTick = speedFloor / 20;`).
Expected: FAIL — `backlog grew unbounded` (fixed 4 chars/tick < 12.5 chars/tick arrival). Then restore the adaptive line and re-run.
Expected after restore: `PASS: maxBacklog=... drainTicksAfterEnd=...`

- [ ] **Step 3: Replace `startTypewriter` in `AI/js/streaming.js`**

```js
window.startTypewriter = () => {
    if (window.typeInterval) return;
    window.typeInterval = setInterval(() => {
        if (window.streamQueue.length === 0) {
            if (!window.isGenerating) {
                clearInterval(window.typeInterval);
                window.typeInterval = null;
                window.updateAssistantDisplay(window.typedResponseText, true);
                if (typeof window.finalizeLastAIMessage === 'function') {
                    try { window.finalizeLastAIMessage(); } catch (e) { console.error('finalizeLastAIMessage failed:', e); }
                }
            }
            return;
        }
        // Adaptive drain: floor = the classic typewriter speed; when the queue
        // outruns the floor, accelerate proportionally (backlog drains in ~6
        // ticks), capped at 50 chars/tick (1000 chars/s) so it never "dumps".
        const speedFloor = window.isInsideThought(window.typedResponseText) ? window.TYPE_SPEED_THOUGHT : window.TYPE_SPEED_MAIN;
        window.charAccu += Math.min(Math.max(speedFloor / 20, window.streamQueue.length / 6), 50);
        let charsAdded = 0;
        while (window.charAccu >= 1 && window.streamQueue.length > 0) {
            window.typedResponseText += window.streamQueue[0];
            window.streamQueue = window.streamQueue.substring(1);
            window.charAccu -= 1;
            charsAdded++;
        }
        if (charsAdded > 0) {
            if (window.chatHistory.length > 0) {
                window.chatHistory[window.chatHistory.length - 1][1] = window.typedResponseText;
            }
            window.updateAssistantDisplay(window.typedResponseText);
        }
    }, 50);
};
```

Note: `finalizeLastAIMessage` is defined in Task 2 (loaded later than `streaming.js` — the `typeof` guard handles that; it is always defined by the time a stream drains).

- [ ] **Step 4: Commit**

```bash
git add AI/js/streaming.js
git commit -m "feat(chat): adaptive typewriter drain that tracks model speed"
```

---

### Task 2: Slam-free completion + `finalizeLastAIMessage` in `chat-actions.js`

**Files:**
- Modify: `AI/js/chat-actions.js` (`sendMessage` completion block ~lines 265–392; add `window.finalizeLastAIMessage`)

- [ ] **Step 1: Add `window.finalizeLastAIMessage`**

Insert this function directly BEFORE `window.sendMessage = async ...` (i.e. right after the `window.handleAction` block ends, around line 41):

```js
// Called by the typewriter (streaming.js) when the queue has fully drained
// after generation ends. Finalizes the last AI bubble in place — no
// whole-chat render(), so nothing re-animates or slams.
window.finalizeLastAIMessage = () => {
    const chatMsgs = window.els.chatMsgs;
    if (!chatMsgs) return;
    const aiRow = chatMsgs.querySelector('.ai-row:last-child');
    if (!aiRow) return;

    // 1. Fade out the book-flip generation indicator, then remove it.
    const lane = aiRow.querySelector('.book-flip-lane');
    if (lane) {
        lane.classList.add('done');
        setTimeout(() => lane.remove(), 340);
    }

    // 2. Append the actions row (copy / regen / sources / feedback / timestamp).
    const prose = aiRow.querySelector('.prose-target');
    if (prose && !aiRow.querySelector('.ai-msg-actions')) {
        const pairIdx = window.chatHistory.length - 1;
        const sources = (window.chatHistory[pairIdx] && window.chatHistory[pairIdx][5]) || [];
        const actionRow = document.createElement('div');
        actionRow.className = 'ai-msg-actions animate-fade-in';
        actionRow.innerHTML = `
            <div class="ai-actions-left">
                <button onclick="window.copyMsg(${pairIdx}, this)" class="ai-action-btn" title="Copy"><i data-feather="copy" class="w-4 h-4"></i></button>
                <button onclick="window.regenMsg(${pairIdx})" class="ai-action-btn" title="Regenerate"><i data-feather="rotate-cw" class="w-4 h-4"></i></button>
                ${sources.length ? `<button onclick="window.showSources(${pairIdx})" class="ai-action-btn sources-btn" title="View ${sources.length} sources"><i data-feather="link" class="w-4 h-4"></i><span class="sources-count">${sources.length}</span></button>` : ''}
            </div>
            <div class="ai-actions-right">
                <button onclick="window.sendFeedback(${pairIdx}, 'good', this)" class="ai-action-btn feedback-btn" title="Good response"><i data-feather="thumbs-up" class="w-4 h-4"></i></button>
                <button onclick="window.sendFeedback(${pairIdx}, 'bad', this)" class="ai-action-btn feedback-btn" title="Bad response"><i data-feather="thumbs-down" class="w-4 h-4"></i></button>
                <span class="msg-timestamp ai-timestamp">${window.formatDate(window.chatHistory[pairIdx][3])}</span>
            </div>
        `;
        prose.parentNode.appendChild(actionRow);
        feather.replace({ 'stroke-width': 2, 'width': 16, 'height': 16 }, actionRow);
    }

    // 3. Settle scroll at the bottom.
    if (window.els.chatCont) window.els.chatCont.scrollTop = window.els.chatCont.scrollHeight;
};
```

- [ ] **Step 2: Replace the completion block in `sendMessage`**

In `AI/js/chat-actions.js`, replace everything from `const lastProseEl = window.els.chatMsgs.querySelector(...)` (currently ~line 304) through the end of the actions-row `if (lastProseEl) { ... }` block (~line 359) — i.e. both DOM-slam blocks — with the queue-convergence snippet below. Then delete the `window.render();` line (~line 371) directly before `window.updateUI();`, keeping `window.updateUI();`.

The replacement (goes where the two DOM blocks were, right after the canvas-extraction block):

```js
        // Hand the SANITIZED remainder to the typewriter so it converges to
        // exactly responseText (no slam). If sanitization removed chars that
        // were already typed (e.g. a completed <remember> tag), prefix
        // alignment is impossible — hard-sync instead (rare path).
        if (window.typedResponseText && responseText.startsWith(window.typedResponseText)) {
            window.streamQueue = responseText.slice(window.typedResponseText.length);
        } else {
            window.typedResponseText = responseText;
            window.streamQueue = "";
        }
        // If the typewriter never started (zero-token reply) or already
        // drained, finalize right now — nobody else will.
        if (!window.typeInterval) {
            window.updateAssistantDisplay(window.typedResponseText, true);
            window.finalizeLastAIMessage();
        }
```

Result: on the success path, `sendMessage` no longer touches the last bubble's DOM at all — the typewriter drains the (small) remainder, does the final `updateAssistantDisplay(text, true)`, and calls `finalizeLastAIMessage()`.

- [ ] **Step 3: Fix the `finally` interval kill + the catch path**

In the same function's `finally` block, change:

```js
        if (window.typeInterval) {
            clearInterval(window.typeInterval);
            window.typeInterval = null;
        }
```

to:

```js
        // Don't kill the typewriter mid-backlog on the success path — it
        // drains the remainder in a few hundred ms and finalizes itself.
        // (Error/abort paths cleared the queue first, so it stops instantly.)
        if (window.typeInterval && window.streamQueue.length === 0) {
            clearInterval(window.typeInterval);
            window.typeInterval = null;
        }
```

And in the `catch (e)` block, add `window.streamQueue = "";` as the first line inside the catch (so a surviving interval can't type stale text over the error bubble).

- [ ] **Step 4: Verify — syntax + a scripted DOM smoke test**

There is no JS test runner in this repo; verify in Node with a minimal DOM stub. Create `/tmp/finalize-smoke.mjs`:

```js
// Verifies finalizeLastAIMessage behavior with a tiny fake DOM.
// Run: node /tmp/finalize-smoke.mjs (from anywhere; paths are absolute).
import { readFileSync } from 'node:fs';

const src = readFileSync('/Users/ar12c/Desktop/web/AI/js/chat-actions.js', 'utf8');

// Extract just the finalizeLastAIMessage function source and eval it in a stub env.
const start = src.indexOf('window.finalizeLastAIMessage = () => {');
if (start === -1) { console.error('FAIL: finalizeLastAIMessage not found'); process.exit(1); }
const end = src.indexOf('window.sendMessage = async', start);
const fnSrc = src.slice(start, end);

const removed = [];
const lane = { classList: { add(c) { this.c = c; } }, remove() { removed.push('lane'); } };
const actionsRow = { innerHTML: '' };
const prose = { parentNode: { appendChild(el) { this.appended = el; } } };
const aiRow = {
  q: { '.book-flip-lane': lane, '.ai-msg-actions': null, '.prose-target': prose },
  querySelector(sel) { return this.q[sel] ?? null; },
};
const chatMsgs = { querySelector(sel) { return sel === '.ai-row:last-child' ? aiRow : null; } };

global.window = {
  els: { chatMsgs, chatCont: { scrollTop: 0, scrollHeight: 500 } },
  chatHistory: [['hi', 'hello', null, 1700000000000]],
  formatDate: () => 'now',
};
global.document = { createElement: () => actionsRow };
global.feather = { replace: () => {} };
global.setTimeout = (fn) => { fn(); return 0; };

eval(fnSrc);
window.finalizeLastAIMessage();

if (!removed.includes('lane')) { console.error('FAIL: lane not removed'); process.exit(1); }
if (!actionsRow.innerHTML.includes('ai-action-btn')) { console.error('FAIL: actions row not built'); process.exit(1); }
if (window.els.chatCont.scrollTop !== 500) { console.error('FAIL: scroll not settled'); process.exit(1); }
// Idempotency: second call must not append a duplicate actions row.
prose.parentNode.appended = null;
aiRow.q['.ai-msg-actions'] = {}; // now present
aiRow.q['.book-flip-lane'] = null;
window.finalizeLastAIMessage();
if (prose.parentNode.appended) { console.error('FAIL: duplicate actions row'); process.exit(1); }
console.log('PASS: lane faded+removed, actions row appended once, scroll settled');
```

Run: `node /tmp/finalize-smoke.mjs`
Expected: `PASS: lane faded+removed, actions row appended once, scroll settled`

Also lint-syntax both edited files:
Run: `node --check AI/js/streaming.js && node --check AI/js/chat-actions.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add AI/js/chat-actions.js AI/js/streaming.js
git commit -m "feat(chat): slam-free finish — finalize in place after typewriter drains"
```

(If `streaming.js` shows no changes vs Task 1's commit, stage only `chat-actions.js`.)

---

### Task 3: Book-flip lane fade-out CSS in `chat.html`

**Files:**
- Modify: `AI/chat.html` (the `.book-flip-lane` CSS block)

- [ ] **Step 1: Locate the existing rule**

Run: `grep -n "book-flip-lane" AI/chat.html`
Expected: a `.book-flip-lane { ... }` rule (plus keyframes nearby).

- [ ] **Step 2: Add the fade rule**

Immediately AFTER the existing `.book-flip-lane { ... }` rule, add:

```css
.book-flip-lane {
    transition: opacity 0.3s ease;
}
.book-flip-lane.done {
    opacity: 0;
}
```

(If `.book-flip-lane` already has a `transition` property, merge `opacity 0.3s ease` into it instead of duplicating.)

- [ ] **Step 3: Verify**

Run: `grep -n -A2 "book-flip-lane.done" AI/chat.html`
Expected: the new rule printed.

- [ ] **Step 4: Commit**

```bash
git add AI/chat.html
git commit -m "feat(chat): fade out book-flip indicator instead of instant removal"
```

---

### Task 4: Live browser verification

**Files:** none (verification only)

Prereq: backend running (`backend/run.sh`, port 8001) and the cloudflared tunnel up — both were left running earlier today; check with `curl -s -m 5 https://api.okemovail.com/health` → `{"ok":true}`.

- [ ] **Step 1: Long-answer pace test**

Open `AI/chat.html`, send: `Write a 300-word story about a lighthouse.`
Expected: text types smoothly and keeps pace (no visible growing lag); when generation ends, typing completes within ~0.5s with NO slam; the book-flip lane fades out; the actions row (copy/regen/feedback/timestamp) fades in.

- [ ] **Step 2: Short answer**

Send: `hi`
Expected: reply types out and finalizes the same way; no console errors.

- [ ] **Step 3: Stop mid-stream**

Send the long prompt again, press Stop after ~1s.
Expected: typing halts immediately, the "Stopped" marker appears, the book-flip lane is gone (row re-rendered by the abort path), and no further text arrives.

- [ ] **Step 4: DevTools console**

Throughout steps 1–3: no red errors. `finalizeLastAIMessage failed:` must never appear.

- [ ] **Step 5: Regression — reload + history**

Reload the page, reopen the chat from history.
Expected: all messages render statically (whole-chat `render()` still works for load/switch), actions row present on past replies.

---

## Errata (applied during execution, commit d10bbff)

Code review of Task 2 found two issues in this plan's Step 2/3 code, fixed in
`d10bbff` (`fix(chat): finalize on empty-queue completions, guard orphan
typewriter on chat switch`):

1. **(Critical)** The `if (!window.typeInterval)` fallback missed the
   empty-queue-with-live-interval case (every `<remember>` reply, paced
   streams, hard-syncs): the `finally` guard killed the interval before its
   finalizing tick. Shipped code keys the immediate finalize on
   `window.streamQueue.length === 0` and clears the interval inside that
   branch.
2. **(Important)** The drain-surviving interval could write into a
   switched-to chat. Shipped `startTypewriter` captures
   `const historyRef = window.chatHistory` at interval start and self-clears
   when `window.chatHistory !== historyRef`.

## Self-Review Notes (already applied)

- **Spec coverage:** adaptive drain (Task 1), completion bookkeeping-without-slam + queue convergence + interval-kill guard + catch queue clear (Task 2), `finalizeLastAIMessage` incl. lane fade + actions row + scroll (Tasks 2–3), live verification incl. Stop/reload regressions (Task 4). Astra untouched per spec.
- **Type/name consistency:** `window.finalizeLastAIMessage` named identically in `streaming.js` (call, typeof-guarded) and `chat-actions.js` (definition); `.book-flip-lane.done` class added by JS (Task 2) and styled by CSS (Task 3); `window.streamQueue`/`typedResponseText`/`charAccu`/`typeInterval` globals unchanged.
- **Race check:** success path — typewriter owns the last bubble's DOM from `[DONE]` until finalize; nothing else writes it (the old slam blocks are deleted). Error path — queue cleared, interval self-stops, `render()` shows the error. Abort path — unchanged, clears both.
- **Placeholder scan:** none — all code complete.
