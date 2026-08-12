import httpx
import pytest

import server

LITE_HTML = """
<html><body>
<table border="0" cellpadding="0" cellspacing="0">
  <tr><td valign="top">
    <a rel="nofollow" href="https://example.com/blue" class="result-link">Why Is the
       Sky Blue?</a>
  </td></tr>
  <tr><td class="result-snippet">Blue light scatters more than other colors.</td></tr>
  <tr><td class="result-url">example.com/blue</td></tr>
  <tr><td>&nbsp;</td></tr>
  <tr><td valign="top">
    <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwiki.example%2FRayleigh" class="result-link">Rayleigh scattering</a>
  </td></tr>
  <tr><td class="result-snippet">Scattering of light by small particles.</td></tr>
  <tr><td class="result-url">wiki.example/Rayleigh</td></tr>
  <tr><td>&nbsp;</td></tr>
  <tr><td valign="top">
    <a rel="nofollow" href="//duckduckgo.com/y.js?ad_domain=ads.example" class="result-link">Sponsored junk</a>
  </td></tr>
  <tr><td class="result-snippet">Buy things now.</td></tr>
  <tr><td>&nbsp;</td></tr>
</table>
</body></html>
"""


def test_parse_ddg_lite_extracts_results():
    results = server.parse_ddg_lite(LITE_HTML)
    assert len(results) == 2
    assert results[0] == {
        "title": "Why Is the Sky Blue?",
        "url": "https://example.com/blue",
        "description": "Blue light scatters more than other colors.",
    }


def test_parse_ddg_lite_unwraps_uddg_redirects():
    results = server.parse_ddg_lite(LITE_HTML)
    assert results[1]["url"] == "https://wiki.example/Rayleigh"
    assert results[1]["title"] == "Rayleigh scattering"


def test_parse_ddg_lite_skips_ads_and_garbage():
    # the fixture's third row is an ad (y.js?ad_domain=…) — the count==2
    # assertion above covers it; here: garbage in, empty list out, no crash
    assert server.parse_ddg_lite("") == []
    assert server.parse_ddg_lite("<p>hello</p>") == []
    assert server.parse_ddg_lite(None) == []


def test_parse_ddg_lite_explicitly_excludes_ad_rows():
    results = server.parse_ddg_lite(LITE_HTML)
    assert all("ads.example" not in r["url"] and r["title"] != "Sponsored junk"
               for r in results)


def test_unwrap_ddg_url_relative_redirect():
    assert server._unwrap_ddg_url("/l/?uddg=https%3A%2F%2Fexample.com%2Fx") == "https://example.com/x"


class FakeHTTPResp:
    def __init__(self, status_code=200, text="", payload=None):
        self.status_code = status_code
        self.text = text
        self._payload = payload

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


@pytest.fixture(autouse=True)
def clear_caches():
    server._search_cache.clear()
    server._suggest_cache.clear()
    yield


def _fake_http(monkeypatch, responses):
    """Monkeypatch server._http_get with a scripted sequence. Returns call count dict."""
    calls = {"n": 0}

    def fake(url, **kw):
        r = responses[min(calls["n"], len(responses) - 1)]
        calls["n"] += 1
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(server, "_http_get", fake)
    return calls


def test_api_search_happy_path(monkeypatch):
    calls = _fake_http(monkeypatch, [FakeHTTPResp(200, LITE_HTML)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "why is the sky blue"})
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 2
    assert results[0]["url"] == "https://example.com/blue"
    assert calls["n"] == 1


