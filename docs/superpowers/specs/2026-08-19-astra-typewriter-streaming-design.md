# Astra typewriter streaming — design

2026-08-19 · status: approved by user (live mockup reviewed in brainstorm companion)

## Context

On the search page (`search/index.html` + `search/astra.js`), the AI answer panel's
generation treatment was called out as unprofessional in two specific ways:

1. The thinking-line quip renders with a **shimmer gradient sweep** across the text
   (`.ai-thinking-line`: `background-clip: text` + `line-shimmer`).
2. Streamed answer text lands in **bursty token-chunks** — every SSE delta triggers a
   full re-parse + `innerHTML` swap of the open block — wrapped in the `.ai-tail`
   pop + blur "breathe" animations.

Everything else about the panel stays: the spinning rainbow conic ring, the pulsing
orb, fonts, colors, layout, fullscreen behavior. The user reviewed a live mockup of
the proposed behavior and approved it.

## Design

### 1. Thinking line loses the gradient (`src/site.css`, `[data-page="search"]` section)

`.ai-thinking-line` becomes plain text: `color: var(--text-tertiary)`, no
`background`/`background-clip`/`animation`. The `@keyframes line-shimmer` rule is
deleted (no other consumer). The pulsing orb (`.ai-orb`) is untouched. The
reduced-motion kill list entry for `.ai-thinking-line` (currently resetting the
shimmer) is removed with it.

### 2. Typewriter drain (`search/astra.js`)

New helper `makeTypewriter(renderFn)` inside the existing IIFE, mirroring the chat
typewriter (`AI/js/streaming.js`):

- `push(fullText)`: called from `streamTurn`'s `onToken` with the full received text;
  the helper derives its queue as the not-yet-revealed suffix.
- A 50ms `setInterval` drains the queue with the chat's adaptive rule:
  `acc += min(max(TYPE_SPEED / 20, queue.length / 6), 50)` with `TYPE_SPEED = 80`
  (4 chars/tick baseline, backlog-aware catch-up, 50 chars/tick cap), then calls
  `renderFn(revealedText)` with the revealed prefix. `makeStreamRenderer` is reused
  unchanged as the render function — it already handles block baking and the
  persistent tail div; only the cadence changes.
- `finish()`: called when the stream ends — lets the interval keep draining
  (backlog rule makes it converge fast) and resolves once the queue is empty, so the
  caller can then run `renderStream.finalize(text)` and set `.done` on the panel.
- `halt()`: called on stop/abort/error — clears the interval immediately; the
  revealed-so-far text is what's kept as the partial answer.
- The helper exposes the revealed text so the thread history on stop records what
  the user actually saw (not unrevealed buffered tokens).

Both call sites — `askAstra` (seed answer) and `askFollowUp` — wire through it.

### 3. Tail effects retired (`src/site.css`)

`.ai-panel:not(.done) .ai-tail` animation rule removed, along with
`@keyframes astra-tail-pop` and `astra-tail-breathe` (no other consumers — verified:
Astra-only). `.ai-tail` remains as the persistent open-block div class in
`makeStreamRenderer`; the typing cadence replaces the materialization effects. The
"pop + unblur breathe" prose in `makeStreamRenderer`'s header comment in
`search/astra.js` is updated to describe the typewriter instead.

### 4. Stop / done semantics (unchanged from user perspective)

- Stop mid-stream: halt interval, keep revealed partial in the thread, panel gets
  `.done` — same as today, minus the unrevealed-buffer leak.
- Normal end: drain → `finalize` full parse → `.done` → ring settles. No text slam.

### 5. Motion invariants

Under `prefers-reduced-motion` **or** `navigator.webdriver`, `makeTypewriter` bails:
`push` renders the full received text immediately (today's cadence, minus the deleted
CSS effects). Keeps the Playwright snapshot harness deterministic per the site-wide
motion invariant (CLAUDE.md).

### 6. Docs

Update the Astra paragraph in `CLAUDE.md`: replace the "Streaming text materializes
Apple-Intelligence style … pop/breathe" description with the typewriter drain; note
the thinking line is plain text.

## Out of scope

- The rainbow conic ring, orb pulse, quip copy, citation linkify, images tab,
  composer morph — all untouched.
- Chat page (`AI/chat.html`) — already has a typewriter; its `.thinking-shimmer`
  thought header is unrelated to this request.

## Error handling

- Backend error before first token: unchanged (`showAiError` path; nothing to halt).
- Abort/error mid-drain: `halt()` + existing partial-keep / turn-remove logic.
- `makeStreamRenderer`'s fence-parity guard is unaffected (it operates on whatever
  prefix it's given; the typewriter only changes how fast prefixes grow).

## Testing

No automated frontend suite exists for Astra; verification is manual:

1. Backend running (`./backend/run.sh`), search a query: thinking line is flat grey
   text; answer types char-by-char, crisp, no blur; ring spins then settles.
2. Long answer: drain catches up without a visible slam at `[DONE]`.
3. Stop mid-stream: partial answer stays, typing halts immediately.
4. Follow-up question: same typewriter behavior.
5. Emulated `prefers-reduced-motion`: text appears per-token, no interval.
6. `grep` confirms no remaining references to `line-shimmer`, `astra-tail-pop`,
   `astra-tail-breathe`.
