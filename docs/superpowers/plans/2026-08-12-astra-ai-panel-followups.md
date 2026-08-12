# Astra v2.2 — Branded Shimmer, Follow-up Thread, AI Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the AI panel's shimmer to brand colors that fade away on completion, add an inline follow-up thread to the panel, and add a persisted AI on/off toggle.

**Architecture:** All changes in `search/index.html` (CSS + a little panel markup) and `search/astra.js` (thread state, toggle state, follow-up streaming reusing the existing SSE helper shape). No backend changes. Spec: `docs/superpowers/specs/2026-08-12-astra-ai-panel-followups-design.md`.

**Tech Stack:** vanilla CSS/JS, single IIFE, `marked` CDN. No frontend test infra — manual checklist; backend suite (36 tests) untouched.

---

### Task 1: Branded shimmer + done-fade (CSS only)

**Files:**
- Modify: `search/index.html` (inline `<style>`)

- [ ] **Step 1: Brand the spinning border**

Find the `.ai-panel` rule:

```css
  .ai-panel { margin: 0 0 22px; border-radius: 18px; border: 1.5px solid transparent; background: linear-gradient(var(--bg-white), var(--bg-white)) padding-box, conic-gradient(from var(--rb, 0deg), #ff5f6d, #ffc371, #f0e05a, #5fdc7d, #5aa7ff, #b06bff, #ff5f6d) border-box; animation: rb-spin 6s linear infinite; overflow: hidden; }
```

Replace with (brand gradient + a border-color transition for the done-fade):

```css
  .ai-panel { margin: 0 0 22px; border-radius: 18px; border: 1.5px solid transparent; background: linear-gradient(var(--bg-white), var(--bg-white)) padding-box, conic-gradient(from var(--rb, 0deg), var(--accent), #f0c27b, var(--accent-light), #f0c27b, var(--accent)) border-box; animation: rb-spin 6s linear infinite; overflow: hidden; transition: border-color .6s ease; }
```

- [ ] **Step 2: Fade to a hairline when done**

Immediately after the `.ai-panel` rule, add:

```css
  /* done: shimmer settles to a plain hairline */
  .ai-panel.done { border-color: var(--border-strong); background: var(--bg-white); animation: none; }
```

- [ ] **Step 3: Reduced-motion covers the transition too**

In the `@media (prefers-reduced-motion: reduce)` block, change:

```css
    .ai-wave, .ai-panel.done .ai-wave { transition: none; }
```

to:

```css
    .ai-wave, .ai-panel, .ai-panel.done .ai-wave { transition: none; }
```

(The `@supports not (conic-gradient from var())` fallback already sets a flat border — it stays as the no-animation fallback and the `.done` rule harmonizes with it.)

- [ ] **Step 4: Verify + commit**

Visual check (any width): during a search the panel border spins in rosewood/gold; when the answer finishes it fades to the plain hairline. Then:

```bash
git add search/index.html
git commit -m "feat(astra): brand-colored AI shimmer that settles when done"
```

---

### Task 2: Follow-up thread + AI toggle (`astra.js` + panel markup)

**Files:**
- Modify: `search/index.html` (panel footer markup + meta-row toggle markup + small CSS)
- Modify: `search/astra.js` (thread state, follow-up streaming, toggle persistence)

**Markup changes (`search/index.html`):**

- [ ] **Step 1: Panel footer + meta toggle**

In the `#ai-panel` section, after `<div class="ai-error" id="ai-error" hidden></div>`, add the follow-up row:

```html
    <div class="ai-follow" id="ai-follow" hidden>
      <input id="ai-follow-input" type="text" autocomplete="off" spellcheck="false" aria-label="Ask a follow-up" placeholder="ask more…">
      <button class="skuo skuo-accent" id="ai-follow-send" aria-label="ask follow-up">→</button>
    </div>
```

Change the meta row in the results view from `<p class="r-meta" id="r-meta"></p>` to:

```html
  <div class="r-meta-row">
    <p class="r-meta" id="r-meta"></p>
    <button class="skuo skuo-icon" id="ai-toggle" aria-pressed="true" aria-label="toggle AI answer">✦ AI</button>
  </div>
```

**CSS additions (`search/index.html` inline `<style>`, append near the AI panel rules):**

