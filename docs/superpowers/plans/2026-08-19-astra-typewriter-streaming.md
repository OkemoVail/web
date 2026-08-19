# Astra Typewriter Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Astra AI panel's gradient-shimmer thinking line and chunk-burst stream rendering with a crisp character-by-character typewriter reveal.

**Architecture:** Pure CSS deletions in `src/site.css` (`[data-page="search"]` section) plus one new self-contained helper `makeTypewriter(renderFn)` in `search/astra.js`, wired into both stream call sites (`askAstra`, `askFollowUp`). `makeStreamRenderer` is reused unchanged — only the cadence at which it receives text changes. The rainbow conic ring, orb pulse, and all other panel behavior are untouched.

**Tech Stack:** Vanilla JS (IIFE, no modules), CSS. No build step.

**Testing note:** Per CLAUDE.md this frontend has no test suite ("No bundler, no test suite"); the direct precedent (2026-08-11 adaptive-typewriter for chat) shipped with manual verification. Verification here is manual with the local backend + grep sweeps with exact expected outputs.

**Spec:** `docs/superpowers/specs/2026-08-19-astra-typewriter-streaming-design.md`

**Working-tree warning:** `search/astra.js`, `src/site.css`, and `CLAUDE.md` contain *pre-existing uncommitted work* (the 2026-08-14 stream-materialization feature this plan builds on). Task 0 commits that work separately so the later task commits are clean. Do NOT sweep Task 0's files into later commits.

---

### Task 0: Commit the pre-existing materialization work

**Files:**
- Pre-modified (not by this plan): `search/astra.js`, `src/site.css`, `CLAUDE.md`

- [ ] **Step 1: Review what is already in the tree**

Run: `git status --short && git diff --stat`
Expected: `M CLAUDE.md`, `M search/astra.js`, `M src/site.css` (the materialization feature), plus nothing else unstaged.

- [ ] **Step 2: Commit it as its own commit**

```bash
git add search/astra.js src/site.css CLAUDE.md
git commit -m "feat(astra): apple-intelligence-style stream materialization (baked blocks + tail pop/breathe)"
```

