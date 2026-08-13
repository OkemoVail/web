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


BING_HTML = """
<html><body>
<ol id="b_results">
  <li class="b_algo">
    <h2><a href="https://example.com/sky" target="_blank">Why the Sky Is Blue</a></h2>
    <p>Rayleigh scattering makes the sky appear blue.</p>
  </li>
  <li class="b_algo">
    <h2><a href="/ck/a?p=aaa&u=a1aHR0cHM6Ly93aWtpLmV4YW1wbGUvUmF5bGVpZ2g&ntb=1">Rayleigh scattering</a></h2>
    <p>Elastic scattering of light by small particles.</p>
  </li>
  <li class="b_ad"><h2><a href="https://ads.example/x">Sponsored junk</a></h2><p>Buy things.</p></li>
</ol>
</body></html>
"""


def test_unwrap_bing_url_direct_passthrough():
    assert server._unwrap_bing_url("https://example.com/x") == "https://example.com/x"


def test_unwrap_bing_url_ck_redirect():
    # bing wraps outbound links as /ck/a?...&u=a1<base64url-no-padding>
    assert server._unwrap_bing_url("/ck/a?p=aaa&u=a1aHR0cHM6Ly93aWtpLmV4YW1wbGUvUmF5bGVpZ2g&ntb=1") == "https://wiki.example/Rayleigh"


def test_unwrap_bing_url_garbage():
    assert server._unwrap_bing_url("/ck/a?x=1") == ""        # no u param
    assert server._unwrap_bing_url("/ck/a?u=b2aaaa") == ""   # u without the a1 marker
    assert server._unwrap_bing_url("") == ""


def test_parse_bing_extracts_results():
    results = server.parse_bing(BING_HTML)
    assert len(results) == 2
    assert results[0] == {"title": "Why the Sky Is Blue",
                          "url": "https://example.com/sky",
                          "description": "Rayleigh scattering makes the sky appear blue."}


def test_parse_bing_unwraps_ck_redirects():
    assert server.parse_bing(BING_HTML)[1]["url"] == "https://wiki.example/Rayleigh"


def test_parse_bing_skips_ads_and_garbage():
    results = server.parse_bing(BING_HTML)
    assert all("ads.example" not in r["url"] for r in results)   # b_ad li ignored
    assert server.parse_bing("") == []
    assert server.parse_bing(None) == []


MOJEEK_HTML = """
<html><body>
<ul class="results-standard">
  <li>
    <h2><a href="https://example.com/sky">Why the Sky Is Blue</a></h2>
    <p class="s">Rayleigh scattering makes the sky appear blue.</p>
  </li>
  <li>
    <h2><a href="https://wiki.example/Rayleigh">Rayleigh scattering</a></h2>
    <p class="s">Elastic scattering by small particles.</p>
  </li>
  <li>
    <h2><a href="https://example.com/nodesc">No snippet here</a></h2>
  </li>
</ul>
<ul class="pagination"><li><a href="?s=10">Next</a></li></ul>
</body></html>
"""


def test_parse_mojeek_extracts_results():
    results = server.parse_mojeek(MOJEEK_HTML)
    assert results == [
        {"title": "Why the Sky Is Blue", "url": "https://example.com/sky",
         "description": "Rayleigh scattering makes the sky appear blue."},
        {"title": "Rayleigh scattering", "url": "https://wiki.example/Rayleigh",
         "description": "Elastic scattering by small particles."},
    ]   # the no-snippet row and the pagination <ul> are dropped


def test_parse_mojeek_garbage():
    assert server.parse_mojeek("") == []
    assert server.parse_mojeek(None) == []


BING_HTML_PAGE2 = """
<html><body>
<ol id="b_results">
  <li class="b_algo">
    <h2><a href="https://example.com/blue">Why Is the Sky Blue?</a></h2>
    <p>Repeated from page one.</p>
  </li>
  <li class="b_algo">
    <h2><a href="https://example.com/ozone">Ozone layer</a></h2>
    <p>A different page-two result.</p>
  </li>
</ol>
</body></html>
"""


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
    server._images_cache.clear()
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


def _fake_http_capture(monkeypatch, responses):
    """Like _fake_http but also records the url and params kwarg of each call."""
    calls = {"n": 0, "urls": [], "params": []}

    def fake(url, **kw):
        calls["urls"].append(url)
        calls["params"].append(kw.get("params"))
        r = responses[min(calls["n"], len(responses) - 1)]
        calls["n"] += 1
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(server, "_http_get", fake)
    return calls


