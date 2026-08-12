# Chaotic Evolving Chat Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat titles are re-generated in Saga's full-chaotic voice from a digest of the whole conversation, refreshing every ~4 replies, with rename/thumbs-up locks.

**Architecture:** All title logic stays in `AI/js/chat-management.js` (prompt, digest builder, cadence gate, generator). One call-site block changes in `AI/js/chat-actions.js`. Verification is a root-level node harness (`test-titles.mjs`, matching the existing `test.mjs`/`test_localhost.mjs` convention) that loads `chat-management.js` in a `vm` context with a `window` stub — no browser, no test runner.

**Tech Stack:** Vanilla JS (browser globals via `window.*`), node `vm` for the harness, the existing OpenAI-compatible backend for live checks.

**Spec:** `docs/superpowers/specs/2026-08-11-chaotic-evolving-titles-design.md`

---

### Task 1: Whole-chat digest — `buildTitleDigest`

**Files:**
- Create: `test-titles.mjs`
- Modify: `AI/js/chat-management.js` (add function after `cleanChatTitle`, ~line 31)

- [ ] **Step 1: Write the failing harness with digest tests**

Create `test-titles.mjs`:

```js
// test-titles.mjs — node harness for chat title generation (no browser needed).
// Usage:
//   node test-titles.mjs              → unit checks (digest, cadence, generation flow)
//   node test-titles.mjs --live [url] → fire real title requests (default http://127.0.0.1:8001)
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert';

const code = fs.readFileSync(new URL('./AI/js/chat-management.js', import.meta.url), 'utf8');

function loadModule(overrides = {}) {
    const window = {};
    const ctx = vm.createContext({
        window,
        console,
        fetch: overrides.fetch || (async () => { throw new Error('fetch not stubbed'); }),
    });
    vm.runInContext(code, ctx);
    return window;
}

// ── buildTitleDigest ──
{
    const w = loadModule();
    const hist = [];
    for (let i = 1; i <= 12; i++) {
        hist.push([`question ${i} about ${i === 1 ? 'css centering' : 'docker'}`, `<think>secret ${i}</think> answer ${i}`, null]);
    }
    const d = w.buildTitleDigest(hist);
    assert(d.includes('question 1 about css centering'), 'keeps first message');
    assert(d.includes('question 12'), 'keeps latest turn');
    assert(!d.includes('secret'), 'strips think tags');
    assert(!/<think>/.test(d), 'no think tags in output');
    assert(d.length <= 900, `under budget (${d.length})`);
    assert.strictEqual(w.buildTitleDigest([]), '', 'empty history → empty digest');
    assert.strictEqual(w.buildTitleDigest([[null, null, null]]), '', 'non-string pair skipped');

    const long = [];
    for (let i = 1; i <= 8; i++) long.push([`q${i} ` + 'x'.repeat(300), 'y'.repeat(300), null]);
    const dl = w.buildTitleDigest(long);
    assert(dl.length <= 900, `long digest trimmed (${dl.length})`);
    assert(dl.includes('q1'), 'anchor survives trim');
    assert(dl.includes('q8'), 'latest turn survives trim');
    console.log('✓ buildTitleDigest');
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test-titles.mjs`
Expected: FAIL — `w.buildTitleDigest is not a function`

- [ ] **Step 3: Implement `buildTitleDigest`**

In `AI/js/chat-management.js`, immediately after the `cleanChatTitle` definition (after line 31), add:

```js
const TITLE_DIGEST_BUDGET = 900;

// Builds the user-message payload for title generation from the WHOLE chat:
// the first user message (anchored) + the last 5 exchanges, think-tags
// stripped, capped at TITLE_DIGEST_BUDGET chars (oldest middle lines dropped
// first — the anchor and the newest turns are never removed).
window.buildTitleDigest = (history) => {
    const clean = (s) => (typeof s === 'string' ? s : '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
        .replace(/[\r\n]+/g, ' ')
        .trim();
    const clip = (s, n) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);
    const pairs = (history || []).filter(p => p && (clean(p[0]) || clean(p[1])));
    if (!pairs.length) return '';

    const recent = pairs.slice(-5);
    const lines = [];
    if (pairs.length > recent.length) lines.push(`First message: "${clip(clean(pairs[0][0]), 200)}"`);
    for (const [u, a] of recent) {
        lines.push(`User: "${clip(clean(u), 120)}"`);
        const ac = clean(a);
        if (ac) lines.push(`Assistant: "${clip(ac, 120)}"`);
    }
    while (lines.join('\n').length > TITLE_DIGEST_BUDGET && lines.length > 3) lines.splice(1, 1);
    return lines.join('\n');
};
```