```css
  /* meta row + AI toggle */
  .r-meta-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; max-width: 640px; }
  .r-meta-row .r-meta { margin: 0 4px 14px; }
  #ai-toggle { height: 26px; padding: 0 12px; border-radius: 999px; font-size: .72rem; margin-bottom: 14px; }
  #ai-toggle[aria-pressed="false"] { opacity: .55; filter: saturate(0); }

  /* follow-up row + thread */
  .ai-follow { display: flex; gap: 6px; padding: 0 12px 12px; }
  .ai-follow input { flex: 1; min-width: 0; height: 32px; border-radius: 999px; padding: 0 12px; font-size: .82rem; }
  .ai-follow .skuo { height: 32px; width: 32px; padding: 0; border-radius: 50%; flex: none; }
  .ai-q { margin: 10px 0 2px; font-size: .82rem; font-style: italic; color: var(--text-tertiary); }
  .ai-q::before { content: 'you ✦ '; color: var(--accent); font-style: normal; }
  @media (prefers-reduced-motion: reduce) { .ai-follow { transition: none; } }
```

Note: `.r-meta` currently matches the desktop rail rule `.r-meta, .ai-panel, #result-list { max-width: 640px; }` — after this markup change the RAIL rule must target `.r-meta-row` instead of `.r-meta`. Change that rule to:

```css
  .r-meta-row, .ai-panel, #result-list { max-width: 640px; }
```

and in the `@media (max-width: 768px)` block change `.r-meta, .ai-panel, #result-list { max-width: none; }` to `.r-meta-row, .ai-panel, #result-list { max-width: none; }`, and the mobile `.r-meta { margin: 0 16px 12px; }` to `.r-meta-row { margin: 0 16px 12px; }` with `.r-meta-row .r-meta { margin: 0; }` added beside it.

**JS changes (`search/astra.js`):**

- [ ] **Step 2: AI mode state + toggle wiring**

Add after the `const $ = …` helper:

```js
  // ── AI mode toggle (persisted; default on) ──
  function getAiMode() { try { return localStorage.getItem('astra_ai_mode') !== 'off'; } catch (_) { return true; } }
  function setAiMode(on) {
    try { localStorage.setItem('astra_ai_mode', on ? 'on' : 'off'); } catch (_) {}
    const t = $('ai-toggle');
    t.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!on && aiAbort) aiAbort.abort();
  }
```

In the boot section (after the `wireBar` calls), add:

```js
  setAiMode(getAiMode());   // paint the persisted state
  $('ai-toggle').addEventListener('click', () => {
    const on = !getAiMode();
    setAiMode(on);
    const { q } = readRoute();
    if (on && q) runSearch(q);            // toggling on from results answers immediately
    if (!on) $('ai-panel').hidden = true; // toggling off hides the panel
  });
```

- [ ] **Step 3: Gate `runSearch`'s AI behavior on the toggle**

In `runSearch`, replace the panel-setup block:

```js
    const panel = $('ai-panel');
    panel.hidden = false;                       // panel shows immediately — always-on AI
    panel.classList.remove('done');
```

with:

```js
    const panel = $('ai-panel');
    const aiOn = getAiMode();
    panel.hidden = !aiOn;                       // AI mode off → results-only page
    panel.classList.remove('done');
```

and replace the tail:

```js
    if (results.length) renderResults(results);
    else statusCard('🌌', COPY.emptyResults);   // AI still answers from knowledge

    askAstra(q, results);
```

with:

```js
    if (results.length) renderResults(results);
    else statusCard('🌌', COPY.emptyResults);   // AI still answers from knowledge

    if (aiOn) askAstra(q, results);
```

(The 429/502 error path already hides the panel and returns early — no change needed there.)

- [ ] **Step 4: Thread state + follow-up streaming**

Refactor `askAstra` to be thread-aware. Replace the whole `askAstra` function AND add the follow-up machinery:

```js
  // ── follow-up thread state (reset on every new search) ──
  let thread = [];           // alternating {role, content} pairs after the seed
  let threadQuery = '';      // the query this thread belongs to
  let threadResults = [];    // grounding sources for this thread

  function seedThread(q, results) {
    threadQuery = q;
    threadResults = results;
    const snippets = results.slice(0, 5)
      .map((r, i) => '[' + (i + 1) + '] ' + (r.title || '') + ' — ' + (r.description || '') + ' (' + r.url + ')')
      .join('\n');
    thread = [{ role: 'user', content: q + '\n\nSources:\n' + (snippets || '(no sources — answer from knowledge)') }];
  }

  // streams one assistant turn; onToken(text) renders incrementally, returns full text
  async function streamTurn(onToken) {
    if (aiAbort) aiAbort.abort();
    aiAbort = new AbortController();
    const res = await fetch(backendBase() + '/v1/chat/completions', {
      method: 'POST',
      signal: aiAbort.signal,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'bypass-tunnel-reminder': 'true',
      },
      body: JSON.stringify({
        model: 'saga-0.7b',
        stream: true,
        web_search: false,
        use_thought: false,
        max_tokens: 1024,
        messages: [{ role: 'system', content: COPY.aiSystem }, ...thread],
      }),
    });
    if (!res.ok) throw new Error('backend ' + res.status);

    // SSE consumption — same line protocol as AI/js/chat-actions.js
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', text = '', firstToken = false, sawDone = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const clean = line.trim();
        if (!clean.startsWith('data: ')) continue;
        const dataStr = clean.substring(6).trim();
        if (dataStr === '[DONE]') { sawDone = true; break; }
        try {
          const data = JSON.parse(dataStr);
          const delta = data.choices && data.choices[0] && data.choices[0].delta
            ? (data.choices[0].delta.content || '') : '';
          if (delta) {
            if (!firstToken) { firstToken = true; $('ai-wave-label').textContent = '✦ streaming from the stars…'; }
            text += delta;
            onToken(text);
          }
        } catch { /* partial JSON chunk — ignore */ }
      }
      if (sawDone) break;
    }
    return text;
  }

  async function askAstra(q, results) {
    seedThread(q, results);
    const panel = $('ai-panel');
    panel.hidden = false;
    panel.classList.remove('done');
    $('ai-head').textContent = COPY.aiHeaders[Math.floor(Math.random() * COPY.aiHeaders.length)];
    $('ai-body').innerHTML = '';
    $('ai-error').hidden = true;
    $('ai-follow').hidden = true;               // appears when the answer lands
    const quipTimer = startWaveQuips();

    try {
      const text = await streamTurn((t) => {
        clearInterval(quipTimer);
        $('ai-body').innerHTML = linkifyCitations(marked.parse(t.replace(/&/g, '&amp;').replace(/</g, '&lt;')), results.length);
      });
      clearInterval(quipTimer);
      thread.push({ role: 'assistant', content: text });
      if (!text.trim()) $('ai-body').textContent = '✦ the cosmos answered with silence — try rephrasing?';
      panel.classList.add('done');              // wave collapses + shimmer settles
      $('ai-follow').hidden = false;            // click to ask more
      $('ai-follow-input').focus({ preventScroll: true });
    } catch (e) {
      clearInterval(quipTimer);
      if (e.name === 'AbortError') return;      // superseded by a newer search / toggle off
      panel.classList.add('done');
      showAiError(() => askAstra(q, results));
    }
  }

  function showAiError(retryFn) {
    const err = $('ai-error');
    err.hidden = false;
    err.textContent = '✦ ' + COPY.aiDown + ' ';
    const btn = document.createElement('button');
    btn.className = 'skuo skuo-neutral';
    btn.textContent = 'retry';
    btn.addEventListener('click', retryFn);
    err.appendChild(btn);
  }

  async function askFollowUp(question) {
    const panel = $('ai-panel');
    const input = $('ai-follow-input');
    const send = $('ai-follow-send');
    thread.push({ role: 'user', content: question });

    const qEl = document.createElement('p');    // the user's turn, in the thread
    qEl.className = 'ai-q';
    qEl.textContent = question;
    const aEl = document.createElement('div');  // the streaming answer under it
    aEl.className = 'ai-thread-a';
    $('ai-body').append(qEl, aEl);

    panel.classList.remove('done');             // shimmer spins again while answering
    $('ai-error').hidden = true;
    input.disabled = true; send.disabled = true;
    const quipTimer = startWaveQuips();

    try {
      const text = await streamTurn((t) => {
        clearInterval(quipTimer);
        aEl.innerHTML = linkifyCitations(marked.parse(t.replace(/&/g, '&amp;').replace(/</g, '&lt;')), threadResults.length);
      });
      clearInterval(quipTimer);
      thread.push({ role: 'assistant', content: text });
      if (!text.trim()) aEl.textContent = '✦ silence. rude, but on brand.';
      panel.classList.add('done');
    } catch (e) {
      clearInterval(quipTimer);
      if (e.name === 'AbortError') return;
      thread.pop();                             // don't keep an unanswered question in context
      qEl.remove(); aEl.remove();
      panel.classList.add('done');
      showAiError(() => askFollowUp(question));
    } finally {
      input.disabled = false; send.disabled = false;
      input.focus({ preventScroll: true });
    }
  }
```

