# Astra v2 — Keyless Scraping + Cosmic Playground Redesign — Design Spec

**Date:** 2026-08-12
**Status:** Approved (brainstorming complete, pending implementation plan)
**Supersedes:** the Brave-key architecture and visual system sections of
`2026-08-11-okemo-astra-design.md`

## What

Reconnect Okemo Astra to the internet **with no API key** by moving all web
access server-side into `backend/server.py` (DuckDuckGo scraping), make the
Saga AI answer **always on** for every search, and reskin the page as
**"Google bones, Astra skin"** — Google's layout grammar (breadcrumb URLs above
titles, favicons, AI answer panel on top) wearing the **cosmic playground**
flavor (warm parchment canvas, rainbow-ring AI panel, wiggly link underlines,
tilted favicons). Personality target: Saga's dry edge, never corporate.

Decisions locked during brainstorming:

1. AI answer always on — the separate "Ask Astra" mode/button disappears.
2. Personality = Saga's dry edge (answer-first, dry humor, grounded).
3. Brave key flow deleted entirely (`astra_brave_key`, key card, key modal).
4. Scraping approach = DuckDuckGo lite endpoint, server-side (Option A).
5. Layout = Google bones, Astra skin (Option B).
6. Personality flavor = cosmic playground (visual whimsy, Flavor 1).
7. Hero = buttons below the bar, incl. rainbow "i'm feeling cosmic" (Option A).

Mockups: `.superpowers/brainstorm/25657-1786496871/content/`
(`layout-direction.html`, `personality-flavor.html`, `hero-layout.html`).

## Architecture

```
Browser (search/index.html + astra.js)
   │  GET /api/search?q=…       ─► backend/server.py ─► scrape lite.duckduckgo.com
   │  GET /api/suggest?q=…      ─► backend/server.py ─► proxy duckduckgo.com/ac/ (JSON)
   │  POST /v1/chat/completions ─► backend/server.py ─► Saga (existing, unchanged)
```

The browser never touches a third-party origin directly (CORS-safe by
construction). Backend resolution reuses the existing `backendBase()` helper
(`localStorage.vail_custom_backend_url` → `https://api.okemovail.com`).

**Trade-off on record:** search now depends on the backend being up, and DDG
scraping is a gray zone that can rate-limit under heavy use. Fine at personal
scale; the TTL cache + graceful error cards absorb it.

## Backend (`backend/server.py`)

Two new endpoints + an in-memory cache. New dependency: `httpx`. Parsing uses
stdlib `html.parser` — the DDG lite markup is simple enough that no
BeautifulSoup is needed.

### `GET /api/search?q=<query>` → `{"results": [{title, url, description}]}`

- Fetches `https://lite.duckduckgo.com/lite/?q=<query>` with a browser-like
  `User-Agent` (`Mozilla/5.0 (Macintosh; …) AppleWebKit/537.36 … Chrome/126`).
- Parses result rows from the lite table markup via `html.parser`: title +
  href from the result-link anchor, snippet from the snippet cell, skipping
  ad rows (`sponsored` links) and rows missing any field.
- URL cleaning: DDG lite hrefs may be redirect-wrapped
  (`//duckduckgo.com/l/?uddg=<urlencoded>`) — unwrap `uddg` before returning.
- Returns up to ~15 results (what lite typically yields), in the exact
  `{title, url, description}` shape the frontend already renders.
- Defensive: zero parseable rows → `{"results": []}`, never an exception.

### `GET /api/suggest?q=<query>` → `["…", "…"]`

- Proxies `https://duckduckgo.com/ac/?q=<query>&type=list`, returns the JSON
  array's `phrase` fields as a plain string array (max 6).

### Caching + politeness

- In-memory TTL cache (`dict` + timestamps, 10 min TTL, keyed by normalized
  query) on both endpoints. No locking beyond what CPython's dict gives us —
  worst case is a duplicate upstream fetch, which is harmless.
- 8s upstream timeout. On HTTP 202/403 from DDG (anomaly check): sleep ~2s,
  retry once; still failing → respond `429 {"error": "rate_limited"}`.
- On network error/timeout → `502 {"error": "upstream"}`.

### Frontend error contract

| Backend response | Frontend shows |
|---|---|
| 200 + results | normal render + AI stream |
| 200 + `[]` | 🌌 "nothing in this corner" card; AI panel still streams an answer from Saga's own knowledge |
| 429 | 🌙 "slow down, stargazer" + retry; **no AI call** (no grounding, and the point is to back off) |
| 502 / unreachable | 📡 "lost contact with the cosmos" + retry; **no AI call** |

## Frontend (`search/astra.js`)

### Deleted

