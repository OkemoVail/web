# Unlock All Personality Presets — Design

**Date:** 2026-08-11
**Status:** Approved by user (2026-08-11)

## Problem

With the temp backend running, the Personality modal in `AI/chat.html` shows
only **one** preset ("Saga") instead of nine. Root cause: at boot,
`chat-actions.js` fetches `/api/system_prompts` and **replaces** the
frontend's hardcoded 9-preset `PERSONALITY_PRESETS` with whatever the backend
returns ("backend is the single source of truth", by design). The temp
backend's stub returned a single personality, which reads to the user as the
other eight being locked behind a paywall/account.

## Approach

Approach A (chosen): serve all 9 personalities from the temp backend's
`/api/system_prompts`. Alternatives rejected: removing the frontend bootstrap
sync (fights the architecture; re-gates on real-backend reconnect), merging
server+local lists (dedup complexity, no user-visible gain).

## Changes

### 1. `backend/server.py` — full personality list

`SYSTEM_PROMPTS["personalities"]` becomes all 9 entries —
`{id, label, prompt}` — with prompt strings copied **verbatim** from
`window.PERSONALITY_PRESETS` in `AI/chat.html` (lines 4761–4769):

| # | id | label |
|---|---|---|
| 1 | `default` | Default |
| 2 | `concise` | Concise |
| 3 | `creative` | Creative |
| 4 | `coder` | Coding Expert |
| 5 | `tutor` | Tutor |
| 6 | `sarcastic` | Sarcastic |
| 7 | `analyst` | Analyst |
| 8 | `discord-friend` | Discord Friend |
| 9 | `friend` | Friend |

- `icon` is **not** served — the frontend's `iconMap` derives icons from `id`.
- `identity_lock` and `global_rules` in the same response stay unchanged.
- Verbatim prompts matter: the bootstrap's stale-preset migration compares
  saved prompts by exact string equality (`trim()`-normalised), and
  `chat.html` notes these prompts "match system_prompts.json exactly".

### 2. `backend/tests/test_server.py` — extend the stub test

Extend `test_system_prompts_shape` (or add `test_system_prompts_all_nine`)
asserting:
- `personalities` has exactly 9 entries
- ids appear in the order above
- every entry has non-empty `label` and `prompt`
- `identity_lock` / `global_rules` still present

### 3. Restart + live verify

Restart the running server (SIGTERM the uvicorn process, relaunch
`backend/run.sh` with nohup, log to `/tmp/oaky-backend.log`), then:
- `curl -s localhost:8001/api/system_prompts` returns 9 personalities
- Browser: reload `AI/chat.html`, open Personality → 9 chips render, clicking
  one fills + persists the textarea (existing behaviour, unchanged)

## Untouched

- Frontend: zero changes.
- The memories account gate (`vail_auth_token` checks) — separate feature,
  out of scope.
- Backend endpoints other than `/api/system_prompts`.

## Error handling

None new — the endpoint returns a static dict. If the backend is unreachable,
the frontend falls back to its hardcoded 9 presets (existing behaviour), so
personalities are now available in both cases.

## Testing

- pytest: the extended shape test above (existing 12 tests must keep passing).
- Live: curl + browser check as in §3.
