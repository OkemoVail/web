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

### JS load order (`AI/js/`)

The load order matters. Later files depend on earlier ones:

1. `state.js` — global mutable state (`window.chatHistory`, `window.settings`, `window.isGenerating`, `window.els`, etc.)
2. `utils.js` — shared helpers
3. `storage.js` — `window.StorageController` (IndexedDB-backed chat persistence)
4. `modals.js`, `i18n.js`, `theme.js` — UI scaffolding
5. `thought.js`, `content-features.js` — markdown/KaTeX rendering helpers
6. `api.js` — `window.getOpenAIClient()`, model definitions, backend URL resolution
7. `google-auth.js`, `profile.js`, `sidebar.js`, `folders.js`, `settings.js` — feature modules
8. `streaming.js` — SSE streaming logic
9. `chat-management.js`, `chat-actions.js` — `window.sendMessage()`, `window.handleAction()`
10. `feedback.js`, `history.js`, `menus.js`, `send-icon.js`, `research.js`, `changelog.js`
11. `render.js` — `window.render()` rebuilds the entire chat DOM from `window.chatHistory`
12. `ui.js` — `window.updateUI()` syncs button states to global flags
13. `mini-logo.js`, `loader.js` — cosmetic/preloader
14. `main.js` — `boot()` async IIFE that initializes storage, detects tunnel URL, then calls `window.initChatUI()`

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

### Models

Defined in `state.js` as `window.MODELS`:
- `OCTAN` — id `"Octan-1.2B"`, default model
- `STUART` — id `"Stuart-1.2B"`

Switch with `window.selectModel('OCTAN')` or `window.selectModel('STUART')`.

### localStorage keys

| Key | Purpose |
|---|---|
| `vail_settings_v4` | Main settings JSON (temp, top_p, rep_pen, max_tokens, apiKey, accent, userName, etc.) |
| `vail_custom_backend_url` | Override backend URL |
| `vail_theme` | `'light'`, `'dark'`, or `'system'` |
| `google_access_token` | Google OAuth token |
| `google_drive_folder_id` | Google Drive sync folder |

### Data flow for a message

1. User submits → `window.handleAction()` → `window.sendMessage()`
2. `sendMessage` pushes `[msg, null, null]` to `chatHistory`, calls `render()`, then streams from the OpenAI-compatible endpoint via SSE (`streaming.js`)
3. Tokens arrive → `window.streamQueue` → typewriter drainer (`setInterval` at 50ms) appends chars to `window.typedResponseText` at `TYPE_SPEED_MAIN` (33.3 chars/tick) or `TYPE_SPEED_THOUGHT` (100 chars/tick) inside `<think>` blocks
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
- `index.html` / `whitename.html` — landing pages using Tailwind (`src/output.css`)
- `Themes/Themes.html` — theme browser
- `ai.html` — top-level AI entry point
