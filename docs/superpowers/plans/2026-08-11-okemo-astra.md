# Okemo Astra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Okemo Astra — a Google-style search page (`search/index.html` + `search/astra.js`) with real Brave Search results, an optional streaming Saga "✦ Ask Astra" AI answer, and the approved cosmic Okemo look.

**Architecture:** One page, two views (hero / results) driven by the URL query string (`?q=`, `&ai=1`) via `history.pushState` + `popstate`. Browser calls the Brave Search API directly (CORS-friendly, key in `localStorage.astra_brave_key`); AI mode grounds Saga (`/v1/chat/completions`, model `saga-0.7b`, SSE) with the top-5 Brave snippets.

**Tech Stack:** Vanilla HTML/CSS/JS (no modules, `window.*` per site convention), `src/design-tokens.css` tokens + `.skuo` buttons, `marked` from CDN. No Tailwind, **no `src/nav.js`** (intentional chromeless exception).

**Spec:** `docs/superpowers/specs/2026-08-11-okemo-astra-design.md`

**Testing note:** This repo has no test suite (per CLAUDE.md). Verification = `node --check` for JS syntax + scripted manual browser checks served over `python3 -m http.server` (file:// breaks CORS-origin on some APIs). Each task ends with exact verify steps + commit.

---

### Task 1: Scaffold `search/index.html` (markup + complete CSS)

**Files:**
- Create: `search/index.html`

- [ ] **Step 1: Write the file**

Complete file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Okemo Astra ✦</title>
<meta name="description" content="Okemo Astra — your tiny telescope for the internet.">
<script>
  // Anti-FOUC theme (same pattern as Themes/Themes.html) — do not remove.
  (function () {
    const stored = localStorage.getItem('vail_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (stored !== 'light' && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  })();
</script>
<link rel="stylesheet" href="../src/design-tokens.css">
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
  /* ── Astra layout & identity (appearance tokens come from design-tokens.css) ── */
  body { margin: 0; min-height: 100vh; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; overflow-x: hidden; }
  [hidden] { display: none !important; }

  /* stars */
  #stars { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
  .star { position: absolute; border-radius: 50%; opacity: .15; }
  @keyframes twinkle { 0%,100% { opacity: .12; } 50% { opacity: .85; } }

  /* hero */
  .hero { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 1rem; box-sizing: border-box; }
  .wordmark { margin: 0; font-size: clamp(2.2rem, 6vw, 3.4rem); font-weight: 700; letter-spacing: -0.03em; background: linear-gradient(92deg, var(--accent) 10%, #f0c27b 90%); -webkit-background-clip: text; background-clip: text; color: transparent; text-align: center; }
  .tagline { margin: -6px 0 4px; font-size: .85rem; font-style: italic; color: var(--text-tertiary); }
  .constellation { position: absolute; top: 16%; right: 14%; width: 76px; height: 50px; color: var(--accent); opacity: .55; pointer-events: none; }
  .hint { margin: 2px 0 0; font-size: .72rem; color: var(--text-tertiary); }
  .foot { position: absolute; bottom: 12px; left: 0; right: 0; text-align: center; font-size: .72rem; color: var(--text-tertiary); }
  .foot a { color: inherit; }
  .theme-toggle { position: absolute; top: 14px; right: 14px; width: 2.2rem; height: 2.2rem; border-radius: 50%; border: 1px solid var(--border-strong); background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; font-size: .9rem; }

  /* search bar (hero + results share .bar) */
  .bar { display: flex; align-items: center; gap: 6px; width: min(560px, 92vw); height: 46px; box-sizing: border-box; padding: 4px 5px 4px 14px; border-radius: 999px; background: var(--bg-white); border: 1px solid var(--border-strong); box-shadow: 0 1px 6px rgba(0,0,0,.06); position: relative; }
  .bar:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent), transparent 80%); }
  .bar-icon { opacity: .55; font-size: .95rem; }
  .bar input { flex: 1; min-width: 0; background: transparent; border: none; box-shadow: none; outline: none; padding: 0; height: 100%; font-size: .95rem; color: var(--text-primary); }
  .bar input:focus { outline: none; box-shadow: none; border: none; }
  .bar .skuo { height: 36px; padding: 0 14px; border-radius: 999px; font-size: .82rem; white-space: nowrap; }
  /* rainbow ring around Ask Astra */
  .ai-ring { border-radius: 999px; padding: 1.5px; background: conic-gradient(from var(--rb, 0deg), #ff5f6d, #ffc371, #f0e05a, #5fdc7d, #5aa7ff, #b06bff, #ff5f6d); animation: rb-spin 3.2s linear infinite; }
  .ai-ring .skuo { height: 33px; background: var(--bg-white); color: var(--text-primary); font-weight: 600; box-shadow: none; }
  @property --rb { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
  @keyframes rb-spin { to { --rb: 360deg; } }
  @supports not (background: conic-gradient(from var(--rb), red, blue)) { .ai-ring { animation: none; } }

  /* suggestions dropdown */
  .suggest { position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: var(--bg-white); border: 1px solid var(--border-strong); border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,.12); overflow: hidden; z-index: 20; }
  .suggest button { display: block; width: 100%; text-align: left; background: none; border: none; padding: 9px 16px; font-size: .85rem; color: var(--text-primary); cursor: pointer; }
  .suggest button.active, .suggest button:hover { background: var(--bg-elevated); }
  .suggest button.active::before { content: '✦ '; color: var(--accent); }

  /* results view */
  .results { position: relative; z-index: 1; max-width: 680px; margin: 0 auto; padding: 1rem 1rem 4rem; }
  .r-top { display: flex; align-items: center; gap: 14px; padding: 6px 0 18px; }
  .r-logo { font-weight: 700; font-size: 1.05rem; text-decoration: none; background: linear-gradient(92deg, var(--accent) 10%, #f0c27b 90%); -webkit-background-clip: text; background-clip: text; color: transparent; white-space: nowrap; }
  .results .bar { width: 100%; height: 42px; }
  .results .bar .skuo { height: 32px; }
  .results .ai-ring .skuo { height: 29px; }
  .r-meta { font-size: .75rem; color: var(--text-tertiary); margin: 0 4px 14px; }
  #result-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 22px; }
  .result { display: grid; grid-template-columns: 22px 1fr; gap: 10px; }
  .result img { width: 18px; height: 18px; border-radius: 4px; margin-top: 3px; }
  .result .r-url { font-size: .72rem; color: var(--text-tertiary); word-break: break-all; }
  .result .r-title { font-size: 1.02rem; color: var(--accent); text-decoration: none; line-height: 1.35; }
  .result .r-title:hover { text-decoration: underline; }
  .result .r-snippet { margin: 2px 0 0; font-size: .84rem; color: var(--text-secondary); line-height: 1.5; }

  /* AI answer panel */
  .ai-panel { margin: 0 0 22px; border: 1px solid var(--border-strong); border-radius: 18px; background: var(--bg-white); overflow: hidden; }
  .ai-head { display: flex; align-items: center; gap: 8px; padding: 12px 16px 0; font-weight: 700; font-size: .92rem; color: var(--accent); }
  .ai-wave { height: 46px; margin: 10px 12px 0; border-radius: 12px; position: relative; overflow: hidden; transition: height .6s ease, margin .6s ease, opacity .6s ease; }
  .ai-wave .blob { position: absolute; inset: -60%; filter: blur(18px); background:
      radial-gradient(38% 55% at 25% 45%, rgba(255,95,109,.9), transparent 70%),
      radial-gradient(38% 55% at 50% 55%, rgba(90,167,255,.85), transparent 70%),
      radial-gradient(38% 55% at 72% 45%, rgba(95,220,125,.8), transparent 70%),
      radial-gradient(40% 60% at 60% 60%, rgba(240,194,123,.85), transparent 70%);
    animation: wave-flow 4.5s ease-in-out infinite alternate; }
  .ai-wave .wave-label { position: relative; z-index: 2; height: 100%; display: flex; align-items: center; padding: 0 14px; font-size: .8rem; font-weight: 700; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,.35); }
  .ai-panel.done .ai-wave { height: 2px; margin: 8px 16px 0; opacity: .9; }
  .ai-panel.done .ai-wave .wave-label { display: none; }
  .ai-body { padding: 12px 16px 16px; font-size: .88rem; line-height: 1.6; color: var(--text-primary); }
  .ai-body a { color: var(--accent); }
  .ai-error { padding: 0 16px 14px; font-size: .84rem; color: var(--text-secondary); }
  @keyframes wave-flow { 0% { transform: translateX(-6%) scale(1.05); } 100% { transform: translateX(6%) scale(1.12); } }

  /* key card + modal + status card share .card from design-tokens */
  .key-card { max-width: 420px; text-align: center; font-size: .88rem; line-height: 1.55; }
  .key-card input { width: 100%; box-sizing: border-box; margin: 10px 0; text-align: center; }
  .key-link { background: none; border: none; color: var(--text-tertiary); font-size: .72rem; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
  .status-card { text-align: center; padding: 2rem 1rem; font-size: .9rem; color: var(--text-secondary); }
  .status-card .big { font-size: 1.6rem; display: block; margin-bottom: 8px; }

  @media (max-width: 560px) {
    .bar .skuo .lbl { display: none; }        /* icon-first buttons on tiny screens */
    .constellation { right: 6%; top: 12%; }
    .r-top { flex-wrap: wrap; }
  }
  @media (prefers-reduced-motion: reduce) {
    .star, .ai-ring, .ai-wave .blob { animation: none !important; }
    .ai-wave, .ai-panel.done .ai-wave { transition: none; }
  }
</style>
</head>
<body>
<div id="stars" aria-hidden="true"></div>

<!-- ═══ HERO ═══ -->
<main id="hero" class="hero">
  <svg class="constellation" viewBox="0 0 52 34" fill="none" aria-hidden="true">
    <path d="M4 26 L18 14 L30 20 L46 6" stroke="currentColor" stroke-width=".6" opacity=".5"/>
    <circle cx="4" cy="26" r="2" fill="currentColor"/><circle cx="18" cy="14" r="2.4" fill="currentColor"/>
    <circle cx="30" cy="20" r="1.8" fill="currentColor"/><circle cx="46" cy="6" r="2.4" fill="currentColor"/>
  </svg>
  <button id="theme-toggle" class="theme-toggle" title="toggle theme" aria-label="toggle theme">◐</button>
  <div>
    <h1 class="wordmark">✦ Okemo Astra</h1>
    <p class="tagline">your tiny telescope for the internet</p>
  </div>
  <div class="bar" id="hero-bar">
    <span class="bar-icon">🔭</span>
    <input id="hero-input" type="text" autocomplete="off" spellcheck="false" aria-label="Search the web">
    <button class="skuo skuo-neutral" id="hero-search"><span class="lbl">Search</span></button>
    <span class="ai-ring"><button class="skuo" id="hero-ai">✦ <span class="lbl">Ask Astra</span></button></span>
    <div class="suggest" id="hero-suggest" hidden></div>
  </div>
  <p class="hint">enter = search · ⌘↵ = ask astra · no wrong questions</p>
  <div id="key-card" class="key-card card card-pad" hidden>
    <strong>✦ Astra needs a key to the cosmos</strong><br>
    Results come from the <a href="https://brave.com/search/api/" target="_blank" rel="noopener">Brave Search API</a> — free tier, 2,000 queries a month. Grab a key and paste it here:
    <input id="key-input" type="password" placeholder="BSA…" aria-label="Brave API key">
    <button class="skuo skuo-accent" id="key-save">save my key</button>
  </div>
  <footer class="foot">made of stardust · <a href="../index.html">okemo</a> ✦</footer>
</main>

<!-- ═══ RESULTS ═══ -->
<main id="results" class="results" hidden>
  <header class="r-top">
    <a class="r-logo" href="./" id="logo-home">✦ Astra</a>
    <div class="bar" id="results-bar">
      <span class="bar-icon">🔭</span>
      <input id="results-input" type="text" autocomplete="off" spellcheck="false" aria-label="Search the web">
      <button class="skuo skuo-neutral" id="results-search"><span class="lbl">Search</span></button>
      <span class="ai-ring"><button class="skuo" id="results-ai">✦ <span class="lbl">Ask Astra</span></button></span>
      <div class="suggest" id="results-suggest" hidden></div>
    </div>
  </header>
  <section id="ai-panel" class="ai-panel" hidden>
    <div class="ai-head">✦ Astra Answer</div>
    <div class="ai-wave" id="ai-wave"><div class="blob"></div><div class="wave-label" id="ai-wave-label">✦ consulting the cosmos…</div></div>
    <div class="ai-body" id="ai-body"></div>
    <div class="ai-error" id="ai-error" hidden></div>
  </section>
  <p class="r-meta" id="r-meta"></p>
  <ol id="result-list"></ol>
  <div style="text-align:center; margin-top:26px;"><button class="key-link" id="key-edit">✦ change api key</button></div>
</main>

<!-- key edit modal (results view) -->
<div id="key-modal" class="key-card card card-pad" hidden style="position:fixed; inset:auto 0 40vh 0; margin:auto; z-index:50;">
  <strong>✦ new key, who dis</strong>
  <input id="key-modal-input" type="password" placeholder="BSA…" aria-label="Brave API key">
  <button class="skuo skuo-accent" id="key-modal-save">save</button>
  <button class="skuo skuo-neutral" id="key-modal-cancel">nevermind</button>
</div>

<script src="astra.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify it renders**

Run: `python3 -m http.server 8080` (repo root), open `http://localhost:8080/search/`
Expected: hero renders — gradient wordmark, tagline, pill bar with both buttons, hint line, footer. Toggle OS dark mode (or run `document.documentElement.classList.add('dark')`) → dark tokens apply. Nothing works yet (no JS) — that's fine.

- [ ] **Step 3: Commit**

```bash
git add search/index.html
git commit -m "feat(astra): scaffold search page markup + css"
```

---

### Task 2: `astra.js` — copy, theme toggle, stars, placeholder rotation

**Files:**
- Create: `search/astra.js`

- [ ] **Step 1: Write the file**

```js
// ─── Okemo Astra — all logic lives here (window.*, no modules) ───
(function () {
  'use strict';

  // ── Copy: playful, never corporate. Edit here, changes everywhere. ──
  const COPY = {
    placeholders: [
      "why is the sky blue, fr?",
      "prove I'm not a robot…",
      "best tacos near mars",
      "how do black holes even",
      "is water wet. settle it.",
      "teach a goldfish calculus",
    ],
    loadingQuips: [
      'consulting the cosmos…',
      'reticulating telescopes…',
      'asking the moon…',
      'warming up the stardust…',
    ],
    emptyResults: 'nothing in this corner of the universe ✦',
    offline: 'lost contact with the cosmos — check your connection',
    rateLimited: 'slow down, stargazer — the cosmos is rate-limiting us',
    badKey: "that key didn't open the cosmos — double-check it?",
    aiDown: 'the cosmos is quiet right now — try again',
    aiSystem: 'You are Astra, a playful search oracle by Okemo. Answer the query concisely and helpfully, grounded in the provided sources. Cite sources inline as [1], [2]… matching their numbers. If no sources are provided, answer from your own knowledge. Keep it warm, a little cosmic, never corporate.',
  };

  // ── tiny DOM helper ──
  const $ = (id) => document.getElementById(id);

  // ── theme toggle (writes vail_theme like src/nav.js does) ──
  function initTheme() {
    $('theme-toggle').addEventListener('click', () => {
      const dark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('vail_theme', dark ? 'dark' : 'light');
    });
  }

  // ── twinkling stars (Perplexity-style sparse dots) ──
  const STAR_COLORS = ['#c96478', '#f0c27b', '#5aa7ff', '#5fdc7d', '#ffffff'];
  function makeStars() {
    const host = $('stars');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'star';
      const size = 2 + Math.round(Math.random()); // 2–3px
      s.style.width = s.style.height = size + 'px';
      s.style.left = (6 + Math.random() * 88) + '%';
      s.style.top = (8 + Math.random() * 80) + '%';
      s.style.background = STAR_COLORS[i % STAR_COLORS.length];
      if (reduced) {
        s.style.opacity = '.3';
      } else {
        s.style.animation = `twinkle ${(2.6 + Math.random() * 2.4).toFixed(1)}s ease-in-out ${(Math.random() * 3).toFixed(1)}s infinite`;
      }
      host.appendChild(s);
    }
  }

  // ── rotating placeholder quips (both bars) ──
  function rotatePlaceholders() {
    let i = Math.floor(Math.random() * COPY.placeholders.length);
    const apply = () => {
      $('hero-input').placeholder = COPY.placeholders[i];
      $('results-input').placeholder = COPY.placeholders[i];
      i = (i + 1) % COPY.placeholders.length;
    };
    apply();
    setInterval(apply, 4000);
  }

  // ── boot ──
  initTheme();
  makeStars();
  rotatePlaceholders();
})();
```

- [ ] **Step 2: Syntax check**

Run: `node --check search/astra.js`
Expected: no output (exit 0)

- [ ] **Step 3: Verify in browser**

Reload `http://localhost:8080/search/`
Expected: ~14 tiny dots that pulse/fade at different times; placeholder text rotates every 4s; ◐ button flips dark/light and survives reload (check `localStorage.vail_theme`).

- [ ] **Step 4: Commit**

```bash
git add search/astra.js
git commit -m "feat(astra): stars, theme toggle, rotating placeholders"
```

---

### Task 3: URL state machine (hero ⇄ results, `?q=` / `&ai=1`)

**Files:**
- Modify: `search/astra.js` — insert the router before the `// ── boot ──` block and extend boot

- [ ] **Step 1: Add the router**

Insert this block immediately before `// ── boot ──`:

```js
  // ── router: URL is the state. ?q= results · &ai=1 results+AI ──
  let aiAbort = null;            // AbortController for the AI stream (Task 7)
  let searchToken = 0;           // stale-response guard

  function readRoute() {
    const p = new URLSearchParams(location.search);
    return { q: (p.get('q') || '').trim(), ai: p.get('ai') === '1' };
  }

  function go(q, ai) {
    const u = new URL(location.href);
    if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
    if (ai) u.searchParams.set('ai', '1'); else u.searchParams.delete('ai');
    history.pushState({}, '', u);
    renderRoute();
  }

  function showHero() {
    if (aiAbort) aiAbort.abort();
    searchToken++;
    $('results').hidden = true;
    $('hero').hidden = false;
    document.title = 'Okemo Astra ✦';
    updateKeyCard();
  }

  function showResults(q, ai) {
    $('hero').hidden = true;
    $('results').hidden = false;
    $('results-input').value = q;
    document.title = q + ' — Okemo Astra';
    runSearch(q, ai);            // defined in Task 5
  }

  function renderRoute() {
    const { q, ai } = readRoute();
    if (!q) showHero(); else showResults(q, ai);
  }

  // ── bar wiring (hero + results bars behave identically) ──
  function wireBar(inputId, searchId, aiId, suggestId) {
    const input = $(inputId);
    $(searchId).addEventListener('click', () => { const q = input.value.trim(); if (q) go(q, false); });
    $(aiId).addEventListener('click', () => { const q = input.value.trim(); if (q) go(q, true); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (!q) return;
        go(q, e.metaKey || e.ctrlKey);
      }
    });
    initSuggest(input, $(suggestId)); // defined in Task 6
  }
```

And replace the boot block with:

```js
  // ── boot ──
  initTheme();
  makeStars();
  rotatePlaceholders();
  wireBar('hero-input', 'hero-search', 'hero-ai', 'hero-suggest');
  wireBar('results-input', 'results-search', 'results-ai', 'results-suggest');
  $('logo-home').addEventListener('click', (e) => { e.preventDefault(); go('', false); });
  window.addEventListener('popstate', renderRoute);
  renderRoute();
```

- [ ] **Step 2: Stub the forward references (temporary, replaced by later tasks)**

Append to the bottom of the IIFE (these are replaced in Tasks 4–7):

```js
  // ── TEMP STUBS (replaced in Tasks 4–7) ──
  function updateKeyCard() {}
  function initSuggest() {}
  function runSearch(q) { $('r-meta').textContent = 'search lands in task 5 — you asked for: ' + q; }
```

- [ ] **Step 3: Syntax check + verify**

Run: `node --check search/astra.js` → no output.
Browser: type "test" in the hero bar → Enter → results view appears, URL is `?q=test`, title changes. Click ✦ Astra logo → back to hero, URL clean. Browser back/forward buttons flip views. `?q=test&ai=1` loads results view directly.

- [ ] **Step 4: Commit**

```bash
git add search/astra.js
git commit -m "feat(astra): url-driven hero/results router"
```

---

### Task 4: Brave key management (`astra_brave_key`)

**Files:**
- Modify: `search/astra.js` — replace the `updateKeyCard` stub, add key helpers + modal wiring

- [ ] **Step 1: Add key helpers + card/modal logic**

Replace the `function updateKeyCard() {}` stub line with:

```js
  // ── Brave API key ──
  function getKey() { return (localStorage.getItem('astra_brave_key') || '').trim(); }

  function saveKey(raw) {
    const k = (raw || '').trim();
    if (!k) return false;
    localStorage.setItem('astra_brave_key', k);
    return true;
  }

  function updateKeyCard() {
    $('key-card').hidden = !!getKey();     // hero: show setup card only when keyless
  }

  function initKeyFlows() {
    $('key-save').addEventListener('click', () => {
      if (saveKey($('key-input').value)) { $('key-card').hidden = true; $('hero-input').focus(); }
    });
    $('key-edit').addEventListener('click', () => {
      $('key-modal-input').value = getKey();
      $('key-modal').hidden = false;
      $('key-modal-input').focus();
    });
    $('key-modal-save').addEventListener('click', () => {
      if (saveKey($('key-modal-input').value)) {
        $('key-modal').hidden = true;
        const { q, ai } = readRoute();     // re-run with the new key
        if (q) showResults(q, ai);
      }
    });
    $('key-modal-cancel').addEventListener('click', () => { $('key-modal').hidden = true; });
  }
```

Add `$('key-edit')` guard note: no guard needed — the elements exist in the HTML from Task 1.

Add `initKeyFlows();` to the boot block, directly after `rotatePlaceholders();`.

- [ ] **Step 2: Syntax check + verify**

Run: `node --check search/astra.js` → no output.
Browser: clear the key (`localStorage.removeItem('astra_brave_key')`) → hero shows the ✦ setup card. Paste any string → save → card hides, survives reload. Go to `?q=test` → "✦ change api key" opens the modal; cancel closes it.

- [ ] **Step 3: Commit**

```bash
git add search/astra.js
git commit -m "feat(astra): brave api key management"
```

---

### Task 5: Brave web search + results rendering + error states

**Files:**
- Modify: `search/astra.js` — replace the `runSearch` stub

- [ ] **Step 1: Add Brave search + rendering**

Replace the `function runSearch(q) {...}` stub line with:

```js
  // ── Brave web search ──
  async function braveSearch(q) {
    const res = await fetch(
      'https://api.search.brave.com/res/v1/web/search?count=20&q=' + encodeURIComponent(q),
      { headers: { 'Accept': 'application/json', 'X-Subscription-Token': getKey() } }
    );
    if (!res.ok) { const e = new Error('Brave ' + res.status); e.status = res.status; throw e; }
    const data = await res.json();
    return (data.web && data.web.results) || [];
  }

  function faviconFor(url) {
    try { return 'https://www.google.com/s2/favicons?domain=' + new URL(url).hostname + '&sz=32'; }
    catch { return ''; }
  }

  function displayUrl(url) {
    try { const u = new URL(url); return u.hostname + (u.pathname === '/' ? '' : u.pathname); }
    catch { return url; }
  }

  function statusCard(emoji, msg, retry) {
    const list = $('result-list');
    list.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'status-card card';
    div.innerHTML = '<span class="big"></span><span></span>';
    div.querySelector('.big').textContent = emoji;
    div.querySelector('span:last-child').textContent = msg;
    if (retry) {
      const btn = document.createElement('button');
      btn.className = 'skuo skuo-neutral';
      btn.style.marginTop = '12px';
      btn.textContent = 'try again';
      btn.addEventListener('click', retry);
      div.appendChild(document.createElement('br'));
      div.appendChild(btn);
    }
    list.appendChild(div);
  }

  function renderResults(results) {
    const list = $('result-list');
    list.innerHTML = '';
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'result';
      li.id = 'result-' + (i + 1);

      const img = document.createElement('img');
      img.src = faviconFor(r.url);
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { textContent: '✦', className: 'bar-icon' })); };

      const wrap = document.createElement('div');
      const urlEl = document.createElement('div');
      urlEl.className = 'r-url';
      urlEl.textContent = displayUrl(r.url);
      const a = document.createElement('a');
      a.className = 'r-title';
      a.href = r.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = r.title || r.url;
      const snip = document.createElement('p');
      snip.className = 'r-snippet';
      snip.textContent = r.description || '';

      wrap.append(urlEl, a, snip);
      li.append(img, wrap);
      list.appendChild(li);
    });
  }

  async function runSearch(q, ai) {
    if (aiAbort) aiAbort.abort();
    const token = ++searchToken;
    $('ai-panel').hidden = !ai;
    $('ai-body').innerHTML = '';
    $('ai-error').hidden = true;
    $('r-meta').textContent = 'searching the universe for “' + q + '”…';
    $('result-list').innerHTML = '';

    if (!getKey()) { $('key-modal').hidden = false; $('r-meta').textContent = ''; return; }

    let results = [];
    try {
      results = await braveSearch(q);
    } catch (e) {
      if (token !== searchToken) return;   // a newer search superseded this one
      $('r-meta').textContent = '';
      const retry = () => runSearch(q, ai);
      if (e.status === 401 || e.status === 403) statusCard('🔑', COPY.badKey, () => { $('key-modal').hidden = false; });
      else if (e.status === 429) statusCard('🌙', COPY.rateLimited, retry);
      else statusCard('📡', COPY.offline, retry);
      return;                              // no AI without grounding results
    }
    if (token !== searchToken) return;

    $('r-meta').textContent = results.length
      ? 'about ' + results.length + ' little stars for “' + q + '”'
      : '';
    if (results.length) renderResults(results);
    else statusCard('🌌', COPY.emptyResults);

    if (ai) askAstra(q, results);          // defined in Task 7
  }
```

Note: `showResults` (Task 3) already calls `runSearch(q, ai)` — signatures match.

- [ ] **Step 2: Syntax check + verify with a real key**

Run: `node --check search/astra.js` → no output.
Browser (needs a real Brave key in the setup card):
- `?q=okemo` → ~20 results with favicons, host-style URLs, accent titles; meta line shows count.
- DevTools → Network → Offline → search again → 📡 offline card with working retry.
- Set a bogus key (`localStorage.setItem('astra_brave_key','nope')`) → 🔑 bad-key card, clicking it opens the key modal.
- `?q=asdkfjhqwkfjhqwkjfhqw` (gibberish) → 🌌 empty card.

- [ ] **Step 3: Commit**

```bash
git add search/astra.js
git commit -m "feat(astra): brave web search results + error states"
```

---

### Task 6: Autocomplete suggestions

**Files:**
- Modify: `search/astra.js` — replace the `initSuggest` stub

- [ ] **Step 1: Add the suggest module**

Replace the `function initSuggest() {}` stub line with:

```js
  // ── autocomplete (Brave suggest; silently disabled on any failure) ──
  async function braveSuggest(q) {
    const res = await fetch(
      'https://api.search.brave.com/res/v1/suggest/search?q=' + encodeURIComponent(q),
      { headers: { 'Accept': 'application/json', 'X-Subscription-Token': getKey() } }
    );
    if (!res.ok) throw new Error('suggest ' + res.status);
    const data = await res.json();
    // tolerant: plans/shapes differ — accept {results:[{query}]} or {suggestions:[…]}
    return ((data.results || data.suggestions || [])
      .map((r) => (typeof r === 'string' ? r : r.query))
      .filter(Boolean)
      .slice(0, 6));
  }

  function initSuggest(input, box) {
    if (!input || !box) return;
    let items = [], active = -1, timer = null, dead = false;

    function close() { box.hidden = true; items = []; active = -1; }
    function render() {
      box.innerHTML = '';
      if (!items.length) return close();
      items.forEach((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = s;
        b.className = i === active ? 'active' : '';
        b.addEventListener('mousedown', (e) => {   // mousedown beats input blur
          e.preventDefault();
          input.value = s;
          close();
          go(s, false);
        });
        box.appendChild(b);
      });
      box.hidden = false;
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (dead || !q || !getKey()) return close();
      timer = setTimeout(async () => {
        try {
          const got = await braveSuggest(q);
          if (input.value.trim() !== q) return;    // stale
          items = got; active = -1; render();
        } catch { dead = true; close(); }          // never surface suggest errors
      }, 150);
    });
    input.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length + 1) % (items.length + 1) - 1;
        if (active >= 0) input.value = items[active];
        render();
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault(); e.stopPropagation();
        close();
        go(input.value.trim(), e.metaKey || e.ctrlKey);
      } else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', close);
  }
```

Keyboard math note: `active` ranges `-1..items.length-1`; `-1` means "what the user typed". ArrowDown from the last item wraps back to `-1`. This is intentional — mirrors Google's behavior.

- [ ] **Step 2: Syntax check + verify**

Run: `node --check search/astra.js` → no output.
Browser (real key, plan permitting): type "why is" slowly in the hero bar → dropdown with ≤6 suggestions; ↓/↑ highlights (✦ prefix), Enter accepts + searches, Esc closes, click works. If the key's plan lacks suggest (403), the dropdown simply never appears and plain search still works.

- [ ] **Step 3: Commit**

```bash
git add search/astra.js
git commit -m "feat(astra): autocomplete suggestions with keyboard nav"
```

---

### Task 7: AI mode — streaming ✦ Astra Answer with rainbow wave

**Files:**
- Modify: `search/astra.js` — add the AI module before the boot block

- [ ] **Step 1: Add `askAstra` + citation linkify + wave quips**

Insert this block immediately before `// ── boot ──`:

```js
  // ── AI mode: Brave-grounded Saga answer, streamed over SSE ──
  function backendBase() {
    return (localStorage.getItem('vail_custom_backend_url') || 'https://api.okemovail.com').replace(/\/$/, '');
  }

  function linkifyCitations(html) {
    // [n] → jump link to the matching result card (must run on marked output)
    return html.replace(/\[(\d{1,2})\]/g, (m, n) =>
      '<a href="#result-' + n + '">[' + n + ']</a>');
  }

  function startWaveQuips() {
    const label = $('ai-wave-label');
    let i = 0;
    label.textContent = '✦ ' + COPY.loadingQuips[0];
    return setInterval(() => {
      i = (i + 1) % COPY.loadingQuips.length;
      label.textContent = '✦ ' + COPY.loadingQuips[i];
    }, 2200);
  }

  async function askAstra(q, results) {
    if (aiAbort) aiAbort.abort();
    aiAbort = new AbortController();
    const panel = $('ai-panel');
    panel.classList.remove('done');
    $('ai-body').innerHTML = '';
    $('ai-error').hidden = true;
    const quipTimer = startWaveQuips();

    const snippets = results.slice(0, 5)
      .map((r, i) => '[' + (i + 1) + '] ' + (r.title || '') + ' — ' + (r.description || '') + ' (' + r.url + ')')
      .join('\n');

    try {
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
          messages: [
            { role: 'system', content: COPY.aiSystem },
            { role: 'user', content: q + '\n\nSources:\n' + (snippets || '(no sources — answer from knowledge)') },
          ],
        }),
      });
      if (!res.ok) throw new Error('backend ' + res.status);

      // SSE consumption — same line protocol as AI/js/chat-actions.js
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', text = '', firstToken = false;
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
          if (dataStr === '[DONE]') break;
          try {
            const data = JSON.parse(dataStr);
            const delta = data.choices && data.choices[0] && data.choices[0].delta
              ? (data.choices[0].delta.content || '') : '';
            if (delta) {
              if (!firstToken) { firstToken = true; clearInterval(quipTimer); $('ai-wave-label').textContent = '✦ streaming from the stars…'; }
              text += delta;
              $('ai-body').innerHTML = linkifyCitations(marked.parse(text));
            }
          } catch { /* partial JSON chunk — ignore */ }
        }
      }
      clearInterval(quipTimer);
      panel.classList.add('done');         // wave collapses to shimmer line
    } catch (e) {
      clearInterval(quipTimer);
      if (e.name === 'AbortError') return; // superseded by a newer search
      panel.classList.add('done');
      const err = $('ai-error');
      err.hidden = false;
      err.textContent = '✦ ' + COPY.aiDown + ' ';
      const btn = document.createElement('button');
      btn.className = 'skuo skuo-neutral';
      btn.textContent = 'retry';
      btn.addEventListener('click', () => askAstra(q, results));
      err.appendChild(btn);
    }
  }
```

- [ ] **Step 2: Syntax check + verify**

Run: `node --check search/astra.js` → no output.
Browser (real key + reachable backend):
- Hero: type a question, click **✦ Ask Astra** → URL `?q=…&ai=1`, panel on top with flowing rainbow wave + rotating quips; answer streams as markdown; on completion the wave collapses to a thin line; `[1]`-style citations jump to result cards.
- ⌘↵ from the results bar re-runs with AI; plain Enter runs without AI (panel hides).
- Backend stopped → playful error + retry button; link results still fine.
- Start an AI search, immediately run another → first stream aborts (no mixed text).

- [ ] **Step 3: Commit**

```bash
git add search/astra.js
git commit -m "feat(astra): streaming saga ai answer with rainbow wave"
```

---

### Task 8: Docs + final verification sweep

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document Astra in CLAUDE.md**

In the "Other pages" list of CLAUDE.md, add:

```markdown
- `search/index.html` — Okemo Astra: Google-style web search (Brave Search API, key in `localStorage.astra_brave_key`) with an optional streaming Saga "✦ Ask Astra" answer (`?q=` results, `&ai=1` adds AI). Intentional exceptions: no `src/nav.js` (chromeless by design), no Tailwind. Spec: `docs/superpowers/specs/2026-08-11-okemo-astra-design.md`.
```

Also add `astra_brave_key` to the localStorage keys table:

```markdown
| `astra_brave_key` | Brave Search API key for Okemo Astra |
```

- [ ] **Step 2: Full manual checklist (from the spec)**

Serve `python3 -m http.server 8080`, verify each:
1. Hero light + dark, stars twinkle, placeholders rotate ✓
2. Key flow: missing → invalid (🔑 card) → valid persists across reload ✓
3. `?q=` renders ~20 real results with favicons ✓
4. `&ai=1` streams the answer; wave → shimmer collapse; `[n]` citations jump ✓
5. Enter vs ⌘↵ vs buttons land on right URLs; back button works ✓
6. Autocomplete dropdown + keyboard nav (or silent absence on plan without suggest) ✓
7. 429 / offline / empty states show playful copy ✓
8. OS reduced-motion on → no twinkle/spin/wave ✓
9. 375px viewport: bar fits (button labels collapse), results readable, no horizontal scroll ✓

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document okemo astra page + exceptions"
```

---

## Self-review notes (author)

- **Spec coverage:** files ✓ (T1/T2), state machine ✓ (T3), Brave + key ✓ (T4/T5), autocomplete ✓ (T6), AI + wave + citations ✓ (T7), errors ✓ (T5/T7), reduced-motion ✓ (T1 CSS + T2 JS), docs ✓ (T8). Removed items (nav, Lucky, pagination) are absent everywhere ✓.
- **Type consistency:** `runSearch(q, ai)` defined T5, called T3 with both args ✓. `initSuggest(input, box)` T6, wired in T3's `wireBar` ✓. `updateKeyCard()` T4, called in T3's `showHero` ✓ (stub replaced before that path is exercised with a real key flow). `askAstra(q, results)` T7, called in T5 ✓. `aiAbort` declared T3, used T5/T7 ✓.
- **No placeholders:** every step carries complete code or exact commands; temp stubs in T3 are explicitly replaced in T4–T6 with full code.
