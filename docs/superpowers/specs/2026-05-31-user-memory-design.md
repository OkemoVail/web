# User Memory System Design
**Date:** 2026-05-31

## Overview

Add a consent-based memory system to Oaky (AI/chat.html). When the model detects personal information about the user, it emits a `<remember>` tag. Instead of silently saving it, a consent card floats above the input bar. The user chooses to save or dismiss. Saved memories are injected into every system prompt and manageable in Settings.

---

## 1. Bug Fix — Hide `<remember>` During Streaming

**File:** `AI/js/streaming.js` → `updateAssistantDisplay`

**Problem:** `<remember>` tags are only stripped at `isFinal=true`. The typewriter renders raw tokens incrementally, so tag content is visible mid-stream.

**Fix:** Before passing `content` to `marked.parse()` in both final and non-final branches, strip:
- Complete `<remember>...</remember>` blocks
- Any partial open tag that hasn't closed yet (e.g. `<remember>you lov`)

Strip pattern: `/<remember>[\s\S]*?<\/remember>/g` for complete tags, and `/<remember>[^<]*/` for partial trailing open tags.

---

## 2. Consent Card — `AI/js/memory.js` (new file)

### Trigger
In `streaming.js` at `isFinal=true`, after extracting `rawMemories[]` from `<remember>` tags, call `window.showMemoryConsent(rawMemories)` instead of saving directly.

### Card position
Fixed-position overlay, rendered inside a `#memory-consent-stack` container that sits immediately above the input bar (inserted into the input area's parent in `chat.html`, below `#chat-cont` and above `#input-row`).

### Card appearance (one per memory, stacked)
```
┌──────────────────────────────────────────────────┐
│ 🧠 Remember: "You have a cat named Mineek"       │
│                              [Save]  [Dismiss]   │
└──────────────────────────────────────────────────┘
```

- Styled to match app theme (uses CSS variables / accent color for [Save])
- Animates in (slide up + fade) and out (fade + shrink) on save/dismiss
- If multiple memories arrive, cards stack vertically above the input

### `window.showMemoryConsent(texts: string[])`
- Creates one card per text string
- Appends to `#memory-consent-stack`
- [Save] → calls `window.saveMemory(text)`, removes card with animation
- [Dismiss] → removes card with animation, no save

### `window.saveMemory(text: string)`
- Normalizes text: replace leading "user" (case-insensitive) with "You"
- Pushes `{ id: Date.now().toString(36), text, source: 'model', createdAt: new Date().toISOString() }` to `window.settings.memories`
- Calls `window.saveSettings()`

### `window.summarizeAndSaveMemory(raw: string)`
- Implement this stub (currently called but undefined in `streaming.js`)
- Calls `window.showMemoryConsent([raw])` — routes through the consent flow

---

## 3. Settings Memory Section

**File:** `AI/js/settings.js`

Add a new "Memory" section in the settings panel, positioned after the System Prompt section.

### Layout
```
Memory
──────────────────────────────
• You have a cat named Mineek  [×]
• You prefer dark mode          [×]
──────────────────────────────
[  Type a memory...  ] [Add]
```

- Each entry: text + delete (×) button
- [×] removes from `window.settings.memories`, calls `saveSettings()`, re-renders list
- Text input + [Add] button: trims input, pushes new memory `{ id, text, source: 'user', createdAt }`, calls `saveSettings()`, re-renders list, clears input
- Empty state: "No memories saved yet."

---

## 4. Data Format

Memory objects (stored in `window.settings.memories[]` → `localStorage` key `vail_settings_v4`):

```json
{
  "id": "abc123",
  "text": "You have a cat named Mineek",
  "source": "model" | "user",
  "createdAt": "2026-05-31T00:00:00.000Z"
}
```

Already initialized in `state.js:326`.

---

## 5. Files Changed

| File | Change |
|---|---|
| `AI/js/streaming.js` | Strip `<remember>` content during streaming; call `showMemoryConsent` instead of auto-save at final |
| `AI/js/memory.js` | New file — `showMemoryConsent`, `saveMemory`, `summarizeAndSaveMemory` |
| `AI/js/settings.js` | Add Memory section with list + delete + manual add |
| `AI/chat.html` | Add `#memory-consent-stack` container above input row; load `memory.js` in script order (after `streaming.js`, before `chat-management.js`) |

---

## 6. Out of Scope

- No LLM summarization of raw memory text (save as-is)
- No per-memory edit (only delete + re-add)
- No sync across devices
