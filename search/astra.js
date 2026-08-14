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
    metaLineImages: (n, secs) => 'found ' + n + ' little pictures in ' + secs + 's — you’re welcome',
    endOfResults: "✦ that's everything in this corner of the universe",
    loadMoreError: 'the telescope jammed — retry?',
    aiSystem: "You are Astra, Saga's search-oracle alter ego built by Okemo. Answer first, then stop — dry humor welcome, never rude, never corporate. Ground answers in the provided sources and cite inline as [1], [2]… matching the numbered results. If no sources are provided, answer from your own knowledge. Keep it tight: a few sentences, not an essay.",
    waitingLineSystem: "You are Astra's loading screen. Write ONE witty 3–8 word loading line about the user's topic. Dry humor, no emoji, no quotes, no trailing period.",
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

  // ── twinkling stars (Perplexity-style sparse dots) ──
  const STAR_COLORS = ['#ffffff'];
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
  let aiStopRequested = false;   // distinguishes user-stop aborts from supersede aborts
  let searchToken = 0;           // stale-response guard
  let wantResultsFocus = false;  // set by bar actions, consumed by showResults
  const PAGE_STEP = 30;         // DDG lite paginates in steps of 30
  const MAX_RESULTS = 120;      // sane cap
  let nextOffset = 0;
  let loadingMore = false;
  let resultsDone = false;
  let totalResults = 0;
  let lastSecs = '0.00';
  let lastResults = [];         // first-page results (citation lookups)
  let scrollObserver = null;

  function readRoute() {
    const p = new URLSearchParams(location.search);
    return { q: (p.get('q') || '').trim(), tab: p.get('tab') === 'images' ? 'images' : 'all' };
  }

  function go(q, tab) {
    const u = new URL(location.href);
    if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
    if (tab === 'images') u.searchParams.set('tab', 'images'); else u.searchParams.delete('tab');
    u.searchParams.delete('ai');   // legacy param — the AI answer is always on now
    u.hash = '';
    if (u.href !== location.href) history.pushState({}, '', u);
    renderRoute();
  }

  function showHero() {
    closeImagePreview();
    exitAiFullscreen();
    if (aiAbort) aiAbort.abort();
    searchToken++;
    $('results').hidden = true;
    $('hero').hidden = false;
    document.title = 'Okemo Astra ✦';
  }

  let lastAllQuery = '';   // guards against re-running a finished search on tab restore
  let lastImgQuery = '';

  function paintTabs(tab) {
    $('tab-all').classList.toggle('on', tab !== 'images');
    $('tab-images').classList.toggle('on', tab === 'images');
  }

  function showResults(q, tab) {
    $('hero').hidden = true;
    $('results').hidden = false;
    $('results-input').value = q;
    if (wantResultsFocus) { wantResultsFocus = false; $('results-input').focus({ preventScroll: true }); }
    document.title = q + ' — Okemo Astra';
    paintTabs(tab);
    const allMode = tab !== 'images';
    $('result-list').hidden = !allMode;
    $('image-grid').hidden = allMode;
    $('ai-toggle').hidden = !allMode;
    if (allMode) {
      $('ai-panel').hidden = !getAiMode();
      if (q !== lastAllQuery) { lastAllQuery = q; runSearch(q); }
    } else {
      $('ai-panel').hidden = true;               // AI panel lives on All; the thread survives
      if (q !== lastImgQuery) { lastImgQuery = q; runImages(q); }
    }
  }

  function renderRouteDom() {
    const { q, tab } = readRoute();
    if (!q) showHero(); else showResults(q, tab);
  }

  // Same-document view transition: hero⇄results swaps and tab switches
  // cross-fade/morph (the search bar holds steady via view-transition-name).
  // Bailed under reduced-motion/automation → instant swap.
  function renderRoute() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce || navigator.webdriver) { renderRouteDom(); return; }
    const vt = document.startViewTransition(renderRouteDom);
    // skipped transitions reject — swallow, the DOM swap already happened
    vt.updateCallbackDone.catch(() => {}); vt.ready.catch(() => {}); vt.finished.catch(() => {});
  }

  // ── bar wiring (hero + results bars behave identically) ──
  function wireBar(inputId, searchId, suggestId) {
    const input = $(inputId);
    initSuggest(input, $(suggestId)); // FIRST: suggest's keydown must run before ours (see defaultPrevented guard)
    $(searchId).addEventListener('click', () => { const q = input.value.trim(); if (q) { wantResultsFocus = true; go(q, readRoute().tab); } });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.defaultPrevented) return;  // initSuggest accepted a suggestion — don't double-navigate
        const q = input.value.trim();
        if (!q) return;
        wantResultsFocus = true;
        go(q, readRoute().tab);
      }
    });
  }

  // ── i'm feeling cosmic: random quip query ──
  function cosmicQuery(current) {
    const pool = COPY.placeholders.filter((p) => p !== current);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── system theme tracking (no on-page toggle: follow the device live) ──
  const themeMq = window.matchMedia('(prefers-color-scheme: dark)');
  themeMq.addEventListener('change', () => {
    let stored = null;
    try { stored = localStorage.getItem('vail_theme'); } catch (_) {}
    const dark = stored === 'dark' || (stored !== 'light' && themeMq.matches);
    document.documentElement.classList.toggle('dark', dark);
  });

  // ── boot ──
  makeStars();
  rotatePlaceholders();
  wireBar('hero-input', 'hero-search', 'hero-suggest');
  wireBar('results-input', 'results-search', 'results-suggest');
  setAiMode(getAiMode());   // paint the persisted state
  $('ai-toggle').addEventListener('click', () => {
    const on = !getAiMode();
    setAiMode(on);
    const { q } = readRoute();
    if (on && q) { lastAllQuery = q; runSearch(q); }  // toggling on from results answers immediately
    if (!on) $('ai-panel').hidden = true;             // toggling off hides the panel
  });
  $('tab-all').addEventListener('click', () => { const r = readRoute(); if (r.q && r.tab !== 'all') go(r.q, 'all'); });
  $('tab-images').addEventListener('click', () => { const r = readRoute(); if (r.q && r.tab !== 'images') go(r.q, 'images'); });
  $('igp-close').addEventListener('click', closeImagePreview);
  $('igp-scrim').addEventListener('click', closeImagePreview);
  $('ai-expand').addEventListener('click', () => toggleAiFullscreen());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (closeImagePreview()) return;
    exitAiFullscreen();
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
  $('ai-stop').addEventListener('click', () => { aiStopRequested = true; if (aiAbort) aiAbort.abort(); });
  window.addEventListener('popstate', renderRoute);
  renderRoute();

  // citation jump links: smooth-scroll inline (new tab in fullscreen), no history entry
  $('ai-body').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#result-"]');
    if (!a) return;
    e.preventDefault();
    const n = +(a.getAttribute('href').slice('#result-'.length));
    if ($('ai-panel').classList.contains('ai-fullscreen')) {
      const r = lastResults[n - 1];
      if (r) window.open(r.url, '_blank', 'noopener');
      return;
    }
    const el = document.getElementById('result-' + n);
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
          go(s, readRoute().tab);
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
        go(input.value.trim(), readRoute().tab);
      } else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', close);
  }

  // ── web search (backend DDG scrape) ──
  async function astraSearch(q, s) {
    const res = await fetch(
      backendBase() + '/api/search?q=' + encodeURIComponent(q) + (s ? '&s=' + s : ''),
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

  function renderResults(results, start, append) {
    const list = $('result-list');
    const sentinel = append ? $('result-sentinel') : null;
    if (!append) list.innerHTML = '';
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'result';
      li.id = 'result-' + (start + i + 1);
      // entrance stagger, capped at 8 rows so long/infinite pages don't trail
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.webdriver) {
        li.classList.add('r-enter');
        li.style.transitionDelay = Math.min(i, 7) * 45 + 'ms';
        requestAnimationFrame(() => requestAnimationFrame(() => li.classList.add('on')));
        li.addEventListener('transitionend', (e) => { if (e.target !== li) return; li.classList.remove('r-enter', 'on'); li.style.transitionDelay = ''; }, { once: true });
      }

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
      if (sentinel) list.insertBefore(li, sentinel); else list.appendChild(li);
    });
  }

  function ensureSentinel() {
    let s = $('result-sentinel');
    if (!s) {
      s = document.createElement('li');
      s.id = 'result-sentinel';
      s.className = 'r-sentinel';
      $('result-list').appendChild(s);
    }
    s.innerHTML = '<span class="r-sentinel-dot">✦</span>';
    return s;
  }

  function watchSentinel(q) {
    if (scrollObserver) scrollObserver.disconnect();
    scrollObserver = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore(q);
    }, { rootMargin: '400px' });
    scrollObserver.observe(ensureSentinel());
  }

  function finishResults() {
    resultsDone = true;
    if (scrollObserver) scrollObserver.disconnect();
    const s = $('result-sentinel');
    if (s) s.innerHTML = '<span>' + COPY.endOfResults + '</span>';
  }

  function sentinelLoadError(q) {
    const s = $('result-sentinel');
    if (!s) return;
    s.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'skuo skuo-neutral';
    btn.type = 'button';
    btn.textContent = COPY.loadMoreError;
    btn.addEventListener('click', () => { s.innerHTML = '<span class="r-sentinel-dot">✦</span>'; loadMore(q); });
    s.appendChild(btn);
  }

  async function loadMore(q) {
    if (loadingMore || resultsDone || $('result-list').hidden) return;
    const token = searchToken;
    loadingMore = true;
    try {
      let more = await astraSearch(q, nextOffset);
      more = more.filter((r) => /^https?:\/\//i.test(r.url || ''));
      if (token !== searchToken) return;
      nextOffset += PAGE_STEP;
      if (!more.length) { finishResults(); return; }
      renderResults(more, totalResults, true);
      totalResults += more.length;
      $('r-meta').textContent = COPY.metaLine(totalResults, lastSecs);
      if (totalResults >= MAX_RESULTS) finishResults();
    } catch (e) {
      if (token !== searchToken) return;
      sentinelLoadError(q);
    } finally {
      loadingMore = false;
    }
  }

  // ── images tab (backend DDG i.js proxy) ──
  async function astraImages(q) {
    const res = await fetch(
      backendBase() + '/api/images?q=' + encodeURIComponent(q),
      { headers: { 'ngrok-skip-browser-warning': 'true', 'bypass-tunnel-reminder': 'true' } }
    );
    if (!res.ok) { const e = new Error('images ' + res.status); e.status = res.status; throw e; }
    const data = await res.json();
    return (data && Array.isArray(data.results)) ? data.results : [];
  }

  function renderImageGrid(results) {
    const grid = $('image-grid');
    grid.innerHTML = '';
    results.forEach((r) => {
      const b = document.createElement('button');
      b.className = 'ig-item';
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.webdriver) b.classList.add('ig-enter');
      b.type = 'button';
      const img = document.createElement('img');
      img.src = r.thumbnail || r.image;
      img.alt = r.title || '';
      img.loading = 'lazy';
      if (r.width && r.height) img.style.aspectRatio = r.width + ' / ' + r.height;
      img.onerror = () => { b.remove(); };
      const host = document.createElement('span');
      host.className = 'ig-host';
      host.textContent = crumbFor(r.url).site;
      b.append(img, host);
      b.addEventListener('click', () => openImagePreview(r));
      grid.appendChild(b);
      const revealItem = () => requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('on')));
      img.addEventListener('load', revealItem, { once: true });
      if (img.complete && img.naturalWidth) revealItem();   // cached images
      b.addEventListener('transitionend', (e) => { if (e.target !== b) return; b.classList.remove('ig-enter', 'on'); }, { once: true });
    });
  }

  function imageGridSkeleton() {
    const grid = $('image-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('div');
      s.className = 'ig-skel';
      grid.appendChild(s);
    }
  }

  function imageGridStatus(emoji, msg, retry) {
    const grid = $('image-grid');
    grid.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'status-card card';
    div.style.columnSpan = 'all';
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
    grid.appendChild(div);
  }

  async function runImages(q) {
    const token = ++searchToken;          // shares the stale-guard counter with runSearch
    $('r-meta').textContent = 'searching the universe for “' + q + '”…';
    imageGridSkeleton();
    const cacheKey = q.toLowerCase();
    if (imgCache.has(cacheKey)) {
      gridResults = imgCache.get(cacheKey);
      renderImageGrid(gridResults);
      $('r-meta').textContent = COPY.metaLineImages(gridResults.length, '0.00');
      return;
    }
    const t0 = performance.now();
    let results;
    try {
      results = await astraImages(q);
    } catch (e) {
      if (token !== searchToken) return;
      $('r-meta').textContent = '';
      const retry = () => { lastImgQuery = ''; runImages(q); };
      if (e.status === 429) imageGridStatus('🌙', COPY.rateLimited, retry);
      else imageGridStatus('📡', COPY.offline, retry);
      return;
    }
    if (token !== searchToken) return;
    imgCache.set(cacheKey, results);
    gridResults = results;
    const secs = ((performance.now() - t0) / 1000).toFixed(2);
    $('r-meta').textContent = results.length ? COPY.metaLineImages(results.length, secs) : '';
    if (results.length) renderImageGrid(results);
    else imageGridStatus('🌌', COPY.emptyResults);
  }

  function openImagePreview(r) {
    $('ig-preview').hidden = false;
    document.body.style.overflow = 'hidden';
    const img = $('igp-img');
    img.src = r.thumbnail || r.image;               // thumbnail paints instantly…
    $('igp-title').textContent = r.title || '';
    $('igp-host').textContent = crumbFor(r.url).site;
    $('igp-visit').href = r.url;
    $('igp-open').href = r.image;
    const full = new Image();                       // …full image swaps in when ready
    full.onload = () => { img.src = r.image; };
    full.src = r.image;
  }

  function closeImagePreview() {
    if ($('ig-preview').hidden) return false;
    $('ig-preview').hidden = true;
    document.body.style.overflow = '';
    return true;
  }

  async function runSearch(q) {
    exitAiFullscreen();                         // a new search always lands inline
    if (aiAbort) aiAbort.abort();
    const token = ++searchToken;
    const panel = $('ai-panel');
    const aiOn = getAiMode();
    panel.hidden = !aiOn;                       // AI mode off → results-only page
    panel.classList.remove('done');
    $('ai-head-label').textContent = COPY.aiHeaders[0];
    $('ai-body').innerHTML = '';
    $('ai-error').hidden = true;
    hideThinking();
    $('ai-follow').hidden = true;
    $('r-meta').textContent = 'searching the universe for “' + q + '”…';
    $('result-list').innerHTML = '';
    nextOffset = 0; loadingMore = false; resultsDone = false; totalResults = 0;
    if (scrollObserver) scrollObserver.disconnect();

    const t0 = performance.now();
    let results = [];
    try {
      results = await astraSearch(q, 0);
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

    lastResults = results;
    nextOffset = PAGE_STEP;
    totalResults = results.length;
    const secs = ((performance.now() - t0) / 1000).toFixed(2);
    lastSecs = secs;
    $('r-meta').textContent = results.length ? COPY.metaLine(totalResults, secs) : '';
    if (results.length) { renderResults(results, 0, false); watchSentinel(q); }
    else statusCard('🌌', COPY.emptyResults);   // AI still answers from knowledge

    if (aiOn) askAstra(q, results);
  }

  // ── AI answer: scraped-results-grounded Saga, streamed over SSE ──
  function linkifyCitations(html, count) {
    // [n] and grouped [n, m, …] → jump links to the matching result cards (must run on marked output)
    return html.replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g, (m, grp) => {
      const linked = grp.split(',').map((num) => {
        const n = num.trim();
        return (+n >= 1 && +n <= count) ? '<a href="#result-' + n + '">' + n + '</a>' : n;
      });
      return '[' + linked.join(', ') + ']';
    });
  }

  function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function setStreaming(on) {
    $('ai-follow-input').disabled = on;
    $('ai-follow-send').disabled = on;
    $('ai-follow-send').hidden = on;
    $('ai-stop').hidden = !on;
  }

  function toggleAiFullscreen(force) {
    const panel = $('ai-panel');
    const on = typeof force === 'boolean' ? force : !panel.classList.contains('ai-fullscreen');
    panel.classList.toggle('ai-fullscreen', on);
    $('ai-expand').textContent = on ? '✕' : '⤢';
    $('ai-expand').setAttribute('aria-label', on ? 'exit fullscreen' : 'fullscreen');
    document.body.style.overflow = on ? 'hidden' : '';
  }

  function exitAiFullscreen() {
    if ($('ai-panel').classList.contains('ai-fullscreen')) toggleAiFullscreen(false);
  }

  // ── model-generated waiting line (tiny parallel call; falls back to static quips) ──
  async function fetchWaitingLine(topic) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const res = await fetch(backendBase() + '/v1/chat/completions', {
        method: 'POST',
        signal: ctl.signal,
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          'bypass-tunnel-reminder': 'true',
        },
        body: JSON.stringify({
          model: 'saga-0.7b',
          stream: false,
          max_tokens: 24,
          temperature: 1.0,
          messages: [
            { role: 'system', content: COPY.waitingLineSystem },
            { role: 'user', content: topic },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const c = data && data.choices && data.choices[0] && data.choices[0].message;
      const line = ((c && c.content) || '').trim().replace(/^["']+|["']+$/g, '').replace(/[.!\s]+$/, '');
      if (!line || line.length > 80) return null;
      return line;
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function showThinking(topic, beforeEl) {
    const t = $('ai-thinking');
    if (beforeEl) beforeEl.before(t);               // place where the answer will land
    t.hidden = false;
    $('ai-thinking-line').textContent = COPY.loadingQuips[Math.floor(Math.random() * COPY.loadingQuips.length)];
    fetchWaitingLine(topic).then((line) => {
      if (line && !t.hidden) $('ai-thinking-line').textContent = line;   // dropped if the answer already started
    });
  }

  function hideThinking() { $('ai-thinking').hidden = true; }

  // ── follow-up thread state (reset on every new search) ──
  let thread = [];           // alternating {role, content} pairs after the seed
  let threadQuery = '';      // the query this thread belongs to
  let threadResults = [];    // grounding sources for this thread
  const imgCache = new Map();   // q.toLowerCase() -> results array
  let gridResults = [];         // currently rendered image results (the preview panel reads these)

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
            if (!firstToken) { firstToken = true; hideThinking(); }
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
    $('ai-head-label').textContent = COPY.aiHeaders[Math.floor(Math.random() * COPY.aiHeaders.length)];
    const body = $('ai-body');
    body.innerHTML = '';
    const aEl = document.createElement('div');      // the seed answer turn
    aEl.className = 'ai-turn';
    body.appendChild(aEl);
    showThinking(q, aEl);
    $('ai-error').hidden = true;
    $('ai-follow').hidden = false;                  // composer visible from the start (ChatGPT-style)
    setStreaming(true);
    const myToken = searchToken;
    let partial = '';

    try {
      const text = await streamTurn((t) => {
        partial = t;
        aEl.innerHTML = linkifyCitations(marked.parse(esc(t)), results.length);
      });
      thread.push({ role: 'assistant', content: text });
      if (!text.trim()) aEl.textContent = '✦ the cosmos answered with silence — try rephrasing?';
      panel.classList.add('done');                  // shimmer settles
    } catch (e) {
      if (e.name === 'AbortError') {
        if (aiStopRequested && partial) {           // user hit stop — keep what streamed
          thread.push({ role: 'assistant', content: partial });
          panel.classList.add('done');
        }
        return;                                     // superseded / toggled off / stopped
      }
      panel.classList.add('done');
      showAiError(() => askAstra(q, results));
    } finally {
      aiStopRequested = false;
      if (myToken === searchToken) setStreaming(false);
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
    thread.push({ role: 'user', content: question });

    const body = $('ai-body');
    const qEl = document.createElement('div');      // the user's turn: right-aligned bubble
    qEl.className = 'ai-bubble-user';
    qEl.textContent = question;
    const aEl = document.createElement('div');      // the streaming answer under it
    aEl.className = 'ai-turn';
    body.append(qEl, aEl);
    // iMessage-style morph: a ghost of the bubble travels from the composer
    const _fromRect = $('ai-follow-input').getBoundingClientRect();
    if (typeof window.motionGhost === 'function') {
      qEl.style.visibility = 'hidden';
      const started = window.motionGhost(qEl, _fromRect, () => { qEl.style.visibility = ''; });
      if (!started) qEl.style.visibility = '';
    }
    showThinking(question, aEl);

    panel.classList.remove('done');                 // shimmer spins again while answering
    $('ai-error').hidden = true;
    setStreaming(true);
    const myToken = searchToken;
    let partial = '';

    try {
      const text = await streamTurn((t) => {
        partial = t;
        aEl.innerHTML = linkifyCitations(marked.parse(esc(t)), threadResults.length);
      });
      thread.push({ role: 'assistant', content: text });
      if (!text.trim()) aEl.textContent = '✦ silence. rude, but on brand.';
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
      thread.pop();                                 // don't keep an unanswered question in context
      qEl.remove(); aEl.remove();
      panel.classList.add('done');
      showAiError(() => askFollowUp(question));
    } finally {
      aiStopRequested = false;
      if (myToken === searchToken) {
        setStreaming(false);
        $('ai-follow-input').focus({ preventScroll: true });
      }
    }
  }
})();
