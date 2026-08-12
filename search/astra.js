// ─── Okemo Astra — all logic lives here (single IIFE, no modules) ───
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
    aiHeaders: [
      '✦ Astra Answer',
      '✦ asked the universe, it answered',
      '✦ the oracle has opinions',
      '✦ straight from the cosmos',
    ],
    emptyResults: 'nothing in this corner of the universe ✦',
    offline: 'lost contact with the cosmos — check your connection',
    rateLimited: 'slow down, stargazer — the cosmos is rate-limiting us',
    aiDown: 'the cosmos is quiet right now — try again',
    metaLine: (n, secs) => 'found ' + n + ' little stars in ' + secs + 's — you’re welcome',
    aiSystem: "You are Astra, Saga's search-oracle alter ego built by Okemo. Answer first, then stop — dry humor welcome, never rude, never corporate. Ground answers in the provided sources and cite inline as [1], [2]… matching the numbered results. If no sources are provided, answer from your own knowledge. Keep it tight: a few sentences, not an essay.",
  };

  // ── tiny DOM helper ──
  const $ = (id) => document.getElementById(id);

  // ── AI mode toggle (persisted; default on) ──
  function getAiMode() { try { return localStorage.getItem('astra_ai_mode') !== 'off'; } catch (_) { return true; } }
  function setAiMode(on) {
    try { localStorage.setItem('astra_ai_mode', on ? 'on' : 'off'); } catch (_) {}
    const t = $('ai-toggle');
    t.setAttribute('aria-pressed', on ? 'true' : 'false');
    t.classList.toggle('skuo-accent', on);
    if (!on && aiAbort) aiAbort.abort();
  }

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

  // ── router: URL is the state. ?q= results (AI answer always included) ──
  let aiAbort = null;            // AbortController for the AI stream
  let searchToken = 0;           // stale-response guard
  let wantResultsFocus = false;  // set by bar actions, consumed by showResults

  function readRoute() {
    const p = new URLSearchParams(location.search);
    return { q: (p.get('q') || '').trim() };
  }

  function go(q) {
    const u = new URL(location.href);
    if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
    u.searchParams.delete('ai');   // legacy param — the AI answer is always on now
    u.hash = '';
    if (u.href !== location.href) history.pushState({}, '', u);
    renderRoute();
  }

  function showHero() {
    if (aiAbort) aiAbort.abort();
    searchToken++;
    $('results').hidden = true;
    $('hero').hidden = false;
    document.title = 'Okemo Astra ✦';
  }

  function showResults(q) {
    $('hero').hidden = true;
    $('results').hidden = false;
    $('results-input').value = q;
    if (wantResultsFocus) { wantResultsFocus = false; $('results-input').focus({ preventScroll: true }); }
    document.title = q + ' — Okemo Astra';
    runSearch(q);
  }

  function renderRoute() {
    const { q } = readRoute();
    if (!q) showHero(); else showResults(q);
  }

  // ── bar wiring (hero + results bars behave identically) ──
  function wireBar(inputId, searchId, suggestId) {
    const input = $(inputId);
    initSuggest(input, $(suggestId)); // FIRST: suggest's keydown must run before ours (see defaultPrevented guard)
    $(searchId).addEventListener('click', () => { const q = input.value.trim(); if (q) { wantResultsFocus = true; go(q); } });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.defaultPrevented) return;  // initSuggest accepted a suggestion — don't double-navigate
        const q = input.value.trim();
        if (!q) return;
        wantResultsFocus = true;
        go(q);
      }
    });
  }

  // ── i'm feeling cosmic: random quip query ──
  function cosmicQuery(current) {
    const pool = COPY.placeholders.filter((p) => p !== current);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── boot ──
  initTheme();
  makeStars();
  rotatePlaceholders();
  wireBar('hero-input', 'hero-search', 'hero-suggest');
  wireBar('results-input', 'results-search', 'results-suggest');
  setAiMode(getAiMode());   // paint the persisted state
  $('ai-toggle').addEventListener('click', () => {
    const on = !getAiMode();
    setAiMode(on);
    const { q } = readRoute();
    if (on && q) runSearch(q);            // toggling on from results answers immediately
    if (!on) $('ai-panel').hidden = true; // toggling off hides the panel
  });
  $('hero-cosmic').addEventListener('click', () => {
    const q = cosmicQuery($('hero-input').value.trim());
    $('hero-input').value = q;
    go(q);
  });
  $('logo-home').addEventListener('click', (e) => { e.preventDefault(); $('hero-input').value = $('results-input').value; go(''); });
  const followGo = () => {
    const q = $('ai-follow-input').value.trim();
    if (!q || !thread.length) return;
    $('ai-follow-input').value = '';
    askFollowUp(q);
  };
  $('ai-follow-send').addEventListener('click', followGo);
  $('ai-follow-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') followGo(); });
  window.addEventListener('popstate', renderRoute);
  renderRoute();

  // citation jump links: smooth-scroll, no history entry
  $('ai-body').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#result-"]');
    if (!a) return;
    e.preventDefault();
    const el = document.getElementById(a.getAttribute('href').slice(1));
    if (el) el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  });

  // ── backend base (same resolution as chat's api.js, minus the tunnel fetch) ──
  function backendBase() {
    try { return (localStorage.getItem('vail_custom_backend_url') || 'https://api.okemovail.com').replace(/\/$/, ''); }
    catch (_) { return 'https://api.okemovail.com'; }
  }

  // ── autocomplete (backend DDG proxy; silently disabled on any failure) ──
  async function astraSuggest(q) {
    const res = await fetch(
      backendBase() + '/api/suggest?q=' + encodeURIComponent(q),
      { headers: { 'ngrok-skip-browser-warning': 'true', 'bypass-tunnel-reminder': 'true' } }
    );
    if (!res.ok) throw new Error('suggest ' + res.status);
    const data = await res.json();
    return (Array.isArray(data) ? data : []).filter((s) => typeof s === 'string').slice(0, 6);
  }

  function initSuggest(input, box) {
    if (!input || !box) return;
    let items = [], active = -1, timer = null, dead = 0, typed = '';

    function close() { clearTimeout(timer); box.hidden = true; items = []; active = -1; }
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
          go(s);
        });
        box.appendChild(b);
      });
      box.hidden = false;
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if ((dead && Date.now() - dead < 30000) || !q) return close();   // failed suggest endpoints get a 30s cooldown, not a session-long death
      dead = 0;
      timer = setTimeout(async () => {
        try {
          const got = await astraSuggest(q);
          if (input.value.trim() !== q) return;    // stale
          if (document.activeElement !== input) return; // blurred mid-flight
          typed = q;
          items = got; active = -1; render();
        } catch { dead = Date.now(); close(); }          // never surface suggest errors
      }, 150);
    });
    input.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length + 2) % (items.length + 1) - 1;
        if (active >= 0) input.value = items[active];
        else input.value = typed;
        render();
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault(); e.stopPropagation();
        close();
        go(input.value.trim());
      } else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', close);
  }

  // ── web search (backend DDG scrape) ──
  async function astraSearch(q) {
    const res = await fetch(
      backendBase() + '/api/search?q=' + encodeURIComponent(q),
      { headers: { 'ngrok-skip-browser-warning': 'true', 'bypass-tunnel-reminder': 'true' } }
    );
    if (!res.ok) { const e = new Error('search ' + res.status); e.status = res.status; throw e; }
    const data = await res.json();
    return (data && Array.isArray(data.results)) ? data.results : [];
  }

  function faviconFor(url) {
    try { return 'https://www.google.com/s2/favicons?domain=' + new URL(url).hostname + '&sz=32'; }
    catch { return ''; }
  }

  // google-style breadcrumb: host + up to 2 path segments, chevron-separated
  function crumbFor(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      const segs = u.pathname.split('/').filter(Boolean).slice(0, 2).map((s) => {
        try { return decodeURIComponent(s); } catch { return s; }
      });
      return { site: host, crumb: host + (segs.length ? ' › ' + segs.join(' › ') : '') };
    } catch {
      return { site: url, crumb: url };
    }
  }

  function statusCard(emoji, msg, retry) {
    const list = $('result-list');
    list.innerHTML = '';
    const div = document.createElement('li');
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
      img.className = 'r-favi';
      img.src = faviconFor(r.url);
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { textContent: '✦', className: 'r-favi r-favi-fallback' })); };

      const c = crumbFor(r.url);
      const wrap = document.createElement('div');
      const head = document.createElement('div');
      const site = document.createElement('div');
      site.className = 'r-site';
      site.textContent = c.site;
      const crumb = document.createElement('div');
      crumb.className = 'r-crumb';
      crumb.textContent = c.crumb;
      head.append(site, crumb);
      const a = document.createElement('a');
      a.className = 'r-title';
      a.href = r.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = r.title || r.url;
      const snip = document.createElement('p');
      snip.className = 'r-snippet';
      snip.textContent = r.description || '';

      wrap.append(head, a, snip);
      li.append(img, wrap);
      list.appendChild(li);
    });
  }

  async function runSearch(q) {
    if (aiAbort) aiAbort.abort();
    const token = ++searchToken;
    const panel = $('ai-panel');
    const aiOn = getAiMode();
    panel.hidden = !aiOn;                       // AI mode off → results-only page
    panel.classList.remove('done');
    $('ai-head').textContent = COPY.aiHeaders[0];
    $('ai-body').innerHTML = '';
    $('ai-error').hidden = true;
    $('ai-follow').hidden = true;
    $('ai-wave-label').textContent = '✦ ' + COPY.loadingQuips[0];
    $('r-meta').textContent = 'searching the universe for “' + q + '”…';
    $('result-list').innerHTML = '';

    const t0 = performance.now();
    let results = [];
    try {
      results = await astraSearch(q);
      results = results.filter((r) => /^https?:\/\//i.test(r.url || ''));
    } catch (e) {
      if (token !== searchToken) return;   // a newer search superseded this one
      panel.hidden = true;                 // no grounding → no AI call (back off)
      $('r-meta').textContent = '';
      const retry = () => runSearch(q);
      if (e.status === 429) statusCard('🌙', COPY.rateLimited, retry);
      else statusCard('📡', COPY.offline, retry);
      return;
    }
    if (token !== searchToken) return;

    const secs = ((performance.now() - t0) / 1000).toFixed(2);
    $('r-meta').textContent = results.length ? COPY.metaLine(results.length, secs) : '';
    if (results.length) renderResults(results);
    else statusCard('🌌', COPY.emptyResults);   // AI still answers from knowledge

    if (aiOn) askAstra(q, results);
  }

  // ── AI answer: scraped-results-grounded Saga, streamed over SSE ──
  function linkifyCitations(html, count) {
    // [n] → jump link to the matching result card (must run on marked output)
    return html.replace(/\[(\d{1,2})\]/g, (m, n) =>
      (+n >= 1 && +n <= count) ? '<a href="#result-' + n + '">[' + n + ']</a>' : m);
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
        messages: [{ role: 'system', content: COPY.aiSystem }, thread[0], ...thread.slice(1).slice(-8)],
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
})();
