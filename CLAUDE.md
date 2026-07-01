# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build

This project uses Tailwind CSS v4 via CLI. To rebuild the stylesheet:

```bash
npx @tailwindcss/cli -i src/input.css -o src/output.css --watch
```

Tailwind scans `./*.html`, `./AI/*.html`, and `./src/**/*.{html,js,jsx,ts,tsx}` (see `tailwind.config.js`). No bundler, no test suite. Open HTML files directly in a browser.

## Architecture

This is a vanilla JS, no-framework AI chat frontend called **Oaky** (`AI/chat.html`). All JS is loaded as plain `<script>` tags at the bottom of `chat.html` in dependency order. There is no module system — every file attaches functions to `window.*`.

### CDN dependencies (loaded by `chat.html` at runtime)

`marked`, `KaTeX`, `feather-icons`, `anime.js`, Tailwind CDN, Google GSI client, and Font Awesome are all loaded from CDN — there is no local npm bundle for these. Do not try to install them via npm.

### JS load order (`AI/js/`)

The load order matters. Later files depend on earlier ones:

1. `state.js` — global mutable state (`window.chatHistory`, `window.settings`, `window.isGenerating`, `window.els`, etc.)
2. `utils.js` — shared helpers
3. `storage.js` — `window.StorageController` (IndexedDB-backed chat persistence)
4. `modals.js`, `i18n.js`, `theme.js` — UI scaffolding
5. `thought.js`, `content-features.js` — markdown/KaTeX rendering helpers
6. `api.js` — `window.getOpenAIClient()`, `window.getGradioClient()`, backend URL resolution (model definitions live in `state.js`)
7. `google-auth.js`, `profile.js`, `sidebar.js`, `folders.js`, `settings.js` — feature modules
8. `streaming.js` — SSE streaming logic
9. `chat-management.js`, `chat-actions.js` — `window.sendMessage()`, `window.handleAction()`
10. `feedback.js`, `history.js`, `menus.js`, `send-icon.js`, `research.js`, `changelog.js`
11. `render.js` — `window.render()` rebuilds the entire chat DOM from `window.chatHistory`
12. `ui.js` — `window.updateUI()` syncs button states to global flags
13. `mini-logo.js`, `loader.js` — cosmetic/preloader
14. `main.js` — `boot()` async IIFE that initializes storage, detects tunnel URL, then calls `window.initChatUI()`
15. `voice.js` — `window.VoiceMode`: full hands-free voice conversation. Records mic
  (MediaRecorder) → `POST /v1/audio/transcriptions` (Whisper) → `window.sendMessage()` →
  `POST /v1/audio/speech` (Kokoro-82M) → playback, looped. Loaded after `chat-actions.js`.
  Backend audio endpoints live in the separate `okemollm/` repo (`train.py`).

Note: `AI/updatenotes.js` (not inside `AI/js/`) is loaded separately. It defines `window.checkChangelog()` / `window.showChangelog()` and reads build numbers from `localStorage` and remote overrides.

### Key globals

| Global | Purpose |
|---|---|
| `window.chatHistory` | Array of `[userMsg, responseText, feedback]` tuples |
| `window.settings` | User preferences persisted to `localStorage` as `vail_settings_v4` (JSON) |
| `window.els` | Cached DOM element references (populated in `main.js:initChatUI`) |
| `window.isGenerating` | Boolean flag guarding send/stop logic |
| `window.currentModel` | Active model object `{ id, name, icon }` — one of `window.MODELS.STUART` or `window.MODELS.OCTAN` |
| `window.StorageController` | IndexedDB abstraction for chat persistence |
| `window.streamQueue` | Buffered token string consumed by the typewriter interval |
| `window.typedResponseText` | Accumulated text rendered so far during streaming |
| `window.allChats` | All persisted chats loaded from IndexedDB at boot |
| `window.currentChatId` | UUID of the active chat session |
| `window.isWebSearch` | Boolean — web search mode active |
| `window.isThinkingEnabled` | Boolean — thought block generation enabled |
| `window.currentGenerationIsSearch` | Boolean — changes thought header label to "Surfing the web..." |

### Models

Defined in `state.js` as `window.MODELS`:
- `OCTAN` — id `"Octan-1.2B"`, default model
- `STUART` — id `"Stuart-1.2B"`

Switch with `window.selectModel('OCTAN')` or `window.selectModel('STUART')`.

### localStorage keys

