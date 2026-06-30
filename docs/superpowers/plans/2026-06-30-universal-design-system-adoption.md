# Universal Design System Adoption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `src/design-tokens.css` the single source of truth for every button, input, card, and badge/tab on every page by swapping page-local control classes to the shared `.skuo*` / `.ui-*` / `.card` classes and deleting the duplicated/recipe-override CSS.

**Architecture:** Each page links `src/design-tokens.css` already. For every page-local control class we (1) apply the shared class(es) in markup, (2) delete that class's appearance CSS *and* its appended `--chrome-*` "glossy override" block from the page's inline `<style>`, keeping only layout (size/flex/grid/padding/position), and (3) drop the page-local class name where the shared class fully covers it. Inputs need no markup change — they are styled globally at element-attribute specificity, so we just delete page-local input appearance overrides. Each page is verified in light + dark before moving on.

**Tech Stack:** Static HTML, vanilla CSS custom properties, Tailwind (CDN on most pages, `output.css` on `design.html`/`Themes`). No build step needed for these edits (CSS lives in `src/design-tokens.css`, already authored, and in page `<style>` blocks).

## Global Constraints

- Never add `!important` to input/textarea/select rules (would break the element-level cascade). — copied from spec & CLAUDE.md.
- Do not change the visual design; the shared classes already define the intended look. This is consolidation only.
- Keep page-local class names ONLY when they still carry layout that has nowhere else to live; otherwise remove them.
- Preserve special per-state surface tints by setting `--skuo-surface` (which still flows through the shared recipe) rather than hand-writing gradients/shadows.
- Shared classes available (from `src/design-tokens.css`): `.skuo`, `.skuo-accent`, `.skuo-neutral`, `.skuo-soft`, `.skuo-icon`, `.skuo-pill`; `.skuomorphic-btn` & `.skuomorphic-button` are aliases of `.skuo` (already glossy via the shared file). `.card` / `.card-pad`. `.ui-badge` (+ `--accent`/`--tiny`), `.ui-crumb`, `.ui-accordion`, `.ui-seg`, `.ui-cell`, `.ui-bullet`, `.ui-opt`, `.ui-field`, `.ui-info`.
- Verification = open the page in a browser in light AND dark mode (toggle persists via `vail_theme` / `.dark` on `<html>`); confirm controls show the shared gradient/shadow/hover/press, correct accent-vs-neutral hierarchy, intact layout, and inputs show the recessed parchment look + accent focus ring. A control reverting to native/unstyled = a missing shared class; fix before commit.

---

### Task 1: Fix the stylesheet-link gap (`AI/debug_test.html`)

**Files:**
- Modify: `AI/debug_test.html`

**Interfaces:**
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Inspect the file**

Read `AI/debug_test.html`. The audit reported it as empty/0-byte and not linking `design-tokens.css`.

- [ ] **Step 2: Act on contents**

- If the file is empty or a throwaway scratch file with no real content, **delete it** (`git rm AI/debug_test.html`) — it is not a real page and needs no design system.
- If it has real markup, add inside `<head>`: `<link rel="stylesheet" href="../src/design-tokens.css">` (match the relative path other `AI/*.html` pages use).

- [ ] **Step 3: Verify**

