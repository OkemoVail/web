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
