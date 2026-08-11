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
      try { localStorage.setItem('vail_theme', dark ? 'dark' : 'light'); } catch (_) {}
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
    if (u.href !== location.href) history.pushState({}, '', u);
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

  // ── boot ──
  initTheme();
  makeStars();
  rotatePlaceholders();
  wireBar('hero-input', 'hero-search', 'hero-ai', 'hero-suggest');
  wireBar('results-input', 'results-search', 'results-ai', 'results-suggest');
  $('logo-home').addEventListener('click', (e) => { e.preventDefault(); go('', false); });
  window.addEventListener('popstate', renderRoute);
  renderRoute();

  // ── TEMP STUBS (replaced in Tasks 4–7) ──
  function updateKeyCard() {}
  function initSuggest() {}
  function runSearch(q) { $('r-meta').textContent = 'search lands in task 5 — you asked for: ' + q; }
})();
