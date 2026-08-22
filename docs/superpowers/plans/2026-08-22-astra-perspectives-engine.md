# Astra Perspectives Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Perspectives toggle to Astra's AI panel that fetches all 3 search sources in parallel and uses the LLM to extract consensus, contradictions, outliers, and source diversity — making every search a critical thinking tool.

**Architecture:** New `GET /api/perspectives` endpoint in `okemollm/train.py` does parallel DDG+Bing+Mojeek scrape, deduplicates with source tagging, calls the model non-streaming with a structured prompt, and returns JSON. Frontend toggle lives in the AI panel header alongside the existing Answer mode; a pure parser in `astra-helpers.js` consumes the response and renders collapsible accordion sections with citation links.

**Tech Stack:** Python (FastAPI, httpx, asyncio), vanilla JS, CSS, Node `assert`.

**Spec:** `docs/superpowers/specs/2026-08-22-astra-perspectives-engine-design.md`

**Note on repo layout:** Two repos are involved. The backend lives in the sibling `okemollm/` repo at `../okemollm/train.py` (relative to `web/`). The frontend lives in `web/`. All absolute paths: backend = `C:\Users\okemo\Desktop\Projects\web projects\okemollm\train.py`, frontend = `C:\Users\okemo\Desktop\Projects\web projects\web\`. Task 1 commits to the `okemollm` repo; Tasks 2–5 commit to the `web` repo. Both repos must be clean (no uncommitted changes) before starting.

## Global Constraints

- No API keys anywhere — all search is keyless scraping
- No new CDN dependencies, no npm packages, no framework
- No new tabs — Perspectives lives as a toggle within the existing AI panel header
- Flat design language — no shadows, gradients, or blur on new UI chrome
- `prefers-reduced-motion` and `navigator.webdriver` guards on all new animations
- Target model: Qwen 2.5 VL 9B (temperature 0.3, non-streaming, max 1500 tokens)
- 10-min TTL cache, same cache pattern as existing `/api/search`

---

### Task 1: Backend Perspectives Endpoint

**Files:**
- Modify: `okemollm/train.py` (add after the `/api/preview` endpoint, before any unrelated sections)

**Interfaces:**
- Produces: `GET /api/perspectives?q=...&n=15` → `{ query, results: [{title,url,snippet,domain,sources}], perspectives: {consensus,contradictions,outliers,source_map} }`

- [ ] Add a `_perspectives_cache = {}` dict near the other cache variables (line ~2044).

- [ ] Add helper `_extract_domain(url)` — extracts hostname from a URL string, strips `www.` prefix, returns the domain. Returns `""` for malformed URLs.

```python
def _extract_domain(url: str) -> str:
    try:
        host = urlparse(url).hostname or ""
        return host.removeprefix("www.")
    except Exception:
        return ""