- [ ] **Step 4: Run the harness to verify it passes**

Run: `node test-titles.mjs`
Expected: `✓ buildTitleDigest`

- [ ] **Step 5: Commit**

```bash
git add test-titles.mjs AI/js/chat-management.js
git commit -m "feat(chat): whole-chat title digest + node test harness"
```

---

### Task 2: Cadence + locks — `chatTitleDue`

**Files:**
- Modify: `test-titles.mjs` (append cadence tests)
- Modify: `AI/js/chat-management.js` (add `chatTitleDue`; edit `renameChat` ~line 141)
- Modify: `AI/js/chat-actions.js:373-379` (call site)

- [ ] **Step 1: Add the failing cadence tests**

Append to `test-titles.mjs`:

```js
// ── chatTitleDue ──
{
    const w = loadModule();
    const hist = [['my flask route keeps 404ing', 'add the leading slash', null]];
    const fallback = 'my flask route keeps 404ing'.substring(0, 30);
    assert.strictEqual(w.chatTitleDue(undefined, 1), true, 'brand-new unpersisted chat → due');
    assert.strictEqual(w.chatTitleDue({ titleManual: true, title: 'x', history: hist }, 9), false, 'renamed → locked');
    assert.strictEqual(w.chatTitleDue({ titleFeedback: 'good', title: 'x', titleGenAt: 1, history: hist }, 9), false, 'thumbs-up → locked');
    assert.strictEqual(w.chatTitleDue({ title: fallback, history: hist }, 1), true, 'fallback title → due');
    assert.strictEqual(w.chatTitleDue({ title: 'real title', titleGenAt: 1, history: hist }, 4), false, 'inside cadence window');
    assert.strictEqual(w.chatTitleDue({ title: 'real title', titleGenAt: 1, history: hist }, 5), true, 'cadence boundary');
    assert.strictEqual(w.chatTitleDue({ title: 'real title', history: hist }, 5), true, 'legacy chat (no titleGenAt)');
    console.log('✓ chatTitleDue');
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test-titles.mjs`
Expected: FAIL — `w.chatTitleDue is not a function`

- [ ] **Step 3: Implement `chatTitleDue` + the rename lock**

In `AI/js/chat-management.js`, immediately after `buildTitleDigest`, add:

```js
const TITLE_REFRESH_EVERY = 4;

// Auto-title gate. Due when: the chat is brand new (not yet persisted), the
// title is still the first-30-chars fallback, or TITLE_REFRESH_EVERY replies
// have landed since the last successful title. Locked by: manual rename
// (titleManual) or a thumbs-up on the title (titleFeedback === 'good').
// Manual Regenerate bypasses this gate entirely (it calls generateChatTitle
// with force=true without consulting chatTitleDue).
window.chatTitleDue = (chat, historyLength) => {
    if (!chat) return true;
    if (chat.titleManual) return false;
    if (chat.titleFeedback === 'good') return false;
    const fallback = (chat.history?.[0]?.[0] || '').substring(0, 30);
    if (!chat.title || chat.title === fallback) return true;
    return historyLength - (chat.titleGenAt || 0) >= TITLE_REFRESH_EVERY;
};
```

In `renameChat` (`AI/js/chat-management.js` — search for `window.renameChat = async`), set the manual lock. Change:

```js
        const newTitle = rawNewTitle.replace(/[\r\n]+/g, ' ').trim();
        window.allChats[id].title = newTitle;
```

to:

```js
        const newTitle = rawNewTitle.replace(/[\r\n]+/g, ' ').trim();
        window.allChats[id].title = newTitle;
        window.allChats[id].titleManual = true;
```

- [ ] **Step 4: Run the harness to verify it passes**

Run: `node test-titles.mjs`
Expected: `✓ buildTitleDigest` then `✓ chatTitleDue`

- [ ] **Step 5: Wire the cadence into the after-stream call site**

In `AI/js/chat-actions.js`, replace lines 373-379:

```js
        if (window.chatHistory.length > 0 && window.chatHistory[0][1] && !window[`_generatingTitle_${window.currentChatId}`]) {
            const existingTitle = window.allChats[window.currentChatId]?.title;
            const fallback = window.chatHistory[0][0].substring(0, 30);
            if (!existingTitle || existingTitle === fallback) {
                window.generateChatTitle(window.currentChatId, window.chatHistory[0][0], window.chatHistory[0][1]);
            }
        }
```

