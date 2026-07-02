# Floating Sidebar Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `AI/chat.html` chat sidebar into a floating, detached panel that matches the site-wide floating nav (`.ov-nav__bar`), and refresh its surface/depth + search/history in the spirit of `design.html` — with zero behavior changes.

**Architecture:** All edits are confined to `AI/chat.html` — its inline `<style>` block and the sidebar markup (`<aside id="sidebar">`). The sidebar stays **in the flex flow** on desktop (`lg:static`) and is inset via `margin` so `<main>` and its absolutely-positioned islands stay aligned automatically. The floating surface reuses the exact `.ov-nav__bar` recipe (whisper 180° gradient + hairline border + inset top highlight + soft lift shadow). Collapsed = a floating 44px rail; mobile = a floating inset drawer. No JS logic changes.

**Tech Stack:** Vanilla HTML/CSS, Tailwind (CDN + utility classes in markup), CSS custom properties. No build step for chat.html (Tailwind CDN); no test suite — verification is manual in-browser.

## Global Constraints

- All changes confined to `AI/chat.html`. Do **not** modify `src/design-tokens.css` or any other page.
- Reuse the `.ov-nav__bar` surface recipe values verbatim (light + dark) — see Task 1.
- Preserve **all** behavior: `window.toggleSidebar()`, drag-to-reorder, folders (create/drag/drop/rename/collapse), `window.filterChats()` search, pin, clear-all, profile submenu, settings, storage line.
- Keep the collapsed rail width at `--sidebar-rail-width: 44px` (icon-centering math depends on it). Do not change it.
- Respect existing `prefers-reduced-motion` guards; new width/margin transitions must be covered by them.
- Light and dark mode must both be correct for every visual change (the page toggles `.dark` on `<html>`).
- No new dependencies. No new JS files.

## File Map

- **Modify** `AI/chat.html`:
  - Inline `<style id="dynamic-accent-styles">` token block (`:root` ~lines 45–86, `.dark` ~88–114) — add floating geometry tokens.
  - Inline `<style>` sidebar block (`aside` ~241–253; `#sidebar` box-shadow ~341–346; desktop media query ~285–295; `.sb-search-*` ~648–704; `.history-item-active` / `.history-btn-container` ~1177–1230).
  - `<aside id="sidebar" ...>` opening tag inline `style` (~line 3423–3424).
- **No other files change.**

## Verification setup (used by every task)

There is no automated test suite. For each task's verification, open the page in a browser:

```bash
# from repo root
python -m http.server 8000
# then open http://localhost:8000/AI/chat.html
```

Use DevTools device toolbar to test both a desktop width (≥1024px) and a mobile width (<1024px), and toggle dark mode via the profile → settings theme buttons (or run `document.documentElement.classList.toggle('dark')` in the console). "Expected" lines describe what you should see.

---

### Task 1: Floating shell surface + geometry tokens (desktop expanded)

Give the sidebar panel the `.ov-nav__bar` floating surface and detach it from the edges on desktop. This task makes the expanded desktop panel float; alignment cleanup is Task 2.

**Files:**
- Modify: `AI/chat.html` token block (`:root` ~45–86 and `.dark` ~88–114)
- Modify: `AI/chat.html` `#sidebar` box-shadow rule (~341–346)
- Modify: `AI/chat.html` desktop media query (~285–295)
- Modify: `AI/chat.html` `<aside id="sidebar">` inline `style` (~3423–3424)

**Interfaces:**
- Produces: CSS custom props `--sb-float-gap`, `--sb-radius`, `--sb-float-surface`, `--sb-float-border`, `--sb-float-shadow` (light) and their `.dark` overrides. Later tasks (collapsed rail, mobile drawer) reuse `--sb-float-gap` and `--sb-radius`.

- [ ] **Step 1: Add floating geometry + surface tokens to `:root`**

