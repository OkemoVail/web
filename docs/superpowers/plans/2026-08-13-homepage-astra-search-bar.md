# Homepage Astra Search Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two hero CTA buttons on `index.html` with a centered pill search bar that GETs `/search/?q=<query>` (Okemo Astra).

**Architecture:** A plain `<form action="/search/" method="get">` with `<input name="q">` — the browser performs the navigation, no new JS. Styling lives in index.html's existing inline `<style>` block, mirroring Astra's `.bar` pattern in the homepage's parchment voice. The submit button uses the shared `.skuo skuo-accent` classes.

**Tech Stack:** Static HTML/CSS, shared design tokens (`src/design-tokens.css`), Tailwind CDN for spacing classes.

**Spec:** `docs/superpowers/specs/2026-08-13-homepage-astra-search-bar-design.md`

---

### Task 1: Hero search bar (markup + CSS)

**Files:**
- Modify: `index.html` — `<style>` block (insert CSS after the `.hero-pfp` rules, before the "Project catalog rows" comment, ~line 132)
- Modify: `index.html` — hero button row (lines 283-287)

- [ ] **Step 1: Add the `.hero-search` CSS to the inline `<style>` block**

In `index.html`, find this exact anchor (the end of the hero-pfp rules):

```css
    .hero-pfp:hover {
      filter: grayscale(0);
      transform: scale(1.04);
    }

    /* ── Project catalog rows ──────────────────────────────────── */
```

Insert the new block between `}` and the `/* ── Project catalog rows` comment:

```css
    .hero-pfp:hover {
      filter: grayscale(0);
      transform: scale(1.04);
    }

    /* ── Hero search bar (feeds Okemo Astra) ───────────────────── */
    .hero-search {
      display: flex;
      align-items: center;
      gap: 6px;
      width: min(560px, 100%);
      margin-inline: auto;
      height: 3rem;
      padding: 4px 5px 4px 16px;
      border-radius: 999px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
      transition: border-color 0.3s ease, box-shadow 0.3s ease;
    }

    .hero-search:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent), transparent 80%);
    }

    /* local reset of the global unified-input styling (design-tokens.css),
       same scoping Astra's .bar input uses */
    .hero-search input {
      flex: 1;
      min-width: 0;
      height: 100%;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: 0;
      box-shadow: none;
      outline: none;
      font-size: 0.95rem;
      color: var(--text-primary);
    }

    /* the pill container carries the focus ring, not the input — this also
       beats the page's global :focus-visible:not(.skuo) outline rule */
    .hero-search input:focus,
    .hero-search input:focus-visible {
      outline: none;
      border: none;
      box-shadow: none;
    }

    .hero-search .skuo {
      flex: none;
      height: 38px;
      padding: 0 18px;
      border-radius: 999px;
      font-size: 0.85rem;
      white-space: nowrap;
    }

    /* ── Project catalog rows ──────────────────────────────────── */
```

- [ ] **Step 2: Replace the hero CTA buttons with the search form**

In `index.html`, replace exactly this block (lines 283-287):

```html
      <div class="flex flex-wrap items-center gap-3 mt-11 load d4">
        <a href="#work" class="skuo skuo-accent px-7 py-3.5 rounded-full text-sm font-medium">Selected work</a>
        <a href="https://github.com/ar12c" target="_blank" rel="noopener"
          class="skuo skuo-neutral px-7 py-3.5 rounded-full text-sm font-medium">GitHub profile</a>
      </div>
```

with:

```html
      <form action="/search/" method="get" class="hero-search mt-11 load d4" role="search">
        <input type="text" name="q" aria-label="Search the web" placeholder="Search the web…"
          enterkeyhint="search" autocomplete="off" spellcheck="false">
        <button type="submit" class="skuo skuo-accent">Search</button>
      </form>
```

Notes:
- `mt-11` preserves the old buttons' 2.75rem top spacing; `load d4` keeps the same fade-in timing the buttons had.
- No JS anywhere — the native GET submits to `/search/?q=<query>`, which `search/astra.js` already routes.
- Empty submit lands on the Astra hero (`/search/?q=`); intentional, no `required` attribute.

- [ ] **Step 3: Verify in a browser over a local HTTP server**

Root-relative `action="/search/"` does not work over `file://`, so serve the repo root:

```bash
cd /Users/ar12c/Desktop/web && python3 -m http.server 8000
```

Open `http://localhost:8000/` and check:

1. **Renders centered:** the pill bar sits horizontally centered in the hero column, same fade-in timing the buttons had; the two old CTA buttons are gone.
2. **Submit with text:** type `test query`, press Enter → URL becomes `http://localhost:8000/search/?q=test+query` and the Astra page renders (results depend on the backend running — the navigation itself is what we're verifying).
3. **Submit via button:** back, retype, click "Search" → same navigation.
4. **Empty submit:** clear input, Enter → `/search/?q=` → Astra hero renders.
5. **Focus ring:** keyboard-focus the input → accent ring appears around the *pill*, no square outline on the input itself.
6. **Mobile:** devtools 375px width → bar is full-width, no horizontal overflow, Enter key shows "search".
7. **Dark mode:** toggle via the nav → bar shows elevated surface + strong border, text readable.
8. **No console errors** on load or submit.

Stop the server (`Ctrl-C`) when done.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Replace hero CTAs with centered Astra search bar"
```

---

## Self-review notes

- **Spec coverage:** markup (Step 2), centered pill styling + input reset + focus scoping (Step 1), empty-query behavior (Step 2 note), all 7 manual tests from the spec (Step 3, items 1-7 + console check).
- **Gotchas baked in:** the page's global `:focus-visible:not(.skuo)` rule would draw a square outline on the input — Step 1's `:focus-visible` reset kills it. Root-relative form action requires testing over HTTP, not `file://` — Step 3 covers it.
