# Skeuomorphic Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every button across all 14 pages a bold, glossy skeuomorphic look (top highlight + inner accent gradient) authored once in the shared stylesheet.

**Architecture:** All pages link `src/design-tokens.css`. The entire glossy system is authored there as a `.skuo` class family (`.skuo`, `.skuo-accent`, `.skuo-neutral`, `.skuo-icon`) plus aliases for the two existing button classes (`.skuomorphic-btn`, `.skuomorphic-button`). Per-page work is only adding classes to markup. No JS, no build step beyond the existing Tailwind watcher (which does not touch `design-tokens.css`).

**Tech Stack:** Plain CSS (`color-mix`, CSS custom properties, `::before` pseudo-elements), class-based dark mode (`.dark` on `<html>`).

**Verification model:** No automated test suite exists (per CLAUDE.md). Each task is verified by opening the affected page(s) in a browser in **both light and dark** mode and confirming the glossy read. Toggle theme via DevTools console: `localStorage.setItem('vail_theme','dark'); location.reload()` (and `'light'`).

---

## File Structure

- **`src/design-tokens.css`** (modify) — owns the entire glossy `.skuo` system + the `--skuo-accent` convenience var. Single source of truth.
- **`AI/chat.html`** (modify) — add `.skuo-accent` to send button; restyle icon-button classes to consume glossy; tabs / new-chat / consent buttons.
- **`AI/index.html`** (modify) — `.skuomorphic-button` upgrades automatically; verify only.
- **`index.html`** (modify) — add `.skuo*` to landing CTAs.
- **`AI/editor.html`, `AI/manage.html`, `AI/research.html`, `AI/goals.html`, `AI/version.html`, `AI/privacy.html`, `AI/tos.html`** (modify) — add `.skuo*` to prominent buttons.
- **`Themes/Themes.html`, `whitename.html`, `word/index.html`** (modify) — add `.skuo*` to action/back buttons.

---

## Task 1: Author the core glossy `.skuo` system in the shared stylesheet

**Files:**
- Modify: `src/design-tokens.css` (append after the existing `:active` block, line 77)

- [ ] **Step 1: Add the `--skuo-accent` convenience var to `:root` and `.dark`**

In `src/design-tokens.css`, add `--skuo-accent` to the `:root` block (after line 19, before the closing `}` at line 20):

```css
  --skuo-accent: var(--accent-color, var(--accent, #c96478));
```

And add the same line to the `.dark` block (after line 36, before the closing `}` at line 37). It resolves the same chain but inherits the dark-swapped `--accent`:

```css
  --skuo-accent: var(--accent-color, var(--accent, #d97790));
```

- [ ] **Step 2: Append the glossy system at the end of the file**

Append to `src/design-tokens.css`:

```css
/* ── Skeuomorphic glossy button system (site-wide) ──────────────
   Bold/glossy buttons: inner vertical gradient + wet-glass top
   highlight + bevel + lift shadow. Accent-aware via --skuo-accent.
   Opt in with .skuo (neutral) / .skuo.skuo-accent (primary).
   Authored once here; all 14 pages link this file. */

.skuo,
.skuomorphic-btn,
.skuomorphic-button {
  position: relative;
  isolation: isolate;
  border: 1px solid color-mix(in srgb, var(--skuo-surface, #e9e7df), black 16%);
  border-radius: 10px;
  background-image: linear-gradient(
    180deg,
    color-mix(in srgb, var(--skuo-surface, #f3f1ea), white 18%),
    var(--skuo-surface, #f3f1ea) 52%,
    color-mix(in srgb, var(--skuo-surface, #f3f1ea), black 12%)
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    inset 0 -1px 1px rgba(0, 0, 0, 0.16),
    0 1px 2px rgba(0, 0, 0, 0.18),
    0 4px 10px -3px rgba(0, 0, 0, 0.25);
  color: var(--text-primary);
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.18s ease,
    filter 0.18s ease;
}

/* Wet-glass reflection over the top half */
.skuo::before,
.skuomorphic-btn::before,
.skuomorphic-button::before {
  content: "";
  position: absolute;
  inset: 1px 1px auto 1px;
  height: 48%;
  border-radius: inherit;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.5),
    rgba(255, 255, 255, 0.06)
  );
  pointer-events: none;
  z-index: -1;
}

.skuo:hover,
.skuomorphic-btn:hover,
.skuomorphic-button:hover {
  transform: translateY(-1px);
  filter: brightness(1.04);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    inset 0 -1px 1px rgba(0, 0, 0, 0.16),
    0 2px 4px rgba(0, 0, 0, 0.2),
    0 8px 16px -4px rgba(0, 0, 0, 0.3);
}

.skuo:active,
.skuomorphic-btn:active,
.skuomorphic-button:active {
  transform: translateY(1px);
  filter: brightness(0.97);
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    0 1px 1px rgba(0, 0, 0, 0.15);
}

.skuo:focus-visible,
.skuomorphic-btn:focus-visible,
.skuomorphic-button:focus-visible {
  outline: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    0 0 0 3px color-mix(in srgb, var(--skuo-accent), transparent 60%),
    0 4px 10px -3px rgba(0, 0, 0, 0.25);
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

/* Accent / primary variant — gradient base is the resolved accent */
.skuo-accent,
.skuomorphic-button {
  --skuo-surface: var(--skuo-accent);
  color: var(--accent-contrast, #ffffff);
  border-color: color-mix(in srgb, var(--skuo-accent), black 22%);
}

/* Explicit neutral (overrides accent if both somehow present) */
.skuo-neutral {
  --skuo-surface: #f3f1ea;
  color: var(--text-primary);
}

/* Compact icon buttons — scale gloss down so they read as chips, not bubbles */
.skuo-icon {
  border-radius: 8px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    0 1px 2px rgba(0, 0, 0, 0.16);
}
.skuo-icon::before { height: 50%; opacity: 0.8; }
.skuo-icon:hover { transform: none; filter: brightness(1.05); }
.skuo-icon:active { transform: translateY(1px); }

/* ── Dark mode ──────────────────────────────────────────────── */
.dark .skuo,
.dark .skuomorphic-btn,
.dark .skuomorphic-button {
  --skuo-surface: #3a3a37;
  border-color: rgba(0, 0, 0, 0.55);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 -1px 1px rgba(0, 0, 0, 0.4),
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 4px 12px -3px rgba(0, 0, 0, 0.55);
}

.dark .skuo::before,
.dark .skuomorphic-btn::before,
.dark .skuomorphic-button::before {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.18),
    rgba(255, 255, 255, 0.02)
  );
}

.dark .skuo-accent,
.dark .skuomorphic-button {
  --skuo-surface: var(--skuo-accent);
  border-color: color-mix(in srgb, var(--skuo-accent), black 30%);
}

.dark .skuo-neutral { --skuo-surface: #3a3a37; }
```

- [ ] **Step 3: Verify in browser (smoke test on the landing CTA)**

Open `AI/index.html` in a browser. The landing buttons use `.skuomorphic-button`, so they should already render glossy/accent.
Expected (light): accent-colored buttons with a visible top sheen, top-light→bottom-dark gradient, lift on hover, sink on press.
Then in DevTools console: `localStorage.setItem('vail_theme','dark'); location.reload()` — confirm dark variant (softer highlight, deeper shadow) still reads glossy.

- [ ] **Step 4: Commit**

```bash
git add src/design-tokens.css
git commit -m "feat(ui): add site-wide skeuomorphic glossy button system"
```

---

## Task 2: Wire the chat app primary + icon buttons

**Files:**
- Modify: `AI/chat.html` (send button markup + icon-button CSS classes)

- [ ] **Step 1: Make the send button accent-glossy**

The send button already has `.skuomorphic-btn` (so it's glossy-neutral). It's the primary action, so add `skuo-accent`. Find `id="send-btn"` in `AI/chat.html` and add `skuo-accent` to its class list, e.g.:

```html
<button id="send-btn" class="skuomorphic-btn skuo-accent ...existing classes...">
```

(Keep all existing classes; only append `skuo-accent`.)

- [ ] **Step 2: Make the icon buttons glossy via their existing classes**

To avoid markup churn on every icon button, restyle their classes to consume the glossy system. In the `AI/chat.html` inline `<style>`, add this block (after the existing `.sb-icon-btn` rule near line 375):

```css
/* Glossy icon buttons (consume the shared .skuo-icon look) */
.sb-icon-btn,
.sb-mini-btn,
.history-action-btn {
  border: 1px solid color-mix(in srgb, var(--skuo-surface, #efece4), black 14%);
  background-image: linear-gradient(
    180deg,
    color-mix(in srgb, var(--skuo-surface, #f4f2ec), white 16%),
    var(--skuo-surface, #f4f2ec) 55%,
    color-mix(in srgb, var(--skuo-surface, #f4f2ec), black 10%)
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 1px 2px rgba(0, 0, 0, 0.16);
}
.dark .sb-icon-btn,
.dark .sb-mini-btn,
.dark .history-action-btn {
  --skuo-surface: #3a3a37;
  border-color: rgba(0, 0, 0, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 1px 2px rgba(0, 0, 0, 0.4);
}
.sb-icon-btn:active,
.sb-mini-btn:active,
.history-action-btn:active { transform: translateY(1px); }
```

- [ ] **Step 3: Verify in browser**

Open `AI/chat.html`. Confirm: send button is a glossy accent pill; sidebar icon buttons, mini buttons, and history pin/delete buttons read as glossy chips (subtle sheen, not flat, not oversized bubbles). Toggle dark mode and re-confirm.
Then open Settings → change the accent color and confirm the send button retints live.

- [ ] **Step 4: Commit**

```bash
git add AI/chat.html
git commit -m "feat(ui): glossy send button + icon buttons in chat app"
```

---

## Task 3: Glossy tabs, new-chat, and consent buttons in chat app

**Files:**
- Modify: `AI/chat.html` (markup class additions)

- [ ] **Step 1: Add glossy classes to the prominent text buttons**

In `AI/chat.html` markup, append classes (keep existing ones):

- Settings tab buttons `.Cadance-tab-btn` → add `skuo skuo-neutral` (the `.active` tab keeps its accent text/box via existing rules; glossy fill underneath is fine).
- New-chat button `.sb-new-chat-btn` → add `skuo skuo-neutral`.
- Memory consent save `.mem-consent-save` → add `skuo skuo-accent`.
- Memory consent dismiss `.mem-consent-dismiss` → add `skuo skuo-neutral`.
- Personality save/memory-add buttons (`.skuomorphic-btn` already) that are primary actions → add `skuo-accent`.

- [ ] **Step 2: Guard against double background on `.sb-new-chat-btn`**

`.sb-new-chat-btn` sets its own `background: var(--bg-elevated)`. Adding `.skuo` gives it a `background-image` gradient that composes on top of that `background-color`, which is correct. No change needed — but verify it doesn't look flat; if the solid `background` hides the gradient, remove the `background:` shorthand from `.sb-new-chat-btn` (it's at line ~580) and rely on `--skuo-surface`. Set `--skuo-surface: var(--bg-elevated)` on the rule if so.

- [ ] **Step 3: Verify in browser**

Open `AI/chat.html`, open Settings (tabs glossy), open the sidebar (new-chat glossy), trigger the memory consent UI if reachable. Confirm glossy in light + dark.

- [ ] **Step 4: Commit**

```bash
git add AI/chat.html
git commit -m "feat(ui): glossy tabs, new-chat, and consent buttons"
```

---

## Task 4: Landing page (`index.html`) CTAs

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add glossy classes to the landing buttons**

Find the `<button>` / `<a class="...">` CTAs in `index.html` (≈8 of them). For each primary CTA add `skuo skuo-accent`; for secondary/neutral buttons add `skuo skuo-neutral`. Keep existing Tailwind sizing/radius classes (e.g. `px-6 py-3 rounded-full`) — the glossy CSS composes with them. If a Tailwind `rounded-full` is present, the glossy `border-radius:10px` would override; to keep pills, also keep the utility and add inline-safe `rounded-full` wins via Tailwind specificity — verify; if the corner looks wrong, add `style="border-radius:9999px"` or a small `.skuo-pill { border-radius:9999px }` helper in `src/design-tokens.css`.

- [ ] **Step 2: Add a `.skuo-pill` helper if any pill buttons need it**

If step 1 found pill-shaped CTAs, append to `src/design-tokens.css`:

```css
.skuo-pill { border-radius: 9999px; }
.skuo-pill::before { border-radius: 9999px; }
```

and add `skuo-pill` to those buttons.

- [ ] **Step 3: Verify in browser**

Open `index.html` in light + dark. Confirm CTAs are glossy, accent primary buttons retint with theme, corners correct.

- [ ] **Step 4: Commit**

```bash
git add index.html src/design-tokens.css
git commit -m "feat(ui): glossy CTAs on landing page"
```

---

## Task 5: Remaining AI sub-pages

**Files:**
- Modify: `AI/editor.html`, `AI/manage.html`, `AI/research.html`, `AI/goals.html`, `AI/version.html`, `AI/privacy.html`, `AI/tos.html`

- [ ] **Step 1: editor.html toolbar buttons**

In `AI/editor.html`, add `skuo skuo-neutral` to `.toolbar-btn` and header action buttons. For the small square toolbar icons, also add `skuo-icon`. Primary "Publish"/"Save" buttons get `skuo skuo-accent`.

- [ ] **Step 2: manage.html / research.html / goals.html / version.html**

For each, add to the prominent text buttons: primary actions → `skuo skuo-accent`; secondary/back/cancel → `skuo skuo-neutral`. Small icon buttons → `skuo skuo-icon`.

- [ ] **Step 3: privacy.html / tos.html**

Add `skuo skuo-neutral` to any back/nav buttons present.

- [ ] **Step 4: Verify in browser**

Open each of the 7 pages in light + dark. Confirm buttons are glossy and corners/sizing intact.

- [ ] **Step 5: Commit**

```bash
git add AI/editor.html AI/manage.html AI/research.html AI/goals.html AI/version.html AI/privacy.html AI/tos.html
git commit -m "feat(ui): glossy buttons across AI sub-pages"
```

---

## Task 6: Themes, whitename, word pages

**Files:**
- Modify: `Themes/Themes.html`, `whitename.html`, `word/index.html`

- [ ] **Step 1: Themes.html "Back" pill**

In `Themes/Themes.html` the Back control uses Tailwind utilities + `rounded-full`. Add `skuo skuo-neutral skuo-pill` (keep existing utilities). Confirm the pill shape survives (uses `.skuo-pill` from Task 4; if Task 4 didn't create it, add the `.skuo-pill` block from Task 4 Step 2 to `src/design-tokens.css` now).

- [ ] **Step 2: whitename.html / word/index.html action buttons**

Add `skuo` (neutral) or `skuo skuo-accent` (primary actions) to the action buttons on each page. `word/index.html` uses inline `<style>` only and still links `design-tokens.css`, so `.skuo` is available.

- [ ] **Step 3: Verify in browser**

Open all three pages in light + dark. Confirm glossy buttons, correct pill on Themes Back.

- [ ] **Step 4: Commit**

```bash
git add Themes/Themes.html whitename.html word/index.html
git commit -m "feat(ui): glossy buttons on Themes, whitename, word pages"
```

---

## Task 7: Final cross-page pass

- [ ] **Step 1: Sweep every page for missed or broken buttons**

Open all 14 pages once more in light + dark. Look for: any prominent button still flat (missed a class), any button whose existing solid `background`/Tailwind `bg-*` hides the gradient, any unreadable text on an accent fill, any broken corner radius.

- [ ] **Step 2: Fix issues inline**

For buttons whose own `background` hides the gloss: set `--skuo-surface` on that button's existing rule to its intended base color (so the gradient derives from it) instead of a hard `background-color`. For unreadable accent text: ensure `color: var(--accent-contrast, #fff)` is applied (already in `.skuo-accent`); if a page lacks `--accent-contrast`, it falls back to white.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(ui): cross-page skeuomorphic button polish"
```

---

## Self-Review Notes

- **Spec coverage:** shared-file authoring (Task 1), existing-class upgrade (Task 1 selectors + Task 2), accent/neutral/icon variants (Task 1), dark mode (Task 1), every-page rollout (Tasks 2–6), verification (every task + Task 7). All spec sections covered.
- **Accent resolution:** `--skuo-accent` defined identically in `:root`/`.dark`, consumed by `.skuo-accent`. Matches the existing `:active` chain.
- **No automated tests:** intentional — project has none; browser verification substitutes, stated up front.
