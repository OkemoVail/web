# Unified Design System + Showcase Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify inputs and cards across the site in the shared stylesheet and build a public showcase page (`design.html`) that displays the full design system.

**Architecture:** All CSS lands in the already-shared `src/design-tokens.css` (linked by all 14 pages). Inputs are styled globally at low specificity so customized pages still win; cards use a single `.card` class. A new `design.html` at repo root renders every token/component live and is linked from `index.html`'s nav.

**Tech Stack:** Plain HTML + CSS, CSS custom properties, Tailwind utility classes (CDN on some pages), no build step, no test runner. Verification is manual in a browser.

## Global Constraints

- No bundler, no npm install, no test suite — open HTML files directly in a browser.
- All shared styling lives in `src/design-tokens.css`; do not create a new CSS file.
- Tokens already exist: `--bg`, `--bg-elevated`, `--bg-white`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--border`, `--border-strong`, `--accent`, `--accent-light`, `--skuo-accent`. Dark mode is driven by `.dark` on `<html>`.
- Input styling MUST stay at element-attribute selector specificity (e.g. `input[type="text"]`) so page-level class/id rules override automatically. Never use `!important` on input rules.
- Cards are opt-in by `.card` class only — no bare-element card styling.
- Commit after each task. Use Conventional Commit messages.

---

### Task 1: Add unified input/textarea + card styles to the shared stylesheet

**Files:**
- Modify: `src/design-tokens.css` (append at end of file)

**Interfaces:**
- Consumes: existing tokens (`--bg-elevated`, `--border-strong`, `--skuo-accent`, `--text-primary`, `--text-tertiary`, `--bg-white`, `--border`).
- Produces: global text-input styling; `.card` and `.card-pad` classes (relied on by Task 2's `design.html`).

- [ ] **Step 1: Append the new CSS block to the end of `src/design-tokens.css`**

Append exactly this to the end of the file:

```css

/* ── Unified text inputs (site-wide, low specificity) ───────────
   Element-attribute selectors only, so any page rule that uses a
   class or id (chat input bar, word #doc-title/#ai-input, editor)
   overrides without effort. Buttons/checkboxes/radios/ranges excluded. */
input[type="text"],
input[type="email"],
input[type="search"],
input[type="password"],
input[type="number"],
input[type="url"],
input[type="tel"],
textarea,
select {
  background-color: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  font: inherit;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

input[type="text"]::placeholder,
input[type="email"]::placeholder,
input[type="search"]::placeholder,
input[type="password"]::placeholder,
input[type="number"]::placeholder,
input[type="url"]::placeholder,
input[type="tel"]::placeholder,
textarea::placeholder {
  color: var(--text-tertiary);
}

input[type="text"]:focus,
input[type="email"]:focus,
input[type="search"]:focus,
input[type="password"]:focus,
input[type="number"]:focus,
input[type="url"]:focus,
input[type="tel"]:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--skuo-accent);
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.08),
    0 0 0 3px color-mix(in srgb, var(--skuo-accent), transparent 78%);
}

.dark input[type="text"],
.dark input[type="email"],
.dark input[type="search"],
.dark input[type="password"],
.dark input[type="number"],
.dark input[type="url"],
.dark input[type="tel"],
.dark textarea,
.dark select {
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
}

/* ── Unified card surface (opt-in via .card) ───────────────────── */
.card {
  background-color: var(--bg-white);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 8px 24px -12px rgba(0, 0, 0, 0.25);
}

.card-pad { padding: 1.25rem; }

.dark .card {
  background-color: var(--bg-elevated);
  border-color: var(--border-strong);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 8px 24px -12px rgba(0, 0, 0, 0.6);
}
```

- [ ] **Step 2: Verify the CSS parses (no syntax errors)**

Run: `npx @tailwindcss/cli -i src/input.css -o /tmp/_check.css` (or just open any existing page — e.g. `word/index.html` — in a browser).
Expected: no CSS errors in the browser console; existing inputs still legible.

- [ ] **Step 3: Spot-check that customized pages are unchanged**

Open `AI/chat.html`, `word/index.html`, `AI/editor.html` in a browser. Confirm the chat input bar, the `#doc-title`/`#ai-input` fields, and editor inputs look the same as before (their class/id rules win).
Expected: no visible change to those inputs. If any regressed, add a one-line page-level override on that page (do not weaken the global rule).

- [ ] **Step 4: Commit**

```bash
git add src/design-tokens.css
git commit -m "feat(ui): unify text inputs and add .card surface in shared tokens"
```

---

### Task 2: Build the `design.html` showcase page

**Files:**
- Create: `design.html` (repo root)

**Interfaces:**
- Consumes: `src/design-tokens.css` — button classes (`.skuo`, `.skuo-accent`, `.skuo-neutral`, `.skuo-icon`, `.skuo-pill`), the input rules and `.card`/`.card-pad` from Task 1, and all color tokens.
- Produces: a public page reachable at `/design.html` (Task 3 links it).

- [ ] **Step 1: Create `design.html` with this content**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Design System — Okemovail</title>
  <link rel="stylesheet" href="src/output.css">
  <link rel="stylesheet" href="src/design-tokens.css">
  <link rel="icon" type="image/x-icon" href="https://avatars.githubusercontent.com/u/179893130?v=4">
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; }
    .ds-wrap { max-width: 880px; margin: 0 auto; padding: 4rem 1.5rem 6rem; }
    .ds-section { margin-top: 3rem; }
    .ds-h { font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase;
            color: var(--text-tertiary); margin-bottom: 1rem; }
    .ds-row { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
    .ds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.75rem; }
    .swatch { height: 64px; border-radius: 10px; border: 1px solid var(--border);
              display: flex; align-items: flex-end; padding: 0.4rem; font-size: 0.6rem;
              color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
    .ds-topbar { display: flex; justify-content: space-between; align-items: center; }
    .ds-title { font-size: 1.5rem; font-weight: 600; color: var(--text-primary); }
    .stack > * + * { margin-top: 0.6rem; }
  </style>
</head>
<body>
  <div class="ds-wrap">
    <div class="ds-topbar">
      <div class="ds-title">Design System</div>
      <button id="theme-toggle" class="skuo skuo-icon" aria-label="Toggle theme" title="Toggle theme">
        <svg class="icon-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
    </div>

    <section class="ds-section">
      <div class="ds-h">Buttons</div>
      <div class="ds-row">
        <button class="skuo skuo-accent" style="padding:0.55rem 1.1rem;border-radius:10px;">Accent</button>
        <button class="skuo" style="padding:0.55rem 1.1rem;border-radius:10px;">Neutral</button>
        <button class="skuo skuo-neutral" style="padding:0.55rem 1.1rem;border-radius:10px;">Neutral alt</button>
        <button class="skuo skuo-pill skuo-accent" style="padding:0.55rem 1.3rem;">Pill</button>
        <button class="skuo skuo-icon" aria-label="Icon" style="width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="skuo" disabled style="padding:0.55rem 1.1rem;border-radius:10px;opacity:0.5;">Disabled</button>
      </div>
    </section>

    <section class="ds-section">
      <div class="ds-h">Inputs</div>
      <div class="stack" style="max-width:380px;">
        <input type="text" placeholder="Text input">
        <input type="email" placeholder="email@example.com">
        <textarea rows="3" placeholder="Textarea"></textarea>
        <select><option>Select option</option><option>Another</option></select>
        <input type="text" value="Disabled" disabled>
      </div>
    </section>

    <section class="ds-section">
      <div class="ds-h">Cards</div>
      <div class="ds-row" style="align-items:stretch;">
        <div class="card card-pad" style="flex:1;min-width:220px;">
          <strong>Card title</strong>
          <p style="color:var(--text-secondary);margin-top:0.35rem;font-size:0.9rem;">A unified skeuomorphic surface, dark-mode aware.</p>
        </div>
        <div class="card card-pad" style="flex:1;min-width:220px;">
          <strong>With a button</strong>
          <div style="margin-top:0.75rem;">
            <button class="skuo skuo-accent" style="padding:0.45rem 0.9rem;border-radius:8px;">Action</button>
          </div>
        </div>
      </div>
    </section>

    <section class="ds-section">
      <div class="ds-h">Color tokens</div>
      <div class="ds-grid">
        <div class="swatch" style="background:var(--accent);">--accent</div>
        <div class="swatch" style="background:var(--accent-light);">--accent-light</div>
        <div class="swatch" style="background:var(--bg);color:var(--text-primary);text-shadow:none;">--bg</div>
        <div class="swatch" style="background:var(--bg-elevated);color:var(--text-primary);text-shadow:none;">--bg-elevated</div>
        <div class="swatch" style="background:var(--bg-white);color:var(--text-primary);text-shadow:none;">--bg-white</div>
        <div class="swatch" style="background:var(--border-strong);color:var(--text-primary);text-shadow:none;">--border-strong</div>
      </div>
    </section>
  </div>

  <script>
    // Match the site's theme convention: .dark on <html>, persisted to vail_theme.
    (function () {
      var saved = localStorage.getItem('vail_theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (saved === 'dark' || (saved !== 'light' && prefersDark)) {
        document.documentElement.classList.add('dark');
      }
      var btn = document.getElementById('theme-toggle');
      btn.addEventListener('click', function () {
        var isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('vail_theme', isDark ? 'dark' : 'light');
      });
    })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Open `design.html` in a browser**

Expected: four sections render — Buttons (6 variants), Inputs (text/email/textarea/select/disabled), Cards (2), Color tokens (6 swatches). Buttons are glossy; inputs are recessed parchment.

- [ ] **Step 3: Click the theme toggle**

Expected: page flips between light and dark; buttons, inputs, cards, and swatches all adapt. Reload — the chosen theme persists (reads `vail_theme`).

- [ ] **Step 4: Commit**

```bash
git add design.html
git commit -m "feat(ui): add public design-system showcase page"
```

---

### Task 3: Link the showcase from `index.html` nav, mobile menu, and footer

**Files:**
- Modify: `index.html` (nav block ~line 501, mobile panel ~line 524, footer ~line 638)

**Interfaces:**
- Consumes: `design.html` from Task 2.
- Produces: a "Design" link in three places, using existing link classes.

- [ ] **Step 1: Add Design link to the desktop nav Pages group**

Find:
```html
      <a href="#work" class="g-link">Work</a>
      <a href="/AI/index.html" class="g-cta">Labs21</a>
```
Replace with:
```html
      <a href="#work" class="g-link">Work</a>
      <a href="/design.html" class="g-link">Design</a>
      <a href="/AI/index.html" class="g-cta">Labs21</a>
```

- [ ] **Step 2: Add Design link to the mobile panel**

Find:
```html
    <a href="#work" class="mobile-link">Work</a>
    <a href="/AI/index.html" class="mobile-link">Labs21</a>
```
Replace with:
```html
    <a href="#work" class="mobile-link">Work</a>
    <a href="/design.html" class="mobile-link">Design</a>
    <a href="/AI/index.html" class="mobile-link">Labs21</a>
```

- [ ] **Step 3: Add Design link to the footer link list**

Find:
```html
          <a href="https://www.youtube.com/@SochiVail" target="_blank" rel="noopener" class="hover:text-rosewood transition-colors">YouTube</a>
          <a href="/AI/index.html" class="hover:text-rosewood transition-colors">Labs21</a>
```
Replace with:
```html
          <a href="https://www.youtube.com/@SochiVail" target="_blank" rel="noopener" class="hover:text-rosewood transition-colors">YouTube</a>
          <a href="/design.html" class="hover:text-rosewood transition-colors">Design</a>
          <a href="/AI/index.html" class="hover:text-rosewood transition-colors">Labs21</a>
```

- [ ] **Step 4: Verify in a browser**

Open `index.html`. Confirm "Design" appears in the desktop nav and footer; narrow the window to confirm it appears in the mobile menu. Click each — all land on `design.html`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(ui): link design-system showcase from landing nav"
```

---

### Task 4: Document the additions in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (append to the "Skeuomorphic glossy buttons" section)

**Interfaces:**
- Consumes: nothing.
- Produces: project documentation for the new inputs/cards/showcase.

- [ ] **Step 1: Append a subsection to `CLAUDE.md`**

After the existing skeuomorphic-buttons section, add:

```markdown

## Unified inputs, cards, and the showcase page

`src/design-tokens.css` also unifies form inputs and cards:
- **Inputs:** bare `input[type=text|email|search|password|number|url|tel]`, `textarea`, and `select` get a recessed parchment look + accent focus ring, styled globally at *element-attribute specificity* so any page-level class/id rule (chat input bar, word `#doc-title`/`#ai-input`, editor) overrides automatically. Never add `!important` to these rules.
- **Cards:** opt-in via the `.card` class (raised skeuomorphic surface, dark-mode aware); `.card-pad` adds internal padding. Nothing is styled as a card unless it has `.card`.

`design.html` (repo root) is the public showcase — buttons, inputs, cards, and color-token swatches rendered live from `design-tokens.css`, with its own `.dark`/`vail_theme` toggle. It's linked from `index.html` (desktop nav, mobile menu, footer). Keep it in sync when adding new shared components.

Design/plan docs: `docs/superpowers/specs/2026-06-30-unified-design-system-showcase-design.md` and `docs/superpowers/plans/2026-06-30-unified-design-system-showcase.md`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document unified inputs, cards, and showcase page"
```

---

## Self-Review Notes

- **Spec coverage:** input styling (Task 1) ✓, `.card` (Task 1) ✓, showcase with buttons/inputs/cards/tokens (Task 2) ✓, nav link in 3 places (Task 3) ✓, CLAUDE.md docs (Task 4) ✓, global-input risk mitigation via low specificity + spot-check (Task 1 Steps 1 & 3) ✓.
- **Placeholders:** none — every step has concrete code or an exact command.
- **Type/name consistency:** class names `.card`, `.card-pad`, `.skuo*`, token names, and the `/design.html` path are identical across Tasks 1–4.