LITE_HTML_PAGE2 = """
<html><body>
<table border="0" cellpadding="0" cellspacing="0">
  <tr><td valign="top">
    <a rel="nofollow" href="https://example.com/blue" class="result-link">Why Is the Sky Blue?</a>
  </td></tr>
  <tr><td class="result-snippet">Blue light scatters more than other colors.</td></tr>
  <tr><td>&nbsp;</td></tr>
  <tr><td valign="top">
    <a rel="nofollow" href="https://example.com/ozone" class="result-link">Ozone layer</a>
  </td></tr>
  <tr><td class="result-snippet">A different page-two result.</td></tr>
  <tr><td>&nbsp;</td></tr>
</table>
</body></html>
"""


def test_api_search_passes_offset_upstream(monkeypatch):
    calls = _fake_http_capture(monkeypatch, [FakeHTTPResp(200, LITE_HTML)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "sky", "s": 30})
    assert r.status_code == 200
    assert calls["params"][0] == {"q": "sky", "s": 30}


def test_api_search_caches_per_offset(monkeypatch):
    calls = _fake_http(monkeypatch, [FakeHTTPResp(200, LITE_HTML)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    client.get("/api/search", params={"q": "sky"})
    client.get("/api/search", params={"q": "sky", "s": 30})
    client.get("/api/search", params={"q": "sky"})
    client.get("/api/search", params={"q": "sky", "s": 30})
    assert calls["n"] == 2   # each (q, s) pair fetched once


def test_api_search_dedups_against_earlier_pages(monkeypatch):
    # page 2 repeats example.com/blue from page 1 — it must be dropped
    _fake_http_capture(monkeypatch, [FakeHTTPResp(200, LITE_HTML),
                                     FakeHTTPResp(200, LITE_HTML_PAGE2)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r1 = client.get("/api/search", params={"q": "sky"})
    assert len(r1.json()["results"]) == 2
    r2 = client.get("/api/search", params={"q": "sky", "s": 30})
    urls = [r["url"] for r in r2.json()["results"]]
    assert "https://example.com/ozone" in urls
    assert "https://example.com/blue" not in urls


def test_api_search_errors_do_not_poison_cache(monkeypatch):
    # every source must fail before the endpoint errors — 2 attempts each (202 backoff)
    calls = _fake_http(monkeypatch, [FakeHTTPResp(202)] * 6 + [FakeHTTPResp(200, LITE_HTML)])
    monkeypatch.setattr(server.time, "sleep", lambda *_: None)
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    assert client.get("/api/search", params={"q": "sky"}).status_code == 429
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 200          # not served a cached error
    assert len(r.json()["results"]) == 2
    assert calls["n"] == 7               # went upstream again


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


SERP_HTML = ('<html><body><script>var a = 1;</script>'
             '<input type="hidden" name="vqd" value="4-123456789"/>'
             '<script>window.vqd="4-123456789";</script></body></html>')

IJS_PAYLOAD = {
    "results": [
        {"image": "https://cdn.example/cat.jpg", "thumbnail": "https://tse.example/cat.jpg",
         "title": "A cat", "url": "https://example.com/cats", "width": 800, "height": 600},
        {"image": "https://cdn.example/dog.jpg", "thumbnail": "https://tse.example/dog.jpg",
         "title": "A dog", "url": "https://example.com/dogs", "width": 640},
    ]
}


def test_extract_vqd():
    assert server._extract_vqd('x vqd="4-123456789" y') == "4-123456789"
    assert server._extract_vqd("<p>nothing</p>") == ""
    assert server._extract_vqd("") == ""


def test_api_images_happy_path(monkeypatch):
    calls = _fake_http_capture(monkeypatch,
                               [FakeHTTPResp(200, SERP_HTML),
                                FakeHTTPResp(200, payload=IJS_PAYLOAD)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/images", params={"q": "cats"})
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 2
    assert results[0] == {"image": "https://cdn.example/cat.jpg",
                          "thumbnail": "https://tse.example/cat.jpg",
                          "title": "A cat", "url": "https://example.com/cats",
                          "width": 800, "height": 600}
    assert results[1]["height"] == 0          # missing field default
    assert calls["n"] == 2                    # SERP handshake + i.js
    assert calls["params"][1]["vqd"] == "4-123456789"


def test_api_images_cache_hit_skips_upstream(monkeypatch):
    calls = _fake_http(monkeypatch,
                       [FakeHTTPResp(200, SERP_HTML),
                        FakeHTTPResp(200, payload=IJS_PAYLOAD)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    client.get("/api/images", params={"q": "cats"})
    r = client.get("/api/images", params={"q": "cats"})
    assert len(r.json()["results"]) == 2
    assert calls["n"] == 2   # second request served from cache


def test_api_images_no_vqd_gives_502(monkeypatch):
    _fake_http(monkeypatch, [FakeHTTPResp(200, "<p>no token here</p>")])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/images", params={"q": "cats"})
    assert r.status_code == 502


def test_api_images_ijs_failure_gives_502(monkeypatch):
    _fake_http(monkeypatch, [FakeHTTPResp(200, SERP_HTML), FakeHTTPResp(403)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/images", params={"q": "cats"})
    assert r.status_code == 502


def test_api_images_empty_query_never_calls_upstream(monkeypatch):
    calls = _fake_http(monkeypatch, [FakeHTTPResp(200, SERP_HTML)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/images", params={"q": "  "})
    assert r.status_code == 200
    assert r.json() == {"results": []}
    assert calls["n"] == 0


def test_chain_ddg_success_never_calls_other_sources(monkeypatch):
    calls = _fake_http_capture(monkeypatch, [FakeHTTPResp(200, LITE_HTML)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 200
    assert r.json()["source"] == "duckduckgo"
    assert calls["n"] == 1
    assert calls["urls"] == [server.DDG_LITE_URL]


def test_chain_falls_back_to_bing_on_rate_limit(monkeypatch):
    calls = _fake_http_capture(monkeypatch, [FakeHTTPResp(202), FakeHTTPResp(202),
                                             FakeHTTPResp(200, BING_HTML)])
    monkeypatch.setattr(server.time, "sleep", lambda *_: None)
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 200
    assert r.json()["source"] == "bing"
    assert [x["url"] for x in r.json()["results"]] == [
        "https://example.com/sky", "https://wiki.example/Rayleigh"]
    assert calls["urls"] == [server.DDG_LITE_URL, server.DDG_LITE_URL, server.BING_URL]
    assert calls["params"][2] == {"q": "sky", "first": 1}   # s=0 → first=1


def test_chain_falls_back_to_mojeek_when_bing_also_limited(monkeypatch):
    calls = _fake_http_capture(monkeypatch, [FakeHTTPResp(202), FakeHTTPResp(202),
                                             FakeHTTPResp(403), FakeHTTPResp(403),
                                             FakeHTTPResp(200, MOJEEK_HTML)])
    monkeypatch.setattr(server.time, "sleep", lambda *_: None)
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "sky", "s": 30})
    assert r.status_code == 200
    assert r.json()["source"] == "mojeek"
    assert calls["urls"][-1] == server.MOJEEK_URL
    assert calls["params"][-1] == {"q": "sky", "s": 30}     # s passes straight through


def test_chain_network_error_falls_back(monkeypatch):
    _fake_http_capture(monkeypatch, [httpx.ConnectError("boom"), FakeHTTPResp(200, BING_HTML)])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 200
    assert r.json()["source"] == "bing"


def test_chain_empty_results_do_not_failover(monkeypatch):
    calls = _fake_http_capture(monkeypatch, [FakeHTTPResp(200, "<p>nothing</p>")])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 200
    assert r.json()["results"] == []
    assert r.json()["source"] == "duckduckgo"
    assert calls["n"] == 1   # a legit empty never hammers the other sources


def test_chain_all_sources_limited_gives_429(monkeypatch):
    _fake_http(monkeypatch, [FakeHTTPResp(202)])   # helper repeats it for every call
    monkeypatch.setattr(server.time, "sleep", lambda *_: None)
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 429
    assert r.json() == {"error": "rate_limited"}


def test_chain_all_sources_error_gives_502(monkeypatch):
    _fake_http(monkeypatch, [httpx.HTTPError("boom")])
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r = client.get("/api/search", params={"q": "sky"})
    assert r.status_code == 502
    assert r.json() == {"error": "upstream"}


def test_chain_fallback_result_is_cached(monkeypatch):
    calls = _fake_http_capture(monkeypatch, [FakeHTTPResp(202), FakeHTTPResp(202),
                                             FakeHTTPResp(200, BING_HTML)])
    monkeypatch.setattr(server.time, "sleep", lambda *_: None)
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    client.get("/api/search", params={"q": "sky"})
    r = client.get("/api/search", params={"q": "sky"})
    assert r.json()["source"] == "bing"
    assert calls["n"] == 3   # second request served from the bing cache entry


def test_chain_dedups_across_sources(monkeypatch):
    # page 1 from DDG; DDG is limited on page 2 → Bing serves, repeating example.com/blue
    calls = _fake_http_capture(monkeypatch, [FakeHTTPResp(200, LITE_HTML),
                                             FakeHTTPResp(202), FakeHTTPResp(202),
                                             FakeHTTPResp(200, BING_HTML_PAGE2)])
    monkeypatch.setattr(server.time, "sleep", lambda *_: None)
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    r1 = client.get("/api/search", params={"q": "sky"})
    assert len(r1.json()["results"]) == 2
    r2 = client.get("/api/search", params={"q": "sky", "s": 30})
    assert r2.json()["source"] == "bing"
    urls = [x["url"] for x in r2.json()["results"]]
    assert "https://example.com/ozone" in urls
    assert "https://example.com/blue" not in urls
