from fastapi.testclient import TestClient

import server

client = TestClient(server.app)


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
