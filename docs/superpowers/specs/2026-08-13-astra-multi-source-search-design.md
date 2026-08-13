# Astra Multi-Source Search (Keyless Fallback Chain) — Design

**Date:** 2026-08-13
**Status:** Approved
**Scope:** `backend/server.py` `/api/search` only. Suggest (`/api/suggest`) and images (`/api/images`) stay DDG-only. Frontend needs zero changes.

## Problem

Astra's web results come from a single keyless source — the DuckDuckGo lite HTML endpoint. DDG aggressively rate-limits scrapers (202 anomaly pages → the backend's single 2s backoff retry → 429), so real users hit the 🌙 "slow down, stargazer" card and the results page dies. Infinite scroll (page 2+, `s` offset) multiplies request volume and makes tripping the limit more likely.

## Goal

Make rate-limits invisible: if one source is limited/down, another silently serves the results. The 🌙/📡 cards should only appear when **every** source has failed.

## Constraints

- **100% keyless** — no API keys anywhere (site identity). Scraped/proxied public endpoints only.
- `backend/server.py` stays a single file (existing convention).
- Response shape stays `{results: [...]}` (plus one additive debug field) — the frontend (`search/astra.js`) requires no changes.
- All pre-existing backend tests must keep passing unchanged in behavior (DDG remains the primary source).

## Architecture

The DDG scrape logic is refactored into the first member of an ordered **source chain**. Each source is a small fetcher with one shared interface:

```
fetch_<source>(q: str, s: int) -> (results: list[dict], None)
                                | (None, reason: "rate_limited" | "upstream")
```

`results` items keep the existing shape: `{title, url, description}` — the same shape `parse_ddg_lite` already returns and the frontend already consumes.

### The chain (order matters)

1. **DuckDuckGo lite** (existing) — `lite.duckduckgo.com/lite/`, `s` offset passthrough, 202/403 anomaly handling with one 2s backoff retry via the existing shared `_http_get_backoff` helper (which `/api/suggest` and `/api/images` keep using unchanged).
2. **Bing** — `https://www.bing.com/search?q=…&first={s+1}` (Bing paginates 1-indexed in steps of ~10; `s=30` → `first=31`). Parse `<li class="b_algo">` blocks: `<h2><a href>` for title/URL, the block's `<p>` for the snippet. Bing frequently wraps URLs as `/ck/a?…&u=a1<base64url>` redirect links — the parser unwraps these (strip the `a1` prefix, base64url-decode) and drops any URL that doesn't resolve to `http(s)`.
3. **Mojeek** — `https://www.mojeek.com/search?q=…&s={s}` (0-indexed, steps of 10). Independent crawler index, scrape-friendly, direct links. Parse `.results-standard > li` blocks: `<h2><a href>` + `<p class="s">`.

Each fetcher maps the shared `s` offset onto its native pagination parameter, so infinite scroll works regardless of which source serves a given page.

## Failover semantics

`api_search(q, s)` walks the chain in order:

- A source **fails** on: network error (`httpx.HTTPError`), non-200 after the source's anomaly backoff (202/403), or 429.
- On failure, the next source is tried immediately (no extra delay beyond the per-source backoff).
- **Only when all three fail** does the endpoint return an error: `429 {"error":"rate_limited"}` if the last failure was a rate-limit, else `502 {"error":"upstream"}`. (This is exactly what the frontend already renders as 🌙 / 📡.)
- **200 with 0 parseable results = legitimately empty.** Returned as `{"results": []}` with NO failover — otherwise every genuinely-empty query would hammer all three sources, and soft-block pages are indistinguishable from empty result pages without heuristic fragility.

## Caching & dedup

- Cache key becomes `(source_name, q_lower, s)` — a successful page from DDG and the same `(q, s)` from Bing are separate entries. Successes only, same 10-min TTL, same `_cache_get`/`_cache_set`.
- The existing cross-page dedup loop now matches on query alone (ignoring the source in the key): a page-2 result is dropped if its URL appeared in **any** cached earlier page of that query, regardless of which source served it. This preserves the DDG-era dedup behavior and extends it to mixed-source pagination.
- Empty-result responses ARE cached (unchanged from current behavior — an empty page is a valid page).

## Response shape

```json
{"results": [{"title": "…", "url": "…", "description": "…"}], "source": "duckduckgo" | "bing" | "mojeek"}
```

`source` is additive and purely for debugging; the frontend ignores it.

## Error handling summary

| Situation | Client sees |
|---|---|
| DDG limited, Bing healthy | 200, results, `source: "bing"` — invisible |
| DDG down (network), Mojeek healthy | 200, results, `source: "mojeek"` |
| All three limited | 429 → frontend 🌙 card (unchanged) |
| All three erroring | 502 → frontend 📡 card (unchanged) |
| First healthy source returns 0 results | 200, `{"results": []}` → 🌌 empty card (unchanged) |

## Testing

All tests use the existing `_fake_http` / `_fake_http_capture` monkeypatch pattern (no real network). The `clear_caches` autouse fixture stays as-is (one shared `_search_cache`, now with 3-tuple keys).

**Parser unit tests** (fixture HTML strings):
- `parse_bing`: extracts title/URL/snippet from `b_algo` blocks; unwraps a `/ck/a?…u=a1…` URL; drops non-http(s) URLs.
- `parse_mojeek`: extracts title/URL/snippet from `.results-standard` items.

**Chain tests:**
- DDG 200 with results → Bing/Mojeek fetchers never called; response `source == "duckduckgo"`.
- DDG 429 (202 twice through the backoff) → Bing serves; 200, `source == "bing"`.
- DDG raises `httpx.HTTPError` → Bing serves.
- DDG 200 with 0 results → `{"results": []}`, Bing NOT called (no failover on empty).
- All three fail (last = 429) → 429 `rate_limited`.
- Cache: same `(q, s)` twice with DDG failing the first time → second request is a cache hit on the Bing entry (no upstream calls).
- Cross-source dedup: page 1 cached from DDG containing `example.com/x`; page 2 (s=30) served by Bing also containing `example.com/x` → dropped from the response.

**Regression:** the full existing suite must pass — DDG-primary behavior is unchanged when DDG is healthy.

## Non-goals

- No frontend changes (no source badge in the UI, no per-source meta line).
- No changes to `/api/suggest` or `/api/images`.
- No round-robin load spreading or result blending (considered and rejected: pagination is source-specific, blending doubles upstream load).
- No Searx instance rotation (could be a fourth source later; not needed for the rate-limit fix).