```

- [ ] Add the endpoint function:

```python
@app.get("/api/perspectives")
async def api_perspectives(q: str = "", n: int = 15):
    """Fetch all 3 search sources in parallel, deduplicate with source tags,
    then ask the LLM to extract consensus / contradictions / outliers / source diversity."""
    q = (q or "").strip()
    if not q:
        return {"query": q, "results": [], "perspectives": None}
    n = max(5, min(n, 30))
    qk = q.lower()

    # Cache check
    cached = _cache_get(_perspectives_cache, qk)
    if cached is not None:
        return cached

    # Parallel fetch from all 3 sources
    ddg_r, bing_r, mojeek_r = await asyncio.gather(
        _fetch_ddg(q, 0),
        _fetch_bing(q, 0),
        _fetch_mojeek(q, 0),
    )

    # Collect results with source tags, respecting partial failures
    all_results = []  # list of (result_dict, source_name)
    for source, (results, reason) in [("ddg", ddg_r), ("bing", bing_r), ("mojeek", mojeek_r)]:
        if results is not None:
            for r in results:
                all_results.append((r, source))

    if not all_results:
        return JSONResponse({"error": "upstream", "query": q}, status_code=502)

    # Deduplicate by URL, merging source tags
    deduped = {}  # url -> {title, url, snippet, sources: [set], domain}
    for r, source in all_results:
        url = r.get("url", "").rstrip("/")
        if url not in deduped:
            deduped[url] = {
                "title": r.get("title", ""),
                "url": url,
                "snippet": r.get("description", ""),
                "sources": {source},
                "domain": _extract_domain(url),
            }
        else:
            deduped[url]["sources"].add(source)

    # Build ordered list, cap at n
    results = []
    for i, (url, r) in enumerate(deduped.items()):
        if i >= n:
            break
        results.append({
            "title": r["title"],
            "url": r["url"],
            "snippet": r["snippet"],
            "sources": sorted(r["sources"]),
            "domain": r["domain"],
        })

    # Build the user message with formatted results
    lines = []
    for i, r in enumerate(results):
        sources_str = ", ".join(s.title() for s in r["sources"])
        lines.append(f"[{i + 1}] {r['title']} | {r['domain']} | found by: {sources_str}")
        lines.append(f"    {r['snippet'][:300]}")
    results_text = "\n".join(lines)

    # Perspectives system prompt
    system_prompt = (
        "You are Astra's Perspectives Engine. Analyze search results and identify where "
        "sources agree, disagree, and diverge.\n\n"
        "You receive results as: [N] Title | domain | found by: DDG, Bing, Mojeek\n"
        "followed by a snippet.\n\n"
        "Rules:\n"
        "1. CONSENSUS: claims backed by 3+ results. Be specific — \"climate change is "
        "real\" is too vague; \"Global temperatures have risen 1.1C since pre-industrial "
        "levels\" is a claim. Cite result numbers.\n"
        "2. CONTRADICTIONS: genuine disagreements where two groups of sources say "
        "opposite things about the same question. Different wording of the same "
        "fact is NOT a contradiction. Show both sides with citations.\n"
        "3. OUTLIERS: interesting claims from 1-2 results only, uncorroborated.\n"
        "4. If sources overwhelmingly agree, say so honestly. Never fabricate disagreement.\n"
        "5. Sparse or low-quality results? Signal that rather than hallucinate.\n"
        "6. Claims: 1-2 sentences. Max 5 entries per section.\n"
        "7. Output ONLY valid JSON. No markdown, no preamble, no trailing text."
    )
    user_message = f"Query: {q}\n\n{results_text}"

    # Call the model non-streaming
    req = ChatRequest(
        model="saga-0.7b",
        messages=[
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_message),
        ],
        max_tokens=1500,
        temperature=0.3,
        stream=False,
        use_thought=False,
    )

    try:
        response = await chat_completions(req)
    except Exception:
        # Graceful fallback: return results without perspectives analysis
        resp = {"query": q, "results": results, "perspectives": None}
        _cache_set(_perspectives_cache, qk, resp)
        return resp

    # The response from chat_completions is a StreamingResponse or JSONResponse.
    # For non-streaming, it's a JSONResponse. Extract the content.
    # chat_completions returns OpenAI-format: {choices: [{message: {content: "..."}}]}
    import json as _json
    try:
        body = _json.loads(response.body.decode("utf-8"))
        raw_text = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, AttributeError, _json.JSONDecodeError, UnicodeDecodeError):
        resp = {"query": q, "results": results, "perspectives": None}
        _cache_set(_perspectives_cache, qk, resp)
        return resp

    # Parse JSON from the model output (strip markdown code fences if present)
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[-1]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()
    if raw_text.startswith("json"):
        raw_text = raw_text[4:].strip()

    try:
        perspectives = _json.loads(raw_text)
    except _json.JSONDecodeError:
        # Fallback: try regex tagged-text parsing (handled on frontend if None)
        perspectives = None

    resp = {"query": q, "results": results, "perspectives": perspectives}
    _cache_set(_perspectives_cache, qk, resp)
    return resp
