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
- A global `:active` press gradient (every button tints with accent while pressed).
- The **skeuomorphic glossy button system**: classes `.skuo` (neutral base), `.skuo-accent` (accent fill, white text), `.skuo-neutral`, `.skuo-icon` (compact), `.skuo-pill` (keeps `rounded-full`). Each glossy button = top-light→bottom-dark gradient + `inset 0 1px 0 white` highlight + bevel + lift shadow; hover lifts, active sinks. Dark mode handled via `.dark`.

Notes for future button work:
- `.skuomorphic-btn` (chat) is treated as **neutral** glossy by the shared file. `.skuomorphic-button` is intentionally NOT aliased to accent in the shared file (info pages use it as a neutral pill); it's made glossy per-page via a translucent overlay so it works over whatever local base color the page sets (accent on `AI/index.html`, neutral on info pages, `#5865F2` for `.discord`).
- Pages that define their own button classes in an inline `<style>` win over the shared file by source order, so those are upgraded by appending a glossy override at the end of that page's `<style>` (chat `.sb-new-chat-btn`/`.Cadance-tab-btn`/`.mem-consent-*`, landing `.g-cta`/`.btn-ink`/`.btn-line`/`.g-icon`, editor `.toolbar-btn`/`.control-btn`, version `.btn-primary`, word `.hdr-btn`/`.tb-btn`).
- The shared `.skuo::before` wet-glass sheen sits at `z-index:-1`, so on opaque-filled buttons it's hidden behind the fill; the glossy read comes from the gradient + inset highlight. Only relevant for translucent buttons.
- `whitename.html` has no buttons.
- Design/plan docs: `docs/superpowers/specs/2026-06-30-skeuomorphic-buttons-design.md` and `docs/superpowers/plans/2026-06-30-skeuomorphic-buttons.md`.

## Unified inputs, cards, and the showcase page

`src/design-tokens.css` also unifies form inputs and cards:
- **Inputs:** bare `input[type=text|email|search|password|number|url|tel]`, `textarea`, and `select` get a recessed parchment look + accent focus ring, styled globally at *element-attribute specificity* so any page-level class/id rule (chat input bar, word `#doc-title`/`#ai-input`, editor) overrides automatically. Never add `!important` to these rules.
- **Cards:** opt-in via the `.card` class (raised skeuomorphic surface, dark-mode aware); `.card-pad` adds internal padding. Nothing is styled as a card unless it has `.card`.

Reusable components beyond buttons/inputs/cards live in `src/design-tokens.css` under the **`ui-` namespace** (opt-in, themeable, dark-mode aware): `.ui-badge` (+ `--accent`/`--tiny`), `.ui-crumb`, `.ui-accordion` (on `<details>`), `.ui-bullet`, `.ui-opt` (checkbox/radio rows, `.is-disabled`), `.ui-field` (input with leading `.lead` icon), `.ui-info`, `.ui-seg` (segmented control), `.ui-cell`. Inner element selectors are scoped under their `ui-` parent (e.g. `.ui-cell .av`) so plain names never style anything globally. The `ui-` prefix was verified collision-free across all pages — edit a rule here and it updates that component on every page that uses the class.

`design.html` (repo root) is the public showcase — buttons, inputs, cards, and color-token swatches rendered live from `design-tokens.css`, with its own `.dark`/`vail_theme` toggle. It's linked from `index.html` (desktop nav, mobile menu, footer). Keep it in sync when adding new shared components.

Design/plan docs: `docs/superpowers/specs/2026-06-30-unified-design-system-showcase-design.md` and `docs/superpowers/plans/2026-06-30-unified-design-system-showcase.md`.