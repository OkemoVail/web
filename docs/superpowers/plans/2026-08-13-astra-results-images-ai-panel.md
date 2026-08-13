# Astra: Infinite Results + Images Tab + ChatGPT AI Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Okemo Astra (`search/index.html`) with infinite-scroll web results, a keyless Images tab with side-panel preview, and a ChatGPT-style AI panel with fullscreen mode and model-generated waiting lines.

**Architecture:** Backend (`backend/server.py`) gains an `s` offset param on `/api/search` (DDG lite pagination + cross-page dedup) and a new `/api/images` endpoint (DDG `vqd` handshake → `i.js` JSON). Frontend (`search/astra.js`, plain IIFE — no modules) gains tab routing via `?tab=images`, an IntersectionObserver sentinel for infinite scroll, a masonry image grid + preview panel, and the AI panel restructure (thread bubbles, fullscreen overlay, stop button, thinking row). Spec: `docs/superpowers/specs/2026-08-13-astra-results-images-ai-panel-design.md`.

**Tech Stack:** FastAPI + httpx (backend, pytest with mocked HTTP), vanilla JS/CSS (frontend, no build step, no test harness — manual verification).

**Verification environment (used by every frontend task):**
- Backend: `cd backend && ./run.sh` → `127.0.0.1:8001` (the MLX model loads lazily — search/image endpoints work WITHOUT downloading a model). In the browser console on the Astra page: `localStorage.setItem('vail_custom_backend_url','http://127.0.0.1:8001')` then reload.
- Site: `python3 -m http.server 8000` from repo root → `http://localhost:8000/search/`.
- AI-dependent tasks may instead use the live backend (`localStorage.removeItem('vail_custom_backend_url')` → `https://api.okemovail.com`), since they only call the pre-existing `/v1/chat/completions`.

---

### Task 1: Backend — `/api/search` offset param + cross-page dedup

**Files:**
- Modify: `backend/server.py` (`_http_get` at line ~200, `api_search` at lines 215–241)
- Test: `backend/tests/test_search.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_search.py` (after `test_api_search_empty_query_never_calls_upstream`):

```python
def _fake_http_capture(monkeypatch, responses):
    """Like _fake_http but also records the params kwarg of each call."""
    calls = {"n": 0, "params": []}

    def fake(url, **kw):
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
```

