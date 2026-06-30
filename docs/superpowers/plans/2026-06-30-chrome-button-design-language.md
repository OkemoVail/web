# Chrome (Chromify) Button Design Language — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every button on the site into one accent-tinted "Chrome" (Chromify) look — metallic gradient, top + bottom-lip highlights, and a soft blurred accent glow — driven by the existing accent token.

**Architecture:** Define the chrome look **once** as reusable CSS custom properties (`--chrome-fill*`, `--chrome-shadow*`, `--chrome-border`) in `src/design-tokens.css`. CSS custom properties resolve lazily at the element, so each consumer only sets `--skuo-surface` (+ optional `--skuo-glow`) and applies `background-image: var(--chrome-fill)` / `box-shadow: var(--chrome-shadow)`. The shared `.skuo*` block and every per-page glossy override block become thin consumers of this recipe. No new button classes, no markup changes.

**Tech Stack:** Hand-authored CSS in `src/design-tokens.css` (NOT Tailwind-generated — no build step needed for this file). Plain `<style>` blocks inside HTML pages. Verification is visual: open the HTML file in a browser, toggle light/dark.

## Global Constraints

- **No `!important`** on shared input/card rules; not needed for buttons either (per `CLAUDE.md`). The one pre-existing `!important` on the global `button:active` accent overlay (`design-tokens.css` ~L68-78) stays as-is — do not remove it.
- **No class renames, no markup changes.** `.skuo`, `.skuomorphic-btn`, `.skuomorphic-button`, `.skuo-accent`, `.skuo-neutral`, `.skuo-icon`, `.skuo-pill` keep their names and contract. `.skuomorphic-button` stays NOT auto-aliased to accent.
- **Accent resolves via `--skuo-accent`** (already defined: `var(--accent-color, var(--accent, #c96478))` light / `#d97790` dark). All tint flows through it.
- **Everything is accent-tinted chrome, hierarchy by intensity:** neutral = pale accent surface + dark text; primary = deep accent surface + white text.
- **14 pages** link `src/design-tokens.css`; editing the shared block updates all of them.

---

## Reference: the Chrome Recipe (defined in Task 1, consumed everywhere)

After Task 1 these custom properties exist. Consumers use them like:

```css
.some-button {
  --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%); /* pale neutral */
  border: 1px solid var(--chrome-border);
  background-image: var(--chrome-fill);
  box-shadow: var(--chrome-shadow);
}
.some-button:hover  { background-image: var(--chrome-fill-hover); box-shadow: var(--chrome-shadow-hover); }
.some-button:active { box-shadow: var(--chrome-shadow-active); }
```

Surface conventions used throughout this plan:
- **Neutral (pale accent-metal):** `--skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%);` — dark text (`--text-primary`).
- **Primary (deep accent-metal):** `--skuo-surface: color-mix(in srgb, var(--skuo-accent), white 8%);` — white text (`--accent-contrast, #fff`).
- **Dark-mode neutral:** `--skuo-surface: color-mix(in srgb, var(--skuo-accent), #2a2a28 80%);`

---

## Task 1: Add the chrome recipe custom properties

**Files:**
- Modify: `src/design-tokens.css` — add to `:root` (after line 20, the `--skuo-accent` line) and to `.dark` (after line 38).

**Interfaces:**
- Produces (consumed by every later task): custom properties `--chrome-fill`, `--chrome-fill-hover`, `--chrome-border`, `--chrome-shadow`, `--chrome-shadow-hover`, `--chrome-shadow-active`, and `--skuo-glow`. All reference `var(--skuo-surface)` / `var(--skuo-accent)` lazily, so each consumer sets `--skuo-surface` and gets the right chrome.

- [ ] **Step 1: Add the light-mode recipe to `:root`**

In `src/design-tokens.css`, immediately after line 20 (`--skuo-accent: var(--accent-color, var(--accent, #c96478));`) and before the closing `}` of `:root`, insert:

```css
  /* ── Chrome (Chromify) button recipe — consumed via --skuo-surface ── */
  --skuo-glow: color-mix(in srgb, var(--skuo-accent), transparent 78%);
  --chrome-border: color-mix(in srgb, var(--skuo-surface, #eceae2), black 18%);
  --chrome-fill: linear-gradient(
    180deg,
    color-mix(in srgb, var(--skuo-surface, #eceae2), white 60%),
    color-mix(in srgb, var(--skuo-surface, #eceae2), white 18%) 46%,
    var(--skuo-surface, #eceae2) 54%,
    color-mix(in srgb, var(--skuo-surface, #eceae2), black 16%)
  );
  --chrome-fill-hover: linear-gradient(
    180deg,
    color-mix(in srgb, var(--skuo-surface, #eceae2), white 70%),
    color-mix(in srgb, var(--skuo-surface, #eceae2), white 26%) 46%,
    var(--skuo-surface, #eceae2) 54%,
    color-mix(in srgb, var(--skuo-surface, #eceae2), black 12%)
  );
  --chrome-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    inset 0 -1px 0 rgba(255, 255, 255, 0.35),
    inset 0 -3px 4px rgba(0, 0, 0, 0.10),
    0 1px 1px rgba(0, 0, 0, 0.14),
    0 6px 16px -6px rgba(0, 0, 0, 0.30),
    0 4px 18px -4px var(--skuo-glow);
  --chrome-shadow-hover:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    inset 0 -1px 0 rgba(255, 255, 255, 0.4),
    0 2px 4px rgba(0, 0, 0, 0.18),
    0 10px 22px -6px rgba(0, 0, 0, 0.34),
    0 6px 26px -4px var(--skuo-glow);
  --chrome-shadow-active:
    inset 0 2px 4px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    0 1px 1px rgba(0, 0, 0, 0.14);
```

- [ ] **Step 2: Add the dark-mode recipe to `.dark`**

In `src/design-tokens.css`, immediately after line 38 (`--skuo-accent: var(--accent-color, var(--accent, #d97790));`) and before the closing `}` of `.dark`, insert:

```css
  /* ── Chrome recipe — dark mode ── */
  --skuo-glow: color-mix(in srgb, var(--skuo-accent), transparent 72%);
  --chrome-border: rgba(0, 0, 0, 0.5);
  --chrome-fill: linear-gradient(
    180deg,
    color-mix(in srgb, var(--skuo-surface, #3a3a37), white 22%),
    color-mix(in srgb, var(--skuo-surface, #3a3a37), white 6%) 46%,
    var(--skuo-surface, #3a3a37) 54%,
    color-mix(in srgb, var(--skuo-surface, #3a3a37), black 26%)
  );
  --chrome-fill-hover: linear-gradient(
    180deg,
    color-mix(in srgb, var(--skuo-surface, #3a3a37), white 30%),
    color-mix(in srgb, var(--skuo-surface, #3a3a37), white 10%) 46%,
    var(--skuo-surface, #3a3a37) 54%,
    color-mix(in srgb, var(--skuo-surface, #3a3a37), black 22%)
  );
  --chrome-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    inset 0 -1px 0 rgba(255, 255, 255, 0.06),
    inset 0 -3px 4px rgba(0, 0, 0, 0.35),
    0 1px 2px rgba(0, 0, 0, 0.45),
    0 6px 16px -6px rgba(0, 0, 0, 0.55),
    0 4px 18px -4px var(--skuo-glow);
  --chrome-shadow-hover:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    inset 0 -1px 0 rgba(255, 255, 255, 0.08),
    0 2px 4px rgba(0, 0, 0, 0.5),
    0 10px 22px -6px rgba(0, 0, 0, 0.6),
    0 6px 26px -4px var(--skuo-glow);
  --chrome-shadow-active:
    inset 0 2px 4px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 1px 2px rgba(0, 0, 0, 0.4);
```

- [ ] **Step 3: Verify (visual, no build)**

