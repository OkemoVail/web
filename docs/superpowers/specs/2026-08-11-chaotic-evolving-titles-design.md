# Chaotic Evolving Chat Titles — Design

**Date:** 2026-08-11
**Status:** Approved by user (2026-08-11)
**Supersedes:** `2026-08-11-saga-voice-titles-design.md` (voice prompt only; its
meta guard, cleanup, and error-handling rules are kept)

## Problem

Two gaps remain after the saga-voice titles work:

1. **Titles only see the first exchange.** `generateChatTitle`
   (`AI/js/chat-management.js`) is called once, after reply 1, with
   `chatHistory[0]` only (`AI/js/chat-actions.js` ~line 377). A chat that starts
   with css grief and drifts into docker keeps a css title forever — you cannot
   know the entire chat with one glance.
2. **Voice is dry but tame.** Current style ("dry, lowercase, plain, slight
   edge") produces correct-but-flat titles. User wants **full chaotic**:
   puns, CAPS for emphasis, jokes — with the topic still instantly obvious.

## Goals (confirmed with user)

- Title **evolves as the chat grows**: generated after reply 1, then quietly
  re-generated about every 4 replies so it tracks the whole conversation.
- **Full chaotic** voice: puns, caps, dry jokes, punctuation play. The topic
  must still be scannable at a glance — the joke is decoration, never a
  replacement. **No emoji** (the separate "Saga + emoji" option was rejected).
- Manually renamed titles are never auto-touched; a thumbs-up on the title
  also locks it. Thumbs-down leaves it evolving.
- Manual **Regenerate Title** reads the full chat at that moment.
- Approach: **prompt-first evolution** (client-only). Rejected: local keyword
  extraction stuffed into the prompt (crude, more code); two-line title+subtitle
  sidebar UI (bigger UI project).

## Changes

### 1. New title system prompt — `TITLE_SYSTEM_PROMPT` in `chat-management.js`

Rules the prompt must encode:

- One line, **4–12 words**, that names the chat for a sidebar list.
- The **topic must be instantly obvious**; personality decorates the topic.
- Voice: Saga, full chaotic — puns, CAPS for emphasis, dry jokes, punctuation
  play (`!`, `...`, `—`), lowercase by default.
- No emoji, no quotes, no trailing period, no explanation.
- Never describe the user or the conversation ("the user", "this
  conversation", "someone asked") — the existing `TITLE_META_RE` guard stays.
- The digest may span the whole chat; name the arc. If the topic drifted,
  name the dominant/current topic or stitch both.

Example lines (style anchors):

```
"hi"                      → oh, just saying hi
"my flask route keeps 404ing" → FLASK 404: a tragedy in one route
"how do I center a div"   → centering a div, hour three
"write a sci-fi story about mars" → mars sci-fi, because earth was boring
"what causes iron deficiency anemia" → iron deficiency, or: why you're tired
drifted chat (css → docker) → css grief, then docker (classic)
```

### 2. Whole-chat digest — new `buildTitleDigest(history)` in `chat-management.js`

- First user message in full (≤200 chars).
- Up to the **last 5 exchanges**, each side ≤120 chars, `<think>`/`<thought>`
  blocks stripped (reuse the existing strip regexes from `cleanChatTitle`).
- Format matches the existing convention: `User: "..."` / `Assistant: "..."`
  lines.
- Total digest capped at ~900 chars; when over budget, drop middle turns
  first (keep turn 1 and the most recent turns). Small, clean digest beats a
  raw dump for the small titler model.
- Attachments: skip non-text content (images/files contribute nothing to a
  title).

### 3. Cadence + locks

- Chat object gains **`titleGenAt`**: the `history.length` at the last
  successful title generation.
- Auto-(re)title when either:
  - there is no real title yet (title missing or equal to the first-30-chars
    fallback — today's condition), or
  - `history.length - (chat.titleGenAt || 0) >= 4`.
- **Locks** — skip auto-titling (manual Regenerate overrides all locks):
  - `chat.titleManual === true` — set by `renameChat` (the only chat-rename
    entry point, via the header capsule's `renameCurrentChat`; the sidebar
    chat menu has no rename).
  - `chat.titleFeedback === 'good'` — user liked it, it stays.
    `'bad'` leaves it evolving (existing feedback flow unchanged).
- `titleGenAt` updates **only on successful** title application; failures
  just wait for the next boundary. Old chats without `titleGenAt` are treated
  as `0` and refresh once when they next cross a boundary.

### 4. Wiring (minimal diffs)

- **`generateChatTitle(chatId, force)`** — signature change: drop the
  `userMsg`/`aiMsg` params; build the digest internally from
  `window.allChats[chatId].history` (fall back to `window.chatHistory` when
  `chatId === window.currentChatId` and the chat isn't persisted yet).
- **`chat-actions.js`** after-stream block (~line 373): replace the
  first-reply-only condition with the cadence + locks check above.
- **`regenerateCurrentTitle`** (`chat-management.js`): drop the
  `chatHistory[0]` extraction; pass `(currentChatId, true)`.
- **`renameChat`**: set `titleManual: true` on the chat object before saving.
- **Untouched:** `cleanChatTitle`, `TITLE_META_RE` guard + single retry,
  `updateChatTitleDisplay`, title feedback UI, `truncateTitle`, sidebar
  rendering, backend.

## Error handling

- Request failure / non-OK / exception → log, keep the existing title, do not
  touch `titleGenAt` (next cadence boundary retries naturally).
- Meta guard + one corrective retry: unchanged from the saga-voice spec.
- A failed **regenerate** leaves the old title in place (today's behavior).

## Testing

No JS test runner in this repo. Verification:

1. **Node script** POSTing title-shaped requests (new system prompt,
   `stream: false`) to the local backend (`./backend/run.sh`,
   `http://127.0.0.1:8001`): payloads for "hi", flask 404, mars story, and a
   drifted digest (css turns then docker turns). Print titles; expect chaotic
   voice, topic still obvious, none matching `TITLE_META_RE`.
2. **Digest unit check** (node, plain function): digest of a 12-turn history
   keeps turn 1, keeps recent turns, drops middle, stays under the char cap,
   strips think tags.
3. **Browser:** fresh chat → title after reply 1; keep chatting past reply 5 →
   title refreshes on its own; rename → no further auto-changes; thumbs-up →
   no further auto-changes; Regenerate on a long chat → reflects the whole
   arc.

## Out of scope

- Backend changes.
- Re-titling existing chats en masse (they refresh lazily via cadence, or the
  user presses Regenerate).
- Sidebar/UI presentation changes (truncation stays as-is).