- All Brave code (`braveSearch`, `braveSuggest`), `getKey`/`saveKey`/
  `updateKeyCard`/`initKeyFlows`, the hero key card, the key modal, the
  "change api key" link, and the `astra_brave_key` localStorage key.
- The `ai` URL param, the "Ask Astra" buttons, and the ⌘↵ shortcut hint.
  (`&ai=1` in old URLs is simply ignored — behavior is identical with or
  without it.)

### New flow

1. `?q=<query>` → `GET backendBase() + /api/search?q=…` → render results →
   **always** call `askAstra(q, results)` (including on zero results — Saga
   answers from knowledge with no grounding, per the existing prompt fallback).
2. Suggestions: `GET /api/suggest` (same 150ms debounce, keyboard nav,
   silent-failure semantics as before — just a different endpoint returning a
   bare string array).
3. `askAstra` is unchanged except its system prompt:

   > You are Astra, Saga's search-oracle alter ego built by Okemo. Answer
   > first, then stop — dry humor welcome, never rude, never corporate.
   > Ground answers in the provided sources and cite inline as [1], [2]…
   > matching the numbered results. If no sources are provided, answer from
   > your own knowledge. Keep it tight: a few sentences, not an essay.

4. **"i'm feeling cosmic"**: picks a random entry from `COPY.placeholders`
   (≠ current input value), fills the bar, and searches it.

### COPY pass

Personality injected into every label: meta line
`found 14 little stars in 0.31s — you're welcome`, rotating AI panel headers
(`asked the universe, it answered…` joins the quip rotation), empty/error
copy kept (already playful). All copy stays centralized in `COPY`.

## Visual system (cosmic playground over Google bones)

`search/index.html` inline `<style>` — still layout + Astra-specific visuals
only; tokens and `.skuo` still come from `design-tokens.css`.

- **Canvas:** warm parchment tint set **page-locally** on `body`
  (light: `#fdf9f4`-family; a paired warmer dark value) — do **not** edit
  shared tokens in `design-tokens.css`. Stars retained, constellation SVG
  retained on hero.
- **Hero:** gradient wordmark + tagline unchanged; search bar centered; two
  pills **below** the bar: `🔍 search the cosmos` (`.skuo .skuo-neutral`) and
  `✦ i'm feeling cosmic` (rainbow conic ring, existing `.ai-ring` technique).
  Hint line updated (`enter = search · no wrong questions`).
- **Results (Google grammar):** each result = favicon (slightly tilted,
  alternating ±~7°) + site name over breadcrumb (`host › path › segments`,
  chevron-separated, ellipsis truncation) **above** the accent-colored title;
  snippet below. Title hover gets `text-decoration: underline wavy
  var(--accent-light) 1px`.
- **AI panel:** always rendered on results view; rainbow conic **border**
  (padding-box/border-box gradient trick) instead of the plain hairline; wave
  → shimmer-collapse behavior unchanged; header rotates playful variants.
- **Dark mode:** all new surfaces pair with `.dark` variants per site rules.
- **`prefers-reduced-motion`:** twinkle, ring spin, and wave stay disabled;
  favicon tilt is static (fine).

## Error handling

Frontend behavior per the contract table above, plus: AI stream failure leaves
links intact and shows the panel inline error + retry (existing). Suggest
failure silently disables the dropdown (existing). Query always stays in the
bar; page never blanks.

## Out of scope (v2)

Pagination, image/news tabs, instant-answer widgets, accounts/history, the
universal floating nav (Astra stays chromeless), keeping Brave as an optional
fallback, SearXNG instances.

## Testing

### Automated (backend)

Extend `backend/tests/` (fake model pattern already in place):

- DDG-lite fixture HTML → parser yields correct `{title, url, description}`
  tuples; ad rows and malformed rows skipped; `uddg` unwrapping works.
- Empty/garbage HTML → `{"results": []}` (no exception).
- 202-then-200 → single retry succeeds; 202-then-202 → 429.
- Cache: second identical query within TTL does not hit upstream.
- Suggest: proxied JSON → bare string array, capped at 6.

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`.

### Manual checklist

1. `./backend/run.sh`, set `localStorage.vail_custom_backend_url` to
   `http://127.0.0.1:8001`, load `/search/`.
2. Hero: buttons below bar, "i'm feeling cosmic" fires a random quip query.
3. Search → Google-style breadcrumb results, tilted favicons, wavy hover.
4. AI panel streams on every search; `[n]` citations jump to result cards.
5. Suggest dropdown works with no key anywhere.
6. Kill backend → 📡 card + retry; no `astra_brave_key` references remain.
7. Light/dark, mobile ~375px, `prefers-reduced-motion`.
