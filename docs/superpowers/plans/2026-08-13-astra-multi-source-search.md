# Astra Multi-Source Search (Keyless Fallback Chain) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/search` rate-limit-proof by failing over silently through a keyless source chain: DuckDuckGo lite → Bing → Mojeek.

**Architecture:** All changes live in `backend/server.py` (single-file convention). Each source is a fetcher with one interface — `fetch(q, s) -> (results, None) | (None, reason)` — sharing the existing `_http_get_backoff` helper. `api_search` walks the chain in order; cache keys become `(source, q_lower, s)` 3-tuples; cross-page dedup matches on query regardless of source. Response gains an additive `source` field. Frontend needs zero changes. Spec: `docs/superpowers/specs/2026-08-13-astra-multi-source-search-design.md`.

**Tech Stack:** FastAPI + httpx (backend, pytest with mocked HTTP — no real network in tests).

**Key facts an executor needs:**
- Tests monkeypatch `server._http_get`; `_fake_http`/`_fake_http_capture` script a response sequence (last response repeats); `FakeHTTPResp(status, text, payload)`; an `httpx.HTTPError` in the sequence is raised, not returned.
- Tests that exercise the 202/403 backoff must patch sleep: `monkeypatch.setattr(server.time, "sleep", lambda *_: None)`.
- The autouse `clear_caches` fixture clears `_search_cache`/`_suggest_cache`/`_images_cache`.
- Run tests: `cd backend && .venv/bin/python -m pytest tests/ -v`.

---

### Task 1: Bing URL unwrap helper + SERP parser

**Files:**
- Modify: `backend/server.py` (imports; `_unwrap_bing_url` after `_unwrap_ddg_url` ~line 151; `_BingParser`/`parse_bing` after `parse_ddg_lite` ~line 202)
- Test: `backend/tests/test_search.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_search.py`, immediately after `test_parse_ddg_lite_explicitly_excludes_ad_rows` (before the `FakeHTTPResp` class):

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -k "bing" -v`
Expected: FAIL — `AttributeError: module 'server' has no attribute '_unwrap_bing_url'` / `parse_bing`.

- [ ] **Step 3: Implement the unwrap helper + parser**

In `backend/server.py`, add `import base64` to the stdlib imports at the top.

After `_unwrap_ddg_url` (ends ~line 151), add:

```python
def _unwrap_bing_url(href):
    """Bing wraps outbound links in /ck/a?...&u=a1<base64url, no padding>.
    Return the real URL; "" when there is nothing decodable."""
    if "/ck/a?" not in href:
        return href
    u = parse_qs(urlparse(href).query).get("u", [""])[0]
    if not u.startswith("a1"):
        return ""
    try:
        pad = "=" * (-len(u[2:]) % 4)
        return base64.urlsafe_b64decode(u[2:] + pad).decode("utf-8", "replace")
    except Exception:
        return ""
```

After `parse_ddg_lite` (ends ~line 202), add:

```python
class _BingParser(HTMLParser):
    """Pairs each `<li class="b_algo">` h2-link with its first <p> snippet."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results = []
        self._pending = None   # dict being built (inside a b_algo <li>)
        self._h2 = False
        self._capture = None   # "title" | "snippet" | None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if tag == "li" and "b_algo" in cls:
            self._pending = {"title": "", "url": "", "description": ""}
            self._h2 = False
            self._capture = None
        elif self._pending is not None:
            if tag == "h2":
                self._h2 = True
            elif tag == "a" and self._h2 and not self._pending["url"]:
                self._pending["url"] = _unwrap_bing_url(a.get("href") or "")
                self._capture = "title"
            elif tag == "p" and not self._pending["description"] and not self._capture:
                self._capture = "snippet"

    def handle_endtag(self, tag):
        if tag == "a" and self._capture == "title":
            self._capture = None
        elif tag == "h2":
            self._h2 = False
        elif tag == "p" and self._capture == "snippet":
            self._capture = None
        elif tag == "li" and self._pending is not None:
            self._flush()

    def handle_data(self, data):
        if self._pending is None:
            return
        if self._capture == "title":
            self._pending["title"] += data
        elif self._capture == "snippet":
            self._pending["description"] += data

    def _flush(self):
        if self._pending is not None:
            r = {k: " ".join(v.split()) for k, v in self._pending.items()}
            if r["title"] and r["url"] and r["description"]:
                self.results.append(r)
        self._pending = None
        self._h2 = False
        self._capture = None


def parse_bing(html):
    """Parse a Bing SERP into [{title, url, description}]; rows missing any field are dropped."""
    p = _BingParser()
    p.feed(html or "")
    p.close()
    p._flush()
    return p.results
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -k "bing" -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_search.py
git commit -m "Add Bing SERP parser with /ck/a redirect unwrapping"
```

---

### Task 2: Mojeek SERP parser

**Files:**
- Modify: `backend/server.py` (`_MojeekParser`/`parse_mojeek` after `parse_bing`)
- Test: `backend/tests/test_search.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_search.py`, immediately after `test_parse_bing_skips_ads_and_garbage`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -k "mojeek" -v`
Expected: FAIL — `AttributeError: module 'server' has no attribute 'parse_mojeek'`.

- [ ] **Step 3: Implement the parser**

In `backend/server.py`, immediately after `parse_bing`, add:

```python
class _MojeekParser(HTMLParser):
    """Pairs each `.results-standard > li` h2-link with its <p class="s"> snippet."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results = []
        self._in_results = False
        self._pending = None
        self._h2 = False
        self._capture = None   # "title" | "snippet" | None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if tag == "ul":
            if "results-standard" in cls:
                self._in_results = True
            return
        if not self._in_results:
            return
        if tag == "li" and self._pending is None:
            self._pending = {"title": "", "url": "", "description": ""}
        elif self._pending is not None:
            if tag == "h2":
                self._h2 = True
            elif tag == "a" and self._h2 and not self._pending["url"]:
                self._pending["url"] = a.get("href") or ""
                self._capture = "title"
            elif tag == "p" and "s" in cls.split() and not self._pending["description"]:
                self._capture = "snippet"

    def handle_endtag(self, tag):
        if tag == "a" and self._capture == "title":
            self._capture = None
        elif tag == "h2":
            self._h2 = False
        elif tag == "p" and self._capture == "snippet":
            self._capture = None
        elif tag == "li" and self._pending is not None:
            self._flush()
        elif tag == "ul" and self._in_results:
            self._in_results = False

    def handle_data(self, data):
        if self._pending is None:
            return
        if self._capture == "title":
            self._pending["title"] += data
        elif self._capture == "snippet":
            self._pending["description"] += data

    def _flush(self):
        if self._pending is not None:
            r = {k: " ".join(v.split()) for k, v in self._pending.items()}
            if r["title"] and r["url"] and r["description"]:
                self.results.append(r)
        self._pending = None
        self._h2 = False
        self._capture = None