with:

```js
        if (window.chatHistory.length > 0 && window.chatHistory[0][1] && !window[`_generatingTitle_${window.currentChatId}`]
            && window.chatTitleDue(window.allChats[window.currentChatId], window.chatHistory.length)) {
            window.generateChatTitle(window.currentChatId);
        }
```

Note: on a brand-new chat `allChats[currentChatId]` is still undefined here (first `save()` runs later, at ~line 404) — `chatTitleDue(undefined, …)` returns `true`, matching today's first-reply behavior. By the time the async fetch resolves, `save()` has persisted the chat and the apply guard (`if (window.allChats[chatId])`) passes.

- [ ] **Step 6: Commit**

```bash
git add test-titles.mjs AI/js/chat-management.js AI/js/chat-actions.js
git commit -m "feat(chat): evolving title cadence with rename/thumbs-up locks"
```

---

### Task 3: `generateChatTitle` reads the whole chat

**Files:**
- Modify: `test-titles.mjs` (append generation-flow test)
- Modify: `AI/js/chat-management.js` (`generateChatTitle`; `regenerateCurrentTitle`)

- [ ] **Step 1: Add the failing generation-flow test**

Append to `test-titles.mjs`:

```js
// ── generateChatTitle (digest payload + meta retry + apply) ──
{
    const calls = [];
    const w = loadModule({
        fetch: async (url, opts) => {
            calls.push(JSON.parse(opts.body));
            const content = calls.length === 1 ? 'The user is asking about css' : 'css grief, then docker (classic)';
            return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
        }
    });
    w.settings = {};
    w.getOpenAIClient = async () => 'http://fake';
    w.StorageController = { saveChat: async () => {} };
    w.renderHistory = () => {};
    w.updateChatTitleDisplay = () => {};
    w.updateTitleFeedbackUI = () => {};
    w.currentChatId = 'c1';
    const hist = [
        ['how do I center a div', '<think>t</think> use flexbox, justify-center', null],
        ['that worked, now my docker container wont start', 'check the logs first', null],
    ];
    w.chatHistory = hist;
    w.allChats = { c1: { id: 'c1', title: hist[0][0].substring(0, 30), history: hist } };

    await w.generateChatTitle('c1');
    assert.strictEqual(calls.length, 2, 'meta title triggers exactly one retry');
    const sent = calls[0].messages.map(m => m.content).join('\n');
    assert(sent.includes('how do I center a div'), 'payload has first turn');
    assert(sent.includes('docker container'), 'payload has latest turn');
    assert(sent.includes('flexbox'), 'payload has assistant content');
    assert(!/<think>/.test(sent), 'think tags stripped from payload');
    assert.strictEqual(w.allChats.c1.title, 'css grief, then docker (classic)', 'retry title applied');
    assert.strictEqual(w.allChats.c1.titleGenAt, 2, 'titleGenAt recorded');
    console.log('✓ generateChatTitle');
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test-titles.mjs`
Expected: FAIL — `payload has first turn` (old signature receives `userMsg === undefined`, so the payload contains `User: "undefined"`, not the digest)

- [ ] **Step 3: Rewrite `generateChatTitle` (new signature, digest internally, `titleGenAt`)**

In `AI/js/chat-management.js`, replace the whole `generateChatTitle` function (search for `window.generateChatTitle = async` — it ends before `window.updateChatTitleDisplay`) with:

```js
window.generateChatTitle = async (chatId, force = false) => {
    if (!force && window[`_generatingTitle_${chatId}`]) return;
    try {
        const history = chatId === window.currentChatId
            ? window.chatHistory
            : window.allChats[chatId]?.history;
        const digest = window.buildTitleDigest(history);
        if (!digest) return;
        const baseUrl = await window.getOpenAIClient();
        const messages = [
            { "role": "system", "content": TITLE_SYSTEM_PROMPT },
            { "role": "user", "content": digest }
        ];

        let newTitle = await window._requestChatTitle(baseUrl, messages);

        // Meta guard: "The user is..."-style titles describe the chatter, not
        // the chat. Retry once with a corrective nudge; if still meta (or the
        // retry failed), keep the existing fallback title — never ship meta.
        if (newTitle && TITLE_META_RE.test(newTitle)) {
            const retry = await window._requestChatTitle(baseUrl, [...messages,
                { "role": "assistant", "content": newTitle },
                { "role": "user", "content": "no — name the topic, not the user. one short line, your voice, title only." }
            ]);
            if (retry && !TITLE_META_RE.test(retry)) newTitle = retry;
            else newTitle = null;
        }

        if (newTitle && window.allChats[chatId]) {
            window.allChats[chatId].title = newTitle;
            window.allChats[chatId].titleGenAt = (history || []).length;
            await window.StorageController.saveChat(window.allChats[chatId]);
            if (window.currentChatId === chatId) {
                window.updateChatTitleDisplay(newTitle);
                window.allChats[chatId].titleFeedback = null;
                window.updateTitleFeedbackUI(chatId);
            }
            window.renderHistory();
        }
    } catch (e) {
        console.error("Failed to generate title", e);
    } finally {
        delete window[`_generatingTitle_${chatId}`];
    }
};
```

Error-handling note (unchanged semantics): any failure → log, keep the existing title, and `titleGenAt` is NOT touched, so the next cadence boundary retries naturally.

- [ ] **Step 4: Update `regenerateCurrentTitle` to the new signature**

In `AI/js/chat-management.js`, replace `regenerateCurrentTitle` (search for `window.regenerateCurrentTitle = () =>`) with:

```js
window.regenerateCurrentTitle = () => {
    if (!window.currentChatId || window.chatHistory.length === 0) return;

    const titleEl = document.getElementById('top-left-chat-title');
    if (titleEl) titleEl.classList.add('shimmer-active');

    const btn = document.querySelector('#top-left-chat-title button[onclick*="regenerateCurrentTitle"] i');
    window.generateChatTitle(window.currentChatId, true).finally(() => {
        if (titleEl) titleEl.classList.remove('shimmer-active');
    });

    if (window.updateTitleFeedbackUI) window.updateTitleFeedbackUI(window.currentChatId);
    if (btn) {
        btn.classList.add('animate-spin');
        setTimeout(() => btn.classList.remove('animate-spin'), 1000);
    }
};
```

(Only change: the `chatHistory[0]` extraction is gone; `force=true` moves to the second parameter. Manual regenerate bypasses `chatTitleDue` — locks never block it.)

- [ ] **Step 5: Run the harness to verify it passes**

Run: `node test-titles.mjs`
Expected: `✓ buildTitleDigest`, `✓ chatTitleDue`, `✓ generateChatTitle`

- [ ] **Step 6: Commit**

```bash
git add test-titles.mjs AI/js/chat-management.js
git commit -m "feat(chat): title generation reads the whole chat"
```

---

### Task 4: Full-chaotic voice prompt + live verification

**Files:**
- Modify: `AI/js/chat-management.js` (`TITLE_SYSTEM_PROMPT`, near the top of the file)
- Modify: `test-titles.mjs` (append `--live` mode)

- [ ] **Step 1: Replace the system prompt**

In `AI/js/chat-management.js`, replace `TITLE_SYSTEM_PROMPT` (search for `const TITLE_SYSTEM_PROMPT`) with the prompt below. Keep it free of backticks (the `--live` extractor and the JS template literal both depend on that):

```js
const TITLE_SYSTEM_PROMPT = `You are Saga naming this conversation for a sidebar list. Write ONE line (4-12 words) that makes the topic instantly obvious — someone scanning the list should know what this chat is at a glance.

Voice: you at your most chaotic — puns, CAPS for emphasis, dry jokes, punctuation play (! ... —), lowercase by default. The joke decorates the topic; it never replaces it. If the digest shows the chat drifted between topics, name the arc or the dominant topic.

Hard rules: no emoji, no quotes, no trailing period, no explanation, title only. NEVER describe the user or the conversation itself: no "the user", no "this conversation", no "someone asked".

Examples:
"hi" → oh, just saying hi
"hey what's up" → small talk, big potential
"my flask route keeps 404ing" → FLASK 404: a tragedy in one route
"write a sci-fi story about mars" → mars sci-fi, because earth was boring
"what causes iron deficiency anemia" → iron deficiency, or: why you're tired
"how do I center a div" → centering a div, hour three
a chat that starts with css centering and drifts to docker → css grief, then docker (classic)`;
```

- [ ] **Step 2: Add `--live` mode to the harness**

Append to `test-titles.mjs`:

```js
// ── --live [baseUrl]: fire real title requests and print the titles ──
if (process.argv[2] === '--live') {
    const base = process.argv[3] || 'http://127.0.0.1:8001';
    const system = code.match(/const TITLE_SYSTEM_PROMPT = `([\s\S]*?)`;/)[1];
    const w = loadModule();
    const metaRe = /^(the user|user is|this (chat|conversation|is)|in this (chat|conversation))/i;
    const samples = [
        ['greeting', 'User: "hi"'],
        ['flask 404', 'User: "my flask route keeps 404ing"\nAssistant: "your route decorator is missing the leading slash"'],
        ['mars story', 'User: "write a sci-fi story about mars"'],
        ['drifted chat', 'First message: "how do I center a div"\nUser: "that worked, now my docker container wont start"\nAssistant: "check the docker logs first"'],
    ];
    let failed = false;
    for (const [label, digest] of samples) {
        const res = await fetch(base + '/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'saga-0.7b',
                messages: [{ role: 'system', content: system }, { role: 'user', content: digest }],
                temperature: 0.3, max_tokens: 60, stream: false
            }),
        });
        if (!res.ok) { console.error(`✗ ${label}: HTTP ${res.status}`); failed = true; continue; }
        const data = await res.json();
        const title = w.cleanChatTitle(data.choices[0].message.content);
        const meta = metaRe.test(title);
        if (meta) failed = true;
        console.log(`${meta ? '✗ META' : '✓'} ${label}: "${title}"`);
    }
    process.exit(failed ? 1 : 0);
}
```

- [ ] **Step 3: Run the live check against a real backend**

First find a working backend:

```bash
curl -s -m 3 http://127.0.0.1:8001/v1/models || curl -s -m 5 https://api.okemovail.com/v1/models
```

(If the local one is down and you want it: `./backend/run.sh` in a separate shell — first run may download the model. Otherwise use the tunnel.)

Then:

```bash
node test-titles.mjs --live http://127.0.0.1:8001
# or: node test-titles.mjs --live https://api.okemovail.com
```

Expected: four lines, every one prefixed `✓` (no `✗ META`), each title topic-obvious with chaotic flair — e.g. `✓ flask 404: "FLASK 404: a tragedy in one route"`. Exit code 0. Titles are model output so exact wording varies; re-run once if one sample is off-voice (temperature 0.3 still has variance).

- [ ] **Step 4: Commit**

```bash
git add AI/js/chat-management.js test-titles.mjs
git commit -m "feat(chat): full-chaotic title voice"
```

---

### Task 5: Browser verification (manual, no commit)

**Files:** none

- [ ] **Step 1: First-reply title**

Serve the repo (`npx serve .` or open `AI/chat.html` directly), start a fresh chat, send `hi`, then `my flask route keeps 404ing`. Expected: after reply 1 completes, the sidebar + top-left capsule show a generated chaotic title (not the raw message text).

- [ ] **Step 2: Evolution**

In the same chat, send 4+ more messages drifting to a different topic (e.g. docker). Expected: around reply 5, the title refreshes on its own and reflects the newer/whole conversation.

- [ ] **Step 3: Rename lock**

Rename the chat via the header capsule's rename button, then send 4 more messages. Expected: title stays exactly what you typed.

- [ ] **Step 4: Thumbs-up lock**

In another fresh chat, let the title generate, click the thumbs-up title-feedback button, send 4 more messages. Expected: title stays.

- [ ] **Step 5: Manual regenerate on a long chat**

In a chat that drifted, press Regenerate Title. Expected: shimmer plays, new title reflects the whole arc, not just the first message.

---

## Self-review notes (already applied)

- **Spec coverage:** prompt (T4), digest (T1), cadence+locks (T2), wiring — call site (T2), signature + regenerate (T3), rename lock (T2); error handling preserved in T3; testing = harness (T1–T3) + live (T4) + browser (T5). Out-of-scope items (backend, mass re-title, sidebar UI) are not in any task.
- **New-chat ordering:** the cadence call site runs before the first `save()` (`chat-actions.js` ~404), so `chatTitleDue(undefined, …) → true` is load-bearing and asserted in the T2 tests.
- **Field persistence:** `save()` spreads `...existingChat`, so `titleGenAt`/`titleManual`/`titleFeedback` ride along; cloud sync serializes the whole chat object too.
- **`titleFeedback` reset:** `generateChatTitle` still clears `titleFeedback` on apply (pre-existing behavior) — a thumbs-down chat keeps evolving, then gets a fresh vote on the new title.
