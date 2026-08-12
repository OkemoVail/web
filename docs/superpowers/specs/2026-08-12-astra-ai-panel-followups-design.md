# Astra v2.2 — Branded shimmer, follow-up thread, AI toggle — Design Spec

**Date:** 2026-08-12
**Status:** Approved (brainstorming complete, pending implementation plan)
**Builds on:** `2026-08-12-astra-keyless-cosmic-redesign-design.md` (v2),
`2026-08-12-astra-layout-redesign-design.md` (v2.1)

## What

Three coordinated changes to the Astra AI panel (`search/index.html` +
`search/astra.js`; no backend changes):

### 1 · Branded shimmer that disappears when done

- The `.ai-panel` conic border switches from rainbow to the **brand gradient**
  (`--accent` rosewood → `#f0c27b` gold — the wordmark colors), still spinning
  via the existing `--rb` `rb-spin` animation while the answer is in flight.
- On completion (the existing `.done` class), the animated border **fades to a
  plain hairline**: `border-color: var(--border-strong)`, background becomes
  flat `var(--bg-white)`, animation stops; ~0.6s transition so it settles
  instead of snapping. The wave's existing collapse-to-shimmer-line behavior is
  unchanged.
- Scope note: the ✦ cosmic button's `.ai-ring` rainbow is a button accent, NOT
  the AI shimmer — it stays rainbow. (User was offered the choice implicitly
  during design; panel-only was the presented design and approved.)

### 2 · Follow-up thread ("click to ask more")

- After an answer completes, a slim input row fades in at the panel's bottom:
  a pill input (`ask more…`) + a small send button (`.skuo`), inside
  `.ai-panel`, hidden until first `.done`.
- Each follow-up appends a Q&A pair **inside the panel body**: the user's
  question (italic, muted, prefixed `you:`-style marker) followed by the
  freshly streamed answer (same marked/escape/linkify pipeline).
- Context: follow-up requests POST to `/v1/chat/completions` with the full
  thread — the v2 system prompt, the original query + top-5 sources block, and
  every prior Q/A pair as alternating user/assistant messages. Same
  `saga-0.7b`, `stream: true`, `max_tokens: 1024`.
- Starting a **new search resets the thread** (follow-up history cleared, input
  hidden until the new answer completes).
- Abort semantics: a follow-up stream reuses `aiAbort`; a new search or toggle
  off aborts it. The follow-up input is disabled while a stream is in flight.
- Citations in follow-ups linkify against the same numbered results.

### 3 · AI on/off toggle, persisted

- A small pill button `✦ AI` at the right end of the results meta row
  (`.r-meta` becomes a flex row: meta text left, toggle right). Accent-tinted
  when on, neutral grey when off; `aria-pressed` reflects state.
- State stored in **`localStorage` key `astra_ai_mode`** (`'on'` / `'off'`,
  default on). localStorage, not a cookie — matches every other site
  preference; cookies would be sent to the backend on every request for no
  reason.
- **Off behavior:** `runSearch` never un-hides the panel and never calls
  `askAstra` — results-only page. Toggling off mid-stream aborts and hides the
  panel. Toggling on from a results view immediately shows the panel and
  streams an answer for the current query (fresh thread).
- Hero has no toggle (no AI there); the setting persists across searches,
  reloads, and views.

## Out of scope

No backend changes. No chat-page changes. No follow-up input on the hero.
No per-turn source refreshing (follow-ups ground on the original top-5).

## Error handling

Follow-up stream failure → same inline `.ai-error` row + retry button (retries
the follow-up, not the whole search). AI toggle off + backend down is a
non-event (no AI call ever fires).

## Testing

No frontend test infra (repo convention). Manual checklist:

1. Search with AI on: brand-colored spinning border while streaming → fades to
   hairline on completion; follow-up row appears.
2. Follow-up: ask one, watch it stream inline; citations linkify; input
   disabled mid-stream; second follow-up has context of the first.
3. New search resets the thread and re-shows the animated border.
4. Toggle off: panel hidden, no `/v1/chat/completions` request fires (check
   devtools network); persists across reload; toggle back on streams an answer.
5. Light + dark, mobile mode (follow-up row usable at 375px), reduced motion
   (border never spins; the `.done` transition is disabled).
6. Backend suite still green (36 passed) — untouched, confirm only.
