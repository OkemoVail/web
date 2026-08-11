# Temp MLX Backend — Design

**Date:** 2026-08-11
**Status:** Approved by user (2026-08-11)

## Purpose

A lightweight, standalone, temporary backend for the Oaky chat frontend
(`AI/chat.html`) and Okemo Astra (`search/index.html`). It replaces the real
production backend (separate `OkemoLLM` repo, which includes cloud storage,
accounts, voice, etc.) with a single-file server that runs a local model fast
enough for interactive use. Lives entirely inside this repo at `backend/`.

## Requirements (confirmed with user)

- **Model:** `mlx-community/gemma-3-4b-it-qat-4bit` via MLX (user chose quality
  over speed; ~40–70 tok/s expected on M2 Max 64GB). Swappable via `MODEL_ID`
  env var.
- **Serve:** `http://localhost:8001`; the user's existing cloudflared named
  tunnel already maps `api.okemovail.com` → `localhost:8001`. No tunnel setup
  in scope.
- **Scope:** real `POST /v1/chat/completions` + light stubs for the auxiliary
  endpoints the frontend calls on boot/actions, so the UI shows zero console
  errors. No accounts, no cloud storage, no voice (Whisper/Kokoro).
- **Must work with the existing website unchanged** — the server conforms to
  the frontend's existing wire protocol, not vice versa.

## Frontend wire contract (discovered by reading the code)

| Caller | Endpoint | Needs |
|---|---|---|
| `AI/js/chat-actions.js` `sendMessage()` | `POST /v1/chat/completions` | SSE stream: `data: {choices:[{delta:{content}, finish_reason}]}` lines, then `data: [DONE]`. Sends extra fields: `web_search`, `use_thought`, `use_canvas`, `deep_research`, `chat_id`, `job_id`, `user_name`, `user_token`, `attachment`. |
| `AI/js/chat-management.js` `generateChatTitle()` | `POST /v1/chat/completions` with `stream:false` | Plain JSON: `choices[0].message.content`. |
| `search/astra.js` `askAstra()` | `POST /v1/chat/completions` with `stream:true` | Same SSE protocol. Optional side-channel: `data: {"sources":[...]}` (we skip). |
| `AI/js/main.js` boot | `GET /tunnel_url` | `{tunnel_url: "..."}`. |
| `AI/js/chat-actions.js` boot | `GET /api/system_prompts` | `{personalities: [{id, label, prompt}], identity_lock, global_rules}`. |
| `AI/js/feedback.js` | `POST /feedback` | Any 2xx JSON. |
| `AI/js/feedback.js` | `GET /api/tokens?chat_id=` | `{total_tokens: N}`. |
| `AI/js/chat-actions.js` stop button | `POST /cancel_job` `{job_id}` | Any 2xx JSON; should also really stop generation. |

All endpoints need permissive CORS (`Access-Control-Allow-Origin: *` +
preflight handling) because pages may be opened from `file://`, a local static
server, or the tunneled origin.

## Architecture

Approach A (chosen): **FastAPI + `mlx-lm`, one file.** Alternatives considered
and rejected: `llama-server` + proxy (two processes, slower decode on Apple
Silicon), stdlib `http.server` (hand-rolled SSE/threading is error-prone).

```
backend/
  server.py          # entire backend (~150 lines)
  requirements.txt   # mlx-lm, fastapi, uvicorn[standard]
  run.sh             # create .venv if missing, pip install -r, exec uvicorn 127.0.0.1:8001
  feedback.jsonl     # created at runtime by the /feedback stub
```

`.gitignore` gains `backend/.venv/` (and `backend/feedback.jsonl`).
`server.py`, `requirements.txt`, `run.sh` stay tracked.

## Components

### 1. Model wrapper (`server.py` startup)

- `mlx_lm.load(os.environ.get("MODEL_ID", "mlx-community/gemma-3-4b-it-qat-4bit"))`
  → `(model, tokenizer)`.
- First run downloads ~2.5GB to `~/.cache/huggingface` (standard HF cache,
  outside the repo).
- Prompt building: `tokenizer.apply_chat_template(messages,
  tokenize=False, add_generation_prompt=True)`.

### 2. `POST /v1/chat/completions`

- Parse: `model`, `messages`, `max_tokens` (default 512), `temperature`
  (default 1.0), `top_p` (default 1.0), `repetition_penalty` (default 1.0),
  `stream` (default false), `job_id` (optional), `chat_id` (optional).
- Ignore silently: `web_search`, `use_thought`, `use_canvas`, `deep_research`,
  `user_name`, `user_token`, `think`/`thinking` flags.
- Attachment handling: if `attachment.text_content` (string) is present,
  prepend it to the last user message as
  `[File: {name}]\n{text_content}\n\n{original_text}`. Images are ignored.
- Sampling: `mlx_lm.utils.make_logits_processors` /
  `make_sampler(temp, top_p)` + repetition penalty per mlx-lm API.
- Generation runs in a worker thread (`asyncio.to_thread` /
  `run_in_executor`) pulling from `mlx_lm.stream_generate` so the event loop
  stays responsive.
- **Streaming response** (`stream:true`): `StreamingResponse`,
  `media_type="text/event-stream"`. One SSE event per text piece yielded by
  `stream_generate`:
  ```json
  {"id": "chatcmpl-<uuid>", "object": "chat.completion.chunk",
   "created": <unix>, "model": "<requested model id>",
   "choices": [{"index": 0, "delta": {"content": "<text>"},
                "finish_reason": null}]}
  ```
  Final chunk carries `finish_reason: "stop"` (or `"length"` when
  `max_tokens` hit), followed by a literal `data: [DONE]` line.
