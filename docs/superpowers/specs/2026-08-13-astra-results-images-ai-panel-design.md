# Okemo Astra — infinite results, Images tab, ChatGPT-style AI panel with fullscreen

**Date:** 2026-08-13
**Status:** approved (brainstorming session, visual companion — Option A chosen for the AI panel)
**Touches:** `search/index.html`, `search/astra.js`, `backend/server.py`, `backend/tests/`

## Summary

Three upgrades to Okemo Astra (`search/index.html`):

1. **More results via infinite scroll** — the backend paginates DuckDuckGo lite with an `s` offset; the frontend auto-fetches the next page as the user scrolls.
2. **Images tab** — keyless DuckDuckGo image search (`vqd` handshake + `i.js`), Google-style `All | ✦ Images` tabs, masonry grid, side-panel preview.
3. **ChatGPT-ified AI panel with fullscreen** — the Astra answer panel becomes a real chat thread (right-aligned user bubbles, plain assistant text), gains a ⤢ fullscreen overlay mode, a ⏹ stop button, and a ChatGPT-style "thinking" row showing a **model-generated waiting line** per turn.

## 1. Infinite scroll results

### Backend (`backend/server.py`)

- `GET /api/search` gains an optional `s` int param (default `0`), passed straight through to DDG lite as the pagination offset (steps of 30).
- The response shape is unchanged: `{results: [{title, url, description}]}` (still capped at 15 per page — the *page* size stays, the user just gets more pages).
- Cache key becomes `(q.lower(), s)`; TTL stays 10 min.
- Dedup guard: results whose URL was already served for an earlier offset of the same query are dropped (DDG occasionally repeats rows across pages).
- **Risk:** DDG lite's `s` on GET is undocumented. If it proves to ignore `s` (same page returned forever), the fallback is `https://html.duckduckgo.com/html/` (supports `s` offsets, different markup — `.result__a` / `.result__snippet` classes). The dedup guard makes the failure mode harmless (empty page → frontend stops). Verified-blocked note: DDG threw 202 anomaly checks at curl during design; the server already backs off once and retries.

### Frontend (`search/astra.js`)