In the `:root` block inside `<style id="dynamic-accent-styles">`, immediately after the `/* Layout — unchanged */` group (right before the closing `}` near `--sidebar-section-first-margin-top: 8px;`), add:

```css
            /* Floating sidebar shell — matches .ov-nav__bar (design-tokens.css) */
            --sb-float-gap: 0.9rem;
            --sb-radius: 20px;
            --sb-float-surface: linear-gradient(
                180deg,
                color-mix(in srgb, var(--bg-elevated), white 7%),
                color-mix(in srgb, var(--bg-elevated), black 7%)
            );
            --sb-float-border: color-mix(in srgb, var(--bg-elevated), black 14%);
            --sb-float-shadow:
                inset 0 1px 0 rgba(255, 255, 255, 0.5),
                0 1px 2px -1px rgba(0, 0, 0, 0.12),
                0 6px 22px -8px rgba(0, 0, 0, 0.18);
```

- [ ] **Step 2: Add dark-mode surface overrides to `.dark`**

In the `.dark` block (same `<style>`), after the `--sb-depth:` line, add:

```css
            /* Floating shell — mirrors .dark .ov-nav__bar */
            --sb-float-border: rgba(0, 0, 0, 0.5);
            --sb-float-shadow:
                inset 0 1px 0 rgba(255, 255, 255, 0.06),
                0 1px 2px rgba(0, 0, 0, 0.4),
                0 8px 28px -8px rgba(0, 0, 0, 0.55);
```

Note: `--sb-float-surface` uses `--bg-elevated`, which is already dark-swapped in `.dark`, so the gradient adapts automatically (matching how `.ov-nav__bar` derives from `--bg-elevated`). No separate dark gradient needed.

- [ ] **Step 3: Replace the `#sidebar` recessed-plane box-shadow with the floating surface**

Replace the entire existing rule (the one that starts `#sidebar {` with the `box-shadow: inset 0 1px 0 var(--sb-edge-highlight), inset -1px 0 0 var(--sb-edge), var(--sb-depth);`) with:

```css
        #sidebar {
            background: var(--sb-float-surface);
            border: 1px solid var(--sb-float-border);
            border-radius: var(--sb-radius);
            box-shadow: var(--sb-float-shadow);
        }
```

- [ ] **Step 4: Remove the hardcoded surface from the aside inline style**

In the `<aside id="sidebar" ...>` opening tag, change the inline style from:

```html
        style="width: var(--sidebar-width); background: var(--sidebar-surface);">
```

to:

```html
        style="width: var(--sidebar-width);">
```

(The floating `background` now comes from the `#sidebar` rule in Step 3, so light/dark are handled by CSS instead of a fixed inline value.)

- [ ] **Step 5: Inset the panel on desktop via margin**

In the `@media (min-width: 1024px)` block, replace:

```css
        @media (min-width: 1024px) {
            aside {
                position: static;
                width: 240px;
                transform: none !important;
            }

            body.sidebar-collapsed aside {
                width: var(--sidebar-rail-width) !important;
            }
        }
```

with:

```css
        @media (min-width: 1024px) {
            aside {
                position: static;
                width: var(--sidebar-width);
                margin: var(--sb-float-gap) 0 var(--sb-float-gap) var(--sb-float-gap);
                transform: none !important;
            }

            body.sidebar-collapsed aside {
                width: var(--sidebar-rail-width) !important;
            }
        }
```

(`align-items: stretch` on the `flex` body makes the static aside full-height; the top/bottom margin insets it. Left margin detaches it from the viewport edge. `<main>` — `flex-1` — reflows to the right automatically.)

- [ ] **Step 6: Verify (browser, desktop ≥1024px)**

Open the page at a desktop width. Expected:
- The sidebar is a detached, rounded panel floating with a visible gap on its left, top, and bottom edges.
- Its surface (gradient + hairline border + soft lift shadow + top highlight) visually matches the floating nav capsule at the top of the page.
- Toggle dark mode: the panel darkens to match `.dark .ov-nav__bar` (no light-mode gradient bleeding through).
- Known gap (fixed in Task 2): the area in the sidebar's margins may show a different backdrop color, and the gap between the panel's right edge and `<main>` may look off — that is Task 2's job.