- **Non-streaming response** (`stream:false`): collect full text, return
  standard OpenAI JSON:
  ```json
  {"id": "...", "object": "chat.completion", "created": <unix>, "model": "...",
   "choices": [{"index": 0, "message": {"role": "assistant",
                "content": "<full text>"}, "finish_reason": "stop"}],
   "usage": {"prompt_tokens": N, "completion_tokens": M, "total_tokens": N+M}}
  ```

### 3. Concurrency & cancellation

- One global `threading.Lock` serializes generation — a single MLX model
  cannot generate concurrently. Second request waits; acceptable for a
  single-user temp backend.
- The lock is owned by a **daemon worker thread** per stream request, never by
  the SSE response generator: the worker pushes formatted SSE frames into a
  `queue.Queue` (sentinel-terminated) and always terminates (bounded by
  `max_tokens`), so a mid-stream client disconnect can never wedge the lock.
  (The original design held the lock inside the suspended sync generator —
  Starlette does not deterministically close abandoned generators, which
  deadlocked the server on disconnect; fixed in commit `9c27549`, guarded by
  `test_abandoned_stream_does_not_block_next_request`.)
- `POST /cancel_job {job_id}` records the id in a `set`; the token loop checks
  membership each iteration and stops early (finish_reason `"stop"`). This is
  the prompt-stop path — a disconnected client's generation otherwise runs to
  completion in the background, which is bounded and harmless.
- Cancelled/completed job ids are cleared from the set.

### 4. Stubs

- `GET /tunnel_url` → `{"tunnel_url": "https://api.okemovail.com"}`.
- `GET /api/system_prompts` → JSON mirroring the frontend's built-in fallback:
  `personalities: [{id:"default", label:"Saga", prompt:"You are Saga, a helpful AI assistant made by OkemoVail."}]`,
  plus `identity_lock` (`"Your name is Saga. You were built by OkemoVail."`)
  and `global_rules` (the same rules string hardcoded in `chat-actions.js`:
  Traditional Chinese rule, Tailwind-only code rules, clarification rule).
- `POST /feedback` → append the JSON body to `backend/feedback.jsonl`, return
  `{"ok": true}`.
- `GET /api/tokens?chat_id=` → `{"total_tokens": N}` from an in-memory
  `dict[chat_id] -> int` updated after each completion (prompt + completion
  tokens). Empty/unknown chat → `0`.
- `GET /` and `GET /health` → `{"ok": true}` (handy for tunnel checks).

### 5. CORS

`fastapi.middleware.cors.CORSMiddleware` with `allow_origins=["*"]`,
`allow_methods=["*"]`, `allow_headers=["*"]` so preflight from any origin
(file:// pages send `Origin: null`) succeeds.

## Data flow (chat message)

1. User sends in `AI/chat.html` → `sendMessage()` POSTs messages to
  `http://localhost:8001/v1/chat/completions` (or the tunneled origin).
2. Server applies Gemma chat template, streams tokens via SSE.
3. Frontend typewriter drains `window.streamQueue` at 80 chars/s (200 inside
   `<think>`), renders markdown live.
4. On `[DONE]`, frontend saves the chat; `generateChatTitle()` fires a
   non-stream request for a title; `/api/tokens` updates the counter.
5. Stop button → abort + `POST /cancel_job` → server halts the token loop.

`search/index.html?q=...&ai=1` does Brave search client-side, then POSTs
system+user (with snippets) to the same endpoint with `stream:true`.

## Error handling

- Model load failure at startup → crash loudly with a clear message (temp
  script; no silent fallback).
- Malformed request body → FastAPI 422 (frontend shows its error toast).
- Exception mid-generation → SSE error chunk is not part of the protocol;
  instead close the stream after emitting a final delta containing
  `\n\n⚠️ Backend error: ...` so the user sees it in the bubble.
- Unknown endpoints the frontend might call (accounts, KV cache, voice) →
  default 404; the frontend already catches and warns without breaking.

## Testing

No automated test suite exists in this repo; verification is manual:

1. `curl -N -X POST localhost:8001/v1/chat/completions` with
   `{"model":"saga-0.7b","messages":[{"role":"user","content":"hi"}],"stream":true}`
   → observe SSE chunks + `data: [DONE]`.
2. Same with `"stream":false` → valid OpenAI JSON (title-generation shape).
3. `curl localhost:8001/tunnel_url`, `/api/system_prompts`, `/api/tokens` → 200.
4. Open `AI/chat.html`, set Backend URL to `http://localhost:8001` (or open via
   the tunnel), send a message → typewriter streams; press Stop mid-stream →
   generation halts, no red console errors.
5. Open `search/index.html?q=test&ai=1` → Ask Astra panel streams an answer.
6. Repeat one chat flow through `https://api.okemovail.com` to confirm the
   tunnel path works.

## Out of scope

- Accounts / cloud chat storage (`/api/accounts/*`, KV cache) — frontend
  already degrades gracefully.
- Voice mode (`/v1/audio/transcriptions`, `/v1/audio/speech`).
- Real web search (frontend `web_search:true` is accepted but ignored; no
  `sources` side-channel events are emitted).
- Authentication / API-key enforcement (the `Authorization` header is
  accepted and ignored).