```

- [ ] Verify the import of `asyncio` is present at the top of `train.py` (it should be — this is an async FastAPI app).

- [ ] **Step: Test the endpoint manually.** Start the backend, query: `curl "http://localhost:8001/api/perspectives?q=electric+cars+vs+gas+cars+environment"`. Verify the response has `results` with source tags and `perspectives` with consensus/contradictions/outliers/source_map keys.

- [ ] Commit:
```bash
git -C "../okemollm" add train.py
git -C "../okemollm" commit -m "feat: add /api/perspectives endpoint for multi-source consensus analysis"
```

---

### Task 2: Frontend Perspectives Response Parser

**Files:**
- Modify: `search/astra-helpers.js`
- Modify: `test-astra.mjs`

**Interfaces:**
- Produces: `window.AstraHelpers.parsePerspectivesJSON(json)` → rendered HTML string for the AI panel body
- Consumes: the `perspectives` object from the API response shape (Task 1)

- [ ] Add failing tests to `test-astra.mjs`:

```js
// ── Perspectives parser ──

// Full valid JSON
const fullJson = {
  consensus: [
    { claim: "EVs produce fewer lifecycle emissions", citations: [1, 3, 5] },
    { claim: "Battery production is carbon-intensive", citations: [2, 4] }
  ],
  contradictions: [
    {
      position_a: { claim: "Lithium mining has severe impact", citations: [1, 3] },
      position_b: { claim: "Mining impact is overstated", citations: [5, 7] }
    }
  ],
  outliers: [
    { claim: "EV tires produce more particulates", citation: 8 }
  ],
  source_map: {
    ddg: 14, bing: 11, mojeek: 9,
    overlap_all_three: 5,
    domain_types: { academic: 30, news: 25, commercial: 20, personal: 15 }
  }
};

// Test: parser returns HTML string containing section markers
const html = AstraHelpers.parsePerspectivesJSON(fullJson);
assert(html.includes('perspectives-consensus'), 'should render consensus section');
assert(html.includes('EVs produce fewer'), 'should include claim text');
assert(html.includes('[1, 3, 5]'), 'should include citation badges');
assert(html.includes('perspectives-contradictions'), 'should render contradictions section');
assert(html.includes('position_a'), 'should render position A');
assert(html.includes('position_b'), 'should render position B');
assert(html.includes('perspectives-outliers'), 'should render outliers section');
assert(html.includes('perspectives-sourcemap'), 'should render source map section');

// Test: null perspectives
const nullResult = AstraHelpers.parsePerspectivesJSON(null);
assert(nullResult.includes('perspectives-fallback'), 'null should render fallback message');

// Test: empty all sections
const emptyJson = { consensus: [], contradictions: [], outliers: [], source_map: {} };
const emptyHtml = AstraHelpers.parsePerspectivesJSON(emptyJson);
assert(emptyHtml.includes('Sources overwhelmingly agree'), 'empty contradictions should show agree text');
assert(emptyHtml.includes('No uncorroborated outliers'), 'empty outliers should show no-outliers text');

// Test: consensus-only (no contradictions or outliers keys)
const consensusOnly = { consensus: [{ claim: "Only fact", citations: [1] }], source_map: { ddg: 10 } };
const consOnlyHtml = AstraHelpers.parsePerspectivesJSON(consensusOnly);
assert(consOnlyHtml.includes('perspectives-consensus'), 'should show consensus');
assert(consOnlyHtml.includes('[1]'), 'should cite single source');
assert(!consOnlyHtml.includes('perspectives-contradictions'), 'should omit contradictions section when key missing');
assert(!consOnlyHtml.includes('perspectives-outliers'), 'should omit outliers section when key missing');