def parse_mojeek(html):
    """Parse a Mojeek SERP into [{title, url, description}]; rows missing any field are dropped."""
    p = _MojeekParser()
    p.feed(html or "")
    p.close()
    p._flush()
    return p.results
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -k "mojeek" -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_search.py
git commit -m "Add Mojeek SERP parser"
```

---

### Task 3: Source fetchers + fallback chain in `api_search`

**Files:**
- Modify: `backend/server.py` (constants near `DDG_LITE_URL` ~line 127; new `_fetch_source`/`_fetch_ddg`/`_fetch_bing`/`_fetch_mojeek`/`SEARCH_SOURCES` after the parsers; replace `api_search` at lines 241–266)
- Test: `backend/tests/test_search.py`

**Intentional test change:** `test_api_search_errors_do_not_poison_cache` currently expects DDG failing ⇒ 429. The chain is *the feature*: DDG failing now means Bing serves. The test's intent (an error response must never be cached) is preserved by scripting ALL sources to fail first.

- [ ] **Step 1: Extend `_fake_http_capture` to record URLs**

In `backend/tests/test_search.py`, replace the existing `_fake_http_capture` helper (~line 163) with:

```python
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
```

- [ ] **Step 2: Write the failing chain tests**

Add a second Bing fixture (after the `MOJEEK_HTML` block) plus the chain tests at the end of `backend/tests/test_search.py`:

```python
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
```

Also replace `test_api_search_errors_do_not_poison_cache` with:

```python
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -k "chain or poison" -v`
Expected: FAIL — chain tests 404/KeyError on `source` (chain doesn't exist); the poison-cache test fails because Bing serves the scripted 200 (`assert 200 == 429` style failure).

- [ ] **Step 4: Implement the chain**

In `backend/server.py`, near the other DDG constants (after `DDG_IJS_URL`/`VQD_RE`, ~line 131), add:

```python
BING_URL = "https://www.bing.com/search"
MOJEEK_URL = "https://www.mojeek.com/search"
```

After `parse_mojeek`, add:

```python
def _fetch_source(url, parser, params):
    """Fetch+parse one search source. Returns (results, None) on success —
    including a legit empty page — or (None, "rate_limited" | "upstream")."""
    resp, err = _http_get_backoff(url, params=params)
    if err:
        return None, ("rate_limited" if err.status_code == 429 else "upstream")
    results = [r for r in parser(resp.text)
               if r["url"].startswith(("http://", "https://"))]
    return results, None


def _fetch_ddg(q, s):
    return _fetch_source(DDG_LITE_URL, parse_ddg_lite, {"q": q, "s": s})


def _fetch_bing(q, s):
    return _fetch_source(BING_URL, parse_bing, {"q": q, "first": s + 1})


def _fetch_mojeek(q, s):
    return _fetch_source(MOJEEK_URL, parse_mojeek, {"q": q, "s": s})


