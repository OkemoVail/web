# Astra v2 — Keyless Scraping + Cosmic Playground Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Okemo Astra fully keyless (DuckDuckGo scraping server-side), always show a streaming Saga answer with dry personality, and reskin the page as "Google bones, cosmic playground skin."

**Architecture:** `backend/server.py` gains `GET /api/search` (scrapes `lite.duckduckgo.com`, parses with stdlib `html.parser`) and `GET /api/suggest` (proxies `duckduckgo.com/ac/`), both behind an in-memory 10-min TTL cache with 202/403-retry → 429 semantics. The frontend (`search/index.html` + `search/astra.js`) deletes all Brave/API-key code, calls the backend for results + suggestions, and always streams the Saga answer. Spec: `docs/superpowers/specs/2026-08-12-astra-keyless-cosmic-redesign-design.md`.

**Tech Stack:** FastAPI + `httpx` (already in `backend/requirements.txt`) + stdlib `html.parser`; vanilla JS single-IIFE frontend (no modules, no bundler, no frontend test infra — frontend verification is manual); pytest + `fastapi.testclient` + monkeypatch for backend tests (existing pattern in `backend/tests/test_server.py`).

---

### Task 1: Backend — DuckDuckGo lite parser

**Files:**
- Modify: `backend/server.py` (add imports at top, parser section after the `cancel_job` route)
- Test: `backend/tests/test_search.py` (new file)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_search.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -v`
Expected: FAIL — `AttributeError: module 'server' has no attribute 'parse_ddg_lite'`

- [ ] **Step 3: Implement the parser**

In `backend/server.py`, add to the import block at the top:

```python
from html.parser import HTMLParser
from urllib.parse import parse_qs, unquote, urlparse
```

Then append this section after the `cancel_job` route (before the `model = None` block):

```python
# ── Web search (DuckDuckGo, keyless) ─────────────────────────────
DDG_LITE_URL = "https://lite.duckduckgo.com/lite/"
DDG_AC_URL = "https://duckduckgo.com/ac/"
HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/126.0.0.0 Safari/537.36"
}
CACHE_TTL = 600  # seconds
_search_cache = {}
_suggest_cache = {}


def _unwrap_ddg_url(href):
    """DDG lite wraps outbound links in //duckduckgo.com/l/?uddg=<urlencoded>.
    Return the real URL; return "" for ad click-throughs."""
    if "ad_domain=" in href or "/y.js" in href:
        return ""
    if href.startswith("//duckduckgo.com/l/?") or href.startswith("/l/?"):
        full = "https:" + href if href.startswith("//") else "https://duckduckgo.com" + href
        return unquote(parse_qs(urlparse(full).query).get("uddg", [""])[0])
    return href