- [ ] **Step 7: Commit**

```bash
git add AI/chat.html
git commit -m "feat(chat sidebar): floating shell surface matching .ov-nav"
```

---

### Task 2: Desktop backdrop + main alignment

Make the canvas behind the floating panel read as the chat surface, and confirm `<main>`, the title island, and the top-right actions still align.

**Files:**
- Modify: `AI/chat.html` inline `<style>` (add a `body` background rule near the existing top-level `body { line-height... }` rule, ~142–147)

**Interfaces:**
- Consumes: `--sb-float-gap` (Task 1).
- Produces: nothing new; finalizes the desktop layout.

- [ ] **Step 1: Set the app backdrop to the chat canvas color**

Find the existing rule:

```css
        body {
            line-height: 1.6;

            letter-spacing: 0.01em;

        }
```

Replace it with:

```css
        body {
            line-height: 1.6;
            letter-spacing: 0.01em;
            /* Canvas behind the floating sidebar reads as the chat surface,
               so the panel floats on the same plane as <main>. */
            background-color: var(--bg-elevated);
        }
```

- [ ] **Step 2: Verify main content alignment (browser, desktop ≥1024px)**

Expected:
- The margin area around the floating sidebar is the same color as `<main>` (the chat canvas) in both light and dark — the panel reads as floating on the canvas, no rosewood/odd band showing.
- Start a chat so `#top-left-chat-title` appears. It sits to the **right** of the floating sidebar with a sensible gap, not underneath it, and not overlapping.
- `#top-right-actions` (top-right cluster) is unaffected and correctly positioned.
- The composer/input bar and message column are centered/aligned as before (no horizontal shift bug).

- [ ] **Step 3: Verify no regression to the collapsed slot width reflow**

Collapse the sidebar (click the collapse toggle in the header). Expected: `<main>` widens to fill the space; no dead gap the width of the old 260px panel remains (confirms `<main>` reflows off the live aside width, which it does because the aside is still in flex flow). Full rail styling is Task 3 — for now just confirm main reflows.

- [ ] **Step 4: Commit**

```bash
git add AI/chat.html
git commit -m "feat(chat sidebar): float panel on chat canvas, keep main aligned"
```

---

### Task 3: Collapsed floating rail

Make the collapsed state a floating rounded rail (still detached), not a flush edge rail. Width stays 44px to preserve icon centering.

**Files:**
- Modify: `AI/chat.html` desktop media query (the `body.sidebar-collapsed aside` rule from Task 1 Step 5)

**Interfaces:**
- Consumes: `--sb-float-gap`, `--sb-radius`, `--sidebar-rail-width` (44px).

- [ ] **Step 1: Confirm the collapsed rail keeps the float margins**

The `body.sidebar-collapsed aside` rule only overrides `width`. Because the base `aside` rule (Task 1 Step 5) sets `margin` and `#sidebar` sets `border-radius`/surface, the collapsed rail already inherits the float gap, radius, and surface. No new geometry rule is required — verify this is the case rather than adding redundant CSS.

Confirm the media query reads:

```css
        @media (min-width: 1024px) {
            aside {
                position: static;
                width: var(--sidebar-width);
                margin: var(--sb-float-gap) 0 var(--sb-float-gap) var(--sb-float-gap);
                transform: none !important;
            }

            body.sidebar-collapsed aside {
                width: var(--sidebar-rail-width) !important;
            }
        }
```

- [ ] **Step 2: Tighten the rail corner radius so a 44px rail doesn't look over-rounded**

Add, inside the `@media (min-width: 1024px)` block after `body.sidebar-collapsed aside`:

```css
            body.sidebar-collapsed #sidebar {
                border-radius: 16px;
            }
```

- [ ] **Step 3: Verify (browser, desktop ≥1024px)**

Expected:
- Click collapse: the panel animates down to a narrow (~44px) **floating** rounded rail, still inset from the left/top/bottom edges — it does **not** dock flush to the viewport edge.
- Icons (logo, new-chat pencil/bubble, Research compass, Try-VoidAI zap, profile avatar) remain vertically/horizontally centered in the rail as before.
- `.sb-row-text` labels and the history area fade out as before.
- Expand again: smooth return to the full floating panel.
- Dark mode: rail surface matches.

- [ ] **Step 4: Commit**

```bash
git add AI/chat.html
git commit -m "feat(chat sidebar): floating rail when collapsed"
```

---

### Task 4: Mobile floating inset drawer

On `<1024px` the drawer should slide in as the same floating inset rounded panel, and fully hide off-canvas including its margin.

**Files:**
- Modify: `AI/chat.html` base `aside` rule (~241–253) — add mobile hide transform override

**Interfaces:**
- Consumes: `--sb-float-gap` (Task 1). Behavior via existing `-translate-x-full` toggle in `sidebar.js` (unchanged).

- [ ] **Step 1: Ensure the drawer fully hides past its left margin**

Because the mobile drawer now has a left `margin` won't apply on mobile (margin is desktop-only via the media query), the fixed drawer sits at `left: 0`. To give it the floating inset look on mobile, add a mobile-scoped rule. Directly after the base `aside { ... }` rule (the one with `position: fixed; ... transition: width ..., transform ...;`), add:

```css
        @media (max-width: 1023px) {
            #sidebar {
                margin: var(--sb-float-gap);
                height: calc(100% - 2 * var(--sb-float-gap));
                border-radius: var(--sb-radius);
            }

            /* Slide fully off-canvas, clearing the left margin + shadow. */
            #sidebar.-translate-x-full {
                transform: translateX(calc(-100% - var(--sb-float-gap) - 6px));
            }
        }
```

Note: the base `aside` has `top: 0; bottom: 0; left: 0`. With `margin: var(--sb-float-gap)` and `height: calc(100% - 2*gap)`, the drawer is inset from all edges. `inset-y-0` (Tailwind) sets `top/bottom: 0`; margin adds the inset.

- [ ] **Step 2: Verify (browser, mobile <1024px)**

Expected:
- Open the drawer (hamburger / logo toggle). It slides in as a **floating rounded panel** inset from the top, bottom, and left edges — with the same surface + shadow as desktop.
- The dark overlay (`#sidebar-overlay`) appears behind it and closes the drawer on tap.
- Close the drawer: it slides fully off-screen with **no** sliver of the panel or its shadow left peeking at the left edge.
- Dark mode: correct.
- Re-open/close a few times: transform transition is smooth.

- [ ] **Step 3: Commit**

```bash
git add AI/chat.html
git commit -m "feat(chat sidebar): floating inset drawer on mobile"
```

---

### Task 5: Depth system — accent-chip active rows + calm hover

Establish the 3-layer read: shell → flush row → raised **accent chip** for the primary (New chat) and the active chat, replacing the flat two-stop gradient.

**Files:**
- Modify: `AI/chat.html` `.history-item-active` rule + `.dark` variant (~1177–1209)
- Modify: `AI/chat.html` `.history-btn-container:hover` (~1211–1214)

**Interfaces:**
- Consumes: `--skuo-accent`, `--skuo-glow` (from `src/design-tokens.css`, already in scope on this page).

- [ ] **Step 1: Replace the active-row surface with a refined accent chip**

Replace the existing `.history-item-active { ... }` rule (the one using `background: linear-gradient(180deg, var(--sb-active-top), var(--sb-active-bottom)); ...`) with:

```css
        .history-item-active {
            /* Raised accent chip — refined surface (matches design system
               "selected = accent tint"). Whisper accent fill + faint glow. */
            background:
                linear-gradient(
                    180deg,
                    color-mix(in srgb, var(--skuo-accent), white 7%),
                    color-mix(in srgb, var(--skuo-accent), black 7%));
            color: var(--accent-contrast);
            font-weight: 600;
            box-shadow:
                inset 0 1px 0 rgba(255, 255, 255, 0.35),
                0 1px 2px -1px rgba(0, 0, 0, 0.18),
                0 2px 10px -4px var(--skuo-glow);
            border-radius: 8px !important;
        }
```

- [ ] **Step 2: Keep the active label text legible on the accent fill**

Replace the existing `.history-item-active > button { color: var(--accent-color) !important; }` rule with:

```css
        .history-item-active > button {
            color: var(--accent-contrast) !important;
        }
```

- [ ] **Step 3: Replace the dark-mode active-row gradient**

Replace the existing `.dark .history-item-active { background: linear-gradient(180deg, var(--sb-active-top), var(--sb-active-bottom)); }` rule with:

```css
        .dark .history-item-active {
            background:
                linear-gradient(
                    180deg,
                    color-mix(in srgb, var(--skuo-accent), white 8%),
                    color-mix(in srgb, var(--skuo-accent), black 8%));
        }
```

- [ ] **Step 4: Verify (browser, both modes)**

Expected:
- The active chat row reads as a small raised **accent-tinted chip** (fill + faint glow + hairline top highlight), with legible contrast text — not the old flat gradient.
- Hovering an inactive row still shows the calm `--sb-item-hover` fill (unchanged).
- The active row's rounded corners and the collapsed-only left accent bar still behave (in the expanded panel the `::before` bar stays hidden per the existing `body:not(.sidebar-collapsed) .history-item-active::before { display:none }` rule; collapse to confirm the bar appears on the rail).
- Switch between chats: the active chip moves to the selected row.

- [ ] **Step 5: Commit**

```bash
git add AI/chat.html
git commit -m "feat(chat sidebar): accent-chip active chat rows"
```

---

### Task 6: New-chat button as the primary accent chip

Make the "New chat" primary read as an accent chip consistent with the active row (it currently uses the neutral `.skuo` surface).

**Files:**
- Modify: `AI/chat.html` `<button class="sb-new-chat-btn skuo sb-tile">` (~3465) — add `skuo-accent`

**Interfaces:**
- Consumes: shared `.skuo-accent` from `src/design-tokens.css`.

- [ ] **Step 1: Add the accent modifier to the New chat button**

Change:

```html
                <button onclick="window.resetChat()" class="sb-new-chat-btn skuo sb-tile">
```

to:

```html
                <button onclick="window.resetChat()" class="sb-new-chat-btn skuo skuo-accent sb-tile">
```

- [ ] **Step 2: Ensure the New-chat icon/label use accent-contrast text**

The `.sb-new-chat-btn .sb-nav-icon { color: var(--accent-color); }` rule would clash with the accent fill (accent-on-accent). Add, immediately after the existing `.sb-new-chat-btn .sb-nav-icon` rule (~581–583):

```css
        .sb-new-chat-btn.skuo-accent,
        .sb-new-chat-btn.skuo-accent .sb-nav-icon,
        .sb-new-chat-btn.skuo-accent .sb-new-chat-chevron {
            color: var(--accent-contrast);
        }
```

- [ ] **Step 3: Verify (browser, both modes)**

Expected:
- "New chat" is a raised accent chip (accent fill, white/contrast label + chevron), visually the sibling of the active-row chip — the two "primary/selected" elements share the accent language.
- Collapsed rail: the New-chat icon slot still shows the pencil/bubble icon centered, legible on the accent.
- Hover/active press still lifts/insets (shared `.skuo` behavior).
- `window.resetChat()` still fires on click.

- [ ] **Step 4: Commit**

