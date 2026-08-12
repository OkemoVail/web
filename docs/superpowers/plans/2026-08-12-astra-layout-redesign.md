# Astra v2.1 — Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-geometry `search/index.html` into distinct desktop/mobile modes — Google-classic left-rail results on desktop, full-bleed divided rows on mobile, and a tightened hero — without touching JS, markup structure, the backend, or the v2 cosmic-playground skin.

**Architecture:** CSS-only surgery on the inline `<style>` block of `search/index.html`, plus two `<span class="lbl">` wraps on the hero button labels (enables icon-first pills on mobile, matching the existing `.bar .skuo .lbl` pattern). Mode breakpoint: **768px**. Spec: `docs/superpowers/specs/2026-08-12-astra-layout-redesign-design.md`.

**Tech Stack:** plain CSS in the page's inline `<style>` (page-local, wins over `../src/design-tokens.css` by source order). No build step. No frontend test infra — verification is a manual checklist + the untouched backend suite.

---

### Task 1: Layout reskin of `search/index.html` (+ one CLAUDE.md clause)

**Files:**
- Modify: `search/index.html` (inline `<style>` block + two hero button labels)
- Modify: `CLAUDE.md` (one clause in the Astra bullet)

- [ ] **Step 1: Tighten the hero (both modes)**

In `search/index.html`'s inline `<style>`, find:

```css
  .hero { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 1rem; box-sizing: border-box; }
```

change `gap: 14px` → `gap: 8px`.

Find:

```css
  .wordmark { margin: 0; font-size: clamp(2.2rem, 6vw, 3.4rem); font-weight: 700;
```

change the font-size → `clamp(1.8rem, 5vw, 2.6rem)`.

Find:

```css
  .tagline { margin: -6px 0 4px; font-size: .85rem; font-style: italic; color: var(--text-tertiary); }
```

change the margin → `-2px 0 2px`.

- [ ] **Step 2: Desktop results — Google-classic left rail**

Find:

```css
  .results { position: relative; z-index: 1; max-width: 680px; margin: 0 auto; padding: 1rem 1rem 4rem; }
```

replace with:

```css
  .results { position: relative; z-index: 1; max-width: none; margin: 0; padding: 1rem 1rem 4rem clamp(1rem, 12vw, 180px); }
```

Find:

```css
  .results .bar { width: 100%; height: 42px; }
```

replace with:

```css
  .results .bar { width: 100%; max-width: 560px; height: 42px; }
```

Immediately AFTER the `.r-meta { ... }` rule, add:

```css
  /* google-classic left rail: bar, panel and results share one left edge */
  .r-meta, .ai-panel, #result-list { max-width: 640px; }
```

- [ ] **Step 3: Mobile mode (≤ 768px) — full-bleed divided rows + compact top bar + compressed hero**

Find the ENTIRE existing block:

```css
  @media (max-width: 560px) {
    .bar .skuo .lbl { display: none; }        /* icon-first button on tiny screens */
    .constellation { right: 6%; top: 12%; }
    .r-top { flex-wrap: wrap; }
  }
```

Replace it with:

```css
  @media (max-width: 768px) {
    /* ── mobile mode: a different layout, not a shrunk desktop column ── */
    .bar .skuo .lbl { display: none; }        /* icon-first bar button */
    .hero-btns .skuo .lbl { display: none; }  /* icon-first hero pills */
    .hero .wordmark { font-size: 1.5rem; }
    .constellation { right: 6%; top: 12%; }
    .results { padding: .75rem 0 3rem; }      /* full-bleed: rows go edge to edge */
    .r-top { flex-wrap: nowrap; gap: 8px; padding: 6px 2.8rem 12px 12px; }
    .r-logo { font-size: .95rem; }
    .results .bar { max-width: none; height: 40px; }
    .r-meta, .ai-panel, #result-list { max-width: none; }
    .r-meta { margin: 0 16px 12px; }
    .ai-panel { margin: 0 12px 18px; }
    #result-list { gap: 0; }
    .result { padding: 12px 16px; gap: 8px; border-top: 1px solid var(--border-strong); }
    .result:last-child { border-bottom: 1px solid var(--border-strong); }
  }
```