| Key | Purpose |
|---|---|
| `vail_settings_v4` | Main settings JSON (temp, top_p, rep_pen, max_tokens, apiKey, accent, userName, sidebarMode, customAccents, folders, systemPrompt, etc.) |
| `vail_custom_backend_url` | Override backend URL |
| `vail_theme` | `'light'`, `'dark'`, or `'system'` |
| `google_access_token` | Google OAuth token |
| `google_drive_folder_id` | Google Drive sync folder |
| `vail_last_seen_build` | Last build number the user dismissed in the changelog modal |
| `vail_remote_build` | Build number fetched from server (overrides local `BUILD_NUMBER` in `updatenotes.js`) |
| `vail_remote_changelog` | JSON array of changelog strings fetched from server (overrides local `CHANGELOG.changes`) |

### Data flow for a message

1. User submits → `window.handleAction()` → `window.sendMessage()`
2. `sendMessage` pushes `[msg, null, null]` to `chatHistory`, calls `render()`, then streams from the OpenAI-compatible endpoint via SSE (`streaming.js`)
3. Tokens arrive → `window.streamQueue` → typewriter drainer (`setInterval` at 50ms) appends chars using `charAccu += speed / 20` where `TYPE_SPEED_MAIN = 80` (4 chars/tick) or `TYPE_SPEED_THOUGHT = 200` (10 chars/tick) inside `<think>` blocks
4. On completion → `render()` + `updateUI()` + `save()`

### Streaming & thought blocks

`streaming.js` calls `window.updateAssistantDisplay(text, isFinal)` which calls `window.parseThought(text)` to split `<think>...</think>` content from the main response. Thought content renders in a collapsible `.thought-container`; main content renders via `marked.parse()` into `.main-response-content`.

### Backend

The app talks to a self-hosted OpenAI-compatible backend at `https://api.okemovail.com`. At boot, `main.js` fetches `/tunnel_url` to auto-detect a dynamic tunnel URL and stores it in `vail_custom_backend_url`. Override via `localStorage.setItem('vail_custom_backend_url', ...)` or the Settings panel.

### Other pages

- `AI/manage.html` — chat/folder management UI
- `AI/editor.html` — blog post editor
- `AI/research.html` — research mode
- `AI/tos.html`, `AI/privacy.html`, `AI/goals.html`, `AI/version.html` — static info pages
- `AI/data/blogs.json` — static blog data
- `index.html` / `whitename.html` — root landing pages using Tailwind (`src/output.css`)
- `AI/index.html` — Oaky entry/landing page for the AI section (uses Tailwind CDN, not `src/output.css`)
- `Themes/Themes.html` — theme browser

Starting now, if you learn something new, or I prompt you something new, note it down here.

## Skeuomorphic glossy buttons (site-wide)

All 14 pages link `src/design-tokens.css`, which is the single shared stylesheet. It owns:
- The accent tokens (`--accent` / `--accent-light`, dark-swapped under `.dark`) and a convenience var `--skuo-accent` that resolves `--accent-color (chat) → --accent (token pages) → rosewood`.
- Buttons do **not** recolor on press (the old global `:active` accent overlay was removed 2026-07-01). Accent is carried at rest by `.skuo-accent`; press just insets via `--chrome-shadow-active`.
- The **refined button system**: classes `.skuo` (grey neutral base), `.skuo-accent` (accent fill + glow, white text), `.skuo-neutral` (grey), `.skuo-icon` (compact), `.skuo-pill` (keeps `rounded-full`). Each button = whisper top-light→bottom-dark gradient + hairline `inset 0 1px 0 white` highlight + soft lift shadow; accent surfaces add a faint accent glow, neutral surfaces don't; hover lifts, active insets. Dark mode handled via `.dark`. (The earlier glossy/wet-glass look was retired 2026-07-01.)