// Test: source map with all fields present
assert(html.includes('DDG (14)'), 'should show DDG count');
assert(html.includes('Bing (11)'), 'should show Bing count');
assert(html.includes('Mojeek (9)'), 'should show Mojeek count');
assert(html.includes('5 shared'), 'should show overlap count');
assert(html.includes('Academic 30%'), 'should show domain type');
```

- [ ] Run `node test-astra.mjs` and verify the new assertions fail.

- [ ] Implement `parsePerspectivesJSON` in `search/astra-helpers.js`:

```js
AstraHelpers.parsePerspectivesJSON = function (perspectives) {
  if (!perspectives) {
    return '<div class="perspectives-fallback">Perspectives analysis unavailable. Showing standard results.</div>';
  }

  var sections = [];

  // ── Source summary bar ──
  var sm = perspectives.source_map || {};
  var totalSources = (sm.ddg > 0 ? 1 : 0) + (sm.bing > 0 ? 1 : 0) + (sm.mojeek > 0 ? 1 : 0);
  var totalResults = (sm.ddg || 0) + (sm.bing || 0) + (sm.mojeek || 0);
  var overlap = sm.overlap_all_three || 0;
  sections.push(
    '<div class="perspectives-bar">' +
      totalSources + ' sources &middot; ' + totalResults + ' unique results &middot; ' + overlap + ' shared across all three' +
    '</div>'
  );

  // ── Consensus ──
  var hasConsensus = perspectives.consensus && perspectives.consensus.length > 0;
  sections.push('<details class="perspectives-section perspectives-consensus"' + (hasConsensus ? ' open' : '') + '>');
  sections.push('<summary class="perspectives-summary"><span class="perspectives-dot consensus-dot"></span>Consensus</summary>');
  if (hasConsensus) {
    sections.push('<ul class="perspectives-claims">');
    perspectives.consensus.forEach(function (c) {
      sections.push('<li>' + escapeHtml(c.claim) + ' <span class="perspectives-cites">' + formatCitations(c.citations) + '</span></li>');
    });
    sections.push('</ul>');
  } else {
    sections.push('<p class="perspectives-empty">No clear consensus found across sources.</p>');
  }
  sections.push('</details>');

  // ── Contradictions ──
  var hasContradictions = perspectives.contradictions && perspectives.contradictions.length > 0;
  sections.push('<details class="perspectives-section perspectives-contradictions"' + (hasContradictions ? ' open' : '') + '>');
  sections.push('<summary class="perspectives-summary"><span class="perspectives-dot contradictions-dot"></span>Contradictions</summary>');
  if (hasContradictions) {
    perspectives.contradictions.forEach(function (c) {
      sections.push(
        '<div class="perspectives-dual">' +
          '<div class="perspectives-pos">' +
            '<span class="perspectives-pos-label">Position A</span>' +
            '<p>' + escapeHtml(c.position_a.claim) + ' <span class="perspectives-cites">' + formatCitations(c.position_a.citations) + '</span></p>' +
          '</div>' +
          '<div class="perspectives-pos">' +
            '<span class="perspectives-pos-label">Position B</span>' +
            '<p>' + escapeHtml(c.position_b.claim) + ' <span class="perspectives-cites">' + formatCitations(c.position_b.citations) + '</span></p>' +
          '</div>' +
        '</div>'
      );
    });
  } else {
    sections.push('<p class="perspectives-empty">Sources overwhelmingly agree on this topic. No significant disagreements found.</p>');
  }
  sections.push('</details>');

  // ── Outliers ──
  var hasOutliers = perspectives.outliers && perspectives.outliers.length > 0;
  sections.push('<details class="perspectives-section perspectives-outliers"' + (hasOutliers ? ' open' : '') + '>');
  sections.push('<summary class="perspectives-summary"><span class="perspectives-dot outliers-dot"></span>Outliers</summary>');
  if (hasOutliers) {
    sections.push('<ul class="perspectives-claims">');
    perspectives.outliers.forEach(function (o) {
      sections.push('<li>' + escapeHtml(o.claim) + ' <span class="perspectives-cites">' + formatCitations(o.citation != null ? [o.citation] : []) + '</span></li>');
    });
    sections.push('</ul>');
  } else {
    sections.push('<p class="perspectives-empty">No uncorroborated outlier claims found.</p>');
  }
  sections.push('</details>');

  // ── Source Map ──
  sections.push('<details class="perspectives-section perspectives-sourcemap">');
  sections.push('<summary class="perspectives-summary"><span class="perspectives-dot sourcemap-dot"></span>Source Map</summary>');
  sections.push('<div class="perspectives-source-bars">');
  var maxCount = Math.max(sm.ddg || 0, sm.bing || 0, sm.mojeek || 0, 1);
  ['ddg', 'bing', 'mojeek'].forEach(function (name) {
    var count = sm[name] || 0;
    var pct = Math.round((count / maxCount) * 100);
    var label = name === 'ddg' ? 'DDG' : (name === 'bing' ? 'Bing' : 'Mojeek');
    sections.push(
      '<div class="perspectives-source-row">' +
        '<span class="perspectives-source-label">' + label + '</span>' +
        '<span class="perspectives-source-bar" style="width:' + pct + '%"></span>' +
        '<span class="perspectives-source-count">' + count + '</span>' +
      '</div>'
    );
  });
  if (sm.overlap_all_three) {
    sections.push('<p class="perspectives-overlap">' + sm.overlap_all_three + ' results shared across all three sources</p>');
  }
  if (sm.domain_types) {
    var types = [];
    for (var key in sm.domain_types) {
      if (sm.domain_types.hasOwnProperty(key)) {
        types.push(key.charAt(0).toUpperCase() + key.slice(1) + ' ' + sm.domain_types[key] + '%');
      }
    }
    sections.push('<p class="perspectives-domain-types">' + types.join(' &middot; ') + '</p>');
  }
  sections.push('</div>');
  sections.push('</details>');

  return sections.join('');
};
```

- [ ] Add the helper functions `formatCitations` and `escapeHtml` inside `AstraHelpers`:

```js
function formatCitations(nums) {
  if (!nums || !nums.length) return '';
  return '<span class="perspectives-cites">[' + nums.map(function (n) {
    return '<a href="#result-' + n + '" class="perspectives-cite-link" data-cite="' + n + '">' + n + '</a>';
  }).join(', ') + ']</span>';
}

