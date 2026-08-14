# Site-Wide Motion System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole site a "premium but fun" motion language — silky expo base + gentle-spring accents, smooth transitions everywhere, cross-page morphs, and an iMessage-style seamless send — with no framework and no build step.

**Architecture:** Per spec `docs/superpowers/specs/2026-08-14-motion-system-design.md` (read it first). Motion tokens live in `src/site.css` §2; a tiny dependency-free `src/motion.js` provides scroll reveals + a FLIP "ghost" helper; cross-page navigation animates via the View Transitions API (progressive enhancement); chat and Astra send paths get the iMessage morph via a cloned-bubble ghost animation.

**Tech Stack:** vanilla CSS/JS. No new dependencies. Verification reuses `tools/snapshot.mjs` + `tools/visual-diff.mjs` (Playwright pixel-diff harness from the unified-stylesheet project).

---

## Background for the engineer

- **No-build vanilla site.** Pages are served statically; `src/site.css` is the single hand-written stylesheet with `[data-page="..."]`-scoped page sections. Page-local animation CSS goes in that page's section; global motion goes in the §3 block added by Task 3.
- **Snapshots baseline already exists.** `tools/snapshots/before/*.png` (32 shots, light+dark × 16 pages) was captured before the stylesheet migration and matches current rendering exactly. Reuse it. If it is missing, re-capture with `node tools/snapshot.mjs before` BEFORE changing anything.
- **`navigator.webdriver` guard is load-bearing.** Playwright sets `navigator.webdriver = true`, so every JS-driven entrance (reveals, staggers, morphs, same-page view transitions) must bail when it's true — this keeps the pixel-diff harness deterministic. CSS-only motion (load animations) finishes well inside the harness's 1.5s settle.
- **Chat's `render()` is ephemeral.** `AI/js/render.js` rebuilds the whole message list from `window.chatHistory` on every full render, so inline styles set on a bubble don't survive the next render — that's fine and the plan relies on it.
- **Chat row entrances:** `.user-msg-bubble` has `animation: chat-fadeIn 0.3s ease-out forwards` (site.css ~line 2260). `.ai-row` gets class `animate-fade-in` from render.js but that class has **no rule in the chat section** (it's only defined for `[data-page="research"]`) — so AI rows currently pop in with no animation.
- **Edit flow discovery:** `window.editMsg` (chat-actions.js ~490) loads the old text back into the input and re-renders; the user re-sends by pressing enter → `sendMessage(null)` → that IS a typed send and should morph. `window.regenMsg`/`regenMsgWithSearch` call `sendMessage(msg)` with an explicit `txt` → gated out of the morph by `txt === null`. This matches the spec's intent ("regenerated messages keep the plain path").
- **The hard-overshoot spring** `cubic-bezier(0.34, 1.56, 0.64, 1)` appears 7× in site.css (nav pop + 6 chat-section rules). Task 1 retunes all of them to `var(--ease-soft)`.
- **Astra's hero and results are two `<main>` blocks in ONE page** (`#hero`, `#results`, toggled via `hidden`) — the hero⇄results swap is a *same-document* transition (`document.startViewTransition`), while `index.html` → `search/index.html` is a *cross-document* one (`@view-transition { navigation: auto }` + shared `view-transition-name`).
- **Commit style:** conventional, lowercase, scoped (e.g. `feat(motion): ...`). Commits are pre-approved by this plan.

---

### Task 1: Motion tokens + easing retune

**Files:**
- Modify: `src/site.css`

- [ ] **Step 1: Insert the motion token block**

Find the comment `/* ── Light tokens ───────────────────────────────────────────── */` in `src/site.css` (~line 50, just after the JetBrains Mono `@import`). Insert IMMEDIATELY BEFORE it:

```css
/* ── Motion tokens (motion system, spec 2026-08-14) ─────────────────────
   Every transition/animation consumes these. Re-tune the whole site's
   feel by editing this block. Recipe B: silky base + gentle spring. ── */
:root {
  --ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);  /* workhorse: hovers, fades, rises, expands, page transitions */
  --ease-soft:   cubic-bezier(0.34, 1.3, 0.64, 1); /* gentle spring: presses, pops, entrances — the "fun" */
  --dur-1: 140ms;  --dur-2: 220ms;  --dur-3: 360ms;  --dur-4: 560ms;
  --stagger: 45ms;
  --rise: 10px;
}

```

- [ ] **Step 2: Retune the hard-overshoot spring site-wide**

Replace every occurrence of `cubic-bezier(0.34, 1.56, 0.64, 1)` with `var(--ease-soft)` in `src/site.css` (7 occurrences: `.ov-nav__bar.pop` ~line 705, and chat-section rules ~lines 1741, 1891, 1993, 2029, 2962, 4215). A `replaceAll` edit is fine.

Verify: `grep -c "1\.56" src/site.css` → `0`.

- [ ] **Step 3: Tokenize home's existing entrance systems**

In the HOME page section, edit two rules:

`[data-page="home"] .reveal` (~line 5704) — change the transition line to:
```css
      transition: opacity var(--dur-4) var(--ease-smooth), transform var(--dur-4) var(--ease-smooth);
```

`[data-page="home"] .load` (~line 5712) — change the animation line to:
```css
      animation: fadeUp var(--dur-4) var(--ease-smooth) forwards;
```

(Keep `.d1`–`.d4` delays and the 22px distances as they are — home's stagger already ships and feels right.)

- [ ] **Step 4: Tokenize chat's user-bubble fade**

`[data-page="chat"] .user-msg-bubble` (~line 2260) — change:
```css
            animation: chat-fadeIn 0.3s ease-out forwards;
```
to:
```css
            animation: chat-fadeIn var(--dur-2) var(--ease-smooth) forwards;
```

- [ ] **Step 5: Tokenize the `.skuo` button transitions + soft press**

In §3, the `.skuo, .skuomorphic-btn, .skuomorphic-button` base rule (~line 215) — replace the `transition:` block with:
```css
  transition:
    transform var(--dur-1) var(--ease-soft),
    box-shadow var(--dur-2) var(--ease-smooth),
    filter var(--dur-2) var(--ease-smooth),
    background-image var(--dur-2) var(--ease-smooth);
```

In the `.skuo:active` rule (~line 247) — change `transform: translateY(1px);` to:
```css
  transform: translateY(1px) scale(0.96);
```

- [ ] **Step 6: Snapshot sweep — expect no visual change**

```bash
ls tools/snapshots/before | wc -l   # expect 32; if missing: node tools/snapshot.mjs before
node tools/snapshot.mjs after
node tools/visual-diff.mjs
```

Expected: every pair `< 2%` (all retunes alter motion only; settled states are identical).

- [ ] **Step 7: Commit**

```bash
git add src/site.css
git commit -m "feat(motion): motion tokens in site.css §2 + retune springs/entrances to them"
```

---

### Task 2: `src/motion.js` — reveal observer + ghost helper

**Files:**
- Create: `src/motion.js`
- Modify: `AI/index.html`, `search/index.html`, `AI/chat.html` (one `<script>` tag each)

- [ ] **Step 1: Create `src/motion.js` with exactly this content**

```js
/* ═══════════════════════════════════════════════════════════════════════
   src/motion.js — site-wide motion runtime (no dependencies).
   1. Scroll reveals: elements with [data-reveal] fade+rise when scrolled
      into view (optional data-reveal-delay="<ms>"). Styles are gated behind
      html.motion-ready, so content is NEVER hidden when JS is absent.
   2. window.motionGhost(targetEl, fromRect, onDone) — FLIP-style travel:
      a clone of targetEl flies from fromRect to the element's real rect
      (the "iMessage send" morph). Caller hides the real element and
      reveals it in onDone.
   Everything bails (content shown instantly, morph skipped) under
   prefers-reduced-motion AND under automation (navigator.webdriver) so
   Playwright screenshots stay deterministic.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var automated = !!navigator.webdriver;

  document.documentElement.classList.add('motion-ready');

  function revealAll() {
    document.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('revealed'); });
  }

  function initReveals() {
    if (reduce || automated) { revealAll(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.style.transitionDelay = (el.dataset.revealDelay || 0) + 'ms';
        el.classList.add('revealed');
        el.addEventListener('transitionend', function () { el.style.transitionDelay = ''; }, { once: true });
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initReveals);
  else initReveals();

  /* motionGhost: fly a clone of targetEl from fromRect to targetEl's rect.
     Returns true if the animation started (onDone fires at the end),
     false if skipped (onDone still fires, so callers can reveal). */
  window.motionGhost = function (targetEl, fromRect, onDone) {
    var done = function () { if (onDone) onDone(); };
    if (reduce || automated || !targetEl || !fromRect || typeof targetEl.animate !== 'function') { done(); return false; }
    var toRect = targetEl.getBoundingClientRect();
    if (!toRect.width || !toRect.height) { done(); return false; }

    var ghost = targetEl.cloneNode(true);          // clone => exact target styling
    ghost.setAttribute('aria-hidden', 'true');
    ghost.classList.add('motion-ghost');
    var radius = getComputedStyle(targetEl).borderRadius;
    Object.assign(ghost.style, {
      position: 'fixed', margin: '0', maxWidth: 'none', maxHeight: 'none',
      left: fromRect.left + 'px', top: fromRect.top + 'px',
      width: fromRect.width + 'px', height: fromRect.height + 'px',
      borderRadius: '22px', overflow: 'hidden',
      visibility: 'visible', animation: 'none', transition: 'none',
      boxSizing: 'border-box', pointerEvents: 'none', zIndex: '9999'
    });
    document.body.appendChild(ghost);

    var anim = ghost.animate([
      { left: fromRect.left + 'px', top: fromRect.top + 'px', width: fromRect.width + 'px', height: fromRect.height + 'px', borderRadius: '22px' },
      { left: toRect.left + 'px', top: toRect.top + 'px', width: toRect.width + 'px', height: toRect.height + 'px', borderRadius: radius }
    ], { duration: 420, easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)', fill: 'forwards' }); /* var(--ease-soft) */

    function finish() { ghost.remove(); done(); }
    anim.onfinish = finish;
    anim.oncancel = finish;
    return true;
  };
})();
```

- [ ] **Step 2: Load it on the three JS-driven pages**

- `AI/index.html`: add `<script src="../src/motion.js"></script>` immediately BEFORE the existing `<script src="../src/nav.js"></script>` (~line 367).
- `search/index.html`: add `<script src="../src/motion.js"></script>` immediately BEFORE `<script src="astra.js"></script>` (last script tag, ~line 101).
- `AI/chat.html`: find `<script src="js/chat-actions.js">` and add, immediately before it, in this order:
  ```html
  <script src="../src/motion.js"></script>
  ```

(The chat morph wiring file arrives in Task 7; Task 2 only adds motion.js everywhere.)

- [ ] **Step 3: Verify**

```bash
node tools/snapshot.mjs after ai-home && node tools/snapshot.mjs after search && node tools/snapshot.mjs after chat
node tools/visual-diff.mjs ai-home && node tools/visual-diff.mjs search && node tools/visual-diff.mjs chat
```

Expected: all `< 2%` (webdriver bail ⇒ reveals/morphs inert under automation). Also open `http://127.0.0.1:8901/AI/index.html` by hand (any static server) and confirm the console is clean and `document.documentElement.classList.contains('motion-ready')` is `true` in devtools.

- [ ] **Step 4: Commit**

```bash
git add src/motion.js AI/index.html search/index.html AI/chat.html
git commit -m "feat(motion): src/motion.js — data-reveal observer + motionGhost FLIP helper"
```

---

### Task 3: Global layer — cross-page view transitions + theme circular reveal

**Files:**
- Modify: `src/site.css` (new global motion block at end of §3)
- Modify: `src/nav.js` (theme toggle handler, ~line 103)

- [ ] **Step 1: Insert the global motion block**

In `src/site.css`, find the line `/* §4 ICONS — generated by tools/build-icons.mjs: begin */`. Insert IMMEDIATELY BEFORE it:

```css
/* ═══ §3 MOTION — page transitions, theme reveal, reveals, morph ghost ══
   (spec 2026-08-14; tokens in §2) */

/* Cross-page view transitions: pages morph instead of hard-cutting.
   Chrome/Edge/Safari 18+; other browsers just navigate normally. */
@view-transition { navigation: auto; }
@keyframes vt-root-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(calc(var(--rise) * -1)); } }
@keyframes vt-root-in  { from { opacity: 0; transform: translateY(var(--rise)); } to { opacity: 1; transform: none; } }
::view-transition-old(root) { animation: vt-root-out var(--dur-2) var(--ease-smooth) both; }
::view-transition-new(root) { animation: vt-root-in  var(--dur-2) var(--ease-smooth) both; }
/* the floating nav capsule holds steady while content morphs beneath it */
.ov-nav__bar { view-transition-name: site-nav; }

/* Theme toggle: circular reveal from the switch (nav.js sets --theme-x/y
   and adds .theme-reveal-active for the duration of the transition). */
html.theme-reveal-active::view-transition-old(root) { animation: none; }
html.theme-reveal-active::view-transition-new(root) { animation: theme-clip-reveal var(--dur-4) var(--ease-smooth) both; }
@keyframes theme-clip-reveal {
  from { clip-path: circle(0px at var(--theme-x, 92vw) var(--theme-y, 40px)); }
  to   { clip-path: circle(150vmax at var(--theme-x, 92vw) var(--theme-y, 40px)); }
}

/* data-reveal entrances (driven by src/motion.js; never hidden without JS) */
html.motion-ready [data-reveal] { opacity: 0; transform: translateY(var(--rise)); }
html.motion-ready [data-reveal].revealed {
  opacity: 1; transform: none;
  transition: opacity var(--dur-3) var(--ease-smooth), transform var(--dur-3) var(--ease-smooth);
}

/* iMessage-style send morph ghost (src/motion.js motionGhost) */
.motion-ghost { position: fixed; z-index: 9999; pointer-events: none; }

/* Global reduced-motion collapse — the motion system's hard invariant. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
  html { scroll-behavior: auto !important; }
  ::view-transition-old(root), ::view-transition-new(root) { animation: none !important; }
}

```

- [ ] **Step 2: Theme reveal in `src/nav.js`**

Find the theme toggle handler (~line 103):

```js
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        var isDark = document.documentElement.classList.toggle('dark');
        try { localStorage.setItem('vail_theme', isDark ? 'dark' : 'light'); } catch (e) {}
      });
    }
```

Replace with:

```js
    if (themeBtn) {
      themeBtn.addEventListener('click', function (e) {
        var apply = function () {
          var isDark = document.documentElement.classList.toggle('dark');
          try { localStorage.setItem('vail_theme', isDark ? 'dark' : 'light'); } catch (err) {}
        };
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!document.startViewTransition || reduce || navigator.webdriver) { apply(); return; }
        var x = (e && e.clientX) || window.innerWidth - 60;
        var y = (e && e.clientY) || 40;
        document.documentElement.style.setProperty('--theme-x', x + 'px');
        document.documentElement.style.setProperty('--theme-y', y + 'px');
        document.documentElement.classList.add('theme-reveal-active');
        var vt = document.startViewTransition(apply);
        vt.finished.finally(function () { document.documentElement.classList.remove('theme-reveal-active'); });
      });
    }
```

- [ ] **Step 3: Verify**

```bash
node tools/snapshot.mjs after && node tools/visual-diff.mjs
```

Expected: all `< 2%` (view transitions don't alter settled DOM; theme reveal is webdriver-guarded).

Then by hand (any static server, e.g. `python3 -m http.server 8901`): open `http://127.0.0.1:8901/index.html`, click "Design" in the nav — the content should cross-fade/rise while the nav capsule holds steady (if the capsule visibly jumps or jitters instead, delete the `.ov-nav__bar { view-transition-name: site-nav; }` rule and keep everything else). Click the theme toggle — a circular reveal should sweep from the button. In devtools device emulation with `prefers-reduced-motion: reduce`, both become instant.

- [ ] **Step 4: Commit**

```bash
git add src/site.css src/nav.js
git commit -m "feat(motion): cross-page view transitions + theme circular reveal + reveal/ghost primitives"
```

---

### Task 4: Home page — hero focus polish + search handoff morph

**Files:**
- Modify: `src/site.css` (HOME section)

- [ ] **Step 1: Name the hero search pill for the cross-page morph**

In the HOME section, `[data-page="home"] .hero-search` rule (~line 5552). Replace the whole rule's transition line AND add the view-transition-name, so the rule reads:

```css
    [data-page="home"] .hero-search {
      display: flex;
      align-items: center;
      gap: 6px;
      width: min(620px, 100%);
      margin-inline: auto;
      height: 3.75rem;
      padding: 6px 6px 6px 22px;
      border-radius: 999px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
      transition: border-color var(--dur-2) var(--ease-smooth), box-shadow var(--dur-2) var(--ease-smooth), transform var(--dur-2) var(--ease-soft);
      view-transition-name: site-search; /* morphs into Astra's results bar on submit */
    }
```

- [ ] **Step 2: Focus lift**

`[data-page="home"] .hero-search:focus-within` (~line 5567) — add a transform declaration so it reads:

```css
    [data-page="home"] .hero-search:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent), transparent 80%);
      transform: translateY(-2px);
    }
```

- [ ] **Step 3: Verify**

```bash
node tools/snapshot.mjs after home && node tools/visual-diff.mjs home
```

Expected: `< 2%`. By hand: type a query in the homepage pill and submit — in Chrome/Edge/Safari the pill should *travel* into the compact bar at the top of the Astra results page instead of a hard cut. (The Astra side of the pairing lands in Task 6 — until then the morph is a no-op, because no element named `site-search` exists on the destination page. Verify by reading the CSS after Task 6; full handoff check happens there.)

- [ ] **Step 4: Commit**

```bash
git add src/site.css
git commit -m "feat(motion): home hero-search focus lift + site-search view-transition pairing"
```

---

### Task 5: AI landing page — hero entrance + scroll reveals

**Files:**
- Modify: `src/site.css` (AI-HOME section)
- Modify: `AI/index.html`

- [ ] **Step 1: Append the motion rules to the AI-HOME section**

In `src/site.css`, find the banner `PAGE: CHAT  —  scoped to [data-page="chat"]` (~line 1548). The AI-HOME section ends just before it. Insert IMMEDIATELY BEFORE that banner:

```css
        /* ── Motion (spec 2026-08-14) ── */
        @keyframes ai-home-rise { from { opacity: 0; transform: translateY(var(--rise)); } to { opacity: 1; transform: none; } }
        @keyframes ai-home-book-in { from { opacity: 0; transform: translateY(18px) scale(0.98); } to { opacity: 1; transform: none; } }
        [data-page="ai-home"] .mo-in { animation: ai-home-rise var(--dur-4) var(--ease-smooth) backwards; }
        [data-page="ai-home"] .mo-d1 { animation-delay: 45ms; }
        [data-page="ai-home"] .mo-d2 { animation-delay: 90ms; }
        [data-page="ai-home"] .book-scene { animation: ai-home-book-in var(--dur-4) var(--ease-smooth) 120ms backwards; }

```

- [ ] **Step 2: Tag the hero elements in `AI/index.html`**

- The hero `<h1>` (~line 93, `class="text-8xl md:text-8xl ...`): append ` mo-in mo-d1` to its class list.
- The `<button id="start-button">` (~line 98, `class="skuo skuo-accent skuo-pill !px-7 !py-3 mb-4 group flex items-center gap-2"`): append ` mo-in mo-d2` to its class list.
- The two `<section>` elements after `</main>` (~lines 151 and 211, both `class="py-24 px-6 max-w-7xl mx-auto border-t border-border-warm"`): add a `data-reveal` attribute to each (e.g. `<section class="..." data-reveal>`). If a third `<section>` exists below those, tag it too.

- [ ] **Step 3: Verify**

```bash
node tools/snapshot.mjs after ai-home && node tools/visual-diff.mjs ai-home
```

Expected: `< 2%` (reveals are force-shown under webdriver; the entrances finish inside the 1.5s settle). By hand: load `http://127.0.0.1:8901/AI/index.html` — headline then button rise in, the storybook eases up and back before its first leaf turn; scrolling reveals the sections below.

- [ ] **Step 4: Commit**

```bash
git add src/site.css AI/index.html
git commit -m "feat(motion): ai-home hero entrance + book ease-in + scroll reveals"
```

---

### Task 6: Astra search — route morphs, result stagger, images, preview sheet, AI-panel morph

**Files:**
- Modify: `src/site.css` (SEARCH section)
- Modify: `search/astra.js`

- [ ] **Step 1: Append the motion rules to the SEARCH section**

In `src/site.css`, find the banner `PAGE: themes (styles.css)  —  scoped to [data-page="themes"]` (~line 6100). Insert IMMEDIATELY BEFORE it:

```css
  /* ── Motion (spec 2026-08-14) ── */
  /* bar morph: hero bar and results bar share one VT name — only the
     visible bar carries it, pairing hero⇄results (same-document) and
     homepage pill⇄results bar (cross-document). */
  [data-page="search"] #hero:not([hidden]) #hero-bar,
  [data-page="search"] #results:not([hidden]) #results-bar { view-transition-name: site-search; }

  /* result rows: load stagger (capped at 8 — see astra.js renderResults) */
  [data-page="search"] .result.r-enter { opacity: 0; transform: translateY(var(--rise)); }
  [data-page="search"] .result.r-enter.on {
    opacity: 1; transform: none;
    transition: opacity var(--dur-3) var(--ease-smooth), transform var(--dur-3) var(--ease-soft);
  }

  /* image grid: fade-rise as each thumbnail loads */
  [data-page="search"] .ig-item.ig-enter { opacity: 0; transform: translateY(var(--rise)) scale(0.98); }
  [data-page="search"] .ig-item.ig-enter.on {
    opacity: 1; transform: none;
    transition: opacity var(--dur-3) var(--ease-smooth), transform var(--dur-3) var(--ease-soft);
  }

  /* image preview sheet: slides in (right sheet on desktop, bottom sheet on mobile) */
  @keyframes search-sheet-in { from { opacity: 0; transform: translateX(32px); } to { opacity: 1; transform: none; } }
  @media (max-width: 768px) {
    @keyframes search-sheet-in { from { opacity: 0; transform: translateY(48px); } to { opacity: 1; transform: none; } }
  }
  @keyframes search-scrim-in { from { opacity: 0; } to { opacity: 1; } }
  [data-page="search"] #ig-preview:not([hidden]) .igp-panel { animation: search-sheet-in var(--dur-3) var(--ease-smooth) backwards; }
  [data-page="search"] #ig-preview:not([hidden]) .igp-scrim { animation: search-scrim-in var(--dur-2) var(--ease-smooth) backwards; }

```

- [ ] **Step 2: Wrap route changes in a same-document view transition**

In `search/astra.js`, find (~line 162):

```js
  function renderRoute() {
    const { q, tab } = readRoute();
    if (!q) showHero(); else showResults(q, tab);
  }
```

Replace with:

```js
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
    document.startViewTransition(renderRouteDom);
  }
```

- [ ] **Step 3: Result-row entrance stagger**

In `renderResults` (~line 369), find the `li` creation:

```js
      const li = document.createElement('li');
      li.className = 'result';
      li.id = 'result-' + (start + i + 1);
```

Insert IMMEDIATELY AFTER the `li.id = ...` line:

```js
      // entrance stagger, capped at 8 rows so long/infinite pages don't trail
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.webdriver) {
        li.classList.add('r-enter');
        li.style.transitionDelay = Math.min(i, 7) * 45 + 'ms';
        requestAnimationFrame(() => requestAnimationFrame(() => li.classList.add('on')));
        li.addEventListener('transitionend', () => { li.classList.remove('r-enter', 'on'); li.style.transitionDelay = ''; }, { once: true });
      }
```

- [ ] **Step 4: Image-grid fade-rise**

In `renderImageGrid` (~line 483), find:

```js
      const b = document.createElement('button');
      b.className = 'ig-item';
      b.type = 'button';
```

Change to:

```js
      const b = document.createElement('button');
      b.className = 'ig-item';
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.webdriver) b.classList.add('ig-enter');
      b.type = 'button';
```

Then find the grid append line (`b.append(img, host); b.addEventListener(...); grid.appendChild(b);` — the `grid.appendChild(b);` line). Insert IMMEDIATELY AFTER it:

```js
      const revealItem = () => requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('on')));
      img.addEventListener('load', revealItem, { once: true });
      if (img.complete && img.naturalWidth) revealItem();   // cached images
```

- [ ] **Step 5: AI-panel follow-up morph**

In `askFollowUp` (~line 834), find:

```js
    body.append(qEl, aEl);
    showThinking(question, aEl);
```

Insert BETWEEN those two lines:

```js
    // iMessage-style morph: a ghost of the bubble travels from the composer
    const _fromRect = $('ai-follow-input').getBoundingClientRect();
    if (typeof window.motionGhost === 'function') {
      qEl.style.visibility = 'hidden';
      const started = window.motionGhost(qEl, _fromRect, () => { qEl.style.visibility = ''; });
      if (!started) qEl.style.visibility = '';
    }
```

- [ ] **Step 6: Verify**

```bash
node tools/snapshot.mjs after search && node tools/visual-diff.mjs search
```

Expected: `< 2%` (all entrances are reduced-motion/webdriver-gated; the harness never sees them).

By hand (needs the temp backend running for real results — `cd backend && ./run.sh`, or accept the 📡 error state): search from the Astra hero — the bar morphs into the results bar while results stagger in; switch to ✦ Images and back — cross-fade; click an image — sheet slides in (resize < 768px: slides up); ask a follow-up in the AI panel — your question morphs from the composer into its bubble. From `index.html`, submit the homepage pill — it travels into the results bar (cross-document pairing with Task 4).

- [ ] **Step 7: Commit**

```bash
git add src/site.css search/astra.js
git commit -m "feat(motion): astra route morphs, result stagger, image entrances, follow-up morph"
```

---

### Task 7: Chat — the iMessage send morph + AI row entrance + modal pop

**Files:**
- Create: `AI/js/send-morph.js`
- Modify: `AI/chat.html` (one script tag)
- Modify: `AI/js/chat-actions.js` (sendMessage, ~lines 102–119)
- Modify: `src/site.css` (CHAT section)

- [ ] **Step 1: Create `AI/js/send-morph.js` with exactly this content**

```js
/* ═══════════════════════════════════════════════════════════════════════
   AI/js/send-morph.js — iMessage-style seamless send (spec 2026-08-14 §5).
   After render() inserts the just-sent user bubble, a ghost clone of it
   travels from the input capsule to the bubble's final position — one
   continuous motion, no cut between the field and the list.
   Loaded after ../src/motion.js, before js/chat-actions.js.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Morph the most recently rendered user bubble from fromRect.
     Returns true if the morph played; false = caller should do its
     normal (plain) scroll/settle. */
  window.motionMorphLastUserBubble = function (fromRect) {
    if (!fromRect || typeof window.motionGhost !== 'function') return false;
    var bubbles = document.querySelectorAll('#chat-messages .user-msg-bubble');
    var target = bubbles[bubbles.length - 1];
    if (!target) return false;

    // Settle the scroll instantly so the target rect is its FINAL position
    // (a smooth scroll would move the target mid-flight).
    if (window.els && window.els.chatCont) window.els.chatCont.scrollTop = window.els.chatCont.scrollHeight;

    target.style.visibility = 'hidden';
    // NB: the bubble's own chat-fadeIn runs underneath the cover and ends
    // at opacity 1 (forwards fill), so revealing needs no animation reset.
    var started = window.motionGhost(target, fromRect, function () {
      target.style.visibility = '';
    });
    if (!started) target.style.visibility = '';
    return started;
  };
})();
```

- [ ] **Step 2: Load it in `AI/chat.html`**

Find `<script src="js/chat-actions.js">` in `AI/chat.html`. Immediately before it (and after the `../src/motion.js` tag added in Task 2) add:

```html
    <script src="js/send-morph.js"></script>
```

- [ ] **Step 3: Wire the morph into `sendMessage`**

In `AI/js/chat-actions.js`, find (~lines 102–106):

```js
    window.streamQueue = "";
    window.typedResponseText = "";
    window.charAccu = 0;
    window._canvasStreamOpened = false;
    window.els.input.value = ""; window.els.input.style.height = "auto";
```

Insert IMMEDIATELY BEFORE `window.streamQueue = "";`:

```js
    // iMessage morph: capture the input geometry BEFORE clearing it.
    // Only typed sends morph (txt === null, no attachment) — programmatic
    // resends (regenMsg) and attachment messages take the plain path.
    const _morphFrom = (!txt && !attachment && window.els.input)
        ? window.els.input.getBoundingClientRect() : null;

```

Then find (~line 119):

```js
    window.render(); window.els.chatCont.scrollTo({ top: window.els.chatCont.scrollHeight, behavior: 'smooth' });
```

Replace with:

```js
    window.render();
    const _morphed = _morphFrom && window.motionMorphLastUserBubble
        && window.motionMorphLastUserBubble(_morphFrom);
    if (!_morphed) window.els.chatCont.scrollTo({ top: window.els.chatCont.scrollHeight, behavior: 'smooth' });
```

- [ ] **Step 4: Append the motion rules to the CHAT section**

In `src/site.css`, find the banner `PAGE: DESIGN  —  scoped to [data-page="design"]` (~line 5047). Insert IMMEDIATELY BEFORE it:

```css
        /* ── Motion (spec 2026-08-14) ── */
        /* AI rows rise in (render.js tags them .animate-fade-in, which had
           no rule in this section — this gives it the intended entrance) */
        @keyframes chat-rise-in { from { opacity: 0; transform: translateY(var(--rise)); } to { opacity: 1; transform: none; } }
        [data-page="chat"] .ai-row.animate-fade-in { animation: chat-rise-in var(--dur-3) var(--ease-smooth) backwards; }

        /* modals pop softly when shown (display:none → shown restarts the
           animation each open; all four start hidden so nothing runs at load) */
        @keyframes chat-modal-pop { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: none; } }
        [data-page="chat"] #personality-modal > .card,
        [data-page="chat"] #memories-modal > .card,
        [data-page="chat"] #changelog-modal > .card,
        [data-page="chat"] #account-modal > div { animation: chat-modal-pop var(--dur-2) var(--ease-soft) backwards; }

```

- [ ] **Step 5: Verify**

```bash
node tools/snapshot.mjs after chat && node tools/visual-diff.mjs chat
```

Expected: `< 2%` (fresh chat has no rows; modals hidden; morph never runs under automation).

By hand (backend running, or offline is fine for the send animation — the error state renders after): open `http://127.0.0.1:8901/AI/chat.html` and —
1. Type a one-line message, send: the bubble **travels** from the input capsule into the list, docking right. No cut.
2. Type a multi-line message, send: same travel, height morphs too.
3. Send a message with an attachment: plain path (no morph), still smooth-scrolled.
4. Regenerate a response: no morph on the re-sent user bubble.
5. Edit a past message (pencil), press enter: morphs (it is a typed send — intended).
6. Open settings/account/personality modals: cards pop softly.
7. Switch between chats with history: last AI row rises subtly; nothing else jumps.
8. Devtools → emulate `prefers-reduced-motion: reduce`: send → bubble appears instantly, no travel.

- [ ] **Step 6: Commit**

```bash
git add AI/js/send-morph.js AI/chat.html AI/js/chat-actions.js src/site.css
git commit -m "feat(motion): iMessage-style send morph in chat + ai-row entrance + modal pop"
```

---

### Task 8: Full sweep + docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full visual sweep**

```bash
node tools/snapshot.mjs after
node tools/visual-diff.mjs
```

Expected: every pair `< 2%` or eyeballed-and-explained (dynamic content only). Clean up any stale `tools/snapshots/diff-*.png` that remain from earlier runs once their pairs pass.

- [ ] **Step 2: Manual smoke checklist**

Serve the repo (`python3 -m http.server 8901`). In light AND dark: navigate between pages (nav morph), toggle theme (circular reveal), homepage → Astra search (bar handoff), Astra tabs + images + preview sheet + AI follow-up morph, chat send morph + modals. Repeat the chat send with `prefers-reduced-motion: reduce` emulated (instant, nothing hidden). Throttle network to "Slow 3G" and reload ai-home — content must never stay hidden (motion-ready gate).

- [ ] **Step 3: Update `CLAUDE.md`**

1. Find the sidebar-rows paragraph (near the end of the "Universal floating nav" section) containing "both on the overshoot easing `cubic-bezier(0.34, 1.56, 0.64, 1)`" — replace that easing reference with `var(--ease-soft)` and note the motion tokens live in `src/site.css` §2.
2. Add a new section at the end, titled `## Motion system (site-wide)`:

```markdown
## Motion system (site-wide)

One motion language ("premium but fun", spec/plan 2026-08-14): tokens in
`src/site.css` §2 — `--ease-smooth` (workhorse), `--ease-soft` (gentle spring
for presses/entrances), `--dur-1..4`, `--stagger`, `--rise`. Every new
transition/animation consumes the tokens; transform/opacity only.

- `src/motion.js` (loaded by AI/index.html, search/index.html, AI/chat.html):
  `[data-reveal]` scroll entrances (gated behind `html.motion-ready` — content
  is never hidden without JS) and `window.motionGhost(targetEl, fromRect, onDone)`,
  the FLIP ghost behind the iMessage-style send morph.
- Cross-page view transitions (`@view-transition { navigation: auto }` in §3):
  content cross-fades/rises; `.ov-nav__bar` holds steady (`view-transition-name:
  site-nav`); theme toggle is a circular reveal (nav.js + `--theme-x/y` +
  `.theme-reveal-active`). Firefox: plain navigation (progressive enhancement).
- iMessage send morph: chat (`AI/js/send-morph.js`, wired in `sendMessage` —
  typed sends only; regen/attachments plain) and Astra's AI-panel composer
  (in `askFollowUp`). Homepage pill ⇄ Astra bars pair via `view-transition-name:
  site-search`.
- Hard invariants: everything bails under `prefers-reduced-motion` AND
  `navigator.webdriver` (keeps the Playwright snapshot harness deterministic —
  new JS-driven motion MUST keep both guards).
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(motion): site-wide motion system complete — docs + sweep"
```

---

## Execution errata (added during subagent-driven execution)

- **Forwards-fill transform trap (found in Task 4 quality review):** entrance
  animations whose end frame pins `transform` must use `backwards` fill, NOT
  `both`/`forwards` — a forwards fill overrides later interactive transforms
  (same trap CLAUDE.md documents for sidebar rows). Applied to: `.mo-in`,
  `.book-scene`, `#ig-preview` panel/scrim, `.ai-row` rise, modal pop (all now
  `backwards` in this plan) and the pre-existing home `.load` rule
  (`forwards` → `backwards`, fixed in Task 4). The end state equals the
  natural state in every case, so settled rendering is unchanged; `backwards`
  still covers the pre-delay from-frame. View-transition pseudo rules keep
  `both` (transient, non-interactive). **Paired requirement:** the element's
  natural state must be the visible end state — drop any `opacity: 0` base
  from the entrance rule when switching to `backwards` (the backwards fill
  covers the pre-start window; leaving `opacity: 0` hides the element
  forever after the animation). Applied to home `.load` in Task 4
  (commit 9a132e8).
- **Snapshot harness (fixed mid-flight, commit e5eec76):** `tools/snapshot.mjs`
  now waits for chat's `#app-preloader` to detach before shooting; the
  pre-loader-veiled `before/chat-light.png` baseline was re-captured
  (commit 7d9104e). Deterministic 0.000% chat diffs since.

## Self-review notes (plan author)

- **Spec coverage:** tokens (T1), motion.js + invariants (T2), view transitions + theme reveal + global reduced-motion (T3), home hero + handoff (T4), ai-home entrance + reveals (T5), Astra route morphs + stagger + images + sheet + panel morph (T6), chat morph + AI entrance + modals (T7), verification + CLAUDE.md (T8). Rollout order matches spec §7 (tokens → runtime → global → home → ai-home → astra → chat).
- **Spec deviations (intentional):** (1) home keeps its `.load`/`.reveal` systems — retuned to tokens, not replaced by motion.js (they already ship and work; DRY would churn markup for no behavior gain); (2) "edit-resend keeps the plain path" refined to match the real edit flow — edit loads text into the input, so re-sending IS a typed send and morphs; programmatic regen does not; (3) preview-sheet close has no exit animation (hidden-attribute toggle; enter-only keeps scope tight).
- **Placeholder scan:** none — every code step carries complete code.
- **Type/name consistency:** `window.motionGhost(targetEl, fromRect, onDone)` defined in T2, consumed in T6/T7 with the same signature; `window.motionMorphLastUserBubble(fromRect)` defined in T7-S1, called in T7-S3; `r-enter/on`, `ig-enter/on`, `mo-in/mo-d1/mo-d2`, `theme-reveal-active`, `site-search`, `site-nav` used consistently across CSS/JS/HTML; keyframe names are page-prefixed (`ai-home-*`, `chat-*`, `search-*`) or globally unique (`vt-root-*`, `theme-clip-reveal`) — no collisions with existing names (`fadeIn`, `chat-fadeIn`, `fadeInScale`, `fadeUp`, …).
- **Risk notes:** `.ov-nav__bar` carries `view-transition-name` while `position: fixed` — a jump/jitter here is the known failure mode; T3-S3 includes the fallback (drop that one rule). View-transition + reduced-motion + webdriver guards appear in every JS path (nav.js, renderRoute, renderResults, renderImageGrid, askFollowUp, sendMessage/motionGhost).