If kept: open in browser, confirm it loads the stylesheet (no 404 in console). If deleted: confirm no other file references it (`grep -rn "debug_test" .`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ui): close design-tokens link gap on debug_test page"
```

---

### Task 2: Card-only info pages (`goals`, `privacy`, `tos`)

These three pages have no buttons/inputs — only a page-local `.skuomorphic-card` class. Swap to the shared `.card`.

**Files:**
- Modify: `AI/goals.html`, `AI/privacy.html`, `AI/tos.html`

**Interfaces:**
- Consumes: `.card` / `.card-pad` from `src/design-tokens.css`.

- [ ] **Step 1: `AI/goals.html` — swap card markup**

In the body, change every `class="skuomorphic-card ..."` to use `card` instead of `skuomorphic-card`. If the element relied on the old class for internal padding and has no padding utility, add `card-pad`. Keep any Tailwind layout utilities already present.

- [ ] **Step 2: `AI/goals.html` — delete the page-local card CSS**

In the inline `<style>`, delete the `.skuomorphic-card` rule and its `.dark .skuomorphic-card` variant (audit: around lines 169 & 177). Delete nothing else.

- [ ] **Step 3: Repeat for `AI/privacy.html`**

Markup: `skuomorphic-card` → `card` (+ `card-pad` if it provided padding). CSS: delete `.skuomorphic-card` + `.dark .skuomorphic-card` (audit: ~lines 161 & 169).

- [ ] **Step 4: Repeat for `AI/tos.html`**

Identical to privacy (audit: `.skuomorphic-card` ~lines 161 & 169).

- [ ] **Step 5: Verify all three in browser (light + dark)**

Open each page. Confirm the content cards show the shared raised card surface in both themes and nothing lost padding/borders.

- [ ] **Step 6: Commit**

```bash
git add AI/goals.html AI/privacy.html AI/tos.html
git commit -m "feat(ui): adopt shared .card on goals/privacy/tos pages"
```

---

### Task 3: `AI/manage.html` — card + icon button

**Files:**
- Modify: `AI/manage.html`

- [ ] **Step 1: Swap the `.manage-card` container**

Markup: change `class="manage-card"` → `class="card card-pad"` (the page-local class set `padding:24px` + raised surface + hover lift). To preserve the hover lift, keep a thin layout-only rule (see Step 3).

- [ ] **Step 2: Upgrade the red icon button (audit line ~230)**

Current: `class="w-10 h-10 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"`. This is a destructive (delete) action with intentional red coloring — it is NOT part of the accent system. Leave its red Tailwind styling, but add `skuo skuo-icon` is **not** appropriate here (would fight the red fill). **Decision:** leave this button as-is; document it as an intentional semantic-color exception. No change.

- [ ] **Step 3: Trim `.manage-card` CSS to layout-only**

In `<style>` (audit lines ~87–107): delete the `background`, `border`, `border-radius`, `padding`, and `box-shadow` declarations (now provided by `.card`/`.card-pad`) and the `.dark` color overrides. KEEP the hover rule but reduce it to `transform: translateY(-2px);` (layout/motion only). Remove the now-empty base `.manage-card` rule if nothing remains; keep `.manage-card:hover { transform: translateY(-2px); }`.

- [ ] **Step 4: Confirm the line-124 button is unchanged**

Audit line ~124 already uses `skuo skuo-neutral skuo-pill`. Leave it.

- [ ] **Step 5: Verify (light + dark)**

Cards render as shared cards with hover lift; delete button still red; pill button unchanged.

- [ ] **Step 6: Commit**

```bash
git add AI/manage.html
git commit -m "feat(ui): adopt shared .card on manage page; keep semantic delete button"
```

---

### Task 4: `AI/research.html` — buttons + card + input

**Files:**
- Modify: `AI/research.html`

- [ ] **Step 1: Icon button (audit line ~360)**

Current: `class="skuomorphic-button !w-12 !h-12 !rounded-full group transition-all"`. `.skuomorphic-button` is already a shared glossy alias, so it is correct — but to get the compact icon treatment add `skuo-icon` and the pill shape: `class="skuomorphic-button skuo-icon skuo-pill !w-12 !h-12 group transition-all"` (drop `!rounded-full`; `skuo-pill` handles it). Keep the size utilities.

- [ ] **Step 2: Tag/tab button (audit line ~430)**

Current: `class="skuomorphic-button !px-6 !py-2.5 text-[10px] uppercase tracking-widest font-bold transition-all ${isActive ? 'active-tag' : ''}"`. Keep `skuomorphic-button` (glossy alias). For the active state, ensure `.active-tag` sets `--skuo-surface: var(--skuo-accent)` and `color:#fff` instead of hand-written colors (so it flows through the recipe). Find `.active-tag` in `<style>` and rewrite it to those two declarations (+ keep any non-appearance rule).

- [ ] **Step 3: Card swap**

Markup: `skuomorphic-card` → `card` (+ `card-pad` where it provided padding). CSS: delete `.skuomorphic-card` + its `.dark` variant (audit ~lines 254 & 262).

- [ ] **Step 4: Remove page-local input appearance**

In `<style>` delete the `input { background-color: var(--bg-elevated); ... }` rule (audit ~lines 268 & 276) so bare inputs inherit the shared element-level styling. Keep any input *layout* rule (width, etc.) if present.

- [ ] **Step 5: Remove any appended glossy-override block**

If research.html has an appended `--chrome-*` override block for `.skuomorphic-button`, delete it (the shared file already styles `.skuomorphic-button`). (May be none — confirm.)

