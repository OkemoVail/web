# Saga-Voice Chat Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the title-generation prompt with a Saga-voice "one glance = the whole convo" prompt, plus a deterministic meta-title guard with one retry, so titles like "The user is initiating a casual conversation…" can never ship.

**Architecture:** Single-function edit in `AI/js/chat-management.js` (`window.generateChatTitle`): new system prompt, and after the existing cleanup a meta-regex guard → one corrective retry → otherwise keep the existing fallback title. Spec: `docs/superpowers/specs/2026-08-11-saga-voice-titles-design.md`.

**Tech Stack:** Vanilla JS, `window.*` globals, no test runner (per CLAUDE.md) — verification is a Node stub test of the guard logic + live title generation through the tunnel.

**Commit style:** conventional, lowercase, scoped. Commits user-approved.

---

### Task 1: Saga-voice title prompt + meta guard + retry

**Files:**
- Modify: `AI/js/chat-management.js` (`window.generateChatTitle`, lines 3–62)

- [ ] **Step 1: Replace the function**

Replace the entire `window.generateChatTitle = async (chatId, userMsg, aiMsg, force = false) => { ... };` (lines 3–62) with:

```js
const TITLE_META_RE = /^(the user|user is|this (chat|conversation|is)|in this (chat|conversation))/i;

const TITLE_SYSTEM_PROMPT = `You are Saga naming this conversation for a sidebar list. Write one short line (4-10 words) that captures the main topic or vibe of the chat — someone scanning the list should instantly know what this conversation is.

Style: your voice — dry, lowercase, plain, slight edge is fine. No quotes, no trailing period, no emoji, no explanation. NEVER describe the user or the conversation itself: no "the user", no "this conversation", no "someone asked".

Examples:
User: "hi" → oh, just saying hi
User: "my flask route keeps 404ing" → a flask 404 on the api route
User: "write a sci-fi story about mars" → sci-fi story, mars edition
User: "what causes iron deficiency anemia" → iron deficiency anemia, causes and fixes
User: "how do I center a div" → centering a div, finally`;

window.cleanChatTitle = (raw) => {
    let t = (raw || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
        .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g, '')
        .replace(/<\|im_start\|>|<\|im_end\|>/g, '')
        .replace(/<\/?[a-zA-Z][^>]*>/g, '')   // any remaining HTML/XML-ish tags
        .replace(/[\r\n]+/g, ' ')
        .trim();
    // If multiple lines/sentences slipped through, keep the first clause
    t = t.split(/(?<=[.!?])\s+/)[0] || t;
    t = t.replace(/^["'`*\s]+|["'`*\s.]+$/g, '').trim();
    return t;
};

window._requestChatTitle = async (baseUrl, messages) => {
    const response = await fetch(baseUrl + "/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            "bypass-tunnel-reminder": "true",
            ...(window.settings.apiKey ? { "Authorization": `Bearer ${window.settings.apiKey.trim()}` } : {})
        },
        body: JSON.stringify({
            model: window.currentModel.id,
            messages: messages,
            temperature: 0.3,
            max_tokens: 60,
            stream: false,
            use_thought: false,
            think: false,
            thinking: false
        })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return window.cleanChatTitle(data.choices[0].message.content);
};

