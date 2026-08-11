# Temp MLX Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file FastAPI + MLX backend in `backend/` that serves `AI/chat.html` and `search/index.html` with a local Gemma 3 4B model on `localhost:8001` (tunneled to `api.okemovail.com` via the user's existing cloudflared tunnel).

**Architecture:** One `server.py` — FastAPI app with permissive CORS, lazy-loaded `mlx-lm` model (`mlx-community/gemma-3-4b-it-qat-4bit`), OpenAI-shaped SSE streaming from `mlx_lm.stream_generate`, a global generation lock, a cancel-job set, an in-memory per-chat token counter, and JSON stubs for the frontend's auxiliary endpoints. Spec: `docs/superpowers/specs/2026-08-11-temp-mlx-backend-design.md`.

**Tech Stack:** Python 3, FastAPI, uvicorn, mlx-lm (Apple Silicon), pytest + httpx TestClient (tests use a fake model — no 2.5GB download in the test loop).

**Commit style:** this repo uses conventional commits, lowercase, scoped (e.g. `feat(astra): ...`). Use `feat(backend): ...` / `docs: ...` below.

---

### Task 1: Scaffold + health endpoint

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/conftest.py`
- Create: `backend/server.py`
- Create: `backend/tests/test_server.py`

- [ ] **Step 1: Create `backend/requirements.txt`**

```text
mlx-lm
fastapi
uvicorn[standard]
pytest
httpx
```

- [ ] **Step 2: Create the venv and install**

Run:
```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install -r requirements.txt
```
Expected: installs finish without errors (mlx-lm pulls `mlx`, `transformers`, etc.). This is the only dependency-install step; every later command uses `backend/.venv/bin/...`.

- [ ] **Step 3: Create empty `backend/conftest.py`**

Its mere presence makes pytest put `backend/` on `sys.path` so tests can `import server`. Content: empty file (0 bytes is fine).

- [ ] **Step 4: Write the failing health test — `backend/tests/test_server.py`**

```python
from fastapi.testclient import TestClient

import server

client = TestClient(server.app)


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server'`.

- [ ] **Step 6: Write minimal `backend/server.py`**

```python
"""Temp MLX backend for the Oaky chat frontend + Okemo Astra search page.

OpenAI-compatible /v1/chat/completions (SSE streaming) plus light stubs for
the auxiliary endpoints the frontend calls. Spec:
docs/superpowers/specs/2026-08-11-temp-mlx-backend-design.md
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

MODEL_ID = os.environ.get("MODEL_ID", "mlx-community/gemma-3-4b-it-qat-4bit")

app = FastAPI(title="oaky-temp-backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
@app.get("/health")
def health():
    return {"ok": True}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: PASS — `1 passed`.

- [ ] **Step 8: Commit**

```bash
git add backend/requirements.txt backend/conftest.py backend/server.py backend/tests/test_server.py
git commit -m "feat(backend): scaffold fastapi app with health endpoint"
```

---

### Task 2: Stub endpoints (tunnel_url, system_prompts, feedback, tokens, cancel_job)

**Files:**
- Modify: `backend/server.py`
- Modify: `backend/tests/test_server.py`

- [ ] **Step 1: Write the failing stub tests — append to `backend/tests/test_server.py`**

```python
def test_tunnel_url():
    r = client.get("/tunnel_url")
    assert r.status_code == 200
    assert r.json() == {"tunnel_url": "https://api.okemovail.com"}


def test_system_prompts_shape():
    r = client.get("/api/system_prompts")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data["personalities"], list)
    assert data["personalities"][0]["id"] == "default"
    assert "identity_lock" in data
    assert "global_rules" in data