- A sentinel `<li id="result-sentinel">` after the last result, watched by an `IntersectionObserver` (root margin ~400px so the next page loads before the user hits the bottom).
- On intersect: fetch `?q=…&s=<nextOffset>`, append results, advance offset by 30.
- Result numbering keeps incrementing across pages (`result-16`, `result-17`…) so AI citation jump links (`#result-n`) stay valid.
- Stop conditions: a page returns 0 new (post-dedup) results, or the total reaches 120 (sane cap). On stop, the sentinel is replaced by a small "✦ that's everything in this corner of the universe" line.
- The meta line updates as pages land ("found 45 little stars…").
- Errors mid-scroll (429/offline) render the existing status-card style retry inline at the list end; the AI answer is unaffected (it grounds on the first page's top 5, unchanged).
- A new typed query resets the offset, the observer, and the list.

## 2. Images tab

### Backend

- New `GET /api/images?q=` → `{results: [{image, thumbnail, title, url, width, height}]}`.
- Keyless handshake (verified working 2026-08-13, ~77 results for "cats"):
  1. `GET https://duckduckgo.com/?q=…` with the existing browser UA; regex-extract `vqd="([^"]+)"`.
  2. `GET https://duckduckgo.com/i.js?l=us-en&o=json&q=…&vqd=…` with `Referer: https://duckduckgo.com/`.
- Same retry/backoff policy as `/api/search` (202/403 → one 2s backoff; 429 → 429; other failures → 502).
- Same 10-min TTL cache (`_images_cache`, keyed by `q.lower()`).
- No image proxying — thumbnails/full images load from their CDNs directly client-side.

### Frontend

- Tab row under the search bar on the results page: `All | ✦ Images` (segmented-control look via existing tokens; active tab = accent).
- Tab state lives in the URL: `?q=…&tab=images` (`tab` omitted for All). Shareable, bookmarkable, `popstate`-safe. `go()` learns to preserve/set `tab`.
- The Images tab loads lazily on first visit per query (cached in memory per query afterwards).
- Grid: CSS `columns` masonry (Google Images feel), `loading="lazy"` thumbnails, skeleton shimmer placeholders while loading. The tilted-favicon mischief stays on the All tab only.
- AI panel is part of the All tab; hidden on Images. The thread is *not* killed by tab switches — switching back to All re-shows it as-is.
- Click on a thumbnail → **side-panel preview**:
  - Desktop: fixed right panel (~380px, `var(--bg-elevated)` card, backdrop scrim); mobile (≤768px): bottom sheet.
  - Contents: full image (thumbnail shown instantly as placeholder while the full one loads), title, source host, `visit source` (`.skuo-accent`) and `open image` (`.skuo-neutral`) buttons, ✕ / ESC / scrim-click to close.
- Empty results → existing `statusCard('🌌', …)` pattern; errors → 📡/🌙 + retry.

## 3. ChatGPT-ified AI panel + fullscreen

- **Thread layout (Option A from the brainstorm mockup):**
  - Astra turns: plain left-aligned text with a small ✦ accent marker (no bubble).
  - User follow-ups: right-aligned rounded bubbles (grey neutral surface — `color-mix` of `--bg-elevated`), replacing the current italic `.ai-q` "you ✦" style.
  - Existing citation linkification `[n]` keeps working in all turns.
- **Header:** `✦ Astra Answer` (rotating headers stay) + right-side ⤢ fullscreen button (`.skuo-icon`-sized).
- **Fullscreen mode:**
  - The *same* `#ai-panel` element gets a `.ai-fullscreen` class → `position: fixed; inset: 0; z-index: 60` with its own scroll column (centered, `max-width: 760px`), composer pinned at the bottom. Same DOM node = no state loss mid-stream.
  - Body scroll is locked while fullscreen.
  - Close via ✕ button (replaces ⤢ in fullscreen) or ESC.
  - Citation clicks while fullscreen open the source URL in a new tab (results are behind the overlay); inline they keep smooth-scrolling.
  - On mobile the overlay is naturally full-bleed; same close affordances.
- **Composer:** pill input + round send button (as now), plus a ⏹ stop button shown only while streaming (wired to the existing `aiAbort`).
- **Brand kept:** the rainbow conic border still animates while generating and settles to a hairline on completion. The big colorful blob wave (`.ai-wave`) is **replaced** by the thinking row (§4).

## 4. Thinking animation + model-generated waiting lines

- While waiting for the first token (both initial answers and follow-ups), a **thinking row** renders where the answer will land:
  - A pulsing ✦ orb (small, accent-colored, scale/opacity keyframes).
  - A shimmer-sweep text line (ChatGPT "Thinking…" style: `background-clip: text` gradient sweep).
- **The line is generated by the model, per turn:** at the moment a turn starts, a tiny parallel non-stream `/v1/chat/completions` call fires:
  - system: "You are Astra's loading screen. Write ONE witty 3–8 word loading line about the user's topic. Dry humor, no emoji, no quotes, no trailing period."
  - user: the query / follow-up question.
  - `max_tokens: 24`, `temperature: 1.0`, `stream: false`.
  - It races the search scrape (~1–2s) so added latency is ~0; on the temp MLX backend `gen_lock` serializes it ahead of the answer call, but 24 tokens is fast.
- 5s timeout or any failure → fall back to the existing static `COPY.loadingQuips`. If the first answer token arrives before the line resolves, the line is dropped (answer wins).
- `prefers-reduced-motion` disables the pulse + shimmer (static line text remains).

## Data flow (unchanged core)

- Routing stays "URL is the state": `?q=` (+ `&tab=`). `renderRoute()` reads both params.
- The AI thread (`thread`, `threadQuery`, `threadResults`) is untouched by pagination and tab switches; only a new typed query reseeds it.
- Grounding stays the first page's top 5 results (`seedThread` unchanged).

## Error handling

| Case | Behavior |
|---|---|
| Search page N fails (429/offline) | Inline status card + retry at list end; earlier results stay |
| Images endpoint fails | Status card in the grid area + retry; All tab unaffected |
| `vqd` extraction fails | Treated as upstream error (502) with one retry |
| Waiting-line call fails/slow | Static quip fallback, answer unaffected |
| AI stream fails | Existing `showAiError` retry, works in both panel modes |
| DDG lite ignores `s` | Dedup → empty page → sentinel stops (no infinite loop) |

## Testing

- `backend/tests/` (pytest, existing fake-model harness — no downloads):
  - `/api/search` passes `s` through to DDG; cache keys differ per offset; dedup drops repeated URLs.
  - `/api/images`: mocked SERP (`vqd="…"`) + mocked `i.js` JSON → mapped fields; vqd-regex failure → 502; cache hit on second call.
- Frontend (`search/astra.js`, plain JS, no harness): manual verification — infinite scroll cadence, tab switching + URL state, preview panel (desktop/mobile), fullscreen mid-stream, ESC/scrim closes, waiting-line fallback, `prefers-reduced-motion`.

## Out of scope

- Image results pagination (`i.js` supports `s=100…`; one page of ~77 is plenty for v1).
- Video/news tabs.
- Image proxying / safe-search filtering (DDG `i.js` default moderation applies).
- Changes to the real OkemoLLM backend (Astra endpoints remain temp-backend-only, as documented in CLAUDE.md).