Notes for future button work:
- `.skuomorphic-btn` (chat) is treated as **neutral** glossy by the shared file. `.skuomorphic-button` is intentionally NOT aliased to accent in the shared file (info pages use it as a neutral pill); it's made glossy per-page via a translucent overlay so it works over whatever local base color the page sets (accent on `AI/index.html`, neutral on info pages, `#5865F2` for `.discord`).
- Pages that define their own button classes in an inline `<style>` win over the shared file by source order, so those are upgraded by appending a glossy override at the end of that page's `<style>` (chat `.sb-new-chat-btn`/`.Cadance-tab-btn`/`.mem-consent-*`, landing `.g-cta`/`.btn-ink`/`.btn-line`/`.g-icon`, editor `.toolbar-btn`/`.control-btn`, version `.btn-primary`, word `.hdr-btn`/`.tb-btn`).
- The `.skuo::before` layer is now `background: none` and vestigial (the wet-glass sheen was **retired 2026-07-01** — see "Refined surface" below). No rule paints it anymore (its former consumer `.skuo-soft` was also removed); the empty pseudo-element is left in place harmlessly.
- `whitename.html` has no buttons.
- Design/plan docs: `docs/superpowers/specs/2026-06-30-skeuomorphic-buttons-design.md` and `docs/superpowers/plans/2026-06-30-skeuomorphic-buttons.md`.

### Soft gradient button language

As of 2026-06-30 the glossy buttons use one **accent-tinted soft gradient**
family (this replaced the earlier "chrome" metallic look — same recipe vars, new
values). The look is defined once in `src/design-tokens.css` as reusable custom
properties — `--chrome-fill`, `--chrome-fill-hover`, `--chrome-shadow`,
`--chrome-shadow-hover`, `--chrome-shadow-active`, `--chrome-border`, `--skuo-glow`
(the `--chrome-*` names were kept so all consumers stay in sync; the values are no
longer chrome).

**IMPORTANT — the `--chrome-*` recipe is declared ON THE CONSUMER ELEMENTS, not
`:root`.** It embeds `var(--skuo-surface)`/`var(--skuo-glow)`; those are only set on
the button elements. A custom property declared at `:root` substitutes its nested
`var()`s once, in root scope (where `--skuo-surface` is unset → grey fallback), and
inherits that *frozen* value down — so a `:root` recipe makes EVERY control grey
regardless of `.skuo-accent` (this was a real bug fixed 2026-07-01). Instead the
recipe lives on a selector list of all consumers (`.skuo, .skuomorphic-btn,
.skuomorphic-button, .ui-badge, .ui-badge--tiny, .ui-opt input, .ui-seg button.on`,
plus a `.dark` copy), so each element resolves it against its own surface/glow.
**To add a new control that uses `var(--chrome-*)`, add its selector to that list**
(or inline the gradient with `var(--skuo-surface)` directly in a real property). To
make any button match: set `--skuo-surface` (grey via `--skuo-neutral`, or
`var(--skuo-accent)`) + `--skuo-glow` (`transparent` neutral / accent) and apply
`background-image: var(--chrome-fill); box-shadow: var(--chrome-shadow);` with
`:hover` → `*-hover` and `:active` → `--chrome-shadow-active`.

- **Fill** = a gentle top→bottom gradient: **lighter at the top, darker at the
  bottom** in light mode, **inverted** (darker top, lighter bottom) under `.dark`.
  No metallic mid-band; a subtle edge highlight + soft lift shadow. The accent
  glow is **accent-only** — neutral controls set `--skuo-glow: transparent`.
- **Neutral** surface = `var(--skuo-neutral)` — plain grey (`--bg-elevated` light,
  `color-mix(--bg-elevated, white 6%)` dark), dark text, **no** accent tint (as of
  2026-07-01; was pale-accent). "Important things accent, everything else grey."
- **Primary/accent** surface = `var(--skuo-accent)` (white text) + accent glow.

Hierarchy is by **intensity, not hue** — everything is accent-tinted. The per-page
override blocks (chat, landing, editor, version, word) consume the recipe instead
of hand-writing gradients, so editing the recipe updates every page (incl. the
`design.html` showcase). Spec/plan: `docs/superpowers/specs/2026-06-30-chrome-button-design-language.md`,
`docs/superpowers/plans/2026-06-30-chrome-button-design-language.md`.

#### Refined surface (current — replaced the glossy look 2026-07-01)

As of 2026-07-01 the buttons dropped the glossy "dome" for a **refined**
surface — "flat + a whisper of skeuomorphism". Same `--chrome-*` recipe vars
(so every consumer stayed in sync automatically — only the values in the
`:root` / `.dark` token blocks changed), plus the base `.skuo::before` sheen
neutralized to `background: none`. The new read:
- **Fill** = a *whisper* gradient — light `~7%` top → dark `~7%` bottom (was
  24%/13%), same lighter-top→darker-bottom direction in `.dark` (`~8%`) to match
  `design-lab.html` Column C. Almost flat; no visible dome.