(If `git diff` shows the working tree has drifted from what this plan quotes below, stop and re-read the affected files — the plan's old-strings must match reality.)

---

### Task 1: CSS — plain thinking line, retire tail pop/breathe

**Files:**
- Modify: `src/site.css` (`[data-page="search"]` section, ~lines 6096-6112 and the reduced-motion block ~6230-6242)

- [ ] **Step 1: Replace the thinking-line rule (kills the gradient shimmer)**

Find (exact, in `src/site.css`):

```css
  /* thinking row: pulsing orb + shimmer-sweep line (chatgpt 'thinking…' grammar) */
  [data-page="search"] .ai-thinking { display: flex; align-items: center; gap: 9px; padding: 10px 2px; }
  [data-page="search"] .ai-orb { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); animation: orb-pulse 1.2s ease-in-out infinite; flex: none; }
  @keyframes orb-pulse { 0%,100% { transform: scale(.7); opacity: .45; } 50% { transform: scale(1.15); opacity: 1; } }
  [data-page="search"] .ai-thinking-line { font-size: .84rem; background: linear-gradient(90deg, var(--text-tertiary) 20%, var(--text-primary) 50%, var(--text-tertiary) 80%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: line-shimmer 1.6s linear infinite; }
  @keyframes line-shimmer { to { background-position: -200% 0; } }
```

Replace with:

```css
  /* thinking row: pulsing orb + plain quip line (chatgpt 'thinking…' grammar) */
  [data-page="search"] .ai-thinking { display: flex; align-items: center; gap: 9px; padding: 10px 2px; }
  [data-page="search"] .ai-orb { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); animation: orb-pulse 1.2s ease-in-out infinite; flex: none; }
  @keyframes orb-pulse { 0%,100% { transform: scale(.7); opacity: .45; } 50% { transform: scale(1.15); opacity: 1; } }
  [data-page="search"] .ai-thinking-line { font-size: .84rem; color: var(--text-tertiary); }
```

- [ ] **Step 2: Retire the tail pop/breathe animations**

Find (exact):

```css
  /* streaming text materializes apple-intelligence style: the open block lives in one persistent
     .ai-tail div (astra.js only swaps its innerHTML, so these animations never restart mid-stream) —
     it pops in, then breathes a soft unblur until the block bakes to crisp static nodes. The rainbow
     conic border on .ai-panel carries the color while generating; the text itself stays readable. */
  [data-page="search"] .ai-panel:not(.done) .ai-tail { animation: astra-tail-pop .45s var(--ease-soft) backwards, astra-tail-breathe 1.2s ease-in-out .5s infinite; }
  @keyframes astra-tail-pop { from { opacity: 0; transform: translateY(6px); filter: blur(8px); } to { opacity: 1; transform: none; filter: blur(0); } }
  @keyframes astra-tail-breathe { 0%,100% { opacity: 1; filter: blur(0); } 50% { opacity: .8; filter: blur(1.6px); } }
```

Replace with:

```css
  /* streaming text: the open block lives in one persistent .ai-tail div (astra.js only swaps its
     innerHTML) and the typewriter drain in astra.js is the animation — text stays crisp. The rainbow
     conic border on .ai-panel carries the color while generating. */
```

- [ ] **Step 3: Clean the reduced-motion kill list**

Find (exact — note the odd indentation is real):

```css
    [data-page="search"] .star,
[data-page="search"] .ai-ring,
[data-page="search"] .ai-panel::before,
[data-page="search"] .ai-tail,
[data-page="search"] .r-sentinel-dot,
```

Replace with:

```css
    [data-page="search"] .star,
[data-page="search"] .ai-ring,
[data-page="search"] .ai-panel::before,
[data-page="search"] .r-sentinel-dot,
```

Then find (exact):

```css
    [data-page="search"] .ai-orb { animation: none; }
    [data-page="search"] .ai-thinking-line { animation: none; background: none; color: var(--text-tertiary); }
    [data-page="search"] .ai-panel { transition: none; }
```

Replace with:

```css
    [data-page="search"] .ai-orb { animation: none; }
    [data-page="search"] .ai-panel { transition: none; }
```

- [ ] **Step 4: Verify no stragglers**

Run: `grep -n 'line-shimmer\|astra-tail-pop\|astra-tail-breathe' src/site.css`
Expected: no output (exit 1).

- [ ] **Step 5: Commit**

```bash
git add src/site.css
git commit -m "feat(astra): plain thinking line + retire tail pop/breathe ahead of typewriter"
```

---

### Task 2: JS — `makeTypewriter` helper + wire both call sites

**Files:**
- Modify: `search/astra.js` (helper after `makeStreamRenderer` ~line 704; `askAstra` ~lines 860-886; `askFollowUp` ~lines 923-957)

- [ ] **Step 1: Add the helper**

In `search/astra.js`, immediately AFTER the closing `}` of `makeStreamRenderer` (the line before `  function setStreaming(on) {`), insert:

```js
  // ── typewriter drain: sse deltas queue up and a 50 ms interval reveals them
  // char-by-char (chat's cadence: 4 chars/tick baseline, backlog-aware catch-up
  // capped at 50/tick) — the typing itself is the animation, text stays crisp.
  // Bails to instant render under prefers-reduced-motion / navigator.webdriver
  // (snapshot-harness determinism invariant, see CLAUDE.md motion system).
  function makeTypewriter(renderFn) {
    const INSTANT = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || navigator.webdriver;
    let received = '', revealed = 0, acc = 0, timer = null, doneResolve = null;
    const tick = () => {
      const backlog = received.length - revealed;
      if (backlog > 0) {
        acc = Math.min(acc + Math.min(Math.max(4, backlog / 6), 50), backlog);
        const take = Math.floor(acc);
        revealed += take;
        acc -= take;
        renderFn(received.slice(0, revealed));
      }
      if (revealed >= received.length) {              // caught up: go idle (push restarts)
        clearInterval(timer); timer = null;
        if (doneResolve) { const r = doneResolve; doneResolve = null; r(); }
      }
    };
    return {
      push(fullText) {                                // called per SSE delta with full text so far
        received = fullText;
        if (INSTANT) { revealed = received.length; renderFn(received); return; }
        if (!timer) timer = setInterval(tick, 50);
      },
      finish() {                                      // resolves once the queue has played out
        if (INSTANT || revealed >= received.length) return Promise.resolve();
        return new Promise((res) => { doneResolve = res; });
      },
      halt() {                                        // stop typing now; returns what was revealed
        if (timer) { clearInterval(timer); timer = null; }
        doneResolve = null;
        return received.slice(0, revealed);
      },
    };
  }

```

(Note: `take` is always ≥ 1 when `backlog > 0` — `acc` enters each tick < 1, the increment is ≥ 4, and `min(…, backlog)` means `acc = backlog ≥ 1` for short backlogs — so no zero-take guard is needed.)

- [ ] **Step 2: Wire `askAstra`**

Find (exact):

```js
    const myToken = searchToken;
    let partial = '';

    const renderStream = makeStreamRenderer(aEl, results.length);
    try {
      const text = await streamTurn((t) => {
        partial = t;
        renderStream(t);
      });
      thread.push({ role: 'assistant', content: text });
      if (!text.trim()) aEl.textContent = '✦ the cosmos answered with silence — try rephrasing?';
      else renderStream.finalize(text);             // one crisp full parse, tail gone
      panel.classList.add('done');                  // shimmer settles
    } catch (e) {
      if (e.name === 'AbortError') {
        if (aiStopRequested && partial) {           // user hit stop — keep what streamed
          thread.push({ role: 'assistant', content: partial });
          panel.classList.add('done');
        }
        return;                                     // superseded / toggled off / stopped
      }
```

Replace with:

```js
    const myToken = searchToken;

    const renderStream = makeStreamRenderer(aEl, results.length);
    const typer = makeTypewriter(renderStream);
    try {
      const text = await streamTurn((t) => typer.push(t));
      await typer.finish();                         // let the typewriter play out — no slam
      thread.push({ role: 'assistant', content: text });
      if (!text.trim()) aEl.textContent = '✦ the cosmos answered with silence — try rephrasing?';
      else renderStream.finalize(text);             // one crisp full parse, tail gone
      panel.classList.add('done');                  // shimmer settles
    } catch (e) {
      const kept = typer.halt();                    // stop the typewriter whatever happened
      if (e.name === 'AbortError') {
        if (aiStopRequested && kept) {              // user hit stop — keep what streamed
          thread.push({ role: 'assistant', content: kept });
          panel.classList.add('done');
        }
        return;                                     // superseded / toggled off / stopped
      }
```

- [ ] **Step 3: Wire `askFollowUp`**

Find (exact):

```js
    const myToken = searchToken;
    let partial = '';

    const renderStream = makeStreamRenderer(aEl, threadResults.length);
    try {
      const text = await streamTurn((t) => {
        partial = t;
        renderStream(t);
      });
      thread.push({ role: 'assistant', content: text });
      if (!text.trim()) aEl.textContent = '✦ silence. rude, but on brand.';
      else renderStream.finalize(text);
      panel.classList.add('done');
    } catch (e) {
      if (e.name === 'AbortError') {
        if (aiStopRequested && partial) {
          thread.push({ role: 'assistant', content: partial });
          panel.classList.add('done');
        } else if (aiStopRequested) {
          thread.pop();                             // stopped before anything streamed
          qEl.remove(); aEl.remove();
        }
        return;
      }
```

Replace with:

```js
    const myToken = searchToken;

    const renderStream = makeStreamRenderer(aEl, threadResults.length);
    const typer = makeTypewriter(renderStream);
    try {
      const text = await streamTurn((t) => typer.push(t));
      await typer.finish();                         // let the typewriter play out — no slam
      thread.push({ role: 'assistant', content: text });
      if (!text.trim()) aEl.textContent = '✦ silence. rude, but on brand.';
      else renderStream.finalize(text);
      panel.classList.add('done');
    } catch (e) {
      const kept = typer.halt();                    // stop the typewriter whatever happened
      if (e.name === 'AbortError') {
        if (aiStopRequested && kept) {
          thread.push({ role: 'assistant', content: kept });
          panel.classList.add('done');
        } else if (aiStopRequested) {
          thread.pop();                             // stopped before anything streamed
          qEl.remove(); aEl.remove();
        }
        return;
      }
```

(`partial` is fully gone from both functions — `kept` is the revealed text, which is what the user actually saw. The non-abort error branches and `finally` blocks are unchanged.)

- [ ] **Step 4: Syntax check**

Run: `node --check search/astra.js`
Expected: no output (exit 0).

- [ ] **Step 5: Verify no `partial` stragglers in the two functions**

Run: `grep -n 'partial' search/astra.js`
Expected: no output (exit 1). (If any match remains, it is outside `askAstra`/`askFollowUp` — read the surrounding lines before touching it.)

- [ ] **Step 6: Commit**

```bash
git add search/astra.js
git commit -m "feat(astra): typewriter drain for streamed answers (makeTypewriter)"
```

---

### Task 3: Docs — code comment + CLAUDE.md

**Files:**
- Modify: `search/astra.js` (comment above `makeStreamRenderer`, ~lines 672-676)
- Modify: `CLAUDE.md` (the Astra paragraph, one long line ~line 126)

- [ ] **Step 1: Update the `makeStreamRenderer` header comment**

Find (exact):

```js
  // ── streaming renderer: apple-intelligence-style materialization ──
  // Completed blocks (blank-line separated) bake to crisp static nodes; the open
  // block lives in one persistent .ai-tail div whose CSS animation (pop + unblur
  // breathe) survives innerHTML swaps because the div itself is never recreated.
  // Call render.finalize(text) at completion for one crisp full-parse render.
```

Replace with:

```js
  // ── streaming renderer ──
  // Completed blocks (blank-line separated) bake to crisp static nodes; the open
  // block lives in one persistent .ai-tail div whose innerHTML is swapped by the
  // typewriter drain (makeTypewriter) — the typing cadence is the animation.
  // Call render.finalize(text) at completion for one crisp full-parse render.
```

- [ ] **Step 2: Update CLAUDE.md — thinking-row phrase**

In the long Astra bullet (line ~126), find (exact substring):

```
and a "thinking row" (pulsing orb + shimmer-sweep line) shows a model-generated one-line quip
```

Replace with:

```
and a "thinking row" (pulsing orb + plain quip line) shows a model-generated one-line quip
```

- [ ] **Step 3: Update CLAUDE.md — materialization sentence**

Find (exact substring — one continuous stretch of that same long line):

```
Streaming text materializes Apple-Intelligence style (2026-08-14, REPLACED an earlier gradient+glow-on-text attempt — gradient `background-clip: text` kept painting as a solid block on WebKit/iOS, and a whole answer of gradient text read as a block even when it worked): text is plain readable `--text-primary` while the spinning rainbow conic ring carries the color; the ring is an `.ai-panel::before` conic layer covered by an opaque `.ai-panel::after` at `inset: 1.5px` (children are `z-index: 1`) — do NOT bring back the old "solid padding-box over conic border-box" background trick: on WebKit the spinning `--rb` custom property stopped the solid layer from painting and the whole panel filled with gradient (the "big gradient block" bug, fixed 2026-08-16); the open markdown block lives in one persistent `.ai-tail` div (`makeStreamRenderer` in `astra.js` bakes completed `\n\n`-separated blocks to crisp static nodes — with a fence-parity guard so code blocks never split — and only swaps the tail's innerHTML, so the CSS `astra-tail-pop` + `astra-tail-breathe` unblur animations never restart mid-stream); `render.finalize(text)` does one crisp full parse on completion and `.done` (success/error/abort) kills the animation. `.ai-tail` is in the reduced-motion kill list.
```

Replace with (the WebKit ring warning is deliberately preserved verbatim):

```
Streaming text reveals typewriter-style (2026-08-19, replacing the 2026-08-14 pop/blur-breathe materialization, which itself replaced an earlier gradient+glow-on-text attempt): SSE deltas queue in `makeTypewriter` (`astra.js`) and a 50 ms interval reveals ~4 chars/tick (backlog-aware catch-up, capped 50/tick) through `makeStreamRenderer`; text is plain readable `--text-primary` while the spinning rainbow conic ring carries the color; the ring is an `.ai-panel::before` conic layer covered by an opaque `.ai-panel::after` at `inset: 1.5px` (children are `z-index: 1`) — do NOT bring back the old "solid padding-box over conic border-box" background trick: on WebKit the spinning `--rb` custom property stopped the solid layer from painting and the whole panel filled with gradient (the "big gradient block" bug, fixed 2026-08-16); the open markdown block lives in one persistent `.ai-tail` div (`makeStreamRenderer` bakes completed `\n\n`-separated blocks to crisp static nodes — with a fence-parity guard so code blocks never split — and only swaps the tail's innerHTML); after the stream ends the typewriter drains fully, then `render.finalize(text)` does one crisp full parse and `.done` settles the ring. The typewriter bails to instant render under `prefers-reduced-motion` AND `navigator.webdriver`.
```

- [ ] **Step 4: Verify the doc edits landed**

Run: `grep -o 'makeTypewriter' CLAUDE.md | wc -l`
Expected: `1`

Run: `grep -o 'shimmer-sweep\|materializes Apple\|astra-tail' CLAUDE.md | wc -l`
Expected: `0`

- [ ] **Step 5: Syntax check astra.js again**

Run: `node --check search/astra.js`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add search/astra.js CLAUDE.md
git commit -m "docs(astra): typewriter streaming in code comments + CLAUDE.md"
```

---

### Task 4: Manual verification (no commit)

**Files:** none modified.

- [ ] **Step 1: Serve + open the search page**

The backend from this session is already on `127.0.0.1:8001` (check: `curl -s -m 5 http://127.0.0.1:8001/tunnel_url`). Serve the repo root:

```bash
python3 -m http.server 8901
```

Open `http://127.0.0.1:8901/search/?q=anglo+zanzibar+war`.

- [ ] **Step 2: Typewriter behavior**

Expected: thinking row shows the orb + flat grey quip (no shimmer sweep); when the first token lands, the answer types out character-by-character, smooth and crisp (no blur, no pop); the rainbow ring spins while typing and settles to a hairline shortly after the stream ends (once the queue has drained).

- [ ] **Step 3: Long answer / no slam**

Search something open-ended (e.g. `?q=history+of+the+ottoman+empire`). Expected: typing keeps pace via the backlog catch-up; when generation ends the remaining text converges quickly (faster typing), then one final crisp re-parse — no whole-answer slam.

- [ ] **Step 4: Stop mid-stream**

Start a search, hit ⏹ while typing. Expected: typing halts immediately, the revealed partial answer stays, the ring settles, the composer re-enables.

- [ ] **Step 5: Follow-up**

Ask a follow-up in the composer. Expected: same typewriter behavior on the follow-up turn.

- [ ] **Step 6: Reduced-motion bail**

DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, reload, search. Expected: answer appears in per-token chunks (no smooth typing), orb still, ring still.

- [ ] **Step 7: Final grep sweep**

Run: `grep -rn 'line-shimmer\|astra-tail-pop\|astra-tail-breathe' src/ search/ AI/`
Expected: no output (exit 1).

---

## Self-Review Notes

- **Spec coverage:** §1 thinking-line CSS → Task 1 Step 1; §2 typewriter + both call sites → Task 2; §3 tail retire + astra.js comment → Task 1 Steps 2-3, Task 3 Step 1; §4 stop/done semantics → Task 2 Steps 2-3 (`kept` = revealed text); §5 motion invariants → Task 2 Step 1 (`INSTANT` bail) + Task 4 Step 6; §6 docs → Task 3; testing → Task 4.
- **Type consistency:** `makeTypewriter(renderFn)` returns `{ push(fullText), finish(): Promise, halt(): string }`; `renderStream` (the function returned by `makeStreamRenderer`) is passed as `renderFn` at both call sites; `kept` naming is consistent across both catches.
- **No placeholders:** every edit quotes exact old/new code; every verification has an exact command + expected output.
