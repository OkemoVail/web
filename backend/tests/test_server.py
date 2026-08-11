import asyncio
import json
import threading

import pytest
from fastapi.testclient import TestClient

import server

client = TestClient(server.app)


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


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


def test_system_prompts_all_nine_personalities():
    r = client.get("/api/system_prompts")
    assert r.status_code == 200
    ps = r.json()["personalities"]
    assert [p["id"] for p in ps] == [
        "default", "concise", "creative", "coder", "tutor",
        "sarcastic", "analyst", "discord-friend", "friend",
    ]
    for p in ps:
        assert p["label"].strip(), f"{p['id']} has empty label"
        assert p["prompt"].strip(), f"{p['id']} has empty prompt"


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


def test_abandoned_stream_does_not_block_next_request(fake_model):
    # Simulates a mid-stream client disconnect: one chunk is consumed, then the
    # generator is abandoned without being closed — on the old code gen_lock
    # stayed held (deadlock); now the lock lives in the worker thread, not the
    # generator, so the next request must still complete.
    # (Note: `client` is used from a worker thread below; safe here because the
    # join serializes the two requests.)
    resp = server.chat_completions({
        "model": "saga-0.7b",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": True,
    })
    # StreamingResponse wraps the sync generator with iterate_in_threadpool,
    # so body_iterator is an async generator; consume exactly one chunk and
    # then abandon it (never resumed, never closed) to mimic the disconnect.
    it = resp.body_iterator
    assert asyncio.run(it.__anext__()).startswith("data: ")

    result = {}

    def second_request():
        r = client.post("/v1/chat/completions", json={
            "model": "saga-0.7b",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": False,
        })
        result["status"] = r.status_code

    t = threading.Thread(target=second_request, daemon=True)
    t.start()
    t.join(timeout=10)
    del it  # now allow cleanup of the abandoned stream
    assert not t.is_alive(), "second request blocked (lock not released)"
    assert result.get("status") == 200