window.generateChatTitle = async (chatId, userMsg, aiMsg, force = false) => {
    if (!force && window[`_generatingTitle_${chatId}`]) return;
    try {
        const baseUrl = await window.getOpenAIClient();
        const messages = [
            { "role": "system", "content": TITLE_SYSTEM_PROMPT },
            { "role": "user", "content": `User: "${userMsg}"\nAssistant: "${(aiMsg || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim().substring(0, 300).replace(/[\r\n]+/g, ' ')}"` }
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

        if (newTitle) {
            if (window.allChats[chatId]) {
                window.allChats[chatId].title = newTitle;
                await window.StorageController.saveChat(window.allChats[chatId]);
                if (window.currentChatId === chatId) {
                    window.updateChatTitleDisplay(newTitle);
                    window.allChats[chatId].titleFeedback = null;
                    window.updateTitleFeedbackUI(chatId);
                }
                window.renderHistory();
            }
        }
    } catch (e) {
        console.error("Failed to generate title", e);
    } finally {
        delete window[`_generatingTitle_${chatId}`];
    }
};
```

Behavioral notes for the implementer:
- The cleanup regexes in `cleanChatTitle` are MOVED verbatim from the old function — do not retype them differently.
- The old function applied the title whenever non-empty; the new one applies when non-empty AND non-meta (meta + failed retry = keep old title).
- `window._requestChatTitle` and `window.cleanChatTitle` are `window.`-scoped because this repo's split files share globals via `window.*` (follow that pattern); `TITLE_META_RE`/`TITLE_SYSTEM_PROMPT` stay module-const at the top of the function's old location.

- [ ] **Step 2: Syntax + guard unit check**

Run: `node --check AI/js/chat-management.js` → exit 0.

Then create `/tmp/title-guard-check.mjs`:

```js
// Unit-checks the title guard + cleanup without a browser.
import { readFileSync } from 'node:fs';
const src = readFileSync('/Users/ar12c/Desktop/web/AI/js/chat-management.js', 'utf8');

const reSrc = src.match(/const TITLE_META_RE = ([^;]+);/);
if (!reSrc) { console.error('FAIL: TITLE_META_RE not found'); process.exit(1); }
const TITLE_META_RE = eval(reSrc[1]);

const cleanSrc = src.match(/window\.cleanChatTitle = \((?:[\s\S]*?)\n\};/);
if (!cleanSrc) { console.error('FAIL: cleanChatTitle not found'); process.exit(1); }
const window = {};
eval(cleanSrc[0]);

const metaCases = [
  'The user is initiating a casual conversation, likely seeking interaction',
  'The user asked about Flask routing',
  'This conversation is about Mars stories',
  'In this chat, the user learns python',
];
for (const t of metaCases) {
  if (!TITLE_META_RE.test(t)) { console.error('FAIL: meta title not caught:', t); process.exit(1); }
}
const goodCases = [
  'oh, just saying hi',
  'a flask 404 on the api route',
  'user stories for the login page',   // legit title starting with "user"
  'centering a div, finally',
];
for (const t of goodCases) {
  if (TITLE_META_RE.test(t)) { console.error('FAIL: false positive on:', t); process.exit(1); }
}
if (window.cleanChatTitle('"oh, just saying hi."\n') !== 'oh, just saying hi') {
  console.error('FAIL: cleanup did not strip quotes/period'); process.exit(1);
}
console.log('PASS: meta guard catches 4/4 meta, 0 false positives, cleanup works');
```

Run: `node /tmp/title-guard-check.mjs` → expect PASS.

- [ ] **Step 3: Live-fire real titles through the tunnel**

Create `/tmp/title-live-check.mjs`:

```js
// Generates real titles via the tunnel with the NEW prompt and prints them.
import { readFileSync } from 'node:fs';
const src = readFileSync('/Users/ar12c/Desktop/web/AI/js/chat-management.js', 'utf8');
const sys = src.match(/const TITLE_SYSTEM_PROMPT = `([\s\S]*?)`;\n\nwindow\.cleanChatTitle/);
if (!sys) { console.error('FAIL: TITLE_SYSTEM_PROMPT not found'); process.exit(1); }
const prompt = sys[1];

const cases = [
  ['hai', 'Hey there! 😊 How are you doing today?'],
  ['my flask route keeps 404ing', 'A 404 means Flask matched no route. Check the decorator path and methods…'],
  ['write a sci-fi story about mars', 'The red dust settled over New Shanghai Dome as…'],
  ['what causes iron deficiency anemia', 'Iron deficiency anemia usually comes from blood loss, low intake…'],
  ['how do I center a div', 'Use flexbox: display:flex; justify-content:center; align-items:center…'],
];
for (const [userMsg, aiMsg] of cases) {
  const res = await fetch('https://api.okemovail.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'saga-0.7b',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `User: "${userMsg}"\nAssistant: "${aiMsg}"` },
      ],
      temperature: 0.3, max_tokens: 60, stream: false,
    }),
  });
  const data = await res.json();
  console.log(JSON.stringify(userMsg), '→', JSON.stringify(data.choices[0].message.content.trim()));
}
```

Run: `node /tmp/title-live-check.mjs` (backend + tunnel must be up — check `curl -s -m 5 https://api.okemovail.com/health` first)
Expected: five Saga-voice topic lines (dry/lowercase/topical); NONE starting with "The user" / "This conversation". If one slips into meta, that is exactly what the shipped guard+retry handles — note it, don't iterate the prompt further.

- [ ] **Step 4: Commit**

```bash
git add AI/js/chat-management.js
git commit -m "feat(chat): saga-voice titles — topic-line prompt with meta guard + retry"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** new prompt (Step 1 `TITLE_SYSTEM_PROMPT`, verbatim from spec), guard regex + retry + keep-fallback (Step 1), untouched surfaces listed in spec §3 are not in the diff's scope, testing per spec §Testing (Steps 2–3).
- **Type/name consistency:** `cleanChatTitle`/`_requestChatTitle`/`TITLE_META_RE`/`TITLE_SYSTEM_PROMPT` defined and used under those exact names throughout; `generateChatTitle(chatId, userMsg, aiMsg, force)` signature unchanged (regen button unaffected).
- **Placeholder scan:** none — complete code in every step.