- [ ] **Step 6: Verify (light + dark)**

Icon button round + glossy; active tag shows accent fill; cards shared; search/inputs show recessed parchment + accent focus ring.

- [ ] **Step 7: Commit**

```bash
git add AI/research.html
git commit -m "feat(ui): unify research page buttons/cards/inputs on shared system"
```

---

### Task 5: `AI/version.html` — primary/secondary buttons + inputs

**Files:**
- Modify: `AI/version.html`

- [ ] **Step 1: Primary CTA (audit line ~215)**

Markup: `class="btn-primary flex-1"` → `class="skuo skuo-accent flex-1"` (keep `flex-1` layout).

- [ ] **Step 2: Secondary button (audit line ~216)**

Current: `class="px-6 py-3 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"` → `class="skuo skuo-neutral px-6 py-3 text-xs font-bold transition-all"` (drop the manual border/rounded/hover-bg utilities — `.skuo` provides them; keep padding/typography).

- [ ] **Step 3: Delete `.btn-primary` CSS**

In `<style>` delete the `.btn-primary` base + `:hover` + `:active` + `.dark` rules (audit ~lines 155–172) — fully replaced by `.skuo.skuo-accent`.

- [ ] **Step 4: Delete page-local input/textarea appearance**

Delete the `input, textarea { background: rgba(0,0,0,0.03); ... }` rule and its `.dark` variant (audit ~lines 125–150). Bare inputs inherit shared styling. No `!important`.

- [ ] **Step 5: Verify (light + dark)**

Primary = accent glossy, secondary = neutral glossy, inputs = shared recessed look with accent focus ring.

- [ ] **Step 6: Commit**

```bash
git add AI/version.html
git commit -m "feat(ui): swap version page buttons/inputs to shared .skuo system"
```

---

### Task 6: `AI/editor.html` — toolbar + control buttons

**Files:**
- Modify: `AI/editor.html`

`.toolbar-btn` (32px icon) and `.control-btn` (small labeled) both already consume `--chrome-*`. Convert markup to `.skuo skuo-icon` / `.skuo`, keep sizing as layout-only, delete the recipe duplication.

- [ ] **Step 1: Toolbar buttons markup (audit lines 361,363,366,368,370,373)**

Change each `class="toolbar-btn ..."` → `class="toolbar-btn skuo skuo-icon ..."` (keep `toolbar-btn` as the layout-only carrier of the 32×32 size).

- [ ] **Step 2: Control buttons markup (audit lines 469–473)**

Change each `class="control-btn ..."` → `class="control-btn skuo ..."`.

- [ ] **Step 3: Trim `.toolbar-btn` CSS to layout-only**

In `<style>` (audit base ~128–138, hover ~140–150, active ~152–158, accent ~244–253): delete `background`/`background-image`, `border`, `box-shadow`, gradient, and hover/active color declarations. KEEP `width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius` (or drop border-radius and let `skuo-icon` set it). For the **active/pressed-state** rule that set `--skuo-surface: var(--skuo-accent)` (toggle-on look), keep ONLY `{ --skuo-surface: var(--skuo-accent); color:#fff; }`. Delete the appended `--chrome-*` glossy-override block for `.toolbar-btn`.

- [ ] **Step 4: Trim `.control-btn` CSS to layout-only**

(audit base ~229–236, hover ~238–241, accent ~254–263): delete appearance; keep `padding:4px 8px; font-size:10px;`. Keep the accent variant reduced to `{ --skuo-surface: var(--skuo-accent); color:#fff; }` if a control button needs the accent surface. Delete its glossy-override block.

- [ ] **Step 5: Verify (light + dark)**

Toolbar icons glossy + correct size; active formatting toggle shows accent surface; control buttons glossy; nothing misaligned in the toolbar row.

- [ ] **Step 6: Commit**

```bash
git add AI/editor.html
git commit -m "feat(ui): convert editor toolbar/control buttons to shared .skuo"
```

---

### Task 7: `index.html` (root landing) — CTA, ink, line, icon buttons

**Files:**
- Modify: `index.html`

Nav text links (`.g-link`, `.mobile-link`) are NOT skuo surfaces — leave them. Convert `.g-cta`, `.btn-ink`, `.btn-line`, `.g-icon`.

- [ ] **Step 1: `.g-cta` (audit line 473)**

`class="g-cta"` → `class="skuo skuo-accent skuo-pill"`.