def test_api_search_cache_hit_skips_upstream(monkeypatch):
    calls = _fake_http(monkeypatch, [FakeHTTPResp(200, LITE_HTML)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    client.get("/api/search", params={"q": "sky"})
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 200
    assert len(r.json()["results"]) == 2
    assert calls["n"] == 1  # second call served from cache


def test_api_search_retries_202_then_succeeds(monkeypatch):
    calls = _fake_http(monkeypatch, [FakeHTTPResp(202), FakeHTTPResp(200, LITE_HTML)])
    monkeypatch.setattr(server.time, "sleep", lambda *_: None)
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 200
    assert calls["n"] == 2


def test_api_search_double_202_gives_429(monkeypatch):
    _fake_http(monkeypatch, [FakeHTTPResp(202), FakeHTTPResp(202)])
    monkeypatch.setattr(server.time, "sleep", lambda *_: None)
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 429
    assert r.json() == {"error": "rate_limited"}


def test_api_search_network_error_gives_502(monkeypatch):
    _fake_http(monkeypatch, [httpx.HTTPError("boom")])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 502
    assert r.json() == {"error": "upstream"}


def test_api_search_empty_query_never_calls_upstream(monkeypatch):
    calls = _fake_http(monkeypatch, [FakeHTTPResp(200, LITE_HTML)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "   "})
    assert r.status_code == 200
    assert r.json() == {"results": []}
    assert calls["n"] == 0


def test_api_search_errors_do_not_poison_cache(monkeypatch):
    calls = _fake_http(monkeypatch, [FakeHTTPResp(202), FakeHTTPResp(202), FakeHTTPResp(200, LITE_HTML)])
    monkeypatch.setattr(server.time, "sleep", lambda *_: None)
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    assert client.get("/api/search", params={"q": "sky"}).status_code == 429
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 200          # not served a cached error
    assert len(r.json()["results"]) == 2
    assert calls["n"] == 3               # went upstream again


def test_api_suggest_happy_path(monkeypatch):
    payload = [{"phrase": "sky blue"}, {"phrase": "skyrim"}]
    calls = _fake_http(monkeypatch, [FakeHTTPResp(200, payload=payload)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/suggest", params={"q": "sky"})
    assert r.status_code == 200
    assert r.json() == ["sky blue", "skyrim"]
    assert calls["n"] == 1


def test_api_suggest_caps_at_six(monkeypatch):
    payload = [{"phrase": f"s{i}"} for i in range(8)]
    _fake_http(monkeypatch, [FakeHTTPResp(200, payload=payload)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/suggest", params={"q": "s"})
    assert r.json() == [f"s{i}" for i in range(6)]


def test_api_suggest_cache_hit_skips_upstream(monkeypatch):
    calls = _fake_http(monkeypatch, [FakeHTTPResp(200, payload=[{"phrase": "sky"}])])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    client.get("/api/suggest", params={"q": "sky"})
    r = client.get("/api/suggest", params={"q": "sky"})
    assert r.json() == ["sky"]
    assert calls["n"] == 1


def test_api_suggest_malformed_json_returns_empty(monkeypatch):
    _fake_http(monkeypatch, [FakeHTTPResp(200, payload=None)])  # .json() raises ValueError
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/suggest", params={"q": "sky"})
    assert r.status_code == 200
    assert r.json() == []


def test_api_suggest_scalar_json_root_returns_empty(monkeypatch):
    _fake_http(monkeypatch, [FakeHTTPResp(200, payload=5)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/suggest", params={"q": "sky"})
    assert r.status_code == 200
    assert r.json() == []


def test_api_suggest_upstream_500_gives_502(monkeypatch):
    _fake_http(monkeypatch, [FakeHTTPResp(500)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/suggest", params={"q": "sky"})
    assert r.status_code == 502
    assert r.json() == {"error": "upstream"}


def test_api_suggest_ddg_tuple_format(monkeypatch):
    # DDG /ac/?type=list actually answers ["query", ["s1", "s2", …]]
    payload = ["sky", ["sky blue", "skyrim", "sky news"]]
    calls = _fake_http(monkeypatch, [FakeHTTPResp(200, payload=payload)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/suggest", params={"q": "sky"})
    assert r.status_code == 200
    assert r.json() == ["sky blue", "skyrim", "sky news"]
    assert calls["n"] == 1


def test_api_suggest_retries_202_then_succeeds(monkeypatch):
    calls = _fake_http(monkeypatch, [FakeHTTPResp(202), FakeHTTPResp(200, payload=["sky", ["sky blue"]])])
    monkeypatch.setattr(server.time, "sleep", lambda *_: None)
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/suggest", params={"q": "sky"})
    assert r.status_code == 200
    assert r.json() == ["sky blue"]
    assert calls["n"] == 2