// escapeHtml already exists in astra-helpers.js — reuse it. If it doesn't, add:
// function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
```

- [ ] Run `node test-astra.mjs` and verify all perspectives tests pass.

- [ ] Commit:
```bash
git add search/astra-helpers.js test-astra.mjs
git commit -m "feat: add parsePerspectivesJSON parser and tests"
```

---

### Task 3: AI Panel Toggle And Perspectives Rendering

**Files:**
- Modify: `search/index.html`
- Modify: `search/astra.js`

**Interfaces:**
- Consumes: `AstraHelpers.parsePerspectivesJSON` (Task 2), `GET /api/perspectives` (Task 1)
- Produces: Toggle UI in the AI panel header, `runPerspectives()` function, citation click wiring

- [ ] Add toggle buttons to the AI panel header in `search/index.html`. Replace the current `#ai-head` content (line 66):

```html
<div class="ai-head">
  <span id="ai-head-label">✦ Astra Answer</span>
  <div class="ai-mode-toggle" id="ai-mode-toggle" role="radiogroup" aria-label="AI panel mode">
    <button class="ai-mode-btn on" id="ai-mode-answer" role="radio" aria-checked="true" type="button">Answer</button>
    <button class="ai-mode-btn" id="ai-mode-perspectives" role="radio" aria-checked="false" type="button">⚖ Perspectives</button>
  </div>
  <button class="skuo skuo-icon" id="ai-expand" aria-label="fullscreen" aria-expanded="false" aria-controls="ai-panel" title="fullscreen">⤢</button>
</div>
```