And wire the follow-up row in the boot section:

```js
  const followGo = () => {
    const q = $('ai-follow-input').value.trim();
    if (!q || !thread.length) return;
    $('ai-follow-input').value = '';
    askFollowUp(q);
  };
  $('ai-follow-send').addEventListener('click', followGo);
  $('ai-follow-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') followGo(); });
```

- [ ] **Step 5: Delete the old inlined SSE code**

Confirm the old `askAstra` body (with its own fetch/SSE loop and inline error-button code) is fully replaced by the above — no duplicate `streamTurn` logic left inline, no orphaned `snippets` variable. `node --check search/astra.js` must pass.

- [ ] **Step 6: ID cross-check**

Every new `$('…')` id (`ai-toggle`, `ai-follow`, `ai-follow-input`, `ai-follow-send`) must exist in the HTML. List and verify.

- [ ] **Step 7: Manual verification**

With the backend running (`./backend/run.sh`, `localStorage.vail_custom_backend_url='http://127.0.0.1:8001'`):

1. Search: brand shimmer spins → answer streams → shimmer settles to hairline → follow-up row fades in.
2. Follow-up "and why is that?" → streams inline under a `you ✦` marker; has context of the original query; citations still linkify.
3. New search → thread resets (follow-up row hides until the new answer lands).
4. Toggle `✦ AI` off → panel hides; reload → still off; toggle on from a results page → answer streams immediately.
5. 375px width: follow-up row usable, toggle doesn't crowd the meta line.
6. Dark mode + reduced motion (border never spins, no settle transition).

- [ ] **Step 8: Backend suite + commit**

```bash
cd backend && .venv/bin/python -m pytest tests/ -q   # expect 36 passed (untouched)
cd ..
git add search/index.html search/astra.js
git diff --cached   # verify only intended hunks
git commit -m "feat(astra): follow-up thread + persisted AI on/off toggle"
```

---

### Task 3: CLAUDE.md clause + final sweep

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Astra bullet**

In CLAUDE.md's `search/index.html` bullet, find:

```
Layout modes split at 768px (v2.1): Google-classic left-rail results on desktop, full-bleed divided result rows + compact top bar on mobile.
```

replace with:

```
Layout modes split at 768px (v2.1): Google-classic left-rail results on desktop, full-bleed divided result rows + compact top bar on mobile. AI panel (v2.2): brand-colored conic shimmer that settles to a hairline on completion, inline follow-up thread (full thread context re-sent, sources stay the original top-5), and a persisted on/off toggle (`localStorage.astra_ai_mode`, default on; NOT a cookie — site convention is localStorage).
```

Also add to the localStorage keys table (after the `vail_theme` row):

```
| `astra_ai_mode` | `'on'`/`'off'` — Astra AI answer panel visibility (default on) |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git diff --cached   # only the Astra bullet + table row
git commit -m "docs: CLAUDE.md — Astra v2.2 (follow-ups, AI toggle, branded shimmer)"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** shimmer brand + fade (Task 1), follow-up thread with full context + reset + abort + disabled-mid-stream (Task 2 Steps 4–6), toggle persisted + all four toggle transitions (Task 2 Steps 2–3), citations in follow-ups (linkify against `threadResults.length`), CLAUDE.md (Task 3).
- **Type/ID consistency:** `getAiMode`/`setAiMode`/`seedThread`/`streamTurn`/`showAiError`/`askFollowUp`/`thread`/`threadQuery`/`threadResults` defined once and used identically; new DOM ids (`ai-toggle`, `ai-follow`, `ai-follow-input`, `ai-follow-send`, `r-meta-row` class) match between HTML, CSS, and JS; the desktop rail rule retargets `.r-meta-row` (both the base 640px rule and the mobile `max-width: none` override are updated — leaving either on `.r-meta` would break the geometry).
- **`threadQuery` caveat:** stored for potential display/future use; harmless if unused (documented as thread ownership marker).
- **No placeholders:** every code block above is complete and runnable; the only non-code steps are the manual checklists (repo has no frontend test infra).
- **Wave during follow-ups:** the wave label element is hidden in `.done` and re-shown when `.done` is removed (existing CSS) — follow-up streaming re-uses that correctly; `ai-body` is NOT cleared between turns, so the thread accumulates.
