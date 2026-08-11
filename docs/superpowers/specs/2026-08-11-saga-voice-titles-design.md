# Saga-Voice Chat Titles — Design

**Date:** 2026-08-11
**Status:** Approved by user (2026-08-11)

## Problem

Auto-generated chat titles are bad. `generateChatTitle`
(`AI/js/chat-management.js`) asks for "a single short sentence summarising
what the user asked or needed" — which the model reads as an invitation to
describe the user's *behavior*: saying "hai" produced the title **"The user is
initiating a casual conversation, likely seeking interaction"**. The prompt's
framing ("summarise what the user asked"), its all-technical examples, and the
loose "10–15 words" limit all push toward meta-commentary.

## Goal (confirmed with user)

Titles should be **a main-topic line with personality** — one glance in the
sidebar tells you what the whole conversation is. Voice: **Saga's own** (dry,
lowercase, plain, slight edge) — e.g. "oh, just saying hi", "a flask 404 on
the api route", "sci-fi story, mars edition". Rejected styles: warm & plain
("Just saying hey"), playful with emoji, terse noun-labels ("Casual greeting").

## Approach

Prompt rewrite + deterministic guard + one retry (chosen over prompt-only —
no backstop — and extractive-only — no personality).

## Changes — all in `AI/js/chat-management.js`, `generateChatTitle`

### 1. New system prompt

```
You are Saga naming this conversation for a sidebar list. Write one short line
(4-10 words) that captures the main topic or vibe of the chat — someone scanning
the list should instantly know what this conversation is.

Style: your voice — dry, lowercase, plain, slight edge is fine. No quotes, no
trailing period, no emoji, no explanation. NEVER describe the user or the
conversation itself: no "the user", no "this conversation", no "someone asked".

Examples:
User: "hi" → oh, just saying hi
User: "my flask route keeps 404ing" → a flask 404 on the api route
User: "write a sci-fi story about mars" → sci-fi story, mars edition
User: "what causes iron deficiency anemia" → iron deficiency anemia, causes and fixes
User: "how do I center a div" → centering a div, finally
```

Replaces the current system message wholesale. The user message format
(`User: "..." Assistant: "..."`) is unchanged. `temperature: 0.3`,
`max_tokens: 60`, `stream: false` unchanged.

### 2. Meta guard + one retry

After the existing cleanup (tag/quote stripping etc. — unchanged), test the
title against:

```js
/^(the user|user is|this (chat|conversation|is)|in this (chat|conversation))/i
```

- Match → retry ONCE: same request plus one extra user message appended:
  `no — name the topic, not the user. one short line, your voice, title only.`
- Still meta after the retry (or retry request fails) → leave the chat's
  existing title in place (it is already the first-30-chars fallback set at
  chat creation) — never overwrite with a meta title.
- The retry's result goes through the same cleanup + guard.

### 3. Untouched

- Title display, title feedback buttons, the Regenerate Title button (calls
  the same function with `force=true` — inherits the fix).
- Backend: nothing (the non-stream `/v1/chat/completions` already works).
- Titles use only this system prompt — the sidebar keeps Saga's voice even
  when the chat uses a different personality preset.
- Existing cleanup regexes (think-tag/ChatML/tag stripping, first-clause
  split, quote trimming).

## Error handling

- Request failure (non-OK/throw) → existing behavior: log + keep the
  truncated-first-message title (the `catch` already just logs; the title
  stays the fallback that was set when the chat was created).
- Retry failure → same fallback. No new error surface.

## Testing

No JS test runner in this repo. Verification:

1. Node script POSTing real title-generation-shaped requests (same system
   prompt, `stream:false`) through the tunnel for: "hai", "my flask route
   keeps 404ing", "write a sci-fi story about mars", "what causes iron
   deficiency anemia", "how do I center a div" — print the titles; expect
   Saga-voice topic lines, none matching the meta regex.
2. Guard unit check: the meta regex fires on "The user is initiating a casual
   conversation" and does NOT fire on "oh, just saying hi",
   "a flask 404 on the api route", "user stories for the login page"
   (legit title starting with "user" — must not match: the regex anchors
   "the user"/"user is", not bare "user").
3. Browser: send "hai" in a fresh chat, watch the sidebar title.

## Out of scope

- Backend changes.
- Re-titling existing chats (user can use Regenerate Title).
- Title length enforcement beyond the prompt (no hard truncation changes).