SEARCH_SOURCES = (
    ("duckduckgo", _fetch_ddg),
    ("bing", _fetch_bing),
    ("mojeek", _fetch_mojeek),
)
```

Replace the whole `api_search` function with:

```python
@app.get("/api/search")
def api_search(q: str = "", s: int = 0):
    q = (q or "").strip()
    if not q:
        return {"results": []}
    s = max(0, s)
    qk = q.lower()
    last_reason = "upstream"
    for name, fetch in SEARCH_SOURCES:
        key = (name, qk, s)
        cached = _cache_get(_search_cache, key)
        if cached is not None:
            return {"results": cached, "source": name}
        results, reason = fetch(q, s)
        if results is None:
            last_reason = reason
            continue
        if s > 0:
            # Drop URLs already served on earlier cached pages of this query
            # (any source — engines occasionally repeat rows across pages).
            seen = set()
            for (kn, kq, ks), (ts, page) in list(_search_cache.items()):
                if kq == qk and ks < s and time.time() - ts < CACHE_TTL:
                    seen.update(r["url"] for r in page)
            results = [r for r in results if r["url"] not in seen]
        results = results[:15]
        _cache_set(_search_cache, key, results)
        return {"results": results, "source": name}
    if last_reason == "rate_limited":
        return JSONResponse({"error": "rate_limited"}, status_code=429)
    return JSONResponse({"error": "upstream"}, status_code=502)
```

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: ALL PASS — new chain tests + every pre-existing test (`test_api_search_double_202_gives_429`, `test_api_search_network_error_gives_502`, dedup/pagination/suggest/images tests all keep passing because the scripted failure responses repeat across the whole chain).

- [ ] **Step 6: Commit**

```bash
git add backend/server.py backend/tests/test_search.py
git commit -m "Fail /api/search over through a keyless DDG→Bing→Mojeek chain"
```

---

### Task 4: Live parser validation + docs

Scrapers are only as good as their selectors — the fixtures pin the parsers, but real SERPs drift. Validate against live HTML before calling this done.

**Files:**
- Modify: `CLAUDE.md` (temp-backend paragraph; `search/index.html` bullet)

- [ ] **Step 1: Validate both parsers against live SERPs**

Run (real network; the model never loads for this):

```bash
cd backend && .venv/bin/python -c "
import server
r = server._http_get(server.BING_URL, params={'q': 'why is the sky blue', 'first': 1})
print('bing', r.status_code, len(server.parse_bing(r.text)))
r = server._http_get(server.MOJEEK_URL, params={'q': 'why is the sky blue', 's': 0})
print('mojeek', r.status_code, len(server.parse_mojeek(r.text)))
"
```

Expected: `bing 200 <n>` and `mojeek 200 <n>` with n ≥ 5 each. If either prints 0, the live markup drifted from the fixture — inspect the HTML, fix the parser selectors, and update the fixture to match before continuing.

- [ ] **Step 2: Smoke-test the running endpoint**

```bash
cd backend && ./run.sh &   # if not already running on 127.0.0.1:8001
sleep 3
curl -s "http://127.0.0.1:8001/api/search?q=cats" | python3 -m json.tool | head -5
curl -s "http://127.0.0.1:8001/api/search?q=cats&s=30" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['source'], len(d['results']))"
```

Expected: `"source": "duckduckgo"` in the response JSON; page 2 returns results with a source field. (Fallback can't be triggered on demand live — the unit tests cover it.)

- [ ] **Step 3: Update CLAUDE.md**

In the "Temp local backend" paragraph, replace `keyless web search `/api/search` (DDG lite scrape; `s` offset param for pagination with cross-page dedup)` with:

`keyless web search `/api/search` (source chain with silent failover — DDG lite scrape → Bing SERP (with `/ck/a` base64 redirect unwrap) → Mojeek; `s` offset param mapped per-source, response carries `source`, cache keys are `(source, q, s)`, cross-page dedup across all sources)`

In the `search/index.html` bullet, replace ``/api/search` scrapes DuckDuckGo lite` with ``/api/search` fails over DDG lite → Bing → Mojeek (keyless)`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — multi-source search fallback chain"
```

---

## Self-review notes (plan author)

- **Spec coverage:** chain + parsers (T1–T3) ✓; failover semantics incl. empty-no-failover and last-reason error (T3) ✓; 3-tuple cache keys + cross-source dedup (T3) ✓; additive `source` field, zero frontend changes (T3) ✓; parser live-validation (T4) ✓; docs (T4) ✓.
- **Intentional test change:** `test_api_search_errors_do_not_poison_cache` — DDG failing now means Bing serves (that IS the feature), so the test scripts all 3 sources failing before the success. Flagged in Task 3.
- **Type consistency:** `parse_bing`/`parse_mojeek` return the same `{title, url, description}` shape as `parse_ddg_lite`; fetchers return `(results, None) | (None, reason)`; `SEARCH_SOURCES` is `(name, fetcher)` pairs consumed identically in the loop; `_fetch_source(url, parser, params)` matches all three call sites; `calls["urls"]` added to `_fake_http_capture` without breaking existing `calls["params"]` users.
- **Fixture math:** `a1aHR0cHM6Ly93aWtpLmV4YW1wbGUvUmF5bGVpZ2g` = `a1` + base64url(`https://wiki.example/Rayleigh`, no padding) — verified by decoding.
- **Empty-query contract preserved:** the `{"results": []}` early return (no `source` field) keeps `test_api_search_empty_query_never_calls_upstream`'s exact-equality assertion passing.