class _DDGLiteParser(HTMLParser):
    """Pairs each `a.result-link` with the next `td.result-snippet`."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results = []
        self._pending = None   # dict being built
        self._capture = None   # "title" | "snippet" | None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if tag == "a" and "result-link" in cls:
            self._flush()
            self._pending = {"title": "", "url": _unwrap_ddg_url(a.get("href") or ""),
                             "description": ""}
            self._capture = "title"
        elif tag == "td" and "result-snippet" in cls and self._pending is not None:
            self._capture = "snippet"

    def handle_endtag(self, tag):
        if tag == "a" and self._capture == "title":
            self._capture = None
        elif tag == "td" and self._capture == "snippet":
            self._capture = None

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


def parse_ddg_lite(html):
    p = _DDGLiteParser()
    p.feed(html or "")
    p.close()
    p._flush()
    return p.results
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_search.py
git commit -m "feat(backend): DuckDuckGo lite HTML parser for keyless search"
```

---

### Task 2: Backend — `GET /api/search` endpoint (cache + retry + errors)

**Files:**
- Modify: `backend/server.py` (add `httpx` import, endpoint after the parser section)
- Test: `backend/tests/test_search.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_search.py`:

```python
import httpx


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -v`
Expected: FAIL — 404 on `/api/search` (and `AttributeError: server._http_get` from the monkeypatch)

- [ ] **Step 3: Implement the endpoint**

In `backend/server.py`, add `import httpx` to the top imports and `JSONResponse` to the fastapi.responses import (change `from fastapi.responses import StreamingResponse` to `from fastapi.responses import JSONResponse, StreamingResponse`).

Then append after the parser section from Task 1:

```python
def _http_get(url, **kw):
    return httpx.get(url, headers=HTTP_HEADERS, timeout=8, **kw)


def _cache_get(cache, key):
    hit = cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    return None


def _cache_set(cache, key, value):
    cache[key] = (time.time(), value)


@app.get("/api/search")
def api_search(q: str = ""):
    q = (q or "").strip()
    if not q:
        return {"results": []}
    key = q.lower()
    cached = _cache_get(_search_cache, key)
    if cached is not None:
        return {"results": cached}
    resp = None
    for attempt in (1, 2):
        try:
            resp = _http_get(DDG_LITE_URL, params={"q": q})
        except httpx.HTTPError:
            return JSONResponse({"error": "upstream"}, status_code=502)
        if resp.status_code == 200:
            break
        if resp.status_code in (202, 403) and attempt == 1:
            time.sleep(2)   # DDG anomaly check — back off once, then give up
            continue
        if resp.status_code in (202, 403, 429):
            return JSONResponse({"error": "rate_limited"}, status_code=429)
        return JSONResponse({"error": "upstream"}, status_code=502)
    results = parse_ddg_lite(resp.text)[:15]
    _cache_set(_search_cache, key, results)
    return {"results": results}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -v`
Expected: 9 passed (3 parser + 6 endpoint)

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_search.py
git commit -m "feat(backend): /api/search — keyless DDG scrape with TTL cache + 202 retry"
```

---

### Task 3: Backend — `GET /api/suggest` endpoint

**Files:**
- Modify: `backend/server.py`
- Test: `backend/tests/test_search.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_search.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -v`
Expected: FAIL — 404 on `/api/suggest`

- [ ] **Step 3: Implement the endpoint**

Append to `backend/server.py` after `api_search`:

```python
@app.get("/api/suggest")
def api_suggest(q: str = ""):
    q = (q or "").strip()
    if not q:
        return []
    key = q.lower()
    cached = _cache_get(_suggest_cache, key)
    if cached is not None:
        return cached
    try:
        resp = _http_get(DDG_AC_URL, params={"q": q, "type": "list"})
    except httpx.HTTPError:
        return JSONResponse({"error": "upstream"}, status_code=502)
    if resp.status_code != 200:
        return JSONResponse({"error": "rate_limited"}, status_code=429)
    try:
        phrases = [i["phrase"] for i in resp.json()
                   if isinstance(i, dict) and i.get("phrase")]
    except ValueError:
        phrases = []
    out = phrases[:6]
    _cache_set(_suggest_cache, key, out)
    return out
```

- [ ] **Step 4: Run the FULL backend suite to verify nothing regressed**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: all tests pass (12 in `test_search.py` + the existing `test_server.py` suite)

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_search.py
git commit -m "feat(backend): /api/suggest — keyless DDG autocomplete proxy"
```

---

### Task 4: Frontend — rewrite `search/index.html` + `search/astra.js`

These two files ship as one atomic change (the new JS references DOM the old
HTML lacks and vice versa). No test infra exists for the frontend — manual
verification steps are at the end.

**Files:**
- Rewrite: `search/index.html`
- Rewrite: `search/astra.js`

- [ ] **Step 1: Rewrite `search/index.html`**

Complete new file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Okemo Astra ✦</title>
<meta name="description" content="Okemo Astra — your tiny telescope for the internet.">
<script>
  // Anti-FOUC theme (same pattern as Themes/Themes.html) — do not remove.
  (function () {
    const stored = localStorage.getItem('vail_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (stored !== 'light' && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  })();
</script>
<link rel="stylesheet" href="../src/design-tokens.css">
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<link rel="icon" href="../images/blehfile.png">
<style>
  /* ── Astra layout & identity (appearance tokens come from design-tokens.css) ── */
  /* Cosmic playground canvas: page-local warm parchment (do NOT edit shared tokens). */
  body { margin: 0; min-height: 100vh; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; overflow-x: hidden; background-color: #fdf9f4; }
  .dark body { background-color: #1e1a18; }
  [hidden] { display: none !important; }

  /* stars */
  #stars { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
  .star { position: absolute; border-radius: 50%; opacity: .15; }
  @keyframes twinkle { 0%,100% { opacity: .12; } 50% { opacity: .85; } }

  /* hero */
  .hero { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 1rem; box-sizing: border-box; }
  .wordmark { margin: 0; font-size: clamp(2.2rem, 6vw, 3.4rem); font-weight: 700; letter-spacing: -0.03em; background: linear-gradient(92deg, var(--accent) 10%, #f0c27b 90%); -webkit-background-clip: text; background-clip: text; color: transparent; text-align: center; }
  .tagline { margin: -6px 0 4px; font-size: .85rem; font-style: italic; color: var(--text-tertiary); }
  .constellation { position: absolute; top: 16%; right: 14%; width: 76px; height: 50px; color: var(--accent); opacity: .55; pointer-events: none; }
  .hint { margin: 2px 0 0; font-size: .72rem; color: var(--text-tertiary); }
  .foot { position: absolute; bottom: 12px; left: 0; right: 0; text-align: center; font-size: .72rem; color: var(--text-tertiary); }
  .foot a { color: inherit; }
  .theme-toggle { position: absolute; top: 14px; right: 14px; width: 2.2rem; height: 2.2rem; border-radius: 50%; border: 1px solid var(--border-strong); background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; font-size: .9rem; }

  /* search bar (hero + results share .bar) */
  .bar { display: flex; align-items: center; gap: 6px; width: min(560px, 92vw); height: 46px; box-sizing: border-box; padding: 4px 5px 4px 14px; border-radius: 999px; background: var(--bg-white); border: 1px solid var(--border-strong); box-shadow: 0 1px 6px rgba(0,0,0,.06); position: relative; }
  .bar:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent), transparent 80%); }
  .bar-icon { opacity: .55; font-size: .95rem; }
  .bar input { flex: 1; min-width: 0; background: transparent; border: none; box-shadow: none; outline: none; padding: 0; height: 100%; font-size: .95rem; color: var(--text-primary); }
  .bar input:focus { outline: none; box-shadow: none; border: none; }
  .dark .bar input { box-shadow: none; }
  .bar .skuo { height: 36px; padding: 0 14px; border-radius: 999px; font-size: .82rem; white-space: nowrap; }
  /* rainbow ring (i'm feeling cosmic) */
  .ai-ring { border-radius: 999px; padding: 1.5px; background: conic-gradient(from var(--rb, 0deg), #ff5f6d, #ffc371, #f0e05a, #5fdc7d, #5aa7ff, #b06bff, #ff5f6d); animation: rb-spin 3.2s linear infinite; }
  .ai-ring .skuo { height: 33px; background: var(--bg-white); color: var(--text-primary); font-weight: 600; box-shadow: none; }
  @property --rb { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
  @keyframes rb-spin { to { --rb: 360deg; } }
  @supports not (background: conic-gradient(from var(--rb), red, blue)) {
    .ai-ring { animation: none; }
    .ai-panel { border: 1px solid var(--border-strong); background: var(--bg-white); }
  }

  /* hero buttons below the bar (google homage) */
  .hero-btns { display: flex; gap: 10px; }
  .hero-btns .skuo { height: 38px; padding: 0 18px; border-radius: 999px; font-size: .85rem; }
  .hero-btns .ai-ring .skuo { height: 35px; }

  /* suggestions dropdown */
  .suggest { position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: var(--bg-white); border: 1px solid var(--border-strong); border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,.12); overflow: hidden; z-index: 20; }
  .suggest button { display: block; width: 100%; text-align: left; background: none; border: none; padding: 9px 16px; font-size: .85rem; color: var(--text-primary); cursor: pointer; }
  .suggest button.active, .suggest button:hover { background: var(--bg-elevated); }
  .suggest button.active::before { content: '✦ '; color: var(--accent); }

  /* results view */
  .results { position: relative; z-index: 1; max-width: 680px; margin: 0 auto; padding: 1rem 1rem 4rem; }
  .r-top { display: flex; align-items: center; gap: 14px; padding: 6px 0 18px; }
  .r-logo { font-weight: 700; font-size: 1.05rem; text-decoration: none; background: linear-gradient(92deg, var(--accent) 10%, #f0c27b 90%); -webkit-background-clip: text; background-clip: text; color: transparent; white-space: nowrap; }
  .results .bar { width: 100%; height: 42px; }
  .results .bar .skuo { height: 32px; }
  .r-meta { font-size: .75rem; color: var(--text-tertiary); margin: 0 4px 14px; }
  #result-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 22px; }
  .result { display: grid; grid-template-columns: 26px 1fr; gap: 10px; }
  /* favicon chip, slightly tilted (cosmic playground mischief) */
  .r-favi { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--border-strong); background: var(--bg-white); margin-top: 2px; }
  .result:nth-of-type(odd) .r-favi { transform: rotate(-7deg); }
  .result:nth-of-type(even) .r-favi { transform: rotate(6deg); }
  .r-favi-fallback { display: inline-grid; place-items: center; font-size: .7rem; color: var(--accent); }
  /* google grammar: site + breadcrumb above the title */
  .r-site { font-size: .78rem; color: var(--text-primary); }
  .r-crumb { font-size: .72rem; color: var(--text-tertiary); word-break: break-all; }
  .result .r-title { font-size: 1.05rem; color: var(--accent); text-decoration: none; line-height: 1.35; display: inline-block; margin-top: 2px; }
  .result .r-title:hover { text-decoration: underline wavy var(--accent-light); text-underline-offset: 3px; }
  .result .r-snippet { margin: 2px 0 0; font-size: .84rem; color: var(--text-secondary); line-height: 1.5; }

  /* AI answer panel — rainbow conic border, always on */
  .ai-panel { margin: 0 0 22px; border-radius: 18px; border: 1.5px solid transparent; background: linear-gradient(var(--bg-white), var(--bg-white)) padding-box, conic-gradient(from var(--rb, 0deg), #ff5f6d, #ffc371, #f0e05a, #5fdc7d, #5aa7ff, #b06bff, #ff5f6d) border-box; animation: rb-spin 6s linear infinite; overflow: hidden; }
  .ai-head { display: flex; align-items: center; gap: 8px; padding: 12px 16px 0; font-weight: 700; font-size: .92rem; color: var(--accent); }
  .ai-wave { height: 46px; margin: 10px 12px 0; border-radius: 12px; position: relative; overflow: hidden; transition: height .6s ease, margin .6s ease, opacity .6s ease; }
  .ai-wave .blob { position: absolute; inset: -60%; filter: blur(18px); background:
      radial-gradient(38% 55% at 25% 45%, rgba(255,95,109,.9), transparent 70%),
      radial-gradient(38% 55% at 50% 55%, rgba(90,167,255,.85), transparent 70%),
      radial-gradient(38% 55% at 72% 45%, rgba(95,220,125,.8), transparent 70%),
      radial-gradient(40% 60% at 60% 60%, rgba(240,194,123,.85), transparent 70%);
    animation: wave-flow 4.5s ease-in-out infinite alternate; }
  .ai-wave .wave-label { position: relative; z-index: 2; height: 100%; display: flex; align-items: center; padding: 0 14px; font-size: .8rem; font-weight: 700; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,.35); }
  .ai-panel.done .ai-wave { height: 2px; margin: 8px 16px 0; opacity: .9; }
  .ai-panel.done .ai-wave .wave-label { display: none; }
  .ai-body { padding: 12px 16px 16px; font-size: .88rem; line-height: 1.6; color: var(--text-primary); }
  .ai-body a { color: var(--accent); }
  .ai-error { padding: 0 16px 14px; font-size: .84rem; color: var(--text-secondary); }
  @keyframes wave-flow { 0% { transform: translateX(-6%) scale(1.05); } 100% { transform: translateX(6%) scale(1.12); } }

  .status-card { text-align: center; padding: 2rem 1rem; font-size: .9rem; color: var(--text-secondary); }
  .status-card .big { font-size: 1.6rem; display: block; margin-bottom: 8px; }

  @media (max-width: 560px) {
    .bar .skuo .lbl { display: none; }        /* icon-first button on tiny screens */
    .constellation { right: 6%; top: 12%; }
    .r-top { flex-wrap: wrap; }
  }
  @media (prefers-reduced-motion: reduce) {
    .star, .ai-ring, .ai-panel, .ai-wave .blob { animation: none !important; }
    .ai-wave, .ai-panel.done .ai-wave { transition: none; }
  }
</style>
</head>
<body>
<div id="stars" aria-hidden="true"></div>

<!-- ═══ HERO ═══ -->
<main id="hero" class="hero">
  <svg class="constellation" viewBox="0 0 52 34" fill="none" aria-hidden="true">
    <path d="M4 26 L18 14 L30 20 L46 6" stroke="currentColor" stroke-width=".6" opacity=".5"/>
    <circle cx="4" cy="26" r="2" fill="currentColor"/><circle cx="18" cy="14" r="2.4" fill="currentColor"/>
    <circle cx="30" cy="20" r="1.8" fill="currentColor"/><circle cx="46" cy="6" r="2.4" fill="currentColor"/>
  </svg>
  <button id="theme-toggle" class="theme-toggle" title="toggle theme" aria-label="toggle theme">◐</button>
  <div>
    <h1 class="wordmark">✦ Okemo Astra</h1>
    <p class="tagline">your tiny telescope for the internet</p>
  </div>
  <div class="bar" id="hero-bar">
    <span class="bar-icon">🔭</span>
    <input id="hero-input" type="text" enterkeyhint="search" autocomplete="off" spellcheck="false" aria-label="Search the web">
    <div class="suggest" id="hero-suggest" hidden></div>
  </div>
  <div class="hero-btns">
    <button class="skuo skuo-neutral" id="hero-search">🔍 search the cosmos</button>
    <span class="ai-ring"><button class="skuo" id="hero-cosmic">✦ i'm feeling cosmic</button></span>
  </div>
  <p class="hint">enter = search · no wrong questions</p>
  <footer class="foot">made of stardust · <a href="../index.html">okemo</a> ✦</footer>
</main>

<!-- ═══ RESULTS ═══ -->
<main id="results" class="results" hidden>
  <header class="r-top">
    <a class="r-logo" href="./" id="logo-home">✦ Astra</a>
    <div class="bar" id="results-bar">
      <span class="bar-icon">🔭</span>
      <input id="results-input" type="text" enterkeyhint="search" autocomplete="off" spellcheck="false" aria-label="Search the web">
      <button class="skuo skuo-neutral" id="results-search">🔍 <span class="lbl">Search</span></button>
      <div class="suggest" id="results-suggest" hidden></div>
    </div>
  </header>
  <section id="ai-panel" class="ai-panel" hidden>
    <div class="ai-head" id="ai-head">✦ Astra Answer</div>
    <div class="ai-wave" id="ai-wave"><div class="blob"></div><div class="wave-label" id="ai-wave-label">✦ consulting the cosmos…</div></div>
    <div class="ai-body" id="ai-body"></div>
    <div class="ai-error" id="ai-error" hidden></div>
  </section>
  <p class="r-meta" id="r-meta"></p>
  <ol id="result-list"></ol>
</main>

<script src="astra.js"></script>
</body>
</html>
```

- [ ] **Step 2: Rewrite `search/astra.js`**

Complete new file:

```js
// ─── Okemo Astra — all logic lives here (single IIFE, no modules) ───
(function () {
  'use strict';

  // ── Copy: playful, never corporate. Edit here, changes everywhere. ──
  const COPY = {
    placeholders: [
      "why is the sky blue, fr?",
      "prove I'm not a robot…",
      "best tacos near mars",
      "how do black holes even",
      "is water wet. settle it.",
      "teach a goldfish calculus",
    ],
    loadingQuips: [
      'consulting the cosmos…',
      'reticulating telescopes…',
      'asking the moon…',
      'warming up the stardust…',
    ],
    aiHeaders: [
      '✦ Astra Answer',
      '✦ asked the universe, it answered',
      '✦ the oracle has opinions',
      '✦ straight from the cosmos',
    ],
    emptyResults: 'nothing in this corner of the universe ✦',
    offline: 'lost contact with the cosmos — check your connection',
    rateLimited: 'slow down, stargazer — the cosmos is rate-limiting us',
    aiDown: 'the cosmos is quiet right now — try again',
    metaLine: (n, secs) => 'found ' + n + ' little stars in ' + secs + 's — you’re welcome',
    aiSystem: "You are Astra, Saga's search-oracle alter ego built by Okemo. Answer first, then stop — dry humor welcome, never rude, never corporate. Ground answers in the provided sources and cite inline as [1], [2]… matching the numbered results. If no sources are provided, answer from your own knowledge. Keep it tight: a few sentences, not an essay.",
  };

  // ── tiny DOM helper ──
  const $ = (id) => document.getElementById(id);

  // ── theme toggle (writes vail_theme like src/nav.js does) ──
  function initTheme() {
    $('theme-toggle').addEventListener('click', () => {
      const dark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('vail_theme', dark ? 'dark' : 'light'); } catch (_) {}
    });
  }

  // ── twinkling stars (Perplexity-style sparse dots) ──
  const STAR_COLORS = ['#c96478', '#f0c27b', '#5aa7ff', '#5fdc7d', '#ffffff'];
  function makeStars() {
    const host = $('stars');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'star';
      const size = 2 + Math.round(Math.random()); // 2–3px
      s.style.width = s.style.height = size + 'px';
      s.style.left = (6 + Math.random() * 88) + '%';
      s.style.top = (8 + Math.random() * 80) + '%';
      s.style.background = STAR_COLORS[i % STAR_COLORS.length];
      if (reduced) {
        s.style.opacity = '.3';
      } else {
        s.style.animation = `twinkle ${(2.6 + Math.random() * 2.4).toFixed(1)}s ease-in-out ${(Math.random() * 3).toFixed(1)}s infinite`;
      }
      host.appendChild(s);
    }
  }

  // ── rotating placeholder quips (both bars) ──
  function rotatePlaceholders() {
    let i = Math.floor(Math.random() * COPY.placeholders.length);
    const apply = () => {
      $('hero-input').placeholder = COPY.placeholders[i];
      $('results-input').placeholder = COPY.placeholders[i];
      i = (i + 1) % COPY.placeholders.length;
    };
    apply();
    setInterval(apply, 4000);
  }

  // ── router: URL is the state. ?q= results (AI answer always included) ──
  let aiAbort = null;            // AbortController for the AI stream
  let searchToken = 0;           // stale-response guard
  let wantResultsFocus = false;  // set by bar actions, consumed by showResults

  function readRoute() {
    const p = new URLSearchParams(location.search);
    return { q: (p.get('q') || '').trim() };
  }

  function go(q) {
    const u = new URL(location.href);
    if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
    u.searchParams.delete('ai');   // legacy param — the AI answer is always on now
    u.hash = '';
    if (u.href !== location.href) history.pushState({}, '', u);
    renderRoute();
  }

  function showHero() {
    if (aiAbort) aiAbort.abort();
    searchToken++;
    $('results').hidden = true;
    $('hero').hidden = false;
    document.title = 'Okemo Astra ✦';
  }

  function showResults(q) {
    $('hero').hidden = true;
    $('results').hidden = false;
    $('results-input').value = q;
    if (wantResultsFocus) { wantResultsFocus = false; $('results-input').focus({ preventScroll: true }); }
    document.title = q + ' — Okemo Astra';
    runSearch(q);
  }

  function renderRoute() {
    const { q } = readRoute();
    if (!q) showHero(); else showResults(q);
  }

  // ── bar wiring (hero + results bars behave identically) ──
  function wireBar(inputId, searchId, suggestId) {
    const input = $(inputId);
    initSuggest(input, $(suggestId)); // FIRST: suggest's keydown must run before ours (see defaultPrevented guard)
    $(searchId).addEventListener('click', () => { const q = input.value.trim(); if (q) { wantResultsFocus = true; go(q); } });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.defaultPrevented) return;  // initSuggest accepted a suggestion — don't double-navigate
        const q = input.value.trim();
        if (!q) return;
        wantResultsFocus = true;
        go(q);
      }
    });
  }

  // ── i'm feeling cosmic: random quip query ──
  function cosmicQuery(current) {
    const pool = COPY.placeholders.filter((p) => p !== current);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── boot ──
  initTheme();
  makeStars();
  rotatePlaceholders();
  wireBar('hero-input', 'hero-search', 'hero-suggest');
  wireBar('results-input', 'results-search', 'results-suggest');
  $('hero-cosmic').addEventListener('click', () => {
    const q = cosmicQuery($('hero-input').value.trim());
    $('hero-input').value = q;
    go(q);
  });
  $('logo-home').addEventListener('click', (e) => { e.preventDefault(); $('hero-input').value = $('results-input').value; go(''); });
  window.addEventListener('popstate', renderRoute);
  renderRoute();

  // citation jump links: smooth-scroll, no history entry
  $('ai-body').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#result-"]');
    if (!a) return;
    e.preventDefault();
    const el = document.getElementById(a.getAttribute('href').slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // ── backend base (same resolution as chat's api.js, minus the tunnel fetch) ──
  function backendBase() {
    try { return (localStorage.getItem('vail_custom_backend_url') || 'https://api.okemovail.com').replace(/\/$/, ''); }
    catch (_) { return 'https://api.okemovail.com'; }
  }

  // ── autocomplete (backend DDG proxy; silently disabled on any failure) ──
  async function astraSuggest(q) {
    const res = await fetch(
      backendBase() + '/api/suggest?q=' + encodeURIComponent(q),
      { headers: { 'ngrok-skip-browser-warning': 'true', 'bypass-tunnel-reminder': 'true' } }
    );
    if (!res.ok) throw new Error('suggest ' + res.status);
    const data = await res.json();
    return (Array.isArray(data) ? data : []).filter((s) => typeof s === 'string').slice(0, 6);
  }

  function initSuggest(input, box) {
    if (!input || !box) return;
    let items = [], active = -1, timer = null, dead = false, typed = '';

    function close() { clearTimeout(timer); box.hidden = true; items = []; active = -1; }
    function render() {
      box.innerHTML = '';
      if (!items.length) return close();
      items.forEach((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = s;
        b.className = i === active ? 'active' : '';
        b.addEventListener('mousedown', (e) => {   // mousedown beats input blur
          e.preventDefault();
          input.value = s;
          close();
          go(s);
        });
        box.appendChild(b);
      });
      box.hidden = false;
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (dead || !q) return close();
      timer = setTimeout(async () => {
        try {
          const got = await astraSuggest(q);
          if (input.value.trim() !== q) return;    // stale
          if (document.activeElement !== input) return; // blurred mid-flight
          typed = q;
          items = got; active = -1; render();
        } catch { dead = true; close(); }          // never surface suggest errors
      }, 150);
    });
    input.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length + 2) % (items.length + 1) - 1;
        if (active >= 0) input.value = items[active];
        else input.value = typed;
        render();
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault(); e.stopPropagation();
        close();
        go(input.value.trim());
      } else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', close);
  }

  // ── web search (backend DDG scrape) ──
  async function astraSearch(q) {
    const res = await fetch(
      backendBase() + '/api/search?q=' + encodeURIComponent(q),
      { headers: { 'ngrok-skip-browser-warning': 'true', 'bypass-tunnel-reminder': 'true' } }
    );
    if (!res.ok) { const e = new Error('search ' + res.status); e.status = res.status; throw e; }
    const data = await res.json();
    return (data && Array.isArray(data.results)) ? data.results : [];
  }

  function faviconFor(url) {
    try { return 'https://www.google.com/s2/favicons?domain=' + new URL(url).hostname + '&sz=32'; }
    catch { return ''; }
  }

  // google-style breadcrumb: host + up to 2 path segments, chevron-separated
  function crumbFor(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      const segs = u.pathname.split('/').filter(Boolean).slice(0, 2).map((s) => {
        try { return decodeURIComponent(s); } catch { return s; }
      });
      return { site: host, crumb: host + (segs.length ? ' › ' + segs.join(' › ') : '') };
    } catch {
      return { site: url, crumb: url };
    }
  }

  function statusCard(emoji, msg, retry) {
    const list = $('result-list');
    list.innerHTML = '';
    const div = document.createElement('li');
    div.className = 'status-card card';
    div.innerHTML = '<span class="big"></span><span></span>';
    div.querySelector('.big').textContent = emoji;
    div.querySelector('span:last-child').textContent = msg;
    if (retry) {
      const btn = document.createElement('button');
      btn.className = 'skuo skuo-neutral';
      btn.style.marginTop = '12px';
      btn.textContent = 'try again';
      btn.addEventListener('click', retry);
      div.appendChild(document.createElement('br'));
      div.appendChild(btn);
    }
    list.appendChild(div);
  }

  function renderResults(results) {
    const list = $('result-list');
    list.innerHTML = '';
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'result';
      li.id = 'result-' + (i + 1);

      const img = document.createElement('img');
      img.className = 'r-favi';
      img.src = faviconFor(r.url);
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { textContent: '✦', className: 'r-favi r-favi-fallback' })); };

      const c = crumbFor(r.url);
      const wrap = document.createElement('div');
      const head = document.createElement('div');
      head.className = 'r-head';
      const site = document.createElement('div');
      site.className = 'r-site';
      site.textContent = c.site;
      const crumb = document.createElement('div');
      crumb.className = 'r-crumb';
      crumb.textContent = c.crumb;
      head.append(site, crumb);
      const a = document.createElement('a');
      a.className = 'r-title';
      a.href = r.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = r.title || r.url;
      const snip = document.createElement('p');
      snip.className = 'r-snippet';
      snip.textContent = r.description || '';

      wrap.append(head, a, snip);
      li.append(img, wrap);
      list.appendChild(li);
    });
  }

  async function runSearch(q) {
    if (aiAbort) aiAbort.abort();
    const token = ++searchToken;
    const panel = $('ai-panel');
    panel.hidden = false;                       // panel shows immediately — always-on AI
    panel.classList.remove('done');
    $('ai-head').textContent = COPY.aiHeaders[0];
    $('ai-body').innerHTML = '';
    $('ai-error').hidden = true;
    $('ai-wave-label').textContent = '✦ ' + COPY.loadingQuips[0];
    $('r-meta').textContent = 'searching the universe for “' + q + '”…';
    $('result-list').innerHTML = '';

    const t0 = performance.now();
    let results = [];
    try {
      results = await astraSearch(q);
      results = results.filter((r) => /^https?:\/\//i.test(r.url || ''));
    } catch (e) {
      if (token !== searchToken) return;   // a newer search superseded this one
      panel.hidden = true;                 // no grounding → no AI call (back off)
      $('r-meta').textContent = '';
      const retry = () => runSearch(q);
      if (e.status === 429) statusCard('🌙', COPY.rateLimited, retry);
      else statusCard('📡', COPY.offline, retry);
      return;
    }
    if (token !== searchToken) return;

    const secs = ((performance.now() - t0) / 1000).toFixed(2);
    $('r-meta').textContent = results.length ? COPY.metaLine(results.length, secs) : '';
    if (results.length) renderResults(results);
    else statusCard('🌌', COPY.emptyResults);   // AI still answers from knowledge

    askAstra(q, results);
  }

  // ── AI answer: scraped-results-grounded Saga, streamed over SSE ──
  function linkifyCitations(html, count) {
    // [n] → jump link to the matching result card (must run on marked output)
    return html.replace(/\[(\d{1,2})\]/g, (m, n) =>
      (+n >= 1 && +n <= count) ? '<a href="#result-' + n + '">[' + n + ']</a>' : m);
  }

  function startWaveQuips() {
    const label = $('ai-wave-label');
    let i = 0;
    label.textContent = '✦ ' + COPY.loadingQuips[0];
    return setInterval(() => {
      i = (i + 1) % COPY.loadingQuips.length;
      label.textContent = '✦ ' + COPY.loadingQuips[i];
    }, 2200);
  }

  async function askAstra(q, results) {
    if (aiAbort) aiAbort.abort();
    aiAbort = new AbortController();
    const panel = $('ai-panel');
    panel.hidden = false;
    panel.classList.remove('done');
    $('ai-head').textContent = COPY.aiHeaders[Math.floor(Math.random() * COPY.aiHeaders.length)];
    $('ai-body').innerHTML = '';
    $('ai-error').hidden = true;
    const quipTimer = startWaveQuips();

    const snippets = results.slice(0, 5)
      .map((r, i) => '[' + (i + 1) + '] ' + (r.title || '') + ' — ' + (r.description || '') + ' (' + r.url + ')')
      .join('\n');

    try {
      const res = await fetch(backendBase() + '/v1/chat/completions', {
        method: 'POST',
        signal: aiAbort.signal,
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          'bypass-tunnel-reminder': 'true',
        },
        body: JSON.stringify({
          model: 'saga-0.7b',
          stream: true,
          web_search: false,
          use_thought: false,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: COPY.aiSystem },
            { role: 'user', content: q + '\n\nSources:\n' + (snippets || '(no sources — answer from knowledge)') },
          ],
        }),
      });
      if (!res.ok) throw new Error('backend ' + res.status);

      // SSE consumption — same line protocol as AI/js/chat-actions.js
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', text = '', firstToken = false, sawDone = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const clean = line.trim();
          if (!clean.startsWith('data: ')) continue;
          const dataStr = clean.substring(6).trim();
          if (dataStr === '[DONE]') { sawDone = true; break; }
          try {
            const data = JSON.parse(dataStr);
            const delta = data.choices && data.choices[0] && data.choices[0].delta
              ? (data.choices[0].delta.content || '') : '';
            if (delta) {
              if (!firstToken) { firstToken = true; clearInterval(quipTimer); $('ai-wave-label').textContent = '✦ streaming from the stars…'; }
              text += delta;
              $('ai-body').innerHTML = linkifyCitations(marked.parse(text.replace(/&/g, '&amp;').replace(/</g, '&lt;')), results.length);
            }
          } catch { /* partial JSON chunk — ignore */ }
        }
        if (sawDone) break;
      }
      clearInterval(quipTimer);
      if (!text.trim()) $('ai-body').textContent = '✦ the cosmos answered with silence — try rephrasing?';
      panel.classList.add('done');         // wave collapses to shimmer line
    } catch (e) {
      clearInterval(quipTimer);
      if (e.name === 'AbortError') return; // superseded by a newer search
      panel.classList.add('done');
      const err = $('ai-error');
      err.hidden = false;
      err.textContent = '✦ ' + COPY.aiDown + ' ';
      const btn = document.createElement('button');
      btn.className = 'skuo skuo-neutral';
      btn.textContent = 'retry';
      btn.addEventListener('click', () => askAstra(q, results));
      err.appendChild(btn);
    }
  }
})();
```

- [ ] **Step 3: Manual verification — happy path**

Run: `./backend/run.sh` (serves `127.0.0.1:8001`; the MLX model loads lazily on first AI request — search endpoints respond immediately without it)

Open `search/index.html` in a browser, then in the console:

```js
localStorage.setItem('vail_custom_backend_url', 'http://127.0.0.1:8001');
```

Reload, then verify:
1. Hero: no key card; buttons below the bar; `✦ i'm feeling cosmic` has the rainbow ring; hint reads "enter = search · no wrong questions".
2. Click `✦ i'm feeling cosmic` → navigates to results with a random quip query.
3. Type in the hero bar → suggestion dropdown appears (keyless).
4. Search → AI panel visible with rainbow border immediately, results render as site-name/breadcrumb → accent title → snippet; favicons tilted; meta line reads "found N little stars in X.XXs — you're welcome".
5. AI answer streams in (first request may take a while — model download/load); `[n]` citations smooth-scroll to result cards; panel header is one of the four rotating variants.
6. Back button returns to hero; forward returns to results.

- [ ] **Step 4: Manual verification — error + polish paths**

1. Stop the backend (`Ctrl+C`), search again → 📡 "lost contact with the cosmos" card with retry; AI panel hidden.
2. Restart backend, toggle dark mode → parchment dark canvas, rainbow border still visible, breadcrumbs legible.
3. Narrow window to ~375px → bar fits, no horizontal scroll.
4. `grep -n "brave\|astra_brave_key\|key-card\|key-modal" search/index.html search/astra.js` → **zero matches** (case-insensitive: add `-i`).

- [ ] **Step 5: Commit**

```bash
git add search/index.html search/astra.js
git commit -m "feat(astra): keyless backend search, always-on Saga answer, cosmic playground reskin"
```

---

### Task 5: Docs — update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remove the Brave key from the localStorage keys table**

Delete this row from the localStorage keys table:

```
| `astra_brave_key` | Brave Search API key for Okemo Astra |
```

- [ ] **Step 2: Update the temp-backend paragraph**

In the "Temp local backend" paragraph, replace:

```
that implements `/v1/chat/completions` (SSE + non-stream) plus stubs for `/tunnel_url`, `/api/system_prompts`, `/feedback`, `/api/tokens`, `/cancel_job`.
```

with:

```
that implements `/v1/chat/completions` (SSE + non-stream), keyless web search `/api/search` + autocomplete `/api/suggest` (DuckDuckGo scrape/proxy with a 10-min TTL cache), plus stubs for `/tunnel_url`, `/api/system_prompts`, `/feedback`, `/api/tokens`, `/cancel_job`.
```

- [ ] **Step 3: Update the Astra entry under "Other pages"**

Replace the entire `search/index.html` bullet:

```
- `search/index.html` — Okemo Astra: Google-style web search (Brave Search API, key in `localStorage.astra_brave_key`) with an optional streaming Saga "✦ Ask Astra" answer (`?q=` results, `&ai=1` adds AI). Intentional exceptions: no `src/nav.js` (chromeless by design), no Tailwind. Spec: `docs/superpowers/specs/2026-08-11-okemo-astra-design.md`.
```

with:

```
- `search/index.html` — Okemo Astra: keyless Google-style web search. Results + autocomplete come from the backend (`/api/search` scrapes DuckDuckGo lite, `/api/suggest` proxies DDG autocomplete — no API key anywhere); every search also streams a dry-humor Saga answer grounded in the top 5 results, cited `[n]`. UI: "Google bones, cosmic playground skin" — breadcrumb URLs above accent titles, tilted favicon chips, rainbow-conic AI panel border, warm parchment canvas (`#fdf9f4` / `#1e1a18`, page-local), hero buttons below the bar incl. `✦ i'm feeling cosmic` (random quip query). Intentional exceptions: no `src/nav.js` (chromeless by design), no Tailwind. Specs: `docs/superpowers/specs/2026-08-11-okemo-astra-design.md` (v1), `docs/superpowers/specs/2026-08-12-astra-keyless-cosmic-redesign-design.md` (v2).
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — Astra v2 keyless architecture"
```

---

### Task 6: Final verification sweep

- [ ] **Step 1: Full backend test suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: all tests pass — 12 in `test_search.py` plus the existing `test_server.py` suite (no regressions).

- [ ] **Step 2: Full manual sweep** (backend running, `vail_custom_backend_url` pointed local)

Repeat the Task 4 Step 3 + Step 4 checklists end-to-end in one session: hero → cosmic button → suggest → results + streaming AI + citations → error card → dark mode → mobile width → reduced motion (macOS: Accessibility → Reduce Motion) disabling the twinkle/ring/panel animations.

- [ ] **Step 3: Confirm no stray references repo-wide**

Run: `rg -in "brave" search/ backend/ CLAUDE.md`
Expected: zero matches in `search/`; the only acceptable mentions are none — if any appear, fix and re-commit.

---

## Self-Review Notes (already applied)

- **Spec coverage:** /api/search (Task 2), /api/suggest (Task 3), parser + uddg + ad-skip (Task 1), cache (Tasks 2–3), frontend key/Brave deletion + always-on AI + cosmic button + COPY/prompt (Task 4), breadcrumb/tilt/rainbow/parchment UI (Task 4 Step 1 CSS), error contract (Task 4 `runSearch` mapping 429/502; empty-results AI-from-knowledge), CLAUDE.md (Task 5). The `astra_brave_key` localStorage key and `&ai=1` param are gone by virtue of the full-file rewrites.
- **Type consistency:** backend — `parse_ddg_lite`, `_unwrap_ddg_url`, `_DDGLiteParser`, `_http_get`, `_cache_get`/`_cache_set`, `_search_cache`/`_suggest_cache`, `DDG_LITE_URL`/`DDG_AC_URL`, `HTTP_HEADERS`, `CACHE_TTL` used identically across Tasks 1–3 and their tests. Frontend — `astraSearch`/`astraSuggest`/`crumbFor`/`cosmicQuery`/`backendBase`, COPY fields `aiHeaders`/`metaLine`/`aiSystem` used identically between definition and call sites; DOM ids (`hero-cosmic`, `ai-head`, `results-search`, …) match between the new HTML and JS.
- **No placeholders:** every code step above is complete, runnable code; the only non-code steps are manual verification checklists (the repo has no frontend test infra, per CLAUDE.md).