- [ ] **Step 4: Hero button label spans (enables the icon-first pills from Step 3)**

In the hero markup, find:

```html
    <button class="skuo skuo-neutral" id="hero-search">🔍 search the cosmos</button>
    <span class="ai-ring"><button class="skuo" id="hero-cosmic">✦ i'm feeling cosmic</button></span>
```

replace with:

```html
    <button class="skuo skuo-neutral" id="hero-search">🔍 <span class="lbl">search the cosmos</span></button>
    <span class="ai-ring"><button class="skuo" id="hero-cosmic">✦ <span class="lbl">i'm feeling cosmic</span></button></span>
```

- [ ] **Step 5: Manual verification — geometry**

Serve the page however you like (it also runs from `file://`). Backend optional for geometry checks (error cards are part of the layout too — the page shows 📡 without a backend, that's fine for these checks). Verify:

1. **Desktop ≥1200px:** results, AI panel, and meta all share the same left edge at the ~180px inset; bar is capped at 560px starting at that inset; nothing is centered anymore.
2. **~900px:** inset fluidly smaller (12vw); toggle ◐ (fixed top-right) never overlaps the bar.
3. **≤768px:** top row = small ✦ Astra logo + full-width bar with icon-only 🔍 button; result rows are full-bleed with hairline dividers, no side gaps; AI panel has 12px side margins; hero wordmark ~1.5rem and pills icon-first (🔍 / ✦).
4. **375px:** no horizontal scroll on either view; hero pills don't overflow.
5. **769px boundary:** resize slowly across 768px — clean swap between the two modes, no broken intermediate state.
6. **Dark mode** in both modes: dividers (`--border-strong`) visible, parchment dark canvas, panel border fine.
7. **`prefers-reduced-motion`:** twinkle/ring/panel animations still off.

- [ ] **Step 6: Manual verification — functional smoke (with backend)**

`./backend/run.sh` → set `localStorage.vail_custom_backend_url = 'http://127.0.0.1:8001'` in the console → reload:
search renders results + streaming AI answer; `[n]` citations still jump; suggest dropdown still works on both bars; `✦ i'm feeling cosmic` still fires a random query; back/forward navigation intact.

- [ ] **Step 7: Backend suite — confirm untouched**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: `36 passed` (nothing backend changed — this just proves it).

- [ ] **Step 8: CLAUDE.md clause**

In CLAUDE.md's `search/index.html` bullet, find:

```
hero buttons below the bar incl. `✦ i'm feeling cosmic` (random quip query). Deployment coupling:
```

replace with:

```
hero buttons below the bar incl. `✦ i'm feeling cosmic` (random quip query). Layout modes split at 768px (v2.1): Google-classic left-rail results on desktop, full-bleed divided result rows + compact top bar on mobile. Deployment coupling:
```

- [ ] **Step 9: Commit**

```bash
git add search/index.html CLAUDE.md
# VERIFY the staged diff contains ONLY these two files' intended hunks (git diff --cached)
git commit -m "feat(astra): split desktop/mobile layouts — Google-classic results rail, tightened hero"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** desktop rail (Step 2), mobile mode (Step 3), hero tightening (Steps 1, 3, 4), kept-skin items (untouched by edits), CLAUDE.md (Step 8), backend suite confirmation (Step 7).
- **Breakpoint consistency:** desktop rules are the base (apply >768px); the only media query is `max-width: 768px` — no gap/overlap. The old 560px query is fully replaced (its two still-relevant rules are carried into the 768 block; the `r-top` wrap is deliberately superseded by the compact nowrap row).
- **Mobile max-width override:** Step 3's `.r-meta, .ai-panel, #result-list { max-width: none; }` is required — without it the desktop 640px cap would mis-center content at 641–768px viewports.
- **Status cards** (`.status-card`, no `.result` class) are unaffected by the divider-row rules — verified selectors only target `.result`.
- **Type/selector consistency:** every selector edited or added exists in the current committed `search/index.html` (post `ba642d3`); `.lbl` pattern matches the pre-existing `.bar .skuo .lbl` convention.