- [ ] Add `runPerspectives(q)` to `search/astra.js` (after the existing `runSearch` function area):

```js
window.runPerspectives = async function (q) {
  var panel = el('ai-panel');
  var body = el('ai-body');
  panel.removeAttribute('aria-busy');
  panel.setAttribute('aria-busy', 'true');
  body.innerHTML = '<div class="perspectives-loading">' +
    '<div class="perspectives-skel"><span></span><span></span><span></span></div>' +
    '<div class="perspectives-skel"><span></span><span></span></div>' +
    '<div class="perspectives-skel"><span></span><span></span><span></span></div>' +
  '</div>';

  try {
    var res = await fetch(backendBase() + '/api/perspectives?q=' + encodeURIComponent(q));
    if (!res.ok) throw new Error('perspectives fetch failed');
    var data = await res.json();
    if (data.perspectives === null) {
      body.innerHTML = '<div class="perspectives-fallback">Perspectives analysis unavailable for this query. <button class="skuo skuo-neutral" id="perspectives-fallback-answer">Try standard answer</button></div>';
      document.getElementById('perspectives-fallback-answer').onclick = function () {
        setAiPanelMode('answer');
        runSearch(q);
      };
      return;
    }
    body.innerHTML = AstraHelpers.parsePerspectivesJSON(data.perspectives);
    // Wire citation clicks to smooth-scroll + highlight
    wirePerspectivesCitations();
  } catch (e) {
    console.error('Perspectives error:', e);
    body.innerHTML = '<div class="perspectives-fallback">Perspectives analysis failed. <button class="skuo skuo-neutral" id="perspectives-fallback-answer">Try standard answer</button></div>';
    document.getElementById('perspectives-fallback-answer').onclick = function () {
      setAiPanelMode('answer');
      runSearch(q);
    };
  } finally {
    panel.setAttribute('aria-busy', 'false');
  }
};
```

- [ ] Add `wirePerspectivesCitations()`, `setAiPanelMode(mode)`, and `getAiPanelMode()`:

```js
function wirePerspectivesCitations() {
  var links = document.querySelectorAll('.perspectives-cite-link');
  links.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var targetId = this.getAttribute('href');
      if (!targetId) return;
      var target = document.querySelector(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('citation-target');
      setTimeout(function () { target.classList.remove('citation-target'); }, 1600);
    });
  });
}

function setAiPanelMode(mode) {
  var answerBtn = document.getElementById('ai-mode-answer');
  var perspectivesBtn = document.getElementById('ai-mode-perspectives');
  if (mode === 'perspectives') {
    answerBtn.classList.remove('on');
    answerBtn.setAttribute('aria-checked', 'false');
    perspectivesBtn.classList.add('on');
    perspectivesBtn.setAttribute('aria-checked', 'true');
  } else {
    perspectivesBtn.classList.remove('on');
    perspectivesBtn.setAttribute('aria-checked', 'false');
    answerBtn.classList.add('on');
    answerBtn.setAttribute('aria-checked', 'true');
  }
  localStorage.setItem('astra_perspectives_mode', mode);
}

function getAiPanelMode() {
  return localStorage.getItem('astra_perspectives_mode') || 'answer';
}
```

- [ ] Wire the toggle buttons in the setup/init area of `astra.js`:

```js
document.getElementById('ai-mode-answer').addEventListener('click', function () {
  setAiPanelMode('answer');
  var q = getCurrentQuery(); // existing helper or read from URL
  if (q) runSearch(q);
});

document.getElementById('ai-mode-perspectives').addEventListener('click', function () {
  setAiPanelMode('perspectives');
  var q = getCurrentQuery();
  if (q) runPerspectives(q);
});
```

- [ ] Modify the existing `showResults(q, tab)` function: when `tab === 'all'`, check `getAiPanelMode()`. If `'perspectives'`, call `runPerspectives(q)` instead of `askAstra(q, ...)`.

