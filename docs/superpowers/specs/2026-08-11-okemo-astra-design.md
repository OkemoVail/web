# Okemo Astra — Design Spec

**Date:** 2026-08-11
**Status:** Approved (brainstorming complete, pending implementation plan)

## What

**Okemo Astra** is a Google-style web search engine page for the Okemo ecosystem:
a clean, cosmic homepage ("your tiny telescope for the internet") with a single
compact search bar, real web results from the Brave Search API, and an optional
**✦ Ask Astra** AI mode that streams a grounded answer from the Saga model above
the classic link results.

Approved visual direction: **Okemo-native base + Astra cosmic identity**
(parchment/dark design tokens, sparse twinkling stars, small constellation SVG,
✦ sparkle brand mark, gradient rosewood→gold wordmark, rotating rainbow ring on
the AI button, flowing rainbow "aurora" wave while the AI thinks). Mockups:
`.superpowers/brainstorm/97981-1786381877/content/homepage-v4.html` (final).

Explicitly removed during brainstorming: top floating nav, "I'm Feeling Lucky",
pagination, corporate-tone copy.

## Files

| File | Purpose |
|---|---|
| `search/index.html` | The entire app — hero state + results state in one page |
| `search/astra.js` | All logic, plain `<script>` attaching to `window.*` (site convention, no modules) |

`search/index.html` contains an inline `<style>` block holding **layout-only**
CSS plus Astra-specific visuals (stars, bar, rainbow ring, wave, results).
It links `../src/design-tokens.css` for tokens and `.skuo` button classes.
No Tailwind (same pattern as `Themes/Themes.html`, `word/index.html`).

**Intentional exceptions to site-wide rules (document in CLAUDE.md on ship):**
- Does **not** load `src/nav.js` — the Astra homepage is deliberately chromeless,
  google.com-style. Only a small corner theme toggle + tiny "okemo ✦" footer link.
- Skips Tailwind entirely.

**Anti-FOUC theme script:** early inline `<script>` in `<head>` reading
`vail_theme` (`'light' | 'dark' | 'system'`) and toggling `.dark` on `<html>`,
matching every other page.

## State machine

One page, two views, driven entirely by the URL query string:

| URL | View |
|---|---|
| `/search/` (no `?q`) | **Hero** — wordmark, tagline, bar, stars |
| `/search/?q=hello` | **Results** — compact bar on top, 20 link results |
| `/search/?q=hello&ai=1` | **Results + AI** — the ✦ Astra Answer panel streams above the links |

- Search button or **Enter** in the bar → navigate to `?q=<query>`
- **✦ Ask Astra** button or **⌘/Ctrl+Enter** → navigate to `?q=<query>&ai=1`
- Navigation uses `history.pushState` + in-place re-render (no reload);
  `popstate` re-renders too, so the browser back button returns from results to
  hero naturally.
- The bar always preserves the current query.

## Brave Search integration

- Endpoint: `GET https://api.search.brave.com/res/v1/web/search?q=<q>&count=20`
  with headers `X-Subscription-Token: <key>` and `Accept: application/json`.
  Brave's API is CORS-enabled, so the browser calls it directly.
- API key lives in localStorage under **`astra_brave_key`** (Astra-specific; do
  not reuse `vail_settings_v4`).
- **First-run / missing key:** hero shows a playful setup card
  ("Astra needs a key to the cosmos ✦") with a paste field and a link to
  Brave's free tier (https://brave.com/search/api/). On the results page a small
  ✦/⚙ link re-opens the key dialog.
- Results render from the response's `web.results[]`: `title`, `url`
  (displayed as a breadcrumb-ish host+path), `description`. Favicon per result
  via `https://www.google.com/s2/favicons?domain=<host>&sz=32` (no key needed)
  with a ✦ fallback if it errors.
- Result count fixed at 20, single page (no pagination in v1).

### Autocomplete

- Endpoint: `GET https://api.search.brave.com/res/v1/suggest/search?q=<q>`,
  same key header.
- 150 ms debounce, max 6 suggestions in a dropdown under the bar.
- Full keyboard nav: ↓/↑ cycle, Enter accepts, Esc closes; mouse hover +
  click work too.
- Any error (403 on plans without suggest, network, etc.) silently disables the
  dropdown — search keeps working. Never surface suggest errors.

## AI mode (✦ Ask Astra)

1. Run the Brave web search first (results render regardless of AI outcome).
2. Take the top 5 results (title + description) and ground the prompt with them.
3. `POST <baseUrl>/v1/chat/completions` with:
   - `baseUrl` = `localStorage.vail_custom_backend_url`, falling back to
     `https://api.okemovail.com` (same resolution order as chat's `api.js`,
     minus the tunnel fetch — keep Astra dependency-free)
   - `model: "saga-0.7b"`, `stream: true`, `web_search: false`,
     `use_thought: false`
   - System message: playful Astra persona ("a playful search oracle"),
     instructed to answer concisely using the provided snippets and to cite
     sources inline as `[1]`..`[5]` matching the numbered results below.
   - User message: the query + the 5 numbered snippets.