def test_feedback_appends_jsonl(tmp_path, monkeypatch):
    log = tmp_path / "feedback.jsonl"
    monkeypatch.setattr(server, "FEEDBACK_LOG", str(log))
    r = client.post("/feedback", json={"rating": "good", "text": "nice"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    lines = log.read_text().strip().splitlines()
    assert len(lines) == 1
    assert '"rating": "good"' in lines[0]


def test_tokens_unknown_chat_is_zero():
    r = client.get("/api/tokens", params={"chat_id": "nope"})
    assert r.status_code == 200
    assert r.json() == {"total_tokens": 0}


def test_cancel_job_ok():
    r = client.post("/cancel_job", json={"job_id": "abc123"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert "abc123" in server.cancelled_jobs
    server.cancelled_jobs.discard("abc123")
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: 5 FAIL — 404s / missing attributes (`server.cancelled_jobs`).

- [ ] **Step 3: Implement the stubs — replace `backend/server.py` content after the CORS block**

Replace everything below the `app.add_middleware(...)` block (including the existing `health` route, which is repeated here) with:

```python
TUNNEL_URL = os.environ.get("TUNNEL_URL", "https://api.okemovail.com")
FEEDBACK_LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "feedback.jsonl")

cancelled_jobs = set()
chat_tokens = {}

IDENTITY_LOCK = "Your name is Saga. You were built by OkemoVail."
GLOBAL_RULES = "\n".join([
    "Language rule:",
    "- If the user writes in Chinese, always reply in Traditional Chinese. Never use Simplified Chinese.",
    "",
    "Code generation rules (HTML / web UI):",
    "- Use Tailwind CSS utility classes ONLY. No custom <style> blocks, no separate CSS files, no inline style=\"...\" unless the user explicitly asks. Tailwind keeps output compact and saves tokens.",
    "- For standalone HTML, load Tailwind via <script src=\"https://cdn.tailwindcss.com\"></script> in the <head>.",
    "- Configure Tailwind to follow the OS theme automatically. Before the CDN script, include:",
    "    <script>tailwind.config = { darkMode: 'media' }</script>",
    "  Then every component MUST ship paired classes: a light variant AND a `dark:` variant for every color-affecting utility (bg, text, border, ring, divide, placeholder, from/to, etc.). Examples:",
    "    bg-white dark:bg-zinc-900   text-zinc-900 dark:text-zinc-100",
    "    border-zinc-200 dark:border-zinc-800   hover:bg-zinc-100 dark:hover:bg-zinc-800",
    "- The page must look polished and readable in BOTH light and dark mode with no extra user action. Always set a base on <body> like `class=\"bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100\"` so the canvas preview adapts whether the host UI is light or dark.",
    "- Prefer concise, idiomatic Tailwind. No redundant utility chains.",
    "",
    "Clarification rule:",
    "- If the user's task is ambiguous, underspecified, or complex enough that you cannot confidently produce a correct answer, ask 1–3 short, specific follow-up questions BEFORE writing code or a long answer. Do not guess silently. Simple, clear tasks: just answer.",
])
SYSTEM_PROMPTS = {
    "personalities": [
        {"id": "default", "label": "Saga", "prompt": "You are Saga, a helpful AI assistant made by OkemoVail."},
    ],
    "identity_lock": IDENTITY_LOCK,
    "global_rules": GLOBAL_RULES,
}


@app.get("/")
@app.get("/health")
def health():
    return {"ok": True}


@app.get("/tunnel_url")
def tunnel_url():
    return {"tunnel_url": TUNNEL_URL}


@app.get("/api/system_prompts")
def system_prompts():
    return SYSTEM_PROMPTS


@app.post("/feedback")
def feedback(body: dict):
    import json, time
    with open(FEEDBACK_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": int(time.time()), **body}, ensure_ascii=False) + "\n")
    return {"ok": True}


@app.get("/api/tokens")
def tokens(chat_id: str = ""):
    return {"total_tokens": chat_tokens.get(chat_id, 0)}


@app.post("/cancel_job")
def cancel_job(body: dict):
    jid = body.get("job_id")
    if jid:
        cancelled_jobs.add(jid)
    return {"ok": True}
```

(The `import json, time` inside `feedback` moves to the top of the file in Task 3; keeping it local here keeps this task's diff minimal.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: PASS — `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_server.py
git commit -m "feat(backend): add frontend stub endpoints (tunnel_url, system_prompts, feedback, tokens, cancel_job)"
```

---

### Task 3: `/v1/chat/completions` — streaming + non-streaming (fake model in tests)

**Files:**
- Modify: `backend/server.py`
- Modify: `backend/tests/test_server.py`

- [ ] **Step 1: Write the failing completion tests — append to `backend/tests/test_server.py`**

```python
import json

import pytest


class FakeResp:
    def __init__(self, text, finish_reason=None, prompt_tokens=7, generation_tokens=1):
        self.text = text
        self.finish_reason = finish_reason
        self.prompt_tokens = prompt_tokens
        self.generation_tokens = generation_tokens


class FakeTokenizer:
    def apply_chat_template(self, messages, tokenize=False, add_generation_prompt=True):
        return " | ".join(f"{m['role']}:{m['content']}" for m in messages) + " | assistant:"


@pytest.fixture
def fake_model(monkeypatch):
    monkeypatch.setattr(server, "model", object())
    monkeypatch.setattr(server, "tokenizer", FakeTokenizer())
    captured = {}

    def fake_stream_generate(model, tokenizer, prompt=None, max_tokens=512,
                             sampler=None, logits_processors=None, **kw):
        captured["prompt"] = prompt
        pieces = ["Hello", ", world"]
        for i, t in enumerate(pieces):
            yield FakeResp(t, finish_reason="stop" if i == len(pieces) - 1 else None,
                           generation_tokens=i + 1)

    monkeypatch.setattr(server.mlx_lm, "stream_generate", fake_stream_generate)
    server.chat_tokens.clear()
    server.cancelled_jobs.clear()
    yield captured
    monkeypatch.setattr(server, "model", None)
    monkeypatch.setattr(server, "tokenizer", None)


def _sse_payloads(text):
    return [line.strip()[6:] for line in text.splitlines() if line.strip().startswith("data: ")]


def test_completion_non_stream(fake_model):
    r = client.post("/v1/chat/completions", json={
        "model": "saga-0.7b",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": False,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["choices"][0]["message"]["role"] == "assistant"
    assert data["choices"][0]["message"]["content"] == "Hello, world"
    assert data["choices"][0]["finish_reason"] == "stop"
    assert data["usage"]["prompt_tokens"] == 7
    assert data["usage"]["completion_tokens"] == 2
    assert data["usage"]["total_tokens"] == 9


def test_completion_stream_sse(fake_model):
    r = client.post("/v1/chat/completions", json={
        "model": "saga-0.7b",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": True,
    })
    assert r.status_code == 200
    payloads = _sse_payloads(r.text)
    assert payloads[-1] == "[DONE]"
    chunks = [json.loads(p) for p in payloads[:-1]]
    text = "".join(c["choices"][0]["delta"].get("content", "") for c in chunks)
    assert text == "Hello, world"
    assert chunks[-1]["choices"][0]["finish_reason"] == "stop"
    assert all(c["object"] == "chat.completion.chunk" for c in chunks)


def test_completion_attachment_prepended(fake_model):
    client.post("/v1/chat/completions", json={
        "model": "saga-0.7b",
        "messages": [{"role": "user", "content": "summarize this"}],
        "stream": False,
        "attachment": {"name": "notes.txt", "text_content": "FILE BODY"},
    })
    assert "[File: notes.txt]" in fake_model["prompt"]
    assert "FILE BODY" in fake_model["prompt"]
    assert "summarize this" in fake_model["prompt"]


def test_completion_cancel_job_stops_stream(fake_model):
    client.post("/cancel_job", json={"job_id": "job-x"})
    r = client.post("/v1/chat/completions", json={
        "model": "saga-0.7b",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": True,
        "job_id": "job-x",
    })
    payloads = _sse_payloads(r.text)
    chunks = [json.loads(p) for p in payloads[:-1]]
    text = "".join(c["choices"][0]["delta"].get("content", "") for c in chunks)
    assert text == ""
    assert "job-x" not in server.cancelled_jobs  # cleaned up after the run


def test_tokens_accumulate_per_chat(fake_model):
    client.post("/v1/chat/completions", json={
        "model": "saga-0.7b",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": False,
        "chat_id": "chat-1",
    })
    r = client.get("/api/tokens", params={"chat_id": "chat-1"})
    assert r.json() == {"total_tokens": 9}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: 5 FAIL — 404 on `/v1/chat/completions`.

- [ ] **Step 3: Implement completions — modify `backend/server.py`**

At the top of the file, replace `import os` with:

```python
import json
import os
import threading
import time
import uuid

import mlx_lm
from mlx_lm.sample_utils import make_sampler, make_logits_processors
from fastapi.responses import StreamingResponse
```

Remove the now-redundant local `import json, time` inside `feedback()`.

Add `gen_lock = threading.Lock()` next to the other globals (`cancelled_jobs = set()` etc.), then append this whole block at the end of the file:

```python
model = None
tokenizer = None


def ensure_model():
    global model, tokenizer
    if model is None:
        print(f"[backend] loading {MODEL_ID} ...", flush=True)
        model, tokenizer = mlx_lm.load(MODEL_ID)
        print("[backend] model loaded", flush=True)


def build_prompt(messages, attachment=None):
    msgs = [{"role": m.get("role", "user"), "content": m.get("content") or ""}
            for m in messages if isinstance(m, dict)]
    msgs = [m for m in msgs if m["content"].strip()]
    if attachment and isinstance(attachment, dict) and attachment.get("text_content"):
        for m in reversed(msgs):
            if m["role"] == "user":
                m["content"] = (f"[File: {attachment.get('name', 'file')}]\n"
                                f"{attachment['text_content']}\n\n{m['content']}")
                break
    return tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)


def generate_pieces(body):
    """Yield (text, prompt_tokens, generation_tokens, finish_reason) tuples.

    Stops early (yielding a single stop tuple) when the job was cancelled via
    /cancel_job. Runs under gen_lock held by the caller.
    """
    ensure_model()
    prompt = build_prompt(body.get("messages") or [], body.get("attachment"))
    job_id = body.get("job_id")
    sampler = make_sampler(temp=body.get("temperature", 1.0),
                           top_p=body.get("top_p", 1.0))
    rep_pen = body.get("repetition_penalty", 1.0)
    procs = (make_logits_processors(repetition_penalty=rep_pen)
             if rep_pen and rep_pen != 1.0 else None)
    for resp in mlx_lm.stream_generate(
            model, tokenizer, prompt=prompt,
            max_tokens=body.get("max_tokens") or 512,
            sampler=sampler, logits_processors=procs):
        if job_id and job_id in cancelled_jobs:
            yield "", 0, 0, "stop"
            return
        yield (resp.text,
               getattr(resp, "prompt_tokens", 0),
               getattr(resp, "generation_tokens", 0),
               getattr(resp, "finish_reason", None))


def _record_tokens(body, ptok, gtok):
    cid = body.get("chat_id")
    if cid:
        chat_tokens[cid] = chat_tokens.get(cid, 0) + ptok + gtok


def _chunk(cid, created, model_id, delta, finish_reason):
    return {"id": cid, "object": "chat.completion.chunk", "created": created,
            "model": model_id,
            "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}]}


@app.post("/v1/chat/completions")
def chat_completions(body: dict):
    model_id = body.get("model") or MODEL_ID
    created = int(time.time())
    cid = "chatcmpl-" + uuid.uuid4().hex[:24]

    if body.get("stream"):
        def sse():
            ptok, gtok, finish = 0, 0, "stop"
            with gen_lock:
                try:
                    for text, p, g, fr in generate_pieces(body):
                        ptok, gtok = p or ptok, g or gtok
                        if text:
                            yield f"data: {json.dumps(_chunk(cid, created, model_id, {'content': text}, None), ensure_ascii=False)}\n\n"
                        if fr:
                            finish = fr
                except Exception as e:
                    yield f"data: {json.dumps(_chunk(cid, created, model_id, {'content': f'⚠️ Backend error: {e}'}, None), ensure_ascii=False)}\n\n"
                finally:
                    cancelled_jobs.discard(body.get("job_id"))
                    _record_tokens(body, ptok, gtok)
            yield f"data: {json.dumps(_chunk(cid, created, model_id, {}, finish))}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(sse(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache",
                                          "X-Accel-Buffering": "no"})

    full, ptok, gtok, finish = [], 0, 0, "stop"
    with gen_lock:
        try:
            for text, p, g, fr in generate_pieces(body):
                ptok, gtok = p or ptok, g or gtok
                if text:
                    full.append(text)
                if fr:
                    finish = fr
        finally:
            cancelled_jobs.discard(body.get("job_id"))
            _record_tokens(body, ptok, gtok)
    return {
        "id": cid, "object": "chat.completion", "created": created,
        "model": model_id,
        "choices": [{"index": 0,
                     "message": {"role": "assistant", "content": "".join(full)},
                     "finish_reason": finish}],
        "usage": {"prompt_tokens": ptok, "completion_tokens": gtok,
                  "total_tokens": ptok + gtok},
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: PASS — `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_server.py
git commit -m "feat(backend): openai-compatible chat completions via mlx-lm with sse streaming"
```

---

### Task 4: `run.sh`, `.gitignore`, real-model smoke test

**Files:**
- Create: `backend/run.sh`
- Modify: `.gitignore`

- [ ] **Step 1: Create `backend/run.sh`**

```bash
#!/usr/bin/env bash
# Temp MLX backend — creates .venv on first run, then serves on 127.0.0.1:8001.
# First model load downloads ~2.5GB to ~/.cache/huggingface.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi
exec .venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
```

Run: `chmod +x backend/run.sh`

- [ ] **Step 2: Add backend artifacts to `.gitignore`**

Append at the end of `.gitignore`:

```gitignore
# Temp MLX backend
backend/.venv/
backend/__pycache__/
backend/feedback.jsonl
```

- [ ] **Step 3: Start the server (real model)**

Run: `./backend/run.sh`
Expected: `[backend] loading mlx-community/gemma-3-4b-it-qat-4bit ...` then (first run only, ~2.5GB download) `Uvicorn running on http://127.0.0.1:8001`. Leave it running in a dedicated terminal for the next steps.

- [ ] **Step 4: Smoke-test streaming with curl**

Run:
```bash
curl -N -X POST http://localhost:8001/v1/chat/completions -H 'Content-Type: application/json' -d '{"model":"saga-0.7b","messages":[{"role":"user","content":"Say hello in one short sentence."}],"max_tokens":64,"stream":true}'
```
Expected: `data: {...}` lines appear incrementally, then a chunk with `"finish_reason":"stop"`, then `data: [DONE]`.

- [ ] **Step 5: Smoke-test non-streaming (title-generation shape)**

Run:
```bash
curl -s -X POST http://localhost:8001/v1/chat/completions -H 'Content-Type: application/json' -d '{"model":"saga-0.7b","messages":[{"role":"user","content":"Say hi."}],"max_tokens":32,"stream":false}'
```
Expected: JSON with `choices[0].message.content` and a `usage` object.

- [ ] **Step 6: Smoke-test the stubs**

Run:
```bash
curl -s http://localhost:8001/tunnel_url && curl -s http://localhost:8001/api/system_prompts | head -c 200 && curl -s "http://localhost:8001/api/tokens?chat_id=x"
```
Expected: `{"tunnel_url":"https://api.okemovail.com"}`, JSON starting with `{"personalities":...`, `{"total_tokens":0}`.

- [ ] **Step 7: Browser check — chat**

Start cloudflared (user's existing named tunnel, their own command). Open `AI/chat.html`, send a message. Expected: typewriter streams a reply; Stop mid-stream halts it; no red errors in devtools console; title auto-generates after the reply.

- [ ] **Step 8: Browser check — Astra search**

Open `search/index.html?q=what+is+mlx&ai=1`. Expected: the "✦ Ask Astra" panel streams an answer citing the Brave results.

- [ ] **Step 9: Commit**

```bash
git add backend/run.sh .gitignore
git commit -m "feat(backend): add run.sh launcher and gitignore venv/artifacts"
```

---

### Task 5: Document the temp backend in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (the `### Backend` section under Architecture)

- [ ] **Step 1: Update the Backend section**

In `CLAUDE.md`, find the section starting `### Backend` and replace the paragraph:

```markdown
The app talks to a self-hosted OpenAI-compatible backend at `https://api.okemovail.com`. At boot, `main.js` fetches `/tunnel_url` to auto-detect a dynamic tunnel URL and stores it in `vail_custom_backend_url`. Override via `localStorage.setItem('vail_custom_backend_url', ...)` or the Settings panel.
```

with:

```markdown
The app talks to a self-hosted OpenAI-compatible backend at `https://api.okemovail.com`. At boot, `main.js` fetches `/tunnel_url` to auto-detect a dynamic tunnel URL and stores it in `vail_custom_backend_url`. Override via `localStorage.setItem('vail_custom_backend_url', ...)` or the Settings panel.

**Temp local backend (2026-08-11):** `backend/server.py` is a single-file FastAPI + mlx-lm server (Gemma 3 4B QAT 4-bit by default, `MODEL_ID` env to swap) that implements `/v1/chat/completions` (SSE + non-stream) plus stubs for `/tunnel_url`, `/api/system_prompts`, `/feedback`, `/api/tokens`, `/cancel_job`. Run `./backend/run.sh` → `127.0.0.1:8001`; the existing cloudflared named tunnel exposes it as `api.okemovail.com`. Tests: `cd backend && .venv/bin/python -m pytest tests/ -v` (fake model — no download). Spec: `docs/superpowers/specs/2026-08-11-temp-mlx-backend-design.md`. No accounts/cloud storage/voice — the real backend remains the separate `OkemoLLM` repo.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document temp mlx backend in backend/"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** model wrapper (Task 3 `ensure_model`/`generate_pieces`), SSE + non-stream (Task 3), cancel via `/cancel_job` (Tasks 2+3), all five stubs (Task 2), CORS (Task 1), attachment prepend (Task 3 `build_prompt`), token counting (Tasks 2+3), run.sh + gitignore (Task 4), CLAUDE.md (Task 5). Frontend wire shapes match `chat-actions.js` (SSE `data:`/`[DONE]`/`finish_reason`), `chat-management.js` (`stream:false` → `choices[0].message.content`), `main.js` (`tunnel_url`), `feedback.js` (`total_tokens`), `astra.js` (same SSE).
- **Type consistency:** `generate_pieces` yields `(text, prompt_tokens, generation_tokens, finish_reason)` — consumed identically in both branches; `_chunk(cid, created, model_id, delta, finish_reason)` signature matches all call sites; globals `model`, `tokenizer`, `cancelled_jobs`, `chat_tokens`, `FEEDBACK_LOG` named identically in tests and implementation.
- **Placeholder scan:** none — every code step contains complete code.
- **Known accepted limitations (per spec):** disconnect detection is best-effort (sync generator in threadpool) — the Stop button's `/cancel_job` is the reliable cancel path; generation is serialized under one lock; no auth.