- **Depth** = a hairline top edge highlight (`inset 0 1px 0` at `0.5`, was `0.7`)
  + a soft lift shadow + a **faint** accent glow (`--skuo-glow` at `transparent 82%`).
- **No** wet-glass sheen and **no** hard top-shine — the two things that read as
  "too glassy". Hover still lifts 1px + grows the shadow; active flattens to a
  subtle inset.
This came from the `design-lab.html` comparison (Column C = "A + current").

The **`.skuo-soft` (Soft / Satin) variant was removed 2026-07-01** — its CSS
(light + dark), the `design.html` showcase card, and all `word/index.html`
usages were deleted; those buttons now use the base refined `.skuo`. The
`.skuo::before` layer is now vestigial (no rule paints it).

**The refined surface now also drives non-button controls** (2026-07-01) so the
whole system shares one finish:
- **`.ui-badge` / `--accent` / `--tiny`** — were flat chips; now raised chips
  using `--chrome-fill` + `--chrome-shadow` (neutral = grey `--skuo-neutral`, no
  glow; `--accent` = accent surface + glow).
- **`.ui-opt input`** (checkbox/radio) — were native `accent-color` controls;
  now custom `appearance: none` controls in the same recipe: unchecked = neutral
  chip, checked = accent surface with a white SVG checkmark (checkbox) or a
  `radial-gradient` dot (radio). Checkbox keeps a `5px` radius, radio is round.
- Both get a `.dark` neutral-surface override (`var(--skuo-neutral)`) mirroring
  `.dark .skuo`, since they don't inherit the `.skuo` dark rule. Checked/accent
  variants set the accent surface + glow.
- **Selected state = accent tint.** `.ui-seg button.on` (segmented control) now
  fills with the refined **accent** surface (was near-black `--text-primary`).
  Toolbar/tab toggles (editor, word, chat settings) already toggle `.skuo-accent`,
  and the global `button:active` rule tints accent on press — so "selected"
  reads accent everywhere.

## Unified inputs, cards, and the showcase page

`src/design-tokens.css` also unifies form inputs and cards:
- **Inputs:** bare `input[type=text|email|search|password|number|url|tel]`, `textarea`, and `select` get a recessed parchment look + accent focus ring, styled globally at *element-attribute specificity* so any page-level class/id rule (chat input bar, word `#doc-title`/`#ai-input`, editor) overrides automatically. Never add `!important` to these rules.
- **Cards:** opt-in via the `.card` class (raised skeuomorphic surface, dark-mode aware); `.card-pad` adds internal padding. Nothing is styled as a card unless it has `.card`.

Reusable components beyond buttons/inputs/cards live in `src/design-tokens.css` under the **`ui-` namespace** (opt-in, themeable, dark-mode aware): `.ui-badge` (+ `--accent`/`--tiny`), `.ui-crumb`, `.ui-accordion` (on `<details>`), `.ui-bullet`, `.ui-opt` (checkbox/radio rows, `.is-disabled`), `.ui-field` (input with leading `.lead` icon), `.ui-info`, `.ui-seg` (segmented control), `.ui-cell`. Inner element selectors are scoped under their `ui-` parent (e.g. `.ui-cell .av`) so plain names never style anything globally. The `ui-` prefix was verified collision-free across all pages — edit a rule here and it updates that component on every page that uses the class.

`design.html` (repo root) is the public showcase — buttons, inputs, cards, and color-token swatches rendered live from `design-tokens.css`, with its own `.dark`/`vail_theme` toggle. It's linked from `index.html` (desktop nav, mobile menu, footer). Keep it in sync when adding new shared components.

Design/plan docs: `docs/superpowers/specs/2026-06-30-unified-design-system-showcase-design.md` and `docs/superpowers/plans/2026-06-30-unified-design-system-showcase.md`.

## Universal adoption — one file controls every control

As of 2026-07-01 every page consumes the shared classes **directly**; page-local
button/card/input *appearance* classes were removed. Inline `<style>` blocks now
hold only **layout** for controls (size, position, flex/grid, responsive
show/hide, child-element rules). To restyle any button/card/input/badge
site-wide, edit `src/design-tokens.css` alone.