Open `design.html` directly in a browser. Buttons will not change yet (no consumer rewired), but the page must still render with **no CSS errors** in DevTools console. Confirm the file parses (no broken `color-mix`/`var` syntax). Toggle the page's dark switch — no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/design-tokens.css
git commit -m "feat(ui): add chrome button recipe custom properties"
```

---

## Task 2: Convert the shared `.skuo*` block to chrome

**Files:**
- Modify: `src/design-tokens.css` — replace the base block lines ~87-235 (the `.skuo` base, `::before`, `:hover`, `:active`, `:focus-visible`, `:disabled`, `.skuo-accent`, `.skuo-neutral`, `.skuo-icon`, `.skuo-pill`, and the `.dark .skuo*` block).

**Interfaces:**
- Consumes: `--chrome-fill`, `--chrome-fill-hover`, `--chrome-shadow`, `--chrome-shadow-hover`, `--chrome-shadow-active`, `--chrome-border`, `--skuo-glow` from Task 1.
- Produces: chrome-styled `.skuo` / `.skuomorphic-btn` / `.skuomorphic-button` (neutral pale-accent) and `.skuo-accent` (deep accent), used by all 14 pages.

- [ ] **Step 1: Replace the base + variants block**

In `src/design-tokens.css`, replace the entire range from `.skuo,` (line ~87) through the end of `.dark .skuo-neutral { ... }` (line ~235) with:

```css
.skuo,
.skuomorphic-btn,
.skuomorphic-button {
  --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%);
  position: relative;
  isolation: isolate;
  border: 1px solid var(--chrome-border);
  border-radius: 12px;
  background-image: var(--chrome-fill);
  box-shadow: var(--chrome-shadow);
  color: var(--text-primary);
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.2s ease,
    filter 0.18s ease,
    background-image 0.2s ease;
}

/* Wet-glass reflection over the top half (light play) */
.skuo::before,
.skuomorphic-btn::before,
.skuomorphic-button::before {
  content: "";
  position: absolute;
  inset: 1px 1px auto 1px;
  height: 46%;
  border-radius: inherit;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.55),
    rgba(255, 255, 255, 0.05)
  );
  pointer-events: none;
  z-index: -1;
}

.skuo:hover,
.skuomorphic-btn:hover,
.skuomorphic-button:hover {
  transform: translateY(-1px);
  filter: brightness(1.03);
  background-image: var(--chrome-fill-hover);
  box-shadow: var(--chrome-shadow-hover);
}

.skuo:active,
.skuomorphic-btn:active,
.skuomorphic-button:active {
  transform: translateY(1px);
  filter: brightness(0.98);
  box-shadow: var(--chrome-shadow-active);
}

.skuo:focus-visible,
.skuomorphic-btn:focus-visible,
.skuomorphic-button:focus-visible {
  outline: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 0 0 3px color-mix(in srgb, var(--skuo-accent), transparent 55%),
    0 4px 14px -4px var(--skuo-glow);
}

.skuo:disabled,
.skuo[disabled],
.skuomorphic-btn:disabled,
.skuomorphic-button:disabled {
  cursor: default;
  transform: none;
  filter: none;
  opacity: 0.55;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

/* Accent / primary — deep accent-metal, white text */
.skuo-accent {
  --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 8%);
  color: var(--accent-contrast, #ffffff);
  border-color: color-mix(in srgb, var(--skuo-accent), black 26%);
}

/* Explicit neutral pale-accent (overrides accent if both present) */
.skuo-neutral {
  --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%);
  color: var(--text-primary);
}

/* Compact icon buttons — smaller radius + gentler glow */
.skuo-icon {
  border-radius: 9px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 1px 2px rgba(0, 0, 0, 0.16),
    0 3px 12px -4px var(--skuo-glow);
}
.skuo-icon::before { height: 50%; opacity: 0.85; }
.skuo-icon:hover { transform: none; filter: brightness(1.05); }
.skuo-icon:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }

/* Pill-shaped (keep rounded-full CTAs round) */
.skuo-pill { border-radius: 9999px; }
.skuo-pill::before { border-radius: 9999px; }

/* ── Dark mode neutral surface ──────────────────────────────── */
.dark .skuo,
.dark .skuomorphic-btn,
.dark .skuomorphic-button {
  --skuo-surface: color-mix(in srgb, var(--skuo-accent), #2a2a28 80%);
}

.dark .skuo::before,
.dark .skuomorphic-btn::before,
.dark .skuomorphic-button::before {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.2),
    rgba(255, 255, 255, 0.02)
  );
}

.dark .skuo-accent {
  --skuo-surface: color-mix(in srgb, var(--skuo-accent), black 8%);
  border-color: color-mix(in srgb, var(--skuo-accent), black 34%);
}