- [ ] Add `getCurrentQuery()` helper if it doesn't exist:

```js
function getCurrentQuery() {
  var p = new URLSearchParams(window.location.search);
  return p.get('q') || '';
}
```

- [ ] **Step: Smoke test in browser.** Load Astra, search a query, toggle to Perspectives. Verify the panel switches modes, shows skeletons during load, then renders sections. Click citations to verify smooth-scroll + highlight.

- [ ] Commit:
```bash
git add search/index.html search/astra.js
git commit -m "feat: add AI panel Perspectives toggle with section rendering"
```

---

### Task 4: Perspectives Styles

**Files:**
- Modify: `src/site.css` (under the `[data-page="search"]` section)

- [ ] Add styles after the existing AI panel styles in the search section of `site.css`. All selectors are scoped under `[data-page="search"]` or use the `.perspectives-*` class namespace:

```css
/* ═══ AI Mode Toggle ═══ */
.ai-mode-toggle {
  display: flex;
  gap: 2px;
  margin-left: 12px;
}
.ai-mode-btn {
  padding: 2px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-family: inherit;
  cursor: pointer;
  transition: background-color var(--dur-2) var(--ease-smooth),
              color var(--dur-2) var(--ease-smooth);
}
.ai-mode-btn.on {
  background: var(--skuo-accent);
  color: #fff;
  border-color: var(--skuo-accent);
}
.ai-mode-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--skuo-accent), transparent 55%);
}

/* ═══ Perspectives Bar ═══ */
.perspectives-bar {
  padding: 8px 12px;
  font-size: 0.78rem;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
}

/* ═══ Perspectives Sections ═══ */
.perspectives-section {
  margin-bottom: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.perspectives-section[open] {
  /* No shadow per flat design */
}
.perspectives-summary {
  padding: 10px 12px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
  list-style: none;
  color: var(--text-primary);
  background: var(--bg-elevated);
}
.perspectives-summary::-webkit-details-marker { display: none; }
.perspectives-summary::before {
  content: '▸';
  font-size: 0.75rem;
  transition: transform var(--dur-2) var(--ease-smooth);
  width: 12px;
  flex-shrink: 0;
}
.perspectives-section[open] > .perspectives-summary::before {
  transform: rotate(90deg);
}
.perspectives-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.consensus-dot { background: #2e7d32; }
.contradictions-dot { background: #e65100; }
.outliers-dot { background: var(--skuo-accent); }
.sourcemap-dot { background: var(--text-tertiary); }

/* ── Section content ── */
.perspectives-claims {
  list-style: none;
  margin: 0;
  padding: 8px 12px 12px 28px;
}
.perspectives-claims li {
  padding: 4px 0;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border);
}
.perspectives-claims li:last-child { border-bottom: none; }

.perspectives-empty {
  padding: 8px 12px 12px 28px;
  font-size: 0.85rem;
  color: var(--text-tertiary);
  font-style: italic;
  margin: 0;
}

/* ── Contradictions dual column ── */
.perspectives-dual {
  display: flex;
  gap: 12px;
  padding: 8px 12px 12px 28px;
}
.perspectives-pos {
  flex: 1;
  min-width: 0;
}
.perspectives-pos-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 4px;
}
.perspectives-pos p {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--text-primary);
}

@media (max-width: 600px) {
  .perspectives-dual {
    flex-direction: column;
    gap: 8px;
  }
}

/* ── Citations ── */
.perspectives-cites {
  white-space: nowrap;
  font-size: 0.78rem;
  color: var(--text-tertiary);
}
.perspectives-cite-link {
  color: var(--skuo-accent);
  text-decoration: none;
  font-weight: 500;
}
.perspectives-cite-link:hover {
  text-decoration: underline;
}

/* ── Source Map ── */
.perspectives-source-bars {
  padding: 8px 12px 12px 28px;
}
.perspectives-source-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.perspectives-source-label {
  width: 44px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.perspectives-source-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--skuo-accent);
  flex-shrink: 1;
  min-width: 8px;
  transition: width var(--dur-3) var(--ease-smooth);
}
.perspectives-source-count {
  font-size: 0.8rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.perspectives-overlap {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin: 8px 0 4px;
}
.perspectives-domain-types {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  margin: 4px 0 0;
}

/* ── Loading skeletons ── */
.perspectives-loading {
  padding: 12px;
}
.perspectives-skel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.perspectives-skel span {
  display: block;
  height: 12px;
  border-radius: 4px;
  background: var(--bg-elevated);
  animation: skel-shimmer 1.5s ease-in-out infinite;
}
.perspectives-skel span:nth-child(1) { width: 70%; }
.perspectives-skel span:nth-child(2) { width: 55%; }
.perspectives-skel span:nth-child(3) { width: 85%; }
.perspectives-skel:last-child span:nth-child(1) { width: 60%; }
.perspectives-skel:last-child span:nth-child(2) { width: 40%; }

/* ── Fallback state ── */
.perspectives-fallback {
  padding: 24px 16px;
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .perspectives-skel span { animation: none; }
  .perspectives-source-bar { transition: none; }
}
```