(The existing `_fake_http` already repeats the last scripted response, which is exactly what the dedup test needs — page 1 and page 2 differ because the sequence advances. `_fake_http_capture` is used there simply to keep one helper in the test.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -k "offset or dedup" -v`
Expected: FAIL — `test_api_search_passes_offset_upstream` fails because the params sent upstream lack `s` (FastAPI will also 422 on the unknown `s` query param until the signature changes).

- [ ] **Step 3: Implement offset + dedup in `api_search`**

In `backend/server.py`, first update `_http_get` to support header merging (needed by Task 2) and add the extracted backoff helper right after it:

```python
def _http_get(url, headers=None, **kw):
    h = dict(HTTP_HEADERS)
    if headers:
        h.update(headers)
    return httpx.get(url, headers=h, timeout=8, **kw)


def _http_get_backoff(url, **kw):
    """GET with the standard DDG anomaly backoff: one 2s retry on 202/403.
    Returns (resp, None) on 200, otherwise (None, JSONResponse error)."""
    for attempt in (1, 2):
        try:
            resp = _http_get(url, **kw)
        except httpx.HTTPError:
            return None, JSONResponse({"error": "upstream"}, status_code=502)
        if resp.status_code == 200:
            return resp, None
        if resp.status_code in (202, 403) and attempt == 1:
            time.sleep(2)   # DDG anomaly check — back off once, then give up
            continue
        if resp.status_code in (202, 403, 429):
            return None, JSONResponse({"error": "rate_limited"}, status_code=429)
        return None, JSONResponse({"error": "upstream"}, status_code=502)
```

Then replace the whole `api_search` function with:

```python
@app.get("/api/search")
def api_search(q: str = "", s: int = 0):
    q = (q or "").strip()
    if not q:
        return {"results": []}
    s = max(0, s)
    key = (q.lower(), s)
    cached = _cache_get(_search_cache, key)
    if cached is not None:
        return {"results": cached}
    resp, err = _http_get_backoff(DDG_LITE_URL, params={"q": q, "s": s})
    if err:
        return err
    results = [r for r in parse_ddg_lite(resp.text)
               if r["url"].startswith(("http://", "https://"))]
    if s > 0:
        # Drop URLs already served on earlier cached pages of this query
        # (DDG occasionally repeats rows across pages).
        seen = set()
        for (kq, ks), (ts, page) in list(_search_cache.items()):
            if kq == key[0] and ks < s and time.time() - ts < CACHE_TTL:
                seen.update(r["url"] for r in page)
        results = [r for r in results if r["url"] not in seen]
    results = results[:15]
    _cache_set(_search_cache, key, results)
    return {"results": results}
```

Also refactor `api_suggest` to use the helper (behavior must stay identical — its existing tests pin it):

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
    resp, err = _http_get_backoff(DDG_AC_URL, params={"q": q, "type": "list"})
    if err:
        return err
    try:
        data = resp.json()
    except (ValueError, TypeError):
        data = []
    phrases = []
    if isinstance(data, list):
        # DDG /ac/ answers either ["query", ["s1", …]] or [{"phrase": "s1"}, …]
        if len(data) == 2 and isinstance(data[1], list):
            phrases = [s for s in data[1] if isinstance(s, str)]
        else:
            phrases = [i["phrase"] for i in data
                       if isinstance(i, dict) and isinstance(i.get("phrase"), str)]
    out = phrases[:6]
    _cache_set(_suggest_cache, key, out)
    return out
```

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: ALL PASS (new offset/dedup tests + every pre-existing test — the refactor must not change behavior).

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_search.py
git commit -m "Add s-offset pagination + cross-page dedup to /api/search"
```

---

### Task 2: Backend — `/api/images` endpoint (DDG vqd handshake)

**Files:**
- Modify: `backend/server.py` (imports at top; constants near `DDG_LITE_URL` line ~126; new endpoint after `api_suggest`)
- Test: `backend/tests/test_search.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_search.py`:

```python
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
```

Also update the autouse cache-clearing fixture to include the new cache:

```python
@pytest.fixture(autouse=True)
def clear_caches():
    server._search_cache.clear()
    server._suggest_cache.clear()
    server._images_cache.clear()
    yield
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_search.py -k "images or vqd" -v`
Expected: FAIL — `AttributeError: module 'server' has no attribute '_extract_vqd'` (and 404s for the route).

- [ ] **Step 3: Implement `/api/images`**

In `backend/server.py`, add `import re` to the stdlib imports. Near the other DDG constants (by `DDG_LITE_URL`) add:

```python
DDG_HOME_URL = "https://duckduckgo.com/"
DDG_IJS_URL = "https://duckduckgo.com/i.js"
VQD_RE = re.compile(r'vqd="([^"]+)"')
_images_cache = {}
```

After `api_suggest`, add:

```python
def _extract_vqd(html):
    """Pull the vqd token DDG embeds in its SERP (needed to unlock i.js)."""
    m = VQD_RE.search(html or "")
    return m.group(1) if m else ""


def _map_image(r):
    return {
        "image": r.get("image") or "",
        "thumbnail": r.get("thumbnail") or "",
        "title": r.get("title") or "",
        "url": r.get("url") or "",
        "width": r.get("width") or 0,
        "height": r.get("height") or 0,
    }


@app.get("/api/images")
def api_images(q: str = ""):
    """Keyless DDG image search: scrape vqd from the SERP, then call i.js."""
    q = (q or "").strip()
    if not q:
        return {"results": []}
    key = q.lower()
    cached = _cache_get(_images_cache, key)
    if cached is not None:
        return {"results": cached}
    resp, err = _http_get_backoff(DDG_HOME_URL, params={"q": q})
    if err:
        return err
    vqd = _extract_vqd(resp.text)
    if not vqd:
        return JSONResponse({"error": "upstream"}, status_code=502)
    try:
        iresp = _http_get(DDG_IJS_URL,
                          params={"l": "us-en", "o": "json", "q": q, "vqd": vqd},
                          headers={"Referer": "https://duckduckgo.com/"})
    except httpx.HTTPError:
        return JSONResponse({"error": "upstream"}, status_code=502)
    if iresp.status_code != 200:
        return JSONResponse({"error": "upstream"}, status_code=502)
    try:
        data = iresp.json()
    except (ValueError, TypeError):
        data = {}
    results = [_map_image(r) for r in (data.get("results") or []) if isinstance(r, dict)]
    results = [r for r in results if r["image"].startswith(("http://", "https://"))]
    _cache_set(_images_cache, key, results)
    return {"results": results}
```

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_search.py
git commit -m "Add keyless /api/images endpoint (DDG vqd handshake + i.js)"
```

---

### Task 3: Frontend — tabs + URL routing (`All | ✦ Images`)

This task lands the routing skeleton only: tabs render, URL state works, the Images tab shows a placeholder. Tasks 4–5 fill in the grid.

**Files:**
- Modify: `search/index.html` (tab nav + `#image-grid` container + tab CSS)
- Modify: `search/astra.js` (routing, tab wiring, `showResults` split)

- [ ] **Step 1: Add the tab markup + grid container**

In `search/index.html`, inside `<main id="results">`, immediately after the `</header>` (end of the `.r-top` block), add:

```html
  <nav class="r-tabs" id="r-tabs">
    <button class="r-tab on" id="tab-all" type="button">All</button>
    <button class="r-tab" id="tab-images" type="button">✦ Images</button>
  </nav>
```

Immediately after `<ol id="result-list"></ol>`, add:

```html
  <div id="image-grid" hidden></div>
```

- [ ] **Step 2: Add tab + grid CSS**

In the `<style>` block of `search/index.html`, after the `.r-meta-row` rules, add:

```css
  /* tabs (google grammar: text tabs, accent underline) */
  .r-tabs { display: flex; gap: 18px; max-width: 640px; margin: -6px 0 16px; border-bottom: 1px solid var(--border-strong); }
  .r-tab { background: none; border: none; padding: 8px 2px 10px; font-family: inherit; font-size: .85rem; color: var(--text-secondary); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .r-tab:hover { color: var(--text-primary); }
  .r-tab.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }

  /* images grid (masonry via css columns) */
  #image-grid { max-width: 900px; columns: 200px; column-gap: 10px; }
```

And inside the `@media (max-width: 768px)` block add:

```css
    .r-tabs { max-width: none; margin: -4px 16px 14px; }
    #image-grid { max-width: none; margin: 0 12px; columns: 150px; }
```

- [ ] **Step 3: Wire routing in `search/astra.js`**

Replace `readRoute` and `go` with tab-aware versions:

```javascript
  function readRoute() {
    const p = new URLSearchParams(location.search);
    return { q: (p.get('q') || '').trim(), tab: p.get('tab') === 'images' ? 'images' : 'all' };
  }

  function go(q, tab) {
    const u = new URL(location.href);
    if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
    if (tab === 'images') u.searchParams.set('tab', 'images'); else u.searchParams.delete('tab');
    u.searchParams.delete('ai');   // legacy param — the AI answer is always on now
    u.hash = '';
    if (u.href !== location.href) history.pushState({}, '', u);
    renderRoute();
  }
```

Replace `showResults` and `renderRoute` with:

```javascript
  let lastAllQuery = '';   // guards against re-running a finished search on tab restore
  let lastImgQuery = '';

  function paintTabs(tab) {
    $('tab-all').classList.toggle('on', tab !== 'images');
    $('tab-images').classList.toggle('on', tab === 'images');
  }

  function showResults(q, tab) {
    $('hero').hidden = true;
    $('results').hidden = false;
    $('results-input').value = q;
    if (wantResultsFocus) { wantResultsFocus = false; $('results-input').focus({ preventScroll: true }); }
    document.title = q + ' — Okemo Astra';
    paintTabs(tab);
    const allMode = tab !== 'images';
    $('result-list').hidden = !allMode;
    $('image-grid').hidden = allMode;
    $('ai-toggle').hidden = !allMode;
    if (allMode) {
      $('ai-panel').hidden = !getAiMode();
      if (q !== lastAllQuery) { lastAllQuery = q; runSearch(q); }
    } else {
      $('ai-panel').hidden = true;               // AI panel lives on All; the thread survives
      if (q !== lastImgQuery) { lastImgQuery = q; runImages(q); }
    }
  }

  function renderRoute() {
    const { q, tab } = readRoute();
    if (!q) showHero(); else showResults(q, tab);
  }
```

Update the existing `go()` callers to pass the tab: in `wireBar`, both `go(q)` calls (the search-button click handler and the Enter-key handler) become `go(q, readRoute().tab)`; inside `initSuggest`, the mousedown-accept `go(s)` and the keyboard-accept `go(input.value.trim())` become `go(s, readRoute().tab)` and `go(input.value.trim(), readRoute().tab)`. The cosmic button's `go(q)` and logo-home's `go('')` stay as-is (the hero always lands on All).

Add a stub `runImages` (Task 4 replaces it) just before `runSearch`:

```javascript
  // ── images tab (grid rendering lands in the next task) ──
  async function runImages(q) {
    $('r-meta').textContent = 'image search lands in the next task…';
  }
```

Add tab click wiring to the boot section (after the `$('ai-toggle')` listener):

```javascript
  $('tab-all').addEventListener('click', () => { const r = readRoute(); if (r.q && r.tab !== 'all') go(r.q, 'all'); });
  $('tab-images').addEventListener('click', () => { const r = readRoute(); if (r.q && r.tab !== 'images') go(r.q, 'images'); });
```

- [ ] **Step 4: Verify manually**

- Load `http://localhost:8000/search/?q=cats` → All tab active, normal results + AI panel.
- Click `✦ Images` → URL gains `&tab=images`; result list + AI panel hide; placeholder meta line shows.
- Click `All` → results + AI panel return WITHOUT re-streaming a new answer (thread preserved).
- Reload directly on `?q=cats&tab=images` → boots into the Images tab. Browser back/forward switches tabs.
- A new search typed in the results bar while on Images keeps the Images tab.

- [ ] **Step 5: Commit**

```bash
git add search/index.html search/astra.js
git commit -m "Add All/Images tab routing to Astra results page"
```

---

### Task 4: Frontend — image grid + skeleton loading

**Files:**
- Modify: `search/index.html` (grid CSS)
- Modify: `search/astra.js` (`runImages`, `astraImages`, `renderImageGrid`, COPY)

- [ ] **Step 1: Add grid item + skeleton CSS** (`search/index.html`, after the `#image-grid` rule added in Task 3):

```css
  .ig-item { display: block; width: 100%; padding: 0; border: 1px solid var(--border-strong); border-radius: 12px; overflow: hidden; background: var(--bg-elevated); cursor: zoom-in; margin: 0 0 10px; break-inside: avoid; position: relative; }
  .ig-item img { display: block; width: 100%; height: auto; }
  .ig-host { position: absolute; left: 6px; bottom: 6px; font-size: .62rem; background: rgba(0,0,0,.55); color: #fff; padding: 1px 7px; border-radius: 999px; backdrop-filter: blur(4px); }
  .ig-skel { break-inside: avoid; margin-bottom: 10px; border-radius: 12px; background: linear-gradient(100deg, var(--bg-elevated) 40%, var(--border-strong) 50%, var(--bg-elevated) 60%); background-size: 200% 100%; animation: ig-shimmer 1.4s linear infinite; }
  .ig-skel:nth-child(3n) { height: 130px; }
  .ig-skel:nth-child(3n+1) { height: 190px; }
  .ig-skel:nth-child(3n+2) { height: 160px; }
  @keyframes ig-shimmer { to { background-position: -200% 0; } }
```

In the `@media (prefers-reduced-motion: reduce)` block, add `.ig-skel` to the `animation: none !important` selector list.

- [ ] **Step 2: Replace the `runImages` stub in `search/astra.js`**

In `COPY`, after the `metaLine` entry, add:

```javascript
    metaLineImages: (n, secs) => 'found ' + n + ' little pictures in ' + secs + 's — you’re welcome',
```

Add module state near the thread state declarations:

```javascript
  const imgCache = new Map();   // q.toLowerCase() -> results array
  let gridResults = [];         // currently rendered image results (the preview panel reads these)
```

Replace the Task 3 `runImages` stub with:

```javascript
  // ── images tab (backend DDG i.js proxy) ──
  async function astraImages(q) {
    const res = await fetch(
      backendBase() + '/api/images?q=' + encodeURIComponent(q),
      { headers: { 'ngrok-skip-browser-warning': 'true', 'bypass-tunnel-reminder': 'true' } }
    );
    if (!res.ok) { const e = new Error('images ' + res.status); e.status = res.status; throw e; }
    const data = await res.json();
    return (data && Array.isArray(data.results)) ? data.results : [];
  }

  function renderImageGrid(results) {
    const grid = $('image-grid');
    grid.innerHTML = '';
    results.forEach((r) => {
      const b = document.createElement('button');
      b.className = 'ig-item';
      b.type = 'button';
      const img = document.createElement('img');
      img.src = r.thumbnail || r.image;
      img.alt = r.title || '';
      img.loading = 'lazy';
      if (r.width && r.height) img.style.aspectRatio = r.width + ' / ' + r.height;
      img.onerror = () => { b.remove(); };
      const host = document.createElement('span');
      host.className = 'ig-host';
      host.textContent = crumbFor(r.url).site;
      b.append(img, host);
      b.addEventListener('click', () => openImagePreview(r));
      grid.appendChild(b);
    });
  }

  function imageGridSkeleton() {
    const grid = $('image-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('div');
      s.className = 'ig-skel';
      grid.appendChild(s);
    }
  }

  function imageGridStatus(emoji, msg, retry) {
    const grid = $('image-grid');
    grid.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'status-card card';
    div.style.columnSpan = 'all';
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
    grid.appendChild(div);
  }

  async function runImages(q) {
    const token = ++searchToken;          // shares the stale-guard counter with runSearch
    $('r-meta').textContent = 'searching the universe for “' + q + '”…';
    imageGridSkeleton();
    const cacheKey = q.toLowerCase();
    if (imgCache.has(cacheKey)) {
      gridResults = imgCache.get(cacheKey);
      renderImageGrid(gridResults);
      $('r-meta').textContent = COPY.metaLineImages(gridResults.length, '0.00');
      return;
    }
    const t0 = performance.now();
    let results;
    try {
      results = await astraImages(q);
    } catch (e) {
      if (token !== searchToken) return;
      $('r-meta').textContent = '';
      const retry = () => { lastImgQuery = ''; runImages(q); };
      if (e.status === 429) imageGridStatus('🌙', COPY.rateLimited, retry);
      else imageGridStatus('📡', COPY.offline, retry);
      return;
    }
    if (token !== searchToken) return;
    imgCache.set(cacheKey, results);
    gridResults = results;
    const secs = ((performance.now() - t0) / 1000).toFixed(2);
    $('r-meta').textContent = results.length ? COPY.metaLineImages(results.length, secs) : '';
    if (results.length) renderImageGrid(results);
    else imageGridStatus('🌌', COPY.emptyResults);
  }
```

`openImagePreview(r)` arrives in Task 5 — add a temporary stub so clicks don't throw:

```javascript
  function openImagePreview(r) { window.open(r.url, '_blank', 'noopener'); }  // placeholder; the preview panel replaces this
```

- [ ] **Step 3: Verify manually** (local backend required — `/api/images` doesn't exist on the live one)

- `?q=cats&tab=images` → skeleton shimmer → masonry grid of thumbnails with host chips.
- Switching All → Images → All: the grid is instant on the second visit (in-memory cache).
- Thumbnails reserve their aspect ratio (no layout jump as they load).
- Stop the backend, reload the tab → 📡 card + retry button inside the grid area.

- [ ] **Step 4: Commit**

```bash
git add search/index.html search/astra.js
git commit -m "Render Astra Images tab as a masonry grid with skeleton loading"
```

---

### Task 5: Frontend — image side-panel preview

**Files:**
- Modify: `search/index.html` (preview markup + CSS)
- Modify: `search/astra.js` (`openImagePreview`, close wiring, ESC handling)

- [ ] **Step 1: Add the preview markup** (`search/index.html`, right before `<script src="astra.js"></script>`):

```html
<aside id="ig-preview" hidden>
  <div class="igp-scrim" id="igp-scrim"></div>
  <div class="igp-panel card">
    <button class="skuo skuo-icon igp-close" id="igp-close" aria-label="close preview">✕</button>
    <div class="igp-imgwrap"><img id="igp-img" alt=""></div>
    <div class="igp-title" id="igp-title"></div>
    <div class="igp-host" id="igp-host"></div>
    <div class="igp-actions">
      <a class="skuo skuo-accent" id="igp-visit" target="_blank" rel="noopener">visit source</a>
      <a class="skuo skuo-neutral" id="igp-open" target="_blank" rel="noopener">open image</a>
    </div>
  </div>
</aside>
```

- [ ] **Step 2: Add the preview CSS** (in the `<style>` block, before the media queries):

```css
  /* image preview: right side panel (desktop) / bottom sheet (mobile) */
  #ig-preview { position: fixed; inset: 0; z-index: 70; }
  .igp-scrim { position: absolute; inset: 0; background: rgba(0,0,0,.4); }
  .igp-panel { position: absolute; top: 0; right: 0; bottom: 0; width: min(380px, 94vw); padding: 16px; overflow-y: auto; border-radius: 18px 0 0 18px; display: flex; flex-direction: column; gap: 10px; }
  .igp-close { align-self: flex-end; width: 30px; height: 30px; padding: 0; border-radius: 50%; flex: none; }
  .igp-imgwrap { border-radius: 12px; overflow: hidden; border: 1px solid var(--border-strong); background: var(--bg-white); }
  .igp-imgwrap img { display: block; width: 100%; height: auto; }
  .igp-title { font-size: .9rem; color: var(--text-primary); line-height: 1.4; }
  .igp-host { font-size: .75rem; color: var(--text-tertiary); }
  .igp-actions { display: flex; gap: 8px; }
  .igp-actions .skuo { height: 34px; padding: 0 14px; border-radius: 999px; font-size: .8rem; display: inline-flex; align-items: center; text-decoration: none; }
```

And inside `@media (max-width: 768px)`:

```css
    .igp-panel { top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: 82vh; border-radius: 18px 18px 0 0; }
```

- [ ] **Step 3: Replace the `openImagePreview` stub** in `search/astra.js` with:

```javascript
  function openImagePreview(r) {
    $('ig-preview').hidden = false;
    document.body.style.overflow = 'hidden';
    const img = $('igp-img');
    img.src = r.thumbnail || r.image;               // thumbnail paints instantly…
    $('igp-title').textContent = r.title || '';
    $('igp-host').textContent = crumbFor(r.url).site;
    $('igp-visit').href = r.url;
    $('igp-open').href = r.image;
    const full = new Image();                       // …full image swaps in when ready
    full.onload = () => { img.src = r.image; };
    full.src = r.image;
  }

  function closeImagePreview() {
    if ($('ig-preview').hidden) return;
    $('ig-preview').hidden = true;
    document.body.style.overflow = '';
  }
```

In the boot section add:

```javascript
  $('igp-close').addEventListener('click', closeImagePreview);
  $('igp-scrim').addEventListener('click', closeImagePreview);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeImagePreview(); });
```

Also add `closeImagePreview();` as the first line of `showHero()` (leaving results must never strand the overlay).

- [ ] **Step 4: Verify manually**

- Images tab → click a thumbnail → side panel opens with the thumbnail instantly, then the full image swaps in; title + host + both action links work.
- ESC, scrim click, and ✕ all close it; body scroll is restored.
- Narrow the window to <768px → the panel becomes a bottom sheet.

- [ ] **Step 5: Commit**

```bash
git add search/index.html search/astra.js
git commit -m "Add side-panel image preview to the Astra Images tab"
```

### Task 6: Frontend — infinite scroll on the All tab

**Files:**
- Modify: `search/index.html` (sentinel CSS)
- Modify: `search/astra.js` (pagination state, `astraSearch` offset, `renderResults` append mode, sentinel observer, `runSearch` reset, `loadMore`)

- [ ] **Step 1: Add sentinel CSS** (`search/index.html`):

```css
  /* infinite-scroll sentinel */
  .r-sentinel { list-style: none; text-align: center; padding: 8px 0 4px; font-size: .8rem; color: var(--text-tertiary); }
  .r-sentinel-dot { display: inline-block; animation: sentinel-pulse 1.2s ease-in-out infinite; }
  @keyframes sentinel-pulse { 0%,100% { opacity: .3; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.1); } }
  .r-sentinel .skuo { font-size: .78rem; margin-top: 4px; }
```

In the `@media (prefers-reduced-motion: reduce)` block, add `.r-sentinel-dot` to the no-animation selector list.

- [ ] **Step 2: Add COPY entries + module state** (`search/astra.js`):

In `COPY` after `metaLineImages`:

```javascript
    endOfResults: "✦ that's everything in this corner of the universe",
    loadMoreError: 'the telescope jammed — retry?',
```

Module state (near `let aiAbort`):

```javascript
  const PAGE_STEP = 30;         // DDG lite paginates in steps of 30
  const MAX_RESULTS = 120;      // sane cap
  let nextOffset = 0;
  let loadingMore = false;
  let resultsDone = false;
  let totalResults = 0;
  let lastSecs = '0.00';
  let lastResults = [];         // first-page results (citation lookups)
  let scrollObserver = null;
```

- [ ] **Step 3: Update `astraSearch` to take an offset:**

```javascript
  async function astraSearch(q, s) {
    const res = await fetch(
      backendBase() + '/api/search?q=' + encodeURIComponent(q) + (s ? '&s=' + s : ''),
      { headers: { 'ngrok-skip-browser-warning': 'true', 'bypass-tunnel-reminder': 'true' } }
    );
    if (!res.ok) { const e = new Error('search ' + res.status); e.status = res.status; throw e; }
    const data = await res.json();
    return (data && Array.isArray(data.results)) ? data.results : [];
  }
```

- [ ] **Step 4: Update `renderResults` for append mode**

Replace the whole function with:

```javascript
  function renderResults(results, start, append) {
    const list = $('result-list');
    const sentinel = append ? $('result-sentinel') : null;
    if (!append) list.innerHTML = '';
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'result';
      li.id = 'result-' + (start + i + 1);

      const img = document.createElement('img');
      img.className = 'r-favi';
      img.src = faviconFor(r.url);
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { textContent: '✦', className: 'r-favi r-favi-fallback' })); };

      const c = crumbFor(r.url);
      const wrap = document.createElement('div');
      const head = document.createElement('div');
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
      if (sentinel) list.insertBefore(li, sentinel); else list.appendChild(li);
    });
  }
```

- [ ] **Step 5: Add the sentinel machinery** (after `renderResults`):

```javascript
  function ensureSentinel() {
    let s = $('result-sentinel');
    if (!s) {
      s = document.createElement('li');
      s.id = 'result-sentinel';
      s.className = 'r-sentinel';
      $('result-list').appendChild(s);
    }
    s.innerHTML = '<span class="r-sentinel-dot">✦</span>';
    return s;
  }

  function watchSentinel(q) {
    if (scrollObserver) scrollObserver.disconnect();
    scrollObserver = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore(q);
    }, { rootMargin: '400px' });
    scrollObserver.observe(ensureSentinel());
  }

  function finishResults() {
    resultsDone = true;
    if (scrollObserver) scrollObserver.disconnect();
    const s = $('result-sentinel');
    if (s) s.innerHTML = '<span>' + COPY.endOfResults + '</span>';
  }

  function sentinelLoadError(q) {
    const s = $('result-sentinel');
    if (!s) return;
    s.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'skuo skuo-neutral';
    btn.type = 'button';
    btn.textContent = COPY.loadMoreError;
    btn.addEventListener('click', () => { s.innerHTML = '<span class="r-sentinel-dot">✦</span>'; loadMore(q); });
    s.appendChild(btn);
  }

  async function loadMore(q) {
    if (loadingMore || resultsDone || $('result-list').hidden) return;
    const token = searchToken;
    loadingMore = true;
    try {
      let more = await astraSearch(q, nextOffset);
      more = more.filter((r) => /^https?:\/\//i.test(r.url || ''));
      if (token !== searchToken) return;
      nextOffset += PAGE_STEP;
      if (!more.length) { finishResults(); return; }
      renderResults(more, totalResults, true);
      totalResults += more.length;
      $('r-meta').textContent = COPY.metaLine(totalResults, lastSecs);
      if (totalResults >= MAX_RESULTS) finishResults();
    } catch (e) {
      if (token !== searchToken) return;
      sentinelLoadError(q);
    } finally {
      loadingMore = false;
    }
  }
```

- [ ] **Step 6: Update `runSearch`**

Replace the whole function with:

```javascript
  async function runSearch(q) {
    if (aiAbort) aiAbort.abort();
    const token = ++searchToken;
    const panel = $('ai-panel');
    const aiOn = getAiMode();
    panel.hidden = !aiOn;                       // AI mode off → results-only page
    panel.classList.remove('done');
    $('ai-head').textContent = COPY.aiHeaders[0];
    $('ai-body').innerHTML = '';
    $('ai-error').hidden = true;
    $('ai-follow').hidden = true;
    $('r-meta').textContent = 'searching the universe for “' + q + '”…';
    $('result-list').innerHTML = '';
    nextOffset = 0; loadingMore = false; resultsDone = false; totalResults = 0;
    if (scrollObserver) scrollObserver.disconnect();

    const t0 = performance.now();
    let results = [];
    try {
      results = await astraSearch(q, 0);
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

    lastResults = results;
    nextOffset = PAGE_STEP;
    totalResults = results.length;
    const secs = ((performance.now() - t0) / 1000).toFixed(2);
    lastSecs = secs;
    $('r-meta').textContent = results.length ? COPY.metaLine(totalResults, secs) : '';
    if (results.length) { renderResults(results, 0, false); watchSentinel(q); }
    else statusCard('🌌', COPY.emptyResults);   // AI still answers from knowledge

    if (aiOn) askAstra(q, results);
  }
```

(The old `$('ai-wave-label')` reset line is dropped — the wave is removed in Task 9; until then the element simply stays empty.)

Also update the ai-toggle boot handler so its `runSearch(q)` keeps `lastAllQuery` consistent:

```javascript
  $('ai-toggle').addEventListener('click', () => {
    const on = !getAiMode();
    setAiMode(on);
    const { q } = readRoute();
    if (on && q) { lastAllQuery = q; runSearch(q); }  // toggling on from results answers immediately
    if (!on) $('ai-panel').hidden = true;             // toggling off hides the panel
  });
```

- [ ] **Step 7: Verify manually** (local backend for the `s` param)

- `?q=cats` → first ~15 results; scroll down → the next page appends automatically (pulsing ✦ at the bottom while loading); result numbering continues past 15.
- Keep scrolling → eventually the "✦ that's everything…" end line appears and no more requests fire (check the Network tab).
- The meta line updates as pages land ("found 30 little stars…").
- AI citations still jump to the right cards.
- Stop the backend mid-scroll → the sentinel becomes a retry button; after restarting the backend, clicking it continues.

- [ ] **Step 8: Commit**

```bash
git add search/index.html search/astra.js
git commit -m "Infinite-scroll Astra web results via s-offset pagination"
```

---

### Task 7: Frontend — ChatGPT thread restyle + stop button

**Files:**
- Modify: `search/index.html` (ai-head restructure, composer stop button, thread CSS; delete `.ai-q` CSS)
- Modify: `search/astra.js` (`askAstra`/`askFollowUp` restructure into turns + bubbles, `setStreaming`, stop wiring, `esc` helper)

Note: this task adds the ⤢ button to the header (wired in Task 8) but keeps the wave element untouched — Task 9 removes it.

- [ ] **Step 1: Restructure the panel markup** (`search/index.html`)

Replace:

```html
    <div class="ai-head" id="ai-head">✦ Astra Answer</div>
```

with:

```html
    <div class="ai-head"><span id="ai-head-label">✦ Astra Answer</span><button class="skuo skuo-icon" id="ai-expand" aria-label="fullscreen" title="fullscreen">⤢</button></div>
```

And in the `.ai-follow` row, add the stop button right after the send button:

```html
      <button class="skuo skuo-neutral" id="ai-stop" aria-label="stop generating" title="stop" hidden>⏹</button>
```

- [ ] **Step 2: CSS** (`search/index.html`)

  - `.ai-head` gains `justify-content: space-between;` (it already has `display: flex`).
  - Delete the `.ai-q` and `.ai-q::before` rules.
  - Add:

```css
  /* chat thread: plain Astra turns, grey right-aligned user bubbles */
  .ai-turn { margin: 2px 0 8px; }
  .ai-bubble-user { width: fit-content; max-width: 85%; margin: 12px 0 4px auto; padding: 8px 13px; border-radius: 16px 16px 4px 16px; background: var(--bg-elevated); border: 1px solid var(--border-strong); font-size: .85rem; color: var(--text-primary); }
  #ai-expand { width: 28px; height: 28px; padding: 0; border-radius: 8px; font-size: .85rem; flex: none; }
```

- [ ] **Step 3: JS restructure** (`search/astra.js`)

Add module state near `let aiAbort`:

```javascript
  let aiStopRequested = false;   // distinguishes user-stop aborts from supersede aborts
```

Add helpers near `linkifyCitations`:

```javascript
  function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function setStreaming(on) {
    $('ai-follow-input').disabled = on;
    $('ai-follow-send').disabled = on;
    $('ai-follow-send').hidden = on;
    $('ai-stop').hidden = !on;
  }
```

Replace ALL of `askAstra` with:

```javascript
  async function askAstra(q, results) {
    seedThread(q, results);
    const panel = $('ai-panel');
    panel.hidden = false;
    panel.classList.remove('done');
    $('ai-head-label').textContent = COPY.aiHeaders[Math.floor(Math.random() * COPY.aiHeaders.length)];
    const body = $('ai-body');
    body.innerHTML = '';
    const aEl = document.createElement('div');      // the seed answer turn
    aEl.className = 'ai-turn';
    body.appendChild(aEl);
    $('ai-error').hidden = true;
    $('ai-follow').hidden = false;                  // composer visible from the start (ChatGPT-style)
    setStreaming(true);
    const myToken = searchToken;
    const quipTimer = startWaveQuips();
    let partial = '';

    try {
      const text = await streamTurn((t) => {
        clearInterval(quipTimer);
        partial = t;
        aEl.innerHTML = linkifyCitations(marked.parse(esc(t)), results.length);
      });
      clearInterval(quipTimer);
      thread.push({ role: 'assistant', content: text });
      if (!text.trim()) aEl.textContent = '✦ the cosmos answered with silence — try rephrasing?';
      panel.classList.add('done');                  // shimmer settles
    } catch (e) {
      clearInterval(quipTimer);
      if (e.name === 'AbortError') {
        if (aiStopRequested && partial) {           // user hit stop — keep what streamed
          thread.push({ role: 'assistant', content: partial });
          panel.classList.add('done');
        }
        return;                                     // superseded / toggled off / stopped
      }
      panel.classList.add('done');
      showAiError(() => askAstra(q, results));
    } finally {
      aiStopRequested = false;
      if (myToken === searchToken) setStreaming(false);
    }
  }
```

Replace ALL of `askFollowUp` with:

```javascript
  async function askFollowUp(question) {
    const panel = $('ai-panel');
    thread.push({ role: 'user', content: question });

    const body = $('ai-body');
    const qEl = document.createElement('div');      // the user's turn: right-aligned bubble
    qEl.className = 'ai-bubble-user';
    qEl.textContent = question;
    const aEl = document.createElement('div');      // the streaming answer under it
    aEl.className = 'ai-turn';
    body.append(qEl, aEl);

    panel.classList.remove('done');                 // shimmer spins again while answering
    $('ai-error').hidden = true;
    setStreaming(true);
    const myToken = searchToken;
    const quipTimer = startWaveQuips();
    let partial = '';

    try {
      const text = await streamTurn((t) => {
        clearInterval(quipTimer);
        partial = t;
        aEl.innerHTML = linkifyCitations(marked.parse(esc(t)), threadResults.length);
      });
      clearInterval(quipTimer);
      thread.push({ role: 'assistant', content: text });
      if (!text.trim()) aEl.textContent = '✦ silence. rude, but on brand.';
      panel.classList.add('done');
    } catch (e) {
      clearInterval(quipTimer);
      if (e.name === 'AbortError') {
        if (aiStopRequested && partial) {
          thread.push({ role: 'assistant', content: partial });
          panel.classList.add('done');
        } else if (aiStopRequested) {
          thread.pop();                             // stopped before anything streamed
          qEl.remove(); aEl.remove();
        }
        return;
      }
      thread.pop();                                 // don't keep an unanswered question in context
      qEl.remove(); aEl.remove();
      panel.classList.add('done');
      showAiError(() => askFollowUp(question));
    } finally {
      aiStopRequested = false;
      if (myToken === searchToken) {
        setStreaming(false);
        $('ai-follow-input').focus({ preventScroll: true });
      }
    }
  }
```

Update the two remaining header references: in `runSearch`, `$('ai-head').textContent = COPY.aiHeaders[0];` becomes `$('ai-head-label').textContent = COPY.aiHeaders[0];`.

In `streamTurn`, the first-token branch currently sets `$('ai-wave-label').textContent = '✦ streaming from the stars…';` — leave `startWaveQuips` and the wave alone for this task, but guard the line so it no-ops once Task 9 deletes the element:

```javascript
            if (!firstToken) { firstToken = true; const wl = $('ai-wave-label'); if (wl) wl.textContent = '✦ streaming from the stars…'; }
```

Add the stop-button wiring in the boot section:

```javascript
  $('ai-stop').addEventListener('click', () => { aiStopRequested = true; if (aiAbort) aiAbort.abort(); });
```

The old `followGo` guard `if (!q || !thread.length) return;` stays valid (thread is non-empty once a search seeded it — and the composer is only usable then).

- [ ] **Step 4: Verify manually** (live backend is fine)

- Search → the composer is visible immediately, input disabled, ⏹ shown while streaming; after the answer lands, send returns and the input enables.
- Ask a follow-up → your question renders as a right-aligned grey bubble; the answer streams below it as plain text.
- Hit ⏹ mid-stream → streaming halts, the partial answer stays, the composer re-enables. Hit ⏹ before any token → the bubble disappears entirely.
- The ⤢ button renders in the panel header (it does nothing yet — Task 8).

- [ ] **Step 5: Commit**

```bash
git add search/index.html search/astra.js
git commit -m "Restyle Astra panel as a chat thread with bubbles + stop button"
```

---

### Task 8: Frontend — AI panel fullscreen

**Files:**
- Modify: `search/index.html` (fullscreen CSS)
- Modify: `search/astra.js` (`toggleAiFullscreen`, ESC handling, fullscreen citation behavior)

- [ ] **Step 1: Fullscreen CSS** (`search/index.html`):

```css
  /* fullscreen: the same panel becomes a fixed overlay (no state loss mid-stream) */
  .ai-panel.ai-fullscreen { position: fixed; inset: 0; z-index: 60; max-width: none; margin: 0; border-radius: 0; height: 100dvh; display: flex; flex-direction: column; }
  .ai-panel.ai-fullscreen > * { width: 100%; max-width: 760px; margin-left: auto; margin-right: auto; }
  .ai-panel.ai-fullscreen .ai-body { flex: 1 1 auto; overflow-y: auto; min-height: 0; }
  .ai-panel.ai-fullscreen .ai-follow { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
```

- [ ] **Step 2: JS** (`search/astra.js`)

Add after `setStreaming`:

```javascript
  function toggleAiFullscreen(force) {
    const panel = $('ai-panel');
    const on = typeof force === 'boolean' ? force : !panel.classList.contains('ai-fullscreen');
    panel.classList.toggle('ai-fullscreen', on);
    $('ai-expand').textContent = on ? '✕' : '⤢';
    $('ai-expand').setAttribute('aria-label', on ? 'exit fullscreen' : 'fullscreen');
    document.body.style.overflow = on ? 'hidden' : '';
  }

  function exitAiFullscreen() {
    if ($('ai-panel').classList.contains('ai-fullscreen')) toggleAiFullscreen(false);
  }
```

Boot wiring:

```javascript
  $('ai-expand').addEventListener('click', () => toggleAiFullscreen());
```

Extend the existing ESC `keydown` listener from Task 5 so preview-close wins, then fullscreen:

```javascript
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (closeImagePreview()) return;
    exitAiFullscreen();
  });
```

(`closeImagePreview` must now return a boolean: `true` when it actually closed something — change its early return to `return false;` and end with `return true;`.)

Update the citation click handler on `$('ai-body')` — in fullscreen, citations open the source in a new tab instead of scrolling (results are behind the overlay):

```javascript
  $('ai-body').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#result-"]');
    if (!a) return;
    e.preventDefault();
    const n = +(a.getAttribute('href').slice('#result-'.length));
    if ($('ai-panel').classList.contains('ai-fullscreen')) {
      const r = lastResults[n - 1];
      if (r) window.open(r.url, '_blank', 'noopener');
      return;
    }
    const el = document.getElementById('result-' + n);
    if (el) el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  });
```

Call `exitAiFullscreen();` at the top of `showHero()` (alongside `closeImagePreview()`) and at the start of `runSearch()` (a new search always lands inline).

- [ ] **Step 3: Verify manually**

- Search → ⤢ → the panel covers the viewport, centered ~760px column, composer pinned at the bottom, page scroll locked.
- Start a follow-up stream, then hit ⤢ mid-stream → the stream continues uninterrupted in fullscreen (same DOM node).
- In fullscreen, clicking a `[n]` citation opens the source in a new tab; inline it smooth-scrolls.
- ESC and ✕ both exit; exiting restores the inline panel exactly as it was.
- New search while fullscreen → panel is inline again.

- [ ] **Step 4: Commit**

```bash
git add search/index.html search/astra.js
git commit -m "Add fullscreen overlay mode to the Astra AI panel"
```

---

### Task 9: Frontend — thinking row + model-generated waiting lines

**Files:**
- Modify: `search/index.html` (replace `.ai-wave` markup + CSS with `.ai-thinking`)
- Modify: `search/astra.js` (`fetchWaitingLine`, `showThinking`/`hideThinking`, remove `startWaveQuips`, COPY)

- [ ] **Step 1: Swap the markup** (`search/index.html`)

Replace:

```html
    <div class="ai-wave" id="ai-wave"><div class="blob"></div><div class="wave-label" id="ai-wave-label">✦ consulting the cosmos…</div></div>
```

with:

```html
    <div class="ai-thinking" id="ai-thinking" hidden><span class="ai-orb"></span><span class="ai-thinking-line" id="ai-thinking-line"></span></div>
```

- [ ] **Step 2: Swap the CSS** (`search/index.html`)

Delete every `.ai-wave` rule, the `.ai-wave .blob` / `.wave-label` rules, and `@keyframes wave-flow`. Add:

```css
  /* thinking row: pulsing orb + shimmer-sweep line (chatgpt 'thinking…' grammar) */
  .ai-thinking { display: flex; align-items: center; gap: 9px; padding: 10px 2px; }
  .ai-orb { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); animation: orb-pulse 1.2s ease-in-out infinite; flex: none; }
  @keyframes orb-pulse { 0%,100% { transform: scale(.7); opacity: .45; } 50% { transform: scale(1.15); opacity: 1; } }
  .ai-thinking-line { font-size: .84rem; background: linear-gradient(90deg, var(--text-tertiary) 20%, var(--text-primary) 50%, var(--text-tertiary) 80%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: line-shimmer 1.6s linear infinite; }
  @keyframes line-shimmer { to { background-position: -200% 0; } }
```

In the `@supports not (background: conic-gradient(...))` fallback block, remove the `.ai-panel` line ONLY if it references the wave (it references the panel border — keep it). In `@media (prefers-reduced-motion: reduce)`, replace the wave entries:

```css
    .star, .ai-ring, .ai-panel, .r-sentinel-dot, .ig-skel { animation: none !important; }
    .ai-orb { animation: none; }
    .ai-thinking-line { animation: none; background: none; color: var(--text-tertiary); }
    .ai-panel { transition: none; }
```

Also delete the `.ai-panel.done .ai-wave` rules.

- [ ] **Step 3: JS** (`search/astra.js`)

In `COPY`, add:

```javascript
    waitingLineSystem: "You are Astra's loading screen. Write ONE witty 3–8 word loading line about the user's topic. Dry humor, no emoji, no quotes, no trailing period.",
```

Delete `startWaveQuips` entirely. Add:

```javascript
  // ── model-generated waiting line (tiny parallel call; falls back to static quips) ──
  async function fetchWaitingLine(topic) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const res = await fetch(backendBase() + '/v1/chat/completions', {
        method: 'POST',
        signal: ctl.signal,
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          'bypass-tunnel-reminder': 'true',
        },
        body: JSON.stringify({
          model: 'saga-0.7b',
          stream: false,
          max_tokens: 24,
          temperature: 1.0,
          messages: [
            { role: 'system', content: COPY.waitingLineSystem },
            { role: 'user', content: topic },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const c = data && data.choices && data.choices[0] && data.choices[0].message;
      const line = ((c && c.content) || '').trim().replace(/^["']+|["']+$/g, '').replace(/[.!\s]+$/, '');
      if (!line || line.length > 80) return null;
      return line;
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function showThinking(topic, beforeEl) {
    const t = $('ai-thinking');
    if (beforeEl) beforeEl.before(t);               // place where the answer will land
    t.hidden = false;
    $('ai-thinking-line').textContent = COPY.loadingQuips[Math.floor(Math.random() * COPY.loadingQuips.length)];
    fetchWaitingLine(topic).then((line) => {
      if (line && !t.hidden) $('ai-thinking-line').textContent = line;   // dropped if the answer already started
    });
  }

  function hideThinking() { $('ai-thinking').hidden = true; }
```

In `askAstra`: delete both `quipTimer` lines; after `body.innerHTML = '';` and the `aEl` append, insert the thinking row before the answer turn and show it — change the setup block to:

```javascript
    const aEl = document.createElement('div');      // the seed answer turn
    aEl.className = 'ai-turn';
    body.appendChild(aEl);
    showThinking(q, aEl);
```

(`showThinking` with `beforeEl = aEl` moves the shared `#ai-thinking` element into the thread, right where the answer will land.)

In `askFollowUp`: delete both `quipTimer` lines; after `body.append(qEl, aEl);` add:

```javascript
    showThinking(question, aEl);
```

In `streamTurn`, replace the first-token branch (the `ai-wave-label` guard from Task 7) with:

```javascript
            if (!firstToken) { firstToken = true; hideThinking(); }
```

In `runSearch`, add `hideThinking();` right after `$('ai-error').hidden = true;`.

- [ ] **Step 4: Verify manually** (live backend)

- Search → before the first token, the thinking row shows: pulsing ✦ orb + a shimmer-sweep line that is a fresh, query-specific quip (e.g. "why is the sky blue" → something like "bullying photons for answers"). It disappears the moment the answer starts.
- Follow-ups get their own fresh line.
- Stop the backend / block the request → the static quip shows and the answer still works.
- `prefers-reduced-motion` (OS setting) → orb and shimmer are static; the line still shows.

- [ ] **Step 5: Commit**

```bash
git add search/index.html search/astra.js
git commit -m "Replace wave with thinking row + model-generated waiting lines"
```

---

### Task 10: Docs — CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Astra entry**

In `CLAUDE.md`, in the "Other pages" section's `search/index.html` bullet: bump the description to mention the Images tab (`All | ✦ Images`, `?tab=images` URL state, `/api/images` vqd handshake, masonry grid + side-panel preview), infinite scroll (backend `s` offset, sentinel observer), and the v2.3 AI panel (chat-thread layout with user bubbles, ⤢ fullscreen overlay, ⏹ stop, thinking row with model-generated waiting lines). Keep the existing deployment-coupling note and add `/api/images` to the list of temp-backend-only endpoints.

In the backend section's "Temp local backend" paragraph: add `/api/images` (keyless DDG image search via vqd + i.js) and the `s` pagination param on `/api/search`.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — Astra images tab, infinite scroll, chat AI panel"
```

---

## Self-review notes (plan author)

- **Spec coverage:** infinite scroll (T1 backend + T6 frontend) ✓; images tab (T2 backend + T3 routing + T4 grid + T5 preview) ✓; ChatGPT panel (T7) ✓; fullscreen (T8) ✓; thinking row + model waiting lines (T9) ✓; docs (T10) ✓.
- **Type consistency:** `renderResults(results, start, append)` used identically in T6 steps 4/5/6; `showThinking(topic, beforeEl)` / `hideThinking()` consistent between T9 definition and call sites; `closeImagePreview()` returns boolean from T8 onward; `lastResults` (T6) is the citation source in T8; `esc()` defined in T7, used in T7 only (T9 keeps using it); `setStreaming` defined T7.
- **Known ordering constraint:** T7's guarded `$('ai-wave-label')` line in `streamTurn` is replaced outright in T9 — an executor reading out of order must apply T7 before T9.