```bash
git add AI/chat.html
git commit -m "feat(chat sidebar): New chat as primary accent chip"
```

---

### Task 7: Search field in the `.ui-field` language

Refresh the search input to the design-system field look (leading icon + unified input surface + accent focus ring), dropping the bespoke inset-shadow stack.

**Files:**
- Modify: `AI/chat.html` `.sb-search-input` + `:focus` + `.dark` variants (~666–704)

**Interfaces:**
- Consumes: `--bg-white`, `--border-strong`, `--accent-color` (in scope). Keeps the existing `#chat-search-input` element + `oninput="window.filterChats(...)"`.

- [ ] **Step 1: Replace the search input surface**

Replace the existing `.sb-search-input { ... }` rule (the one with the `box-shadow: inset 0 0 0 1px var(--sb-edge), 0 1px 2px ...`) with:

```css
        .sb-search-input {
            width: 100%;
            padding: 10px 10px 10px 32px;
            font-size: 13px;
            background: var(--bg-white);
            border: 1px solid var(--border-strong);
            border-radius: 12px;
            outline: none;
            color: var(--text-primary);
            box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
            transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }
```

- [ ] **Step 2: Replace the focus state with the accent ring**

Replace the existing `.sb-search-input:focus { ... }` rule with:

```css
        .sb-search-input:focus {
            background: var(--bg-white);
            border-color: color-mix(in srgb, var(--accent-color) 55%, transparent);
            box-shadow:
                inset 0 1px 2px rgba(0, 0, 0, 0.04),
                0 0 0 3px color-mix(in srgb, var(--accent-color) 15%, transparent);
        }
```

- [ ] **Step 3: Update the dark-mode search variants**

Replace the existing `.dark .sb-search-input { ... }` and `.dark .sb-search-input:focus { ... }` rules with:

```css
        .dark .sb-search-input {
            background: var(--bg-white);
            border-color: var(--border-strong);
            box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
        }

        .dark .sb-search-input:focus {
            background: var(--bg-white);
            border-color: color-mix(in srgb, var(--accent-color) 55%, transparent);
        }
```

(`--bg-white` and `--border-strong` are dark-swapped in `.dark`, so these read correctly in both themes.)

- [ ] **Step 4: Verify (browser, both modes)**

Expected:
- The search field reads like the design-system inputs on `design.html`: a calm recessed field with a 1px border, leading magnifier icon, and a clean **accent focus ring** on focus (not the old heavy inset).
- The `.sb-search-icon` still sits at the left and turns accent on focus (existing `:focus-within` rule).
- Type a query: `window.filterChats()` still filters the history list live.
- Dark mode: field + focus ring correct.

- [ ] **Step 5: Commit**

```bash
git add AI/chat.html
git commit -m "feat(chat sidebar): search field in design-system ui-field style"
```

---

### Task 8: Section label + count, and dead-token cleanup

Polish the recents section header (muted caps + optional count badge) and remove now-unused sidebar tokens/rules to keep the file honest.

**Files:**
- Modify: `AI/chat.html` `.sb-section-label` (~638–646) if a count is added
- Modify: `AI/chat.html` token block — remove unused `--sidebar-surface`, `--sb-edge`, `--sb-edge-highlight`, `--sb-depth`, `--sb-active`, `--sb-active-top`, `--sb-active-bottom` **only if** grep confirms no remaining references

**Interfaces:**
- Consumes: nothing new.

- [ ] **Step 1: Confirm which retired tokens are now unreferenced**

Run:

```bash
cd "$(git rev-parse --show-toplevel)"
for v in --sidebar-surface --sb-edge --sb-edge-highlight --sb-depth --sb-active-top --sb-active-bottom --sb-active ; do
  echo "== $v =="; grep -n -- "$v" AI/chat.html || echo "  (no refs)"
done
```