4. Consume the SSE stream exactly like chat does (`data: ` lines,
   `choices[0].delta.content`, `[DONE]`), via an `AbortController` cancelled on
   any new search or navigation.
5. Render streamed text with `marked` (loaded from CDN, already a site-wide
   dependency). `[n]` citation markers link to the corresponding result cards.

### AI panel states

| State | Visual |
|---|---|
| Waiting for first token | Rainbow aurora wave band (4 blurred radial-gradient blobs drifting in a clipped rounded band) + label "✦ consulting the cosmos…" |
| Streaming | Wave keeps flowing; markdown renders beneath it |
| Done | Wave collapses (height transition) to a 2px rainbow shimmer line under the "✦ Astra Answer" header |
| Backend error | Wave swaps to static; message "the cosmos is quiet right now — try again" + retry button; classic results still shown below |

## Visual system

- **Tokens:** `design-tokens.css` light/dark (`--accent #c96478`, parchment
  `#faf9f5`, dark `#1b1a1e`-family). Buttons: `Search` = `.skuo .skuo-neutral`,
  `✦ Ask Astra` = `.skuo` base with the rainbow ring wrapper.
- **Wordmark:** "✦ Okemo Astra", `background: linear-gradient(92deg, accent 10%, #f0c27b 90%)` with `background-clip: text`; dark mode uses the swapped
  accent (`#d97790`).
- **Tagline:** "your tiny telescope for the internet" (italic, muted).
- **Stars:** ~14 absolutely-positioned 2–3px dots generated by JS with random
  position, size, color (white / accent / `#f0c27b` / `#5aa7ff` / `#5fdc7d`),
  each twinkling via a slow `opacity` keyframe animation with staggered delays.
  Plus one ~52×34 constellation SVG (4 dots + connecting hairlines, accent
  stroke) placed near the wordmark.
- **Rainbow ring:** `@property --rb` animated `conic-gradient` border on the
  Ask Astra button (1.5px padding wrapper, inner pill re-masks the fill).
  Fallback where `@property` is unsupported: static rainbow border.
- **Bar:** single pill (`border-radius: 999px`), 🔭 glyph left, flexible input,
  then `Search` + `✦ Ask Astra` pill buttons inside the right end. Height ~44px
  on desktop, full-width on mobile (buttons may shrink to icon-first).
- **`prefers-reduced-motion`:** twinkle, ring spin, and wave all disabled;
  static gradients remain.
- **Copy** centralized in a `COPY` object in `astra.js`: rotating placeholder
  quips (e.g. "why is the sky blue, fr?", "prove I'm not a robot…"), hint line
  ("enter = search · ⌘↵ = ask astra · no wrong questions"), empty-results line
  ("nothing in this corner of the universe"), footer ("made of stardust ·
  okemo ✦"), loading quips. Tone: playful, never corporate.

## Error handling

| Case | Behavior |
|---|---|
| No key | Setup card (hero) / key dialog (results); no API call fired |
| Brave 401/403 | "that key didn't open the cosmos" card with re-entry field |
| Brave 429 | "slow down, stargazer — the cosmos is rate-limiting us" + retry |
| Network failure | "lost contact with the cosmos — check your connection" + retry |
| Empty results | "nothing in this corner of the universe" card |
| Suggest fails | Silently disabled (see above) |
| AI backend fails | Playful panel error; link results unaffected |

In every case the query stays in the bar and the page never blanks.

## Out of scope (v1)

Pagination, image/news/video tabs (paid Brave tiers), "I'm Feeling Lucky"
(removed by request), user accounts/history, the universal floating nav.

## Testing

Repo has no automated test suite (per CLAUDE.md). The implementation plan ends
with a manual verification checklist:

1. Hero renders light + dark, stars twinkle, placeholders rotate
2. Key setup flow: missing → invalid (403) → valid key persists across reload
3. `?q=` renders ~20 real Brave results with favicons
4. `?q=&ai=1` streams the Saga answer with wave → shimmer collapse; `[n]`
   citations link to result cards
5. Enter vs ⌘↵ vs button clicks land on the right URLs; back button works
6. Autocomplete dropdown + keyboard nav (if key's plan includes suggest)
7. 429 / offline / empty-results states show their playful copy
8. `prefers-reduced-motion` disables all animation
9. Mobile width (~375px): bar fits, results readable, no horizontal scroll