What changed:
- Page-local button classes deleted in favor of `.skuo` (+ `.skuo-accent` /
  `.skuo-neutral` / `.skuo-icon` / `.skuo-pill`): landing
  `.g-cta`/`.btn-ink`/`.btn-line`/`.g-icon`, editor `.toolbar-btn`/`.control-btn`,
  word `.hdr-btn`/`.tb-btn`/`.qa-chip`/`.export-item`/`.ai-clear-btn`/`.ai-mobile-close`,
  version `.btn-primary`, AI-landing/info `.skuomorphic-button`. The per-page
  `--chrome-*` "glossy override" blocks were all removed.
- `.skuomorphic-card` (per-page) replaced everywhere by shared `.card`.
- Active/pressed states (editor & word toolbars, chat settings tabs, word AI
  toggle) now toggle the **`skuo-accent`** class via JS instead of a page-local
  active rule (editor's old active rule was dead and was not resurrected).
- **`.discord`** brand button is now a shared modifier in `design-tokens.css`
  (use `class="skuo discord"`); the per-page copies were deleted.
- Chat modal buttons use `.skuo`: confirm = `skuo skuo-accent`, cancel =
  `skuo skuo-neutral`, danger = `skuo` + the kept red `.modal-btn-danger` fill.

Intentional exceptions (deliberately NOT `.skuo`, kept page-local):
- `.modal-btn-danger` (semantic red) and `manage.html`'s red delete icon button.
- Chat bespoke surfaces: `.input-box-wrap` (animated conic-gradient input bar),
  `.sb-search-input`, `.Cadance-card` (blurred panel), `.mem-consent-card`
  (accent-tinted notice).
- `word/#doc-title` (deliberately borderless inline title field).

When adding a control to any page, use the shared class — do not author new
button/card appearance in a page's `<style>`.

Spec/plan: `docs/superpowers/specs/2026-06-30-universal-design-system-adoption-design.md`,
`docs/superpowers/plans/2026-06-30-universal-design-system-adoption.md`.

## Universal floating nav — one component on every page

As of 2026-07-01 every page shows the same floating "glass" nav capsule
(originally only on `index.html`). It is a single self-injecting component —
edit it in **one** place:
- **`src/nav.js`** — reads an optional `window.NAV_CONFIG` (set BEFORE the
  script tag), builds the nav DOM, and injects `<nav class="ov-nav">` as the
  first child of `<body>`. It wires the chevron collapse/expand + pop
  animation, scroll-morph (`.scrolled`), the theme toggle, mobile re-collapse,
  and a resize/orientationchange recompute (the **mobile-clipping fix**:
  `.ov-nav__bar` is capped at `max-width: calc(100vw - 2rem)` and the link
  group scrolls rather than overflowing). Idempotent via `window.__ovNavInjected`.
- **`.ov-nav*` block in `src/design-tokens.css`** — all nav styling.

Rules:
- The injected markup uses **only** `.ov-nav*` + the shared `.skuo*` classes —
  **no Tailwind utilities** — so it renders identically on the compiled-
  `output.css` pages (`design.html`, `Themes/Themes.html`, `word/index.html`)
  as on the Tailwind-CDN pages.
- Per-page links: set `window.NAV_CONFIG = { links:[{label,href}], primary:{label,href,icon:'labs21'}|null, showThemeToggle }`.
  Omitted fields use defaults (Home · Design · GitHub · YouTube + Labs21 pill +
  theme toggle). Link `href`s are **absolute from site root**; a divider is
  auto-inserted before the first external (`http`) link; external links get
  `target=_blank rel=noopener`. The `<script src>`/`<link>` paths are the only
  depth-relative bit (`src/nav.js` at root, `../src/nav.js` one level deep).
- Theme: the nav's toggle writes `vail_theme` + toggles `.dark`. Each page still
  keeps its own early inline anti-FOUC theme script in `<head>` — do not remove.
- App pages keep their app-functional controls; only duplicate nav chrome was
  removed (editor Back + theme toggle; word `.ow-logo` + `#theme-btn` and the
  dead `toggleTheme`/`updateThemeBtn`; version Back + theme toggle + `toggleTheme`;
  manage/Themes/design headers). App-page collision handling: editor header is
  `justify-end` + `padding-right`, `.ow-header` gets `padding-right`, and chat's
  `#top-right-actions` cluster is stacked below the nav (`top:4.5rem`).

Spec/plan: `docs/superpowers/specs/2026-07-01-universal-floating-nav-design.md`,
`docs/superpowers/plans/2026-07-01-universal-floating-nav.md`.