.dark .skuo-neutral { --skuo-surface: color-mix(in srgb, var(--skuo-accent), #2a2a28 80%); }
```

- [ ] **Step 2: Verify on the showcase**

Open `design.html` in a browser. Confirm:
- Neutral buttons render as **pale accent-tinted chrome** with a visible top highlight, a soft bottom-lip highlight, and a faint accent glow beneath.
- Primary (`.skuo-accent`) buttons render as **deeper accent chrome** with white text.
- Hover lifts + brightens + grows the glow; press sinks into a recessed look.
- Toggle the showcase's dark switch: dark accent-metal surfaces, highlights still read, glow still visible.
- DevTools console: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/design-tokens.css
git commit -m "feat(ui): convert shared skuo buttons to accent chrome"
```

---

## Task 3: Convert chat override block to chrome

**Files:**
- Modify: `AI/chat.html` — the glossy override block (lines ~3304-3409): `.sb-new-chat-btn`, `.Cadance-tab-btn` (+ `.active`), `.mem-consent-save`, `.mem-consent-dismiss`, and their `.dark`/`:active` rules.

**Interfaces:**
- Consumes: chrome recipe vars from Task 1. The chat app sets `--accent-color`, so `--skuo-accent` resolves to the chat accent automatically.

- [ ] **Step 1: Replace the chat override block**

In `AI/chat.html`, replace the range from the comment `/* ── Skeuomorphic glossy overrides for chat-specific buttons ──` (line ~3304) through the `.mem-consent-dismiss:active { transform: translateY(1px); }` line (line ~3409) with:

```css
        /* ── Chrome overrides for chat-specific buttons ──
           Consume the shared --chrome-* recipe; set surface + glow only. */
        .sb-new-chat-btn {
            --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%);
            border: 1px solid var(--chrome-border);
            background-image: var(--chrome-fill);
            box-shadow: var(--chrome-shadow), inset 0 0 0 1px var(--sb-edge);
        }
        .sb-new-chat-btn:hover { background-image: var(--chrome-fill-hover); box-shadow: var(--chrome-shadow-hover), inset 0 0 0 1px var(--sb-edge); }
        .sb-new-chat-btn:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }
        .dark .sb-new-chat-btn { --skuo-surface: color-mix(in srgb, var(--skuo-accent), #2a2a28 80%); }

        /* Settings tabs — pale chrome chips; active tab gets deep accent chrome */
        .Cadance-tab-btn {
            --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%);
            border: 1px solid var(--chrome-border);
            background-image: var(--chrome-fill);
            box-shadow: var(--chrome-shadow);
        }
        .Cadance-tab-btn:hover { background-image: var(--chrome-fill-hover); box-shadow: var(--chrome-shadow-hover); }
        .Cadance-tab-btn.active {
            --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 8%);
            color: var(--accent-contrast, #fff) !important;
            border-color: color-mix(in srgb, var(--skuo-accent), black 26%);
            background-image: var(--chrome-fill);
            box-shadow: var(--chrome-shadow);
        }
        .dark .Cadance-tab-btn { --skuo-surface: color-mix(in srgb, var(--skuo-accent), #2a2a28 80%); }
        .Cadance-tab-btn:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }

        /* Memory consent buttons */
        .mem-consent-save {
            --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 8%);
            color: var(--accent-contrast, #fff);
            border: 1px solid color-mix(in srgb, var(--skuo-accent), black 26%);
            background-image: var(--chrome-fill);
            box-shadow: var(--chrome-shadow);
        }
        .mem-consent-save:hover { background-image: var(--chrome-fill-hover); box-shadow: var(--chrome-shadow-hover); }
        .mem-consent-save:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }
        .mem-consent-dismiss {
            --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%);
            border: 1px solid var(--chrome-border);
            background-image: var(--chrome-fill);
            box-shadow: var(--chrome-shadow);
        }
        .dark .mem-consent-dismiss { --skuo-surface: color-mix(in srgb, var(--skuo-accent), #2a2a28 80%); }
        .mem-consent-dismiss:hover { background-image: var(--chrome-fill-hover); box-shadow: var(--chrome-shadow-hover); }
        .mem-consent-dismiss:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }
```

- [ ] **Step 2: Verify**

Open `AI/chat.html` in a browser. Confirm the sidebar "New chat" button, the settings tabs (open Settings), and the memory-consent buttons all read as accent chrome (active tab = deeper accent). Toggle the in-app theme to dark and re-check. No console errors.

- [ ] **Step 3: Commit**

```bash
git add AI/chat.html
git commit -m "feat(ui): convert chat buttons to accent chrome"
```

---

## Task 4: Convert landing (`index.html`) override block to chrome

**Files:**
- Modify: `index.html` — the glossy override block (lines ~415-491): `.g-cta` (+`:hover`), `.btn-ink`, `.btn-line`, `.g-icon` (+`:active`).

**Interfaces:**
- Consumes: chrome recipe vars from Task 1. Landing uses `--accent` (no `--accent-color`), so `--skuo-accent` resolves to `--accent`.

- [ ] **Step 1: Replace the landing override block**

In `index.html`, replace the range from `/* ── Skeuomorphic glossy buttons (landing) ─────────────────── */` (line ~415) through `.g-icon:active { transform: translateY(1px); }` (line ~491) with:

```css
    /* ── Chrome buttons (landing) — consume shared --chrome-* recipe ── */
    .g-cta {
      --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 8%);
      color: var(--accent-contrast, #fff);
      border: 1px solid color-mix(in srgb, var(--skuo-accent), black 26%);
      background-image: var(--chrome-fill);
      box-shadow: var(--chrome-shadow);
    }
    .g-cta:hover { background-image: var(--chrome-fill-hover); box-shadow: var(--chrome-shadow-hover); }
    .g-cta:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }

    /* btn-ink folded into the one accent-metal family (neutral pale chrome) */
    .btn-ink {
      --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%);
      color: var(--text-primary);
      border: 1px solid var(--chrome-border);
      background-image: var(--chrome-fill);
      box-shadow: var(--chrome-shadow);
    }
    .btn-ink:hover { background-image: var(--chrome-fill-hover); box-shadow: var(--chrome-shadow-hover); }
    .btn-ink:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }

    .btn-line {
      --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%);
      border: 1px solid var(--chrome-border);
      background-image: var(--chrome-fill);
      box-shadow: var(--chrome-shadow);
    }
    .btn-line:hover { background-image: var(--chrome-fill-hover); box-shadow: var(--chrome-shadow-hover); }
    .btn-line:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }

    .g-icon {
      --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%);
      border: 1px solid var(--chrome-border);
      background-image: var(--chrome-fill);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.7),
        0 1px 2px rgba(0, 0, 0, 0.16),
        0 3px 12px -4px var(--skuo-glow);
    }
    .g-icon:hover { background-image: var(--chrome-fill-hover); }
    .g-icon:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }

    .dark .g-cta   { --skuo-surface: color-mix(in srgb, var(--skuo-accent), black 8%); }
    .dark .btn-ink,
    .dark .btn-line,
    .dark .g-icon  { --skuo-surface: color-mix(in srgb, var(--skuo-accent), #2a2a28 80%); }
```

- [ ] **Step 2: Verify**

Open `index.html` in a browser. The nav "Labs21" CTA = deep accent chrome (white text); the theme/menu icon buttons + any `.btn-line`/`.btn-ink` = pale accent chrome. Use the page theme toggle to check dark mode. No console errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): convert landing buttons to accent chrome"
```

---

## Task 5: Convert editor (`AI/editor.html`) override block to chrome

**Files:**
- Modify: `AI/editor.html` — `.toolbar-btn` block (~L128-150) and `.control-btn` block (~L224-280, including the dark variants).

**Interfaces:**
- Consumes: chrome recipe vars from Task 1.

- [ ] **Step 1: Inspect, then replace the editor button rules**

First read the current blocks to capture every selector in range:

```bash
sed -n '120,300p' AI/editor.html
```

Replace the **background-image / box-shadow / border** declarations inside `.toolbar-btn`, `.toolbar-btn:hover`, `.dark .toolbar-btn:hover`, `.control-btn`, `.control-btn:hover`, and any `.dark .control-btn*` rules so each becomes a recipe consumer. For each base rule set:

```css
        .toolbar-btn {
            /* keep existing layout props (padding, size, radius, display) */
            --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%);
            border: 1px solid var(--chrome-border);
            background-image: var(--chrome-fill);
            box-shadow: var(--chrome-shadow);
        }
        .toolbar-btn:hover { background-image: var(--chrome-fill-hover); box-shadow: var(--chrome-shadow-hover); }
        .toolbar-btn:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }
        .dark .toolbar-btn { --skuo-surface: color-mix(in srgb, var(--skuo-accent), #2a2a28 80%); }
```

Apply the identical pattern to `.control-btn` (swap the selector name; keep that rule's own layout properties — only replace `background-image`, `box-shadow`, `border`, and add the `--skuo-surface` line + `:hover`/`:active`/`.dark` rules). Delete the old hand-written gradient/`box-shadow` values they replace. If `.control-btn` has a primary/active state, give it `--skuo-surface: color-mix(in srgb, var(--skuo-accent), white 8%); color: var(--accent-contrast,#fff);` instead of the pale surface.

- [ ] **Step 2: Verify**

Open `AI/editor.html` in a browser. Toolbar buttons and control buttons read as accent chrome; hover/press behave. Toggle dark mode. No console errors.

- [ ] **Step 3: Commit**

```bash
git add AI/editor.html
git commit -m "feat(ui): convert editor buttons to accent chrome"
```

---

## Task 6: Convert version + word override blocks to chrome

**Files:**
- Modify: `AI/version.html` — `.btn-primary` block (~L155-180).
- Modify: `word/index.html` — `.hdr-btn` block (~L178-210) and `.tb-btn` block (~L248-280), including dark variants.

**Interfaces:**
- Consumes: chrome recipe vars from Task 1.

- [ ] **Step 1: Replace `.btn-primary` in `AI/version.html`**

Read the block first: `sed -n '150,185p' AI/version.html`. `.btn-primary` is a primary CTA → deep accent chrome. Replace its `background-image`/`box-shadow`/`border` (keep layout props) with:

```css
        .btn-primary {
            /* keep existing padding/size/radius/display */
            --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 8%);
            color: var(--accent-contrast, #fff);
            border: 1px solid color-mix(in srgb, var(--skuo-accent), black 26%);
            background-image: var(--chrome-fill);
            box-shadow: var(--chrome-shadow);
        }
        .btn-primary:hover { background-image: var(--chrome-fill-hover); box-shadow: var(--chrome-shadow-hover); }
        .btn-primary:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }
        .dark .btn-primary { --skuo-surface: color-mix(in srgb, var(--skuo-accent), black 8%); }
```

- [ ] **Step 2: Replace `.hdr-btn` and `.tb-btn` in `word/index.html`**

Read first: `sed -n '170,285p' word/index.html`. Both are neutral toolbar buttons → pale accent chrome. For each (`.hdr-btn`, `.tb-btn`), keep layout props and replace the gradient/shadow/border with:

```css
        .hdr-btn {
            /* keep existing padding/size/radius/display */
            --skuo-surface: color-mix(in srgb, var(--skuo-accent), white 82%);
            border: 1px solid var(--chrome-border);
            background-image: var(--chrome-fill);
            box-shadow: var(--chrome-shadow);
        }
        .hdr-btn:hover { background-image: var(--chrome-fill-hover); box-shadow: var(--chrome-shadow-hover); }
        .hdr-btn:active { transform: translateY(1px); box-shadow: var(--chrome-shadow-active); }
        .dark .hdr-btn { --skuo-surface: color-mix(in srgb, var(--skuo-accent), #2a2a28 80%); }
```

Apply the same pattern to `.tb-btn` (swap the selector name). Remove the old hand-written gradient/`box-shadow`/`.dark ...:hover` values these replace.

- [ ] **Step 3: Verify**

Open `AI/version.html` and `word/index.html` in a browser. Version "Apply & Push" = deep accent chrome; word header/toolbar buttons = pale accent chrome. Check dark mode on each. No console errors.

- [ ] **Step 4: Commit**

```bash
git add AI/version.html word/index.html
git commit -m "feat(ui): convert version and word buttons to accent chrome"
```

---

## Task 7: Update showcase copy + project docs

**Files:**
- Modify: `design.html` — any inline copy/labels describing the button system (e.g. "Skeuomorphic glossy" → "Chrome"); confirm swatches still render. No structural change required if buttons already inherit from Task 2.
- Modify: `CLAUDE.md` — the "Skeuomorphic glossy buttons" section.

- [ ] **Step 1: Update `design.html` copy**

Search for button-section headings/labels:

```bash
grep -n -i "skeuomorph\|glossy\|button" design.html | head -30
```

Where the showcase labels the button family as "Skeuomorphic / glossy," update the visible copy to describe the **Chrome (accent-tinted)** language. Do not rename CSS classes. If a short descriptive paragraph exists, mention: metallic accent gradient, top + bottom-lip highlights, soft accent glow, hierarchy by intensity (pale neutral / deep primary).

- [ ] **Step 2: Update `CLAUDE.md`**

In the `## Skeuomorphic glossy buttons (site-wide)` section, append/adjust a note documenting the chrome recipe:

```markdown
### Chrome (Chromify) button language

As of 2026-06-30 the glossy buttons were retuned into one **accent-tinted chrome**
family. The look is defined once in `src/design-tokens.css` as reusable custom
properties — `--chrome-fill`, `--chrome-fill-hover`, `--chrome-shadow`,
`--chrome-shadow-hover`, `--chrome-shadow-active`, `--chrome-border`, `--skuo-glow`
— which resolve lazily against the consumer's `--skuo-surface`. To make any button
chrome: set `--skuo-surface` (+ optional surface for `.dark`) and apply
`background-image: var(--chrome-fill); box-shadow: var(--chrome-shadow);` with
`:hover` → `*-hover` and `:active` → `--chrome-shadow-active`.

- **Neutral** surface = `color-mix(in srgb, var(--skuo-accent), white 82%)` (dark text).
- **Primary** surface = `color-mix(in srgb, var(--skuo-accent), white 8%)` (white text).
- **Dark neutral** = `color-mix(in srgb, var(--skuo-accent), #2a2a28 80%)`.

Hierarchy is by **intensity, not hue** — everything is accent-tinted. The per-page
override blocks (chat, landing, editor, version, word) now consume the recipe instead
of hand-writing gradients. Spec/plan: `docs/superpowers/specs/2026-06-30-chrome-button-design-language.md`,
`docs/superpowers/plans/2026-06-30-chrome-button-design-language.md`.
```

- [ ] **Step 3: Verify**

Open `design.html`; confirm copy reads "Chrome" and all swatches/buttons render correctly in light + dark. Re-read the `CLAUDE.md` section for accuracy.

- [ ] **Step 4: Commit**

```bash
git add design.html CLAUDE.md
git commit -m "docs(ui): document chrome button language; update showcase copy"
```

---

## Final verification (after all tasks)

- [ ] Open each page that has buttons — `index.html`, `design.html`, `AI/chat.html`, `AI/editor.html`, `AI/version.html`, `word/index.html`, `AI/index.html`, `AI/manage.html`, `AI/research.html`, `AI/goals.html`, `AI/tos.html`, `AI/privacy.html`, `Themes/Themes.html` — and confirm every button reads as accent chrome in **both** light and dark mode, with no button regressing to the old flat gloss.
- [ ] Confirm primary vs neutral hierarchy is legible (deep vs pale).
- [ ] DevTools console clean on each page.

## Notes for the implementer

- `src/design-tokens.css` is **hand-authored**, not Tailwind output — no `npx @tailwindcss/cli` rebuild is needed for it. Only re-run Tailwind if you touch utility classes in HTML (you won't here).
- `color-mix` + lazy `var()` resolution is the backbone — if a button looks unstyled, it's almost always a missing `--skuo-surface` on that selector.
- The global `button:active` accent overlay (`design-tokens.css` ~L68-78, `!important`) intentionally tints any button on press; leave it. It layers on top of `--chrome-shadow-active` and is fine.
- Pages not given their own task (`AI/index.html`, `AI/manage.html`, `AI/research.html`, info pages, `Themes/Themes.html`) use the shared `.skuo*`/`.skuomorphic-*` classes and are fully covered by Task 2.
```