- [ ] **Step 2: `.btn-ink` (audit line 517)**

`class="btn-ink px-7 py-3.5 rounded-full text-sm font-medium"` → `class="skuo skuo-accent skuo-pill px-7 py-3.5 text-sm font-medium"` (drop `rounded-full`; `skuo-pill` covers it). (If a neutral look is intended for ink, use `skuo` alone — but audit shows it was the dark high-contrast primary, so accent pill matches the soft system's "primary".)

- [ ] **Step 3: `.btn-line` (audit ~line 277 def)**

Wherever `btn-line` is used in markup, → `class="skuo skuo-neutral skuo-pill ..."` (outline/secondary → neutral glossy). Keep layout utilities.

- [ ] **Step 4: `.g-icon` (audit lines 484, 488)**

`class="g-icon"` → `class="skuo skuo-icon"`; for the mobile one keep its `md:hidden`: `class="skuo skuo-icon md:hidden"`.

- [ ] **Step 5: Delete page-local button CSS + glossy overrides**

In `<style>`: delete `.g-cta` (174–188), `.g-icon` (190–205), `.btn-ink` (268–272), `.btn-line` (277–281) appearance rules, AND the appended glossy-override block (lines ~415–461 incl. dark variants 458–461). Keep `.g-link` (156–166) and `.mobile-link` (238–248) untouched. Keep `.glass` nav backdrop (126–149) untouched.

- [ ] **Step 6: Verify (light + dark)**

Hero CTA + ink button = accent glossy pills; line button = neutral glossy pill; theme/menu icons = glossy icon buttons; nav text links unchanged; mobile menu intact.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(ui): convert landing page buttons to shared .skuo system"
```

---

### Task 8: `word/index.html` — header, toolbar, chips, AI buttons

**Files:**
- Modify: `word/index.html`

- [ ] **Step 1: Header buttons `.hdr-btn` (audit lines 1049–1058)**

Each `class="hdr-btn ..."` → `class="hdr-btn skuo skuo-icon ..."` (keep `hdr-btn` for its 32px sizing). The active/accent state stays via `--skuo-surface` (Step 6).

- [ ] **Step 2: Toolbar buttons `.tb-btn` (audit lines 1076–1109, 22×)**

Each `class="tb-btn ..."` → `class="tb-btn skuo skuo-icon ..."` (keep `tb-btn` for 30px sizing).

- [ ] **Step 3: Export items `.export-item` (audit lines 1115–1120)**

`class="export-item ..."` → `class="export-item skuo skuo-soft ..."` (list-style soft button). Keep `export-item` for layout.

- [ ] **Step 4: AI clear button `.ai-clear-btn` (audit line 1145)**

→ add `skuo skuo-accent`: `class="ai-clear-btn skuo skuo-accent ..."`; then trim `.ai-clear-btn` CSS to layout-only.

- [ ] **Step 5: Quick-action chips `.qa-chip` (audit lines 1166–1174, 9×)**

→ `class="qa-chip skuo skuo-neutral skuo-pill ..."`; trim `.qa-chip` CSS to layout-only.

- [ ] **Step 6: Trim header/toolbar CSS + delete glossy overrides**

In `<style>`: for `.hdr-btn` (178–201) and `.tb-btn` (243–268) delete appearance (transparent bg, hover bg, active accent bg), KEEP sizing/flex/radius-or-let-icon-handle. Rewrite their active state to `{ --skuo-surface: var(--skuo-accent); color:#fff; }`. Delete the appended `--chrome-*` override blocks (276–305).

- [ ] **Step 7: `.ai-mobile-close` (audit line 1148)**

→ `class="ai-mobile-close skuo skuo-icon ..."`; trim its CSS (916–929) to layout-only.

- [ ] **Step 8: `.tb-select` → bare select look**

The `.tb-select` (314–332) is a styled `<select>`. Bare `select` is already styled globally. Decision: keep `.tb-select` ONLY if it sets compact sizing that differs from the shared select; delete its background/border/hover-color appearance so it inherits the shared look. If it becomes redundant, remove the class from markup.

- [ ] **Step 9: `#doc-title` input**

`#doc-title` (135–152) is a borderless title input by design (transparent, no outline). This is an intentional exception (document title, not a form field). KEEP as-is; do not force the shared input look. Document the exception.

- [ ] **Step 10: Cards — `.editor-paper`, bubbles**

`.editor-paper` (353–372) is the document "paper" surface — an intentional bespoke surface, NOT a generic card. Leave it. `.msg-user-bubble`/`.msg-ai-bubble` are chat bubbles, also bespoke — leave. (Only swap to `.card` where a container is a generic panel; none qualify here.)

- [ ] **Step 11: Verify (light + dark)**

Header + toolbar icons glossy and correctly sized; active formatting button = accent; export items = soft; chips = neutral pills; AI clear = accent; selects inherit shared look; doc title still borderless; paper + bubbles unchanged.

- [ ] **Step 12: Commit**

```bash
git add word/index.html
git commit -m "feat(ui): unify word editor controls on shared .skuo/.ui system"
```

---

### Task 9: `AI/index.html` — buttons + card

**Files:**
- Modify: `AI/index.html`

- [ ] **Step 1: Discord button (audit line 355)**

`class="skuomorphic-button discord !px-4 !py-1.5 text-xs md:text-sm"`. `.skuomorphic-button` is already glossy via the shared file. Keep the markup; ensure `.discord` only sets `--skuo-surface: #5865F2; color:#fff;` (flows through recipe) instead of hand-written bg/hover. Rewrite `.discord` (142–153) accordingly.

- [ ] **Step 2: Hero CTA (audit line 369)**

`class="skuomorphic-button !px-7 !py-3 mb-4 group flex items-center gap-2"` — already correct (glossy accent-ish via shared file). To make it the primary accent, add `skuo-accent`: `class="skuomorphic-button skuo-accent !px-7 !py-3 mb-4 group flex items-center gap-2"`.

- [ ] **Step 3: Delete the appended glossy-override block (audit 156–173)**

Remove it — the shared file already styles `.skuomorphic-button`. Delete the base `.skuomorphic-button` appearance rule (112–126) too, keeping only any layout it provided (it mostly set appearance; the shared file covers it). Keep `.skuomorphic-button` referenced in markup (alias class).

- [ ] **Step 4: Card swap (audit 177–189)**

If `.skuomorphic-card` is used in markup, swap to `card` (+`card-pad`) and delete the `.skuomorphic-card` CSS.

- [ ] **Step 5: Verify (light + dark)**

Discord button = blue glossy; hero CTA = accent glossy; cards shared. Confirm Tailwind CDN page still renders (no regressions from removed CSS).

- [ ] **Step 6: Commit**

```bash
git add AI/index.html
git commit -m "feat(ui): route AI landing buttons/cards through shared recipe"
```

---

### Task 10: `AI/chat.html` (Part A) — sidebar buttons

**Files:**
- Modify: `AI/chat.html`

chat.html is largest; split across Tasks 10–13. Part A = sidebar.

- [ ] **Step 1: New-chat button `.sb-new-chat-btn` (markup line ~3650)**

`class="sb-new-chat-btn sb-tile"` → `class="sb-new-chat-btn sb-tile skuo skuo-soft"` (soft satin tile). Keep `sb-new-chat-btn`/`sb-tile` for layout.

- [ ] **Step 2: Icon buttons `.sb-icon-btn` (markup lines ~3643, 3720, 3726)**

Add `skuo skuo-icon` to each, keeping existing utilities (e.g. `!text-zinc-400 hover:!text-red-500`). The red/hover text utilities are semantic and stay.

- [ ] **Step 3: Trim `.sb-new-chat-btn` + `.sb-icon-btn` CSS to layout-only**

In `<style>`: `.sb-new-chat-btn` (590–685) — delete bg/border/box-shadow/hover-shadow appearance, keep flex/padding/width/radius layout. `.sb-icon-btn` (356–400) — delete bg/hover-bg/active appearance, keep 28×28 sizing + flex. Delete the appended glossy-override blocks (3300–3308 for new-chat; the 378–400 hover block for icon buttons if it duplicates the recipe).

- [ ] **Step 4: Verify (light + dark)**

Sidebar new-chat = soft tile; icon buttons glossy + semantic hover colors intact; sidebar layout unchanged.

- [ ] **Step 5: Commit**

```bash
git add AI/chat.html
git commit -m "feat(ui): adopt shared .skuo on chat sidebar buttons"
```

---

### Task 11: `AI/chat.html` (Part B) — settings tabs + cards

**Files:**
- Modify: `AI/chat.html`

- [ ] **Step 1: Settings tabs `.Cadance-tab-btn` (markup lines ~4123–4133)**

The tab bar `.Cadance-tab-bar` + `.Cadance-tab-btn` is conceptually a **segmented control**. Two options: (a) swap to `.ui-seg`/`.ui-seg button`, or (b) keep `.Cadance-tab-btn` but route its active state through `--skuo-surface`. **Choose (b)** to minimize risk: keep the classes, rewrite the active `.Cadance-tab-btn` rule (2394–2431) so the active look = `{ --skuo-surface: var(--skuo-accent); color:#fff; }` via the recipe (or keep the existing subtle active look but delete the appended override block 3311–3326). Keep layout (flex-1, min-height) intact.

- [ ] **Step 2: Settings cards `.Cadance-card` (markup lines 4148+, many)**

`.Cadance-card` (2453–2477) is a translucent blurred panel — a bespoke glass surface. Decision: leave its glass look (it's intentional, distinct from `.card`). Do NOT force `.card`. No change.

- [ ] **Step 3: `.skuomorphic-card` / `changelog-card` (markup lines 4533, 4598, 5091)**

`class="changelog-card skuomorphic-card"` → `class="changelog-card card card-pad"`; delete the `.skuomorphic-card` CSS (2856–2868).

- [ ] **Step 4: `.skuomorphic-toast` (2870–2877)**

Toast is a semantic success (green) surface — leave as-is (intentional color). No change.

- [ ] **Step 5: Verify (light + dark)**

Settings tabs work, active tab highlighted via accent; changelog cards = shared card; glass settings cards + toast unchanged.

- [ ] **Step 6: Commit**

```bash
git add AI/chat.html
git commit -m "feat(ui): unify chat settings tabs + changelog cards"
```

---

### Task 12: `AI/chat.html` (Part C) — send button + input bar

**Files:**
- Modify: `AI/chat.html`

- [ ] **Step 1: Send button (markup line ~3994)**

`class="skuomorphic-btn skuo-accent w-11 h-11 flex items-center justify-center rounded-[8px] opacity-50 cursor-not-allowed transition-all active:scale-95"`. `.skuomorphic-btn` is already a glossy alias + `skuo-accent` present — correct. Ensure `#send-btn` / `.skuomorphic-btn` CSS (2823–2854) no longer hand-writes border/shadow that fights the shared recipe: delete the border/transition appearance there, keep only `border-radius`/disabled-state layout. Keep the disabled visual (shared `.skuo:disabled` already dims).

- [ ] **Step 2: Input bar `.input-box-wrap` (1306–1377)**

This is a bespoke, feature-rich container (conic-gradient glow border, generating animation). It is NOT a plain input — leave its appearance. The actual `<textarea id="user-input">` inside should still inherit shared textarea styling unless `.input-box-wrap` intentionally overrides; since the wrap is the styled surface and the textarea is transparent inside it, leave as-is. No change beyond confirming the textarea isn't broken.

- [ ] **Step 3: Sidebar search `.sb-search-input` (715–739)**

Bespoke search with accent focus glow — already on-brand. Leave as-is (intentional). No change.

- [ ] **Step 4: Verify (light + dark)**

Send button glossy accent, disabled state dims correctly, enables on input; input bar glow + generating animation intact; typing works.

- [ ] **Step 5: Commit**

```bash
git add AI/chat.html
git commit -m "feat(ui): route chat send button through shared recipe"
```

---

### Task 13: `AI/chat.html` (Part D) — JS-generated memory-consent buttons

**Files:**
- Modify: `AI/chat.html` (CSS) and the relevant `AI/js/*.js` file that emits the consent markup.

- [ ] **Step 1: Locate the consent button markup generator**

The memory-consent buttons (`.mem-consent-save`, `.mem-consent-dismiss`) are emitted as a JS template string (chat.html ~4789–4850, possibly mirrored in `AI/js/`). Grep: `grep -rn "mem-consent-save\|mem-consent-dismiss" AI/`.

- [ ] **Step 2: Update the generated class strings**

In the JS/template: `mem-consent-save` → add `skuo skuo-accent`; `mem-consent-dismiss` → add `skuo skuo-neutral`. Keep the `mem-consent-*` names for layout/JS hooks.

- [ ] **Step 3: Trim consent CSS + delete glossy override**

`.mem-consent-save` (2106–2120) and `.mem-consent-dismiss` (2122–2143): delete bg/border/hover appearance, keep padding/radius layout. Delete the appended override block (3329–3346). `.mem-consent-card` (2032–2079) is a bespoke notice card — leave (or swap to `.card` if it reads generic; default leave).

- [ ] **Step 4: Verify (light + dark)**

Trigger the memory-consent notice (or temporarily force-render it) and confirm Save = accent glossy, Dismiss = neutral glossy, card intact.

- [ ] **Step 5: Commit**

```bash
git add AI/chat.html AI/js
git commit -m "feat(ui): adopt shared .skuo on chat memory-consent buttons"
```

---

### Task 14: Final consistency sweep + docs

**Files:**
- Modify: `CLAUDE.md`; spot-check all pages.

- [ ] **Step 1: Grep for leftover hand-written button appearance**

`grep -rn "background-image: linear-gradient\|box-shadow: inset 0 1px 0" *.html AI/*.html word/*.html` and confirm remaining matches are intentional bespoke surfaces (input-box-wrap, editor-paper, glass, toast), not button recipes that should have been removed.

- [ ] **Step 2: Single-file-control smoke test**

Temporarily change `--accent` in `src/design-tokens.css` (e.g. to a vivid blue), reload index.html, AI/chat.html, word/index.html, editor.html, version.html in the browser, and confirm every button/input/card/tab shifts to the new accent. Revert the change.

- [ ] **Step 3: Verify `design.html` still matches**

Open `design.html`; confirm the showcase still reflects the shared classes (it should be unchanged but is the reference of record).

- [ ] **Step 4: Update `CLAUDE.md`**

In the design-system section, note: page-local button classes (`.g-cta`, `.btn-ink`, `.btn-line`, `.g-icon`, `.toolbar-btn`, `.control-btn`, `.hdr-btn`, `.tb-btn`, `.btn-primary`, `.sb-new-chat-btn`, `.Cadance-tab-btn`, `.mem-consent-*`, etc.) are now layout-only carriers with appearance delegated to `.skuo`/`.ui-*`/`.card`; the per-page `--chrome-*` glossy-override blocks were removed; intentional bespoke surfaces that were deliberately NOT unified (`#doc-title`, `.editor-paper`, chat `.input-box-wrap`, `.sb-search-input`, `.Cadance-card`, `.skuomorphic-toast`, manage delete button, AI `.discord`) are documented as exceptions.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(ui): record universal design-system adoption + intentional exceptions"
```

---

## Self-Review

**Spec coverage:**
- "Every page links design-tokens.css" → Task 1. ✓
- Buttons unified → Tasks 4,5,6,7,8,9,10,11,12,13. ✓
- Inputs unified (remove page overrides) → Tasks 4,5,8 (others have none). ✓
- Cards unified → Tasks 2,3,4,9,11. ✓
- Badges/tabs/misc ui-* → Task 11 (settings tabs); other pages had no badge/crumb/seg components (audit found none). ✓
- Remove glossy-override blocks → Tasks 6,7,8,9,10,11,13. ✓
- Remove page-local class names where possible / keep layout-only → applied per task; size-bearing classes (toolbar/hdr/tb/sb) kept as layout carriers, pure-appearance classes (`.btn-primary`, `.g-cta`, `.skuomorphic-card`) removed. ✓
- Verify each page light + dark → every task's verify step. ✓
- Acceptance: single-file accent change restyles everything → Task 14 Step 2. ✓
- Update CLAUDE.md → Task 14. ✓

**Placeholder scan:** No TBD/TODO; every step names exact files, classes, and audit line ranges. Line numbers are labeled "audit ~" because edits shift them — implementer locates by class name/selector.

**Type/name consistency:** Shared class names used consistently match `src/design-tokens.css` (`.skuo`, `.skuo-accent`, `.skuo-neutral`, `.skuo-soft`, `.skuo-icon`, `.skuo-pill`, `.card`, `.card-pad`, `.ui-seg`). `.skuomorphic-btn`/`.skuomorphic-button` correctly treated as pre-existing glossy aliases.

**Intentional exceptions** (documented, deliberately not forced into the generic system): manage delete button (semantic red), AI `.discord` (brand blue via `--skuo-surface`), `#doc-title` (borderless title), `.editor-paper` & chat bubbles (bespoke surfaces), chat `.input-box-wrap` & `.sb-search-input` (feature-rich inputs), `.Cadance-card` (glass), `.skuomorphic-toast` (semantic green).
