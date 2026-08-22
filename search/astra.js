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
      "do astronauts do their own laundry",
      "the moon landing but make it fashion",
      "why do we park on driveways",
      "explain wifi to a medieval peasant",
      "are aliens ghosting us",
      "what's the deal with dark matter, actually",
      "can you cry in space",
      "ranking the planets by vibes",
      "how many pizzas fit in the observable universe",
      "did the chicken cross the event horizon",
      "why is pluto not a planet. fight me.",
      "do black holes dream",
      "what if the moon is just very shy",
      "speedrun guide to the heat death of the universe",
      "is mercury okay. genuinely asking.",
      "how to apologize to a satellite",
      "the sun's skincare routine",
      "can fish get thirsty",
      "what does the ISS smell like",
      "astrology but peer-reviewed",
      "why is it called a building when it's already built",
      "are there wifi dead zones in the bermuda triangle",
      "do parallel universes have parallel parking",
      "how loud is the sun",
      "what's jupiter's great red spot so angry about",
      "can you hear meowing in space",
      "the oxford comma: a space opera",
      "why is time. like, in general.",
      "do satellites get bored",
      "what if gravity is just social pressure",
      "how to file taxes in zero-g",
      "is the ocean space but wet",
      "why does the moon follow my car",
      "can a telescope see itself",
      "what do pigeons think of airplanes",
      "how many humans could outrun a comet",
      "the andromeda galaxy is coming. should i worry",
      "what sound does a supernova actually make",
      "do worms have opinions about soil",
      "why are manhole covers round (real answers only)",
      "could the moon win a fight against the sun",
      "what's the point of neptune",
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
    t.setAttribute('aria-label', on ? 'Hide AI answer' : 'Show AI answer');
    t.classList.toggle('skuo-accent', on);
    if (!on && aiAbort) aiAbort.abort();
    if (!on) cancelPerspectives();
  }

  function getAiPanelMode() {
    try {
      const mode = localStorage.getItem('astra_perspectives_mode');
      return mode === 'perspectives' ? mode : 'answer';
    } catch (_) { return 'answer'; }
  }

  function setAiPanelMode(mode) {
    mode = mode === 'perspectives' ? mode : 'answer';
    const answer = $('ai-mode-answer');
    const perspectives = $('ai-mode-perspectives');
    [answer, perspectives].forEach((button) => {
      const selected = button === (mode === 'perspectives' ? perspectives : answer);
      button.classList.toggle('on', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    });
    try { localStorage.setItem('astra_perspectives_mode', mode); } catch (_) {}
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

  // ── rotating placeholder ghosts (both bars, in sync) ──
  // The native placeholder is the static default "search the web…" (shown at load,
  // during rests, and as the no-JS fallback); the quips ride on an animated
  // .ph-ghost overlay — quips fade/swipe every 4s and the cycle rests on the
  // default for a double beat after every 3rd quip. Reduced-motion / webdriver:
  // instant swaps, no slide (CSS also kills the transition).
  function rotatePlaceholders() {
    const pairs = [
      { input: $('hero-input'), ghost: $('hero-ghost') },
      { input: $('results-input'), ghost: $('results-ghost') },
    ];
    const reduced = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || navigator.webdriver;
    let i = Math.floor(Math.random() * COPY.placeholders.length);
    let current = '', quipsSinceRest = 0, resting = false;

    const paint = (t) => {
      current = t;
      pairs.forEach(({ input, ghost }) => {
        ghost.textContent = t;
        ghost.classList.toggle('on', !!t && !input.value && document.activeElement !== input);
      });
    };
    pairs.forEach(({ input }) => {
      input.addEventListener('input', () => paint(current));
      input.addEventListener('focus', () => paint(current));
      input.addEventListener('blur', () => paint(current));
    });

    const transition = (t) => {
      if (reduced) { paint(t); return; }
      pairs.forEach(({ ghost }) => ghost.classList.add('ph-out'));
      setTimeout(() => {
        pairs.forEach(({ ghost }) => {
          ghost.classList.remove('on', 'ph-out');
          void ghost.offsetWidth;               // reflow so the enter transition runs
        });
        paint(t);
      }, 220);
    };

    const tick = () => {
      if (resting) { resting = false; return; }                    // second half of the rest
      if (quipsSinceRest >= 3) {
        quipsSinceRest = 0; resting = true;
        transition('');                                            // ghost hides → default shows ~8s
        return;
      }
      transition(COPY.placeholders[i]);
      i = (i + 1) % COPY.placeholders.length;
      quipsSinceRest++;
    };
    setInterval(tick, 4000);                                       // default shows until the first tick
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
  let lastStandardResults = [];
  let lastStandardQuery = '';
  let perspectivesAbort = null;
  let perspectivesToken = 0;
  let scrollObserver = null;
  let fullscreenTitle = '';
  const modalStack = [];

  function focusableIn(root) {
    return Array.from(root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.hidden && el.getClientRects().length);
  }

  function setLayerBackgroundInert(dialog, open) {
    let node = dialog;
    while (node && node !== document.body) {
      const parent = node.parentElement;
      if (!parent) break;
      Array.from(parent.children).forEach((child) => {
        if (child !== node && !child.matches('script')) child.inert = open;
      });
      node = parent;
    }
  }

  function openModalLayer(dialog, initialFocus, restoreFocus) {
    if (modalStack.some((layer) => layer.dialog === dialog)) return;
    modalStack.push({ dialog, restoreFocus });
    setLayerBackgroundInert(dialog, true);
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => initialFocus.focus({ preventScroll: true }));
  }

  function closeModalLayer(dialog) {
    const index = modalStack.findIndex((layer) => layer.dialog === dialog);
    if (index < 0) return;
    const [{ restoreFocus }] = modalStack.splice(index, 1);
    setLayerBackgroundInert(dialog, false);
    document.body.classList.toggle('modal-open', modalStack.length > 0);
    if (restoreFocus && restoreFocus.isConnected) restoreFocus.focus({ preventScroll: true });
  }

  function trapModalFocus(e) {
    const layer = modalStack[modalStack.length - 1];
    if (!layer) return;
    const focusable = focusableIn(layer.dialog);
    if (!focusable.length) { e.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function closeTopModal() {
    const layer = modalStack[modalStack.length - 1];
    if (!layer) return false;
    if (layer.dialog === $('ig-preview')) return closeImagePreview();
    if (layer.dialog === $('ai-panel')) { exitAiFullscreen(); return true; }
    return false;
  }

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
    closeLinkPreview();
    exitAiFullscreen();
    if (aiAbort) aiAbort.abort();
    cancelPerspectives();
    searchToken++;
    $('results').hidden = true;
    $('hero').hidden = false;
    document.title = 'Okemo Astra ✦';
  }

  let lastAllQuery = '';   // guards against re-running a finished search on tab restore
  let lastImgQuery = '';

  function paintTabs(tab) {
    [$('tab-all'), $('tab-images')].forEach((tabEl, index) => {
      const selected = tab === 'images' ? index === 1 : index === 0;
      tabEl.classList.toggle('on', selected);
      tabEl.setAttribute('aria-selected', selected ? 'true' : 'false');
      tabEl.tabIndex = selected ? 0 : -1;
    });
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
      closeLinkPreview();                        // Images tab has no result rows — never leave the dock open
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
  setAiPanelMode(getAiPanelMode());
  $('ai-toggle').addEventListener('click', () => {
    const on = !getAiMode();
    setAiMode(on);
    const { q } = readRoute();
    if (on && q) {
      $('ai-panel').hidden = false;
      if (lastStandardQuery === q) dispatchAiPanel(q, lastStandardResults);
      else { lastAllQuery = q; runSearch(q); }
    }
    if (!on) $('ai-panel').hidden = true;             // toggling off hides the panel
  });
  $('ai-mode-answer').addEventListener('click', () => switchAiPanelMode('answer'));
  $('ai-mode-perspectives').addEventListener('click', () => switchAiPanelMode('perspectives'));
  $('ai-mode-toggle').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const buttons = [$('ai-mode-answer'), $('ai-mode-perspectives')];
    const current = Math.max(0, buttons.indexOf(document.activeElement));
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
      : (current + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  });
  $('tab-all').addEventListener('click', () => { const r = readRoute(); if (r.q && r.tab !== 'all') go(r.q, 'all'); });
  $('tab-images').addEventListener('click', () => { const r = readRoute(); if (r.q && r.tab !== 'images') go(r.q, 'images'); });
  $('r-tabs').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const tabs = [$('tab-all'), $('tab-images')];
    const current = Math.max(0, tabs.indexOf(document.activeElement));
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1
      : (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  });
  const linkPreviewDock = $('link-preview');
  if (linkPreviewDock) {
    linkPreviewDock.inert = true;
    $('lp-close').addEventListener('click', closeLinkPreview);
    // stays open once shown — only a click outside it (or hovering another
    // result, which just swaps its contents) closes it, per design
    document.addEventListener('click', (e) => {
      if (!linkPreviewDock.classList.contains('open')) return;
      if (linkPreviewDock.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.r-title')) return;
      closeLinkPreview();
    });
  }
  $('igp-close').addEventListener('click', closeImagePreview);
  $('igp-scrim').addEventListener('click', closeImagePreview);
  $('ai-expand').addEventListener('click', () => toggleAiFullscreen());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') trapModalFocus(e);
    if (e.key === 'Escape') closeTopModal();
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
    if (el) {
      el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      el.classList.remove('citation-target');
      void el.offsetWidth;
      el.classList.add('citation-target');
      setTimeout(() => el.classList.remove('citation-target'), 1600);
    }
  });

  $('ai-sources').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#result-"]');
    if (!a) return;
    e.preventDefault();
    const n = +(a.hash.slice('#result-'.length));
    if ($('ai-panel').classList.contains('ai-fullscreen')) {
      const result = lastResults[n - 1];
      if (result) window.open(result.url, '_blank', 'noopener');
      return;
    }
    const target = $('result-' + n);
    if (target) {
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      target.classList.add('citation-target');
      setTimeout(() => target.classList.remove('citation-target'), 1600);
    }
  });

  // ── backend base (same resolution as chat's api.js, minus the tunnel fetch) ──
  function backendBase() {
    try {
      const origin = window.location.origin;
      const isLocal = origin.includes('localhost:8001') || origin.includes('127.0.0.1:8001');
      const isTunnel = origin.includes('api.okemovail.com');
      if (isLocal || isTunnel) return origin;
      return (localStorage.getItem('vail_custom_backend_url') || 'https://api.okemovail.com').replace(/\/$/, '');
    }
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

    function syncCombobox() {
      input.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
      input.setAttribute('aria-activedescendant', active >= 0 ? box.children[active].id : '');
    }
    function close() { clearTimeout(timer); box.hidden = true; items = []; active = -1; syncCombobox(); }
    function render() {
      box.innerHTML = '';
      if (!items.length) return close();
      items.forEach((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = box.id + '-option-' + i;
        b.role = 'option';
        b.setAttribute('aria-selected', i === active ? 'true' : 'false');
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
      syncCombobox();
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
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        active = e.key === 'Home' ? 0 : items.length - 1;
        input.value = items[active];
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

  function cancelPerspectives() {
    perspectivesToken++;
    if (perspectivesAbort) perspectivesAbort.abort();
    perspectivesAbort = null;
  }

  function restoreStandardResults(q) {
    if (lastStandardQuery !== q) return false;
    lastResults = lastStandardResults;
    totalResults = lastStandardResults.length;
    nextOffset = PAGE_STEP;
    resultsDone = false;
    renderResults(lastStandardResults, 0, false);
    if (lastStandardResults.length) watchSentinel(q);
    else renderEmptyResults(q);
    $('r-meta').textContent = lastStandardResults.length ? COPY.metaLine(totalResults, lastSecs) : '';
    return true;
  }

  function dispatchAiPanel(q, results) {
    if (getAiPanelMode() === 'perspectives') runPerspectives(q);
    else askAstra(q, results);
  }

  function switchAiPanelMode(mode) {
    const q = readRoute().q;
    setAiPanelMode(mode);
    if (!q || !getAiMode()) return;
    if (mode === 'perspectives') {
      if (aiAbort) aiAbort.abort();
      runPerspectives(q);
      return;
    }
    cancelPerspectives();
    if (restoreStandardResults(q)) askAstra(q, lastStandardResults);
    else runSearch(q);
  }

  function showPerspectivesFallback(q, message) {
    const body = $('ai-body');
    body.innerHTML = '';
    const fallback = document.createElement('div');
    fallback.className = 'perspectives-fallback';
    fallback.appendChild(document.createTextNode(message + ' '));
    const button = document.createElement('button');
    button.className = 'skuo skuo-neutral';
    button.id = 'perspectives-fallback-answer';
    button.type = 'button';
    button.textContent = 'Try standard answer';
    button.addEventListener('click', () => {
      setAiPanelMode('answer');
      cancelPerspectives();
      if (restoreStandardResults(q)) askAstra(q, lastStandardResults);
      else runSearch(q);
    });
    fallback.appendChild(button);
    body.appendChild(fallback);
  }

  async function runPerspectives(q) {
    cancelPerspectives();
    const token = ++perspectivesToken;
    perspectivesAbort = new AbortController();
    const panel = $('ai-panel');
    panel.hidden = false;
    panel.classList.remove('done');
    panel.setAttribute('aria-busy', 'true');
    $('ai-head-label').textContent = '✦ Perspectives';
    $('ai-provenance').hidden = true;
    $('ai-sources').hidden = true;
    hideThinking();
    $('ai-follow').hidden = true;
    $('ai-error').hidden = true;
    $('ai-body').innerHTML = '<div class="perspectives-loading">' +
      '<div class="perspectives-skel"><span></span><span></span><span></span></div>' +
      '<div class="perspectives-skel"><span></span><span></span></div>' +
      '<div class="perspectives-skel"><span></span><span></span><span></span></div></div>';

    const t0 = performance.now();
    try {
      const res = await fetch(
        backendBase() + '/api/perspectives?q=' + encodeURIComponent(q) + '&n=30',
        {
          signal: perspectivesAbort.signal,
          headers: { 'ngrok-skip-browser-warning': 'true', 'bypass-tunnel-reminder': 'true' },
        }
      );
      if (!res.ok) throw new Error('perspectives ' + res.status);
      const data = await res.json();
      if (token !== perspectivesToken || getAiPanelMode() !== 'perspectives' || readRoute().q !== q) return;
      if (!data || !Array.isArray(data.results)) throw new Error('invalid perspectives response');
      const results = data.results.map((r) => ({
        url: r.url,
        title: r.title,
        domain: r.domain,
        sources: r.sources,
        description: r.description || r.snippet || '',
      }));
      lastResults = results;
      renderResults(results, 0, false);
      if (scrollObserver) scrollObserver.disconnect();
      const secs = ((performance.now() - t0) / 1000).toFixed(2);
      $('r-meta').textContent = results.length ? COPY.metaLine(results.length, secs) : '';
      if (data.perspectives === null) {
        showPerspectivesFallback(q, 'Perspectives analysis unavailable for this query.');
      } else {
        $('ai-body').innerHTML = AstraHelpers.parsePerspectivesJSON(data.perspectives, results.length);
        panel.classList.add('done');
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (token !== perspectivesToken || getAiPanelMode() !== 'perspectives' || readRoute().q !== q) return;
      console.error('Perspectives error:', e);
      showPerspectivesFallback(q, 'Perspectives analysis failed.');
    } finally {
      if (token === perspectivesToken) panel.setAttribute('aria-busy', 'false');
    }
  }
  window.runPerspectives = runPerspectives;

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

  let hoverTimer = null;
  let previewLoadTimer = null;
  let previewToken = 0;

  function canShowLinkPreview() {
    return window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1180px)').matches;
  }

  function openLinkPreview(r) {
    const dock = $('link-preview');
    if (!dock) return;
    const identity = AstraHelpers.domainIdentity(r.url);
    const c = crumbFor(r.url);
    $('lp-title').textContent = r.title || r.url;
    $('lp-host').textContent = c.site;
    $('lp-snippet').textContent = r.description || '';
    $('lp-visit').href = r.url;
    const favicon = $('lp-favicon');
    favicon.style.visibility = '';
    favicon.onerror = () => { favicon.style.visibility = 'hidden'; };
    favicon.src = 'https://' + identity.hostname + '/favicon.ico';

    const ogImage = $('lp-ogimage');
    const ogImgWrap = $('lp-ogwrap');
    ogImage.style.visibility = 'hidden';
    ogImgWrap.hidden = true;

    const frame = $('lp-frame');
    const snippetBlock = $('lp-snippet-block');
    clearTimeout(previewLoadTimer);
    previewToken++;
    const token = previewToken;
    frame.onload = null;
    frame.src = 'about:blank';
    frame.hidden = true;
    snippetBlock.hidden = false;

    dock.classList.add('open');
    dock.setAttribute('aria-hidden', 'false');
    dock.inert = false;

    fetch(backendBase() + '/api/preview?url=' + encodeURIComponent(r.url),
      { headers: { 'ngrok-skip-browser-warning': 'true', 'bypass-tunnel-reminder': 'true' } })
      .then(function (res) { return res.ok ? res.json() : {}; })
      .catch(function () { return {}; })
      .then(function (og) {
        if (token !== previewToken) return;
        if (og.image && /^https?:\/\//i.test(og.image)) {
          ogImgWrap.hidden = false;
          ogImage.src = og.image;
          ogImage.onload = function () { ogImage.style.visibility = ''; };
          ogImage.onerror = function () { ogImgWrap.hidden = true; };
        }
        if (og.title) $('lp-title').textContent = og.title;
        if (og.description) $('lp-snippet').textContent = og.description;
        if (og.site_name) $('lp-host').textContent = og.site_name;
      });

    if (AstraHelpers.isLikelyFrameBlocked(r.url)) return;

    frame.onload = function () {
      if (token !== previewToken) return;
      clearTimeout(previewLoadTimer);
      var blocked = false;
      try { void frame.contentWindow.location.href; blocked = true; } catch (_) { blocked = false; }
      frame.hidden = blocked;
      if (!blocked) snippetBlock.hidden = true;
    };
    frame.src = r.url;
    previewLoadTimer = setTimeout(function () {
      if (token !== previewToken) return;
      frame.hidden = true;
    }, 1500);
  }

  function closeLinkPreview() {
    const dock = $('link-preview');
    if (!dock) return;
    dock.classList.remove('open');
    dock.setAttribute('aria-hidden', 'true');
    dock.inert = true;
    previewToken++;
    clearTimeout(previewLoadTimer);
    const frame = $('lp-frame');
    if (frame) { frame.onload = null; frame.src = 'about:blank'; }
  }

  function renderResults(results, start, append) {
    const list = $('result-list');
    const sentinel = append ? $('result-sentinel') : null;
    if (!append) { list.innerHTML = ''; closeLinkPreview(); }
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

      const identity = AstraHelpers.domainIdentity(r.url);
      const img = document.createElement('span');
      img.className = 'r-favi r-monogram r-monogram-' + identity.paletteIndex;
      img.textContent = identity.monogram;
      img.setAttribute('aria-hidden', 'true');
      const favicon = document.createElement('img');
      favicon.className = 'r-favi-real';
      favicon.alt = '';
      favicon.loading = 'lazy';
      favicon.referrerPolicy = 'no-referrer';
      favicon.src = 'https://' + identity.hostname + '/favicon.ico';
      favicon.addEventListener('error', () => favicon.remove(), { once: true });
      img.prepend(favicon);

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
      const newTab = document.createElement('span');
      newTab.className = 'sr-only';
      newTab.textContent = ' (opens in a new tab)';
      a.appendChild(newTab);
      const snip = document.createElement('p');
      snip.className = 'r-snippet';
      snip.textContent = r.description || '';
      let sourceTags = null;
      if (Array.isArray(r.sources) && r.sources.length) {
        const sourceLabels = { duckduckgo: 'DDG', ddg: 'DDG', bing: 'Bing', mojeek: 'Mojeek' };
        sourceTags = document.createElement('div');
        sourceTags.className = 'r-source-tags';
        r.sources.forEach((source) => {
          const label = sourceLabels[String(source).toLowerCase()];
          if (!label) return;
          const sourceTag = document.createElement('span');
          sourceTag.className = 'r-source-tag';
          sourceTag.textContent = label;
          sourceTags.appendChild(sourceTag);
        });
      }

      const hoverBar = document.createElement('span');
      hoverBar.className = 'r-hover-bar';
      hoverBar.setAttribute('aria-hidden', 'true');
      const hoverFill = document.createElement('span');
      hoverFill.className = 'r-hover-fill';
      hoverBar.appendChild(hoverFill);

      a.addEventListener('mouseenter', () => {
        if (!canShowLinkPreview()) return;
        clearTimeout(hoverTimer);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        hoverFill.style.transition = reduced ? 'none' : 'width 340ms linear';
        hoverFill.style.width = '0%';
        requestAnimationFrame(() => requestAnimationFrame(() => { hoverFill.style.width = '100%'; }));
        hoverTimer = setTimeout(() => openLinkPreview(r), 340);
      });
      a.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimer);
        hoverFill.style.transition = 'none';
        hoverFill.style.width = '0%';
        // the dock itself stays open once shown — closing it is handled by the
        // click-outside listener and the #lp-close button (see wireup near top)
      });

      wrap.append(head, a, hoverBar, snip);
      if (sourceTags) wrap.appendChild(sourceTags);
      li.append(img, wrap);
      if (sentinel) list.insertBefore(li, sentinel); else list.appendChild(li);
    });
  }

  function renderResultSkeletons() {
    const list = $('result-list');
    list.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const row = document.createElement('li');
      row.className = 'result result-skel';
      row.setAttribute('aria-hidden', 'true');
      row.innerHTML = '<span class="r-skel-dot"></span><span><i></i><i></i><i></i></span>';
      list.appendChild(row);
    }
  }

  function renderEmptyResults(q) {
    statusCard('✦', COPY.emptyResults + ' Try fewer words or check the spelling.');
    const card = $('result-list').firstElementChild;
    const edit = document.createElement('button');
    edit.className = 'skuo skuo-neutral';
    edit.textContent = 'edit search';
    edit.addEventListener('click', () => $('results-input').focus());
    const images = document.createElement('button');
    images.className = 'skuo skuo-neutral';
    images.textContent = 'try Images';
    images.addEventListener('click', () => go(q, 'images'));
    const actions = document.createElement('div');
    actions.className = 'status-actions';
    actions.append(edit, images);
    card.appendChild(actions);
  }

  function ensureSentinel() {
    let s = $('result-sentinel');
    if (!s) {
      s = document.createElement('li');
      s.id = 'result-sentinel';
      s.className = 'r-sentinel';
      $('result-list').appendChild(s);
    }
    s.innerHTML = '';
    const button = document.createElement('button');
    button.id = 'result-load-more';
    button.className = 'skuo skuo-neutral';
    button.type = 'button';
    button.textContent = '✦ Load more stars';
    button.addEventListener('click', () => loadMore(readRoute().q));
    s.appendChild(button);
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
    btn.id = 'result-load-more';
    btn.textContent = COPY.loadMoreError;
    btn.addEventListener('click', () => { ensureSentinel(); loadMore(q); });
    s.appendChild(btn);
  }

  async function loadMore(q) {
    if (loadingMore || resultsDone || $('result-list').hidden) return;
    const token = searchToken;
    loadingMore = true;
    let failed = false;
    const button = $('result-load-more');
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'consulting the cosmos…'; }
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
      failed = true;
      sentinelLoadError(q);
    } finally {
      loadingMore = false;
      if (token !== searchToken) return;
      const current = $('result-load-more');
      if (current) {
        current.disabled = false;
        current.removeAttribute('aria-busy');
        if (!failed) current.textContent = '✦ Load more stars';
      }
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
    const restoreFocus = document.activeElement;
    $('ig-preview').hidden = false;
    const img = $('igp-img');
    img.src = r.thumbnail || r.image;               // thumbnail paints instantly…
    img.alt = r.title || 'Image from ' + crumbFor(r.url).site;
    $('igp-title').textContent = r.title || '';
    $('igp-host').textContent = crumbFor(r.url).site;
    $('igp-visit').href = r.url;
    $('igp-open').href = r.image;
    const full = new Image();                       // …full image swaps in when ready
    full.onload = () => { img.src = r.image; };
    full.src = r.image;
    openModalLayer($('ig-preview'), $('igp-close'), restoreFocus);
  }

  function closeImagePreview() {
    if ($('ig-preview').hidden) return false;
    closeModalLayer($('ig-preview'));
    $('ig-preview').hidden = true;
    return true;
  }

  async function runSearch(q) {
    exitAiFullscreen();                         // a new search always lands inline
    if (aiAbort) aiAbort.abort();
    cancelPerspectives();
    const token = ++searchToken;
    const panel = $('ai-panel');
    const aiOn = getAiMode();
    panel.hidden = !aiOn;                       // AI mode off → results-only page
    panel.classList.remove('done');
    $('ai-head-label').textContent = COPY.aiHeaders[0];
    $('ai-body').innerHTML = '';
    $('ai-sources').innerHTML = '';
    $('ai-error').hidden = true;
    hideThinking();
    $('ai-follow').hidden = true;
    $('r-meta').textContent = 'searching the universe for “' + q + '”…';
    $('result-list').setAttribute('aria-busy', 'true');
    renderResultSkeletons();
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
      $('result-list').setAttribute('aria-busy', 'false');
      return;
    }
    if (token !== searchToken) return;

    lastResults = results;
    lastStandardResults = results;
    lastStandardQuery = q;
    nextOffset = PAGE_STEP;
    totalResults = results.length;
    const secs = ((performance.now() - t0) / 1000).toFixed(2);
    lastSecs = secs;
    $('r-meta').textContent = results.length ? COPY.metaLine(totalResults, secs) : '';
    if (results.length) { renderResults(results, 0, false); watchSentinel(q); }
    else renderEmptyResults(q);   // AI still answers from knowledge
    $('result-list').setAttribute('aria-busy', 'false');

    if (aiOn) {
      if (getAiPanelMode() === 'perspectives') runPerspectives(q);
      else askAstra(q, results);
    }
  }

  // ── AI answer: scraped-results-grounded Saga, streamed over SSE ──
  // ── streaming renderer ──
  // Completed blocks (blank-line separated) bake to crisp static nodes; the open
  // block lives in one persistent .ai-tail div whose innerHTML is swapped by the
  // typewriter drain (makeTypewriter) — the typing cadence is the animation.
  // Call render.finalize(text) at completion for one crisp full-parse render.
  function makeStreamRenderer(aEl, count) {
    let finalized = 0;               // source chars already baked into crisp nodes
    let tail = null;                 // the live open block
    const render = (t) => {
      const cut = t.lastIndexOf('\n\n');
      const fenced = cut !== -1 && ((t.slice(0, cut).match(/```/g) || []).length % 2 === 1);
      if (cut > finalized && !fenced) {
        const tmp = document.createElement('div');
        tmp.innerHTML = AstraHelpers.renderAssistantHtml(t.slice(finalized, cut), count, window.marked);
        if (tail) { tail.remove(); tail = null; }
        while (tmp.firstChild) aEl.appendChild(tmp.firstChild);
        finalized = cut;
      }
      const open = t.slice(finalized);
      if (open.trim()) {
        if (!tail) {
          tail = document.createElement('div');
          tail.className = 'ai-tail';
          aEl.appendChild(tail);
        }
        tail.innerHTML = AstraHelpers.renderAssistantHtml(open, count, window.marked);
      }
    };
    render.finalize = (t) => {
      aEl.innerHTML = AstraHelpers.renderAssistantHtml(t, count, window.marked);
    };
    return render;
  }

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

  function setStreaming(on) {
    $('ai-panel').setAttribute('aria-busy', on ? 'true' : 'false');
    $('ai-follow-input').disabled = on;
    $('ai-follow-send').disabled = on;
    $('ai-follow-send').hidden = on;
    $('ai-stop').hidden = !on;
  }

  function toggleAiFullscreen(force) {
    const panel = $('ai-panel');
    const on = typeof force === 'boolean' ? force : !panel.classList.contains('ai-fullscreen');
    if (on) fullscreenTitle = document.title;
    panel.classList.toggle('ai-fullscreen', on);
    $('ai-expand').textContent = on ? '✕' : '⤢';
    $('ai-expand').setAttribute('aria-label', on ? 'exit fullscreen' : 'fullscreen');
    $('ai-expand').title = on ? 'exit fullscreen' : 'fullscreen';
    $('ai-expand').setAttribute('aria-expanded', on ? 'true' : 'false');
    document.title = on ? 'Astra Answer — Okemo Astra' : fullscreenTitle;
    if (on) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'ai-head-label');
      openModalLayer(panel, $('ai-expand'), $('ai-expand'));
    } else {
      closeModalLayer(panel);
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      panel.removeAttribute('aria-labelledby');
    }
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

  function renderAiSources(results) {
    const host = $('ai-sources');
    host.innerHTML = '';
    results.slice(0, 5).forEach((r, i) => {
      const a = document.createElement('a');
      a.className = 'ai-source';
      a.href = '#result-' + (i + 1);
      a.textContent = (i + 1) + ' · ' + crumbFor(r.url).site;
      host.appendChild(a);
    });
  }

  // streams one assistant turn; onToken(text) only accumulates partials (for
  // stop-early) — turns render WHOLE on completion, no incremental typewriter
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
            if (!firstToken) { firstToken = true; hideThinking(); }   // orb hands off to the typewriter
            text += delta;
            if (onToken) onToken(text);
          }
        } catch { /* partial JSON chunk — ignore */ }
      }
      if (sawDone) break;
    }
    return text;
  }

  async function askAstra(q, results) {
    cancelPerspectives();
    seedThread(q, results);
    renderAiSources(results);
    const panel = $('ai-panel');
    panel.hidden = false;
    panel.classList.remove('done');
    $('ai-provenance').hidden = false;
    $('ai-sources').hidden = false;
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
        } else {
          hideThinking();
        }
        return;                                     // superseded / toggled off / stopped
      }
      hideThinking();
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
          hideThinking();
          thread.pop();                             // stopped before anything streamed
          qEl.remove(); aEl.remove();
        }
        return;
      }
      thread.pop();                                 // don't keep an unanswered question in context
      qEl.remove(); aEl.remove();
      hideThinking();
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