Expected: `--sidebar-surface`, `--sb-edge`, `--sb-edge-highlight`, `--sb-depth`, `--sb-active-top`, `--sb-active-bottom` show only their **declaration** lines (no consumers left after Tasks 1 & 5). `--sb-active` / `--sb-active-soft` / `--sb-item-hover` / `--sb-divider` may still be referenced (hover, folders, footer divider) — keep any token that still has a consumer.

- [ ] **Step 2: Delete only the confirmed-dead token declarations**

For each token that Step 1 shows as declaration-only, delete its declaration line from both `:root` and `.dark`. Do **not** delete a token that still has a consumer line. (Example: remove the `--sidebar-surface: #f3f1e8;` line in `:root` and `--sidebar-surface: #191917;` in `.dark`.) Leave `--sidebar-width`, `--sidebar-rail-width`, `--header-height`, and all `--sb-float-*` intact.

- [ ] **Step 3: Verify no visual regression from cleanup (browser)**

Reload. Expected: sidebar looks identical to the end of Task 7 in both themes and both collapsed/expanded states — deleting only dead declarations changes nothing visually. If anything changes, a token you deleted still had a consumer; restore it.

- [ ] **Step 4: Full behavior regression pass (browser)**

Walk the full checklist once, desktop + mobile, light + dark:
- Toggle collapse/expand (desktop) → floating rail ↔ full panel.
- Open/close drawer (mobile) → floating inset drawer, overlay closes it, fully hides.
- New chat → accent chip, starts a new chat.
- Create several chats; the active one shows the accent chip; click others to move it.
- Search filters the list.
- Drag-to-reorder a chat; drop indicator + reorder still work.
- Create a folder, drag a chat into it, collapse/expand the folder.
- Pin a chat; pinned styling intact.
- Profile row: open settings submenu, storage line shows, clear-all works.
- Reduced motion: with OS "reduce motion" on, collapse/drawer transitions are suppressed (existing guards) and nothing errors.

- [ ] **Step 5: Commit**

```bash
git add AI/chat.html
git commit -m "chore(chat sidebar): section label polish + remove dead sidebar tokens"
```

---

## Self-Review

**Spec coverage:**
- Floating shell matching `.ov-nav` (spec §1) → Tasks 1–2.
- 3-layer depth / accent chips (spec §2) → Tasks 5–6.
- Search & history (`.ui-field`, calmer rows, section label) (spec §3) → Tasks 5, 7, 8.
- Collapsed floating rail (spec §4) → Task 3.
- Mobile floating inset drawer (spec §5) → Task 4.
- Behavior preserved / risks (layout alignment, rail width, scroll clip, reduced motion) → Task 2 (alignment), rail kept 44px (Global Constraints + Task 3), Task 1 Step 3 (radius clip on overflow), Task 8 Step 4 (reduced motion).
- Folders/history visuals inherit the new row language (spec §3) → verified in Task 8 Step 4; no structural folder change (spec non-goal).

**Deviation from spec (intentional, lower risk):** spec §4 floated a ~56px rail "TBD"; this plan keeps the rail at **44px** to preserve the existing icon-centering math (documented in Global Constraints and Task 3). Folders get no bespoke restyle beyond inherited row/hover tokens, consistent with the spec's non-goals.

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every CSS/HTML change shows exact final code; the one conditional step (Task 8 cleanup) is gated on an explicit grep whose expected output is stated.

**Type/name consistency:** Token names (`--sb-float-gap`, `--sb-radius`, `--sb-float-surface`, `--sb-float-border`, `--sb-float-shadow`) are introduced in Task 1 and reused verbatim in Tasks 3–4. Selectors (`#sidebar`, `aside`, `.history-item-active`, `.sb-new-chat-btn`, `.sb-search-input`) match the current file. Reused shared classes (`.skuo-accent`) and vars (`--skuo-accent`, `--skuo-glow`, `--bg-white`, `--border-strong`, `--accent-contrast`) exist in `src/design-tokens.css`.
