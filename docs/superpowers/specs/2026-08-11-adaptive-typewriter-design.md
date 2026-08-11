# Adaptive Typewriter + Slam-Free Finish — Design

**Date:** 2026-08-11
**Status:** Approved by user (2026-08-11)

## Purpose

Make Oaky's streaming display feel premium with a local model: the typewriter
currently drains at a fixed 80 chars/s (200 in `<think>`), so with Gemma 3 4B
(~200–300 chars/s) the display lags behind the model, and at `[DONE]` the
interval is killed with a backlog — the remaining text slams in at once (the
"flash" the user sees). Additionally, the completion path slams the full text
into the DOM and calls `window.render()`, rebuilding the whole chat.

Confirmed scope with user: typing tracks the model (display-side fix, not a
model-speed change); the flash to remove is the end-of-generation text slam.

## Approach

Approach A (chosen): adaptive, backlog-aware typewriter + deferred in-place
finalize. Alternatives rejected: instant token rendering (B — throws away the
product's typing aesthetic), raising the fixed speed (C — half-measure tuned
to one model).

## Changes

### 1. Adaptive drain — `AI/js/streaming.js` (`startTypewriter`)

Per 50ms tick, replace the fixed `charAccu += speed / 20` with a
backlog-aware rate:

```js
const speedFloor = window.isInsideThought(window.typedResponseText)
    ? window.TYPE_SPEED_THOUGHT : window.TYPE_SPEED_MAIN;
const perTick = Math.min(
    Math.max(speedFloor / 20, window.streamQueue.length / 6),
    50   // cap: 1000 chars/s, reads fast but never "dumps"
);
window.charAccu += perTick;
```

- `queueLength / 6` = catch-up: drain any backlog over ~6 ticks (300ms).
- Steady state with a fast model: backlog hovers small, drain rate equals
  arrival rate — display tracks the model.
- When the queue is empty and `isGenerating` is false, the interval does the
  final display pass (`updateAssistantDisplay(text, true)` — existing),
  calls `window.finalizeLastAIMessage()` (new, see §3), then clears itself.

### 2. Completion path — `AI/js/chat-actions.js` (`sendMessage`, post-stream)

Keep all data bookkeeping: sanitize, `<remember>` extraction + strip, sources
stash (index 5), canvas extraction, `isGenerating = false`, `updateUI()`,
`toggleSendIcon('send')`, title-generation trigger, `save()`.

Remove from the success path:
- The full-text DOM slam (`lastProseEl` thought/content rewrite, current
  lines ~304–336) — the draining typewriter's final
  `updateAssistantDisplay(text, true)` covers it.
- The premature actions-row append (moves into `finalizeLastAIMessage`, §3).
- The final `window.render()` — redundant once the bubble is finalized in
  place, and it would re-slam the full text while the typewriter drains.
- The `clearInterval` in `finally` must NOT run while `streamQueue` is
  non-empty; the typewriter stops itself after draining.
- The `catch` (error) path additionally sets `window.streamQueue = ""` so the
  surviving interval drains instantly and stops itself without typing stale
  text over the error bubble. (The abort path in `handleAction` already clears
  both the queue and the interval.)

### 3. In-place finalize — new `window.finalizeLastAIMessage()`

Defined in `chat-actions.js` (near the completion logic it replaces), called
by the typewriter when the queue is drained and generation is done:

1. Fade out and remove `.book-flip-lane` under the last `.ai-row` (add a
  `.done` class with an opacity transition ~300ms, remove on
  `transitionend`/timeout) instead of it vanishing instantly.
2. Append the actions row (copy / regen / sources / feedback / timestamp) to
  the last AI bubble if not already present — the same markup the completion
  path builds today, including the sources-count button when
  `chatHistory[last][5]` has entries; `feather.replace` scoped to the row.
3. Scroll the chat container to the bottom.

### 4. Explicitly untouched

- Stop/abort path (`handleAction`): clears queue + interval and renders
  immediately — instant stop is correct there.
- Error path (`catch`): still calls `window.render()`.
- Generation start (`sendMessage` push + `render()`): unchanged — the
  book-flip lane still appears while generating.
- Astra (`search/astra.js`): no typewriter there.
- `TYPE_SPEED_MAIN` (80) / `TYPE_SPEED_THOUGHT` (200) constants stay as the
  floors.

## Data flow after the change

1. Tokens arrive → `streamQueue` grows → adaptive typewriter drains at
   ~arrival rate → bubble updates via `updateAssistantDisplay` (unchanged).
2. `[DONE]` → bookkeeping + `isGenerating = false` → typewriter drains the
   small remaining backlog (a few hundred ms) → final display pass →
   `finalizeLastAIMessage()` → lane fades out, actions fade in, scroll.
3. No full-chat DOM rebuild at any point in the success path.

## Error handling

- Mid-stream error delta (`⚠️ Backend error: ...` from the backend) arrives
  as normal content and types out; `[DONE]` follows and finalize runs — fine.
- Fetch-level failure (`catch`): unchanged behavior (error bubble + render).
- If `finalizeLastAIMessage` throws, the interval still clears itself — wrap
  the call in try/catch and log.

## Testing

No JS test infra exists in this repo (per CLAUDE.md) — verification is
manual in the browser against the live local backend:

1. Long answer: display keeps pace with the stream (no growing lag), text
   finishes typing within ~0.5s of generation ending, no slam.
2. Short answer: same feel at small sizes.
3. Stop mid-stream: immediate halt + "Stopped" marker, no leftover typing.
4. Thought block (if model emits `<think>`): 200 chars/s floor still applies.
5. Book-flip lane fades out; actions row fades in; sources button appears
   when sources exist.
6. Reload mid-chat: history renders correctly from `render()` (unchanged).

## Out of scope

- Model/backend speed changes.
- Removing `render()`'s whole-chat rebuild anywhere except the completion
  path (it's still the tool for load/switch/delete).
- Scroll-behavior redesign.