- [ ] Verify the styles compile correctly if using Tailwind CLI: `npx @tailwindcss/cli -i src/input.css -o src/output.css`. (These are in `src/site.css`, not `input.css`, so no compilation needed for these specific rules — but verify no CSS syntax errors.)

- [ ] Commit:
```bash
git add src/site.css
git commit -m "style: add Perspectives panel styles (sections, toggle, source map)"
```

---

### Task 5: Integration Test And Final Verification

**Files:**
- Modify: `test-astra.mjs`

- [ ] Add a response-shape contract test:

```js
// ── API response shape contract ──
var validResponse = {
  query: "test",
  results: [
    { title: "T", url: "https://example.com", snippet: "s", sources: ["ddg", "bing"], domain: "example.com" }
  ],
  perspectives: {
    consensus: [{ claim: "c", citations: [1] }],
    contradictions: [],
    outliers: [],
    source_map: { ddg: 5, bing: 3, mojeek: 2, overlap_all_three: 1, domain_types: { academic: 50 } }
  }
};

// Test full round-trip through parser with this payload
var roundTrip = AstraHelpers.parsePerspectivesJSON(validResponse.perspectives);
assert(roundTrip.includes('perspectives-consensus'), 'valid response round-trips through parser');
assert(roundTrip.includes('5'), 'source map count appears');
```

- [ ] Run `node test-astra.mjs` and verify all existing + new tests pass.

- [ ] **Manual browser verification checklist:**
  1. Open Astra, search "electric cars vs gas cars environment"
  2. Click the "⚖ Perspectives" toggle in the AI panel header
  3. Verify the panel shows skeletons during load (~5-9s)
  4. Verify sections render: Consensus (green dot), Contradictions (amber dot), Outliers (accent dot), Source Map
  5. Click a citation number — verify smooth-scroll to result + highlight
  6. Toggle back to "Answer" — verify standard AI answer loads
  7. Search "weather Tokyo" — if sources mostly agree, verify "no significant disagreements" copy
  8. Toggle the theme — verify light/dark mode works on perspectives sections
  9. Mobile viewport (<=600px) — verify contradiction dual column stacks vertically

- [ ] Commit:
```bash
git add test-astra.mjs
git commit -m "test: add perspectives response shape contract test"
```

---

### Final Commit Checklist

- [ ] `node test-astra.mjs` passes all tests (including existing ones)
- [ ] Backend `GET /api/perspectives` returns valid JSON for sample queries
- [ ] Perspectives toggle persists across searches in a session (`astra_perspectives_mode` in localStorage)
- [ ] Dark mode renders correctly
- [ ] Reduced motion respected
- [ ] No console errors during mode switching
