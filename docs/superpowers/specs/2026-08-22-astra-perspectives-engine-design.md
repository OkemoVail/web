# Astra Perspectives Engine Design

**Date:** 2026-08-22
**Status:** Draft
**Builds on:** Astra v2.3 (multi-source, AI panel, cosmic clarity)

## Goal

Make Astra a critical thinking tool, not just a link list. Every search becomes a
perspectives analysis: where do sources agree? Where do they disagree? Who says
what? This is something Google structurally cannot do — their business is ranking,
not revealing controversy.

The feature lives inside the existing AI panel as a toggle between `Answer` and
`Perspectives` modes. No new page, no new tab.

## Backend

### New endpoint: `GET /api/perspectives`

Takes `?q=<query>&n=15` (default 15 results per source, capped at 30 total after
dedup).

**Flow:**

1. **Parallel multi-source scrape** — DDG lite, Bing, and Mojeek fire
   simultaneously (5s timeout each). This is NOT failover — all three indices
   are fetched even if one succeeds, because source diversity is the point.

2. **Deduplicate + source-tag** — reuse the existing cross-source dedup logic
   from `/api/search`, but preserve all source tags. A URL found by both DDG
   and Bing gets `sources: ["ddg", "bing"]`. No result is dropped because it
   appeared in a "lower priority" source.

3. **AI analysis** — all unique results (up to ~30) are sent to the LLM with a
   structured system prompt (see AI Pipeline below). Non-streaming, temperature
   0.3, max 1500 tokens. The call uses `response_format: { type: "json_object" }`
   when available; falls back to tagged-text parsing otherwise.

4. **Caching** — 10-minute TTL, keyed on `perspectives:{q.lower()}`. No offset
   parameter (single aggregate fetch, not paginated).

**Response shape:**

```json
{
  "query": "...",
  "results": [
    {
      "title": "...",
      "url": "...",
      "snippet": "...",
      "sources": ["ddg", "bing"],
      "domain": "..."
    }
  ],
  "perspectives": {
    "consensus": [
      { "claim": "...", "citations": [1, 3, 5] }
    ],
    "contradictions": [
      {
        "position_a": { "claim": "...", "citations": [1, 3] },
        "position_b": { "claim": "...", "citations": [5, 7] }
      }
    ],
    "outliers": [
      { "claim": "...", "citation": 8 }
    ],
    "source_map": {
      "ddg": 14,
      "bing": 11,
      "mojeek": 9,
      "overlap_all_three": 5,
      "domain_types": {
        "academic": 30,
        "news": 25,
        "commercial": 20,
        "personal": 15
      }
    }
  }
}
```

**Graceful degradation:**

- 1-2 sources fail: proceed with what succeeded, note missing sources in
  `source_map.missing: ["mojeek"]`.
- AI call fails: return `results` without `perspectives`; frontend shows the
  existing plain answer as fallback.
- All 3 sources fail: 502 with error detail (same behavior as `/api/search`).

Source scraping and caching reuse the existing `backend/server.py` classes
(`_DDGLiteParser`, `_BingParser`, `_MojeekParser`) and the 10-min TTL
`SimpleCache`. No new scraping infrastructure.

## Frontend

### Entry point: AI panel header toggle

```
✦ Astra Answer  |  ⚖ Perspectives
```

A two-segment toggle, like the existing All/Images tabs but within the AI panel
header. Clicking Perspectives fires `GET /api/perspectives?q=...` — a separate
API call because it needs all 3 sources in parallel, not the single-source
failover from the All tab.

The toggle persists to `localStorage` as `astra_perspectives_mode` (defaults
to `"answer"`). Changing modes re-triggers the API call for the current query.

### Panel layout in Perspectives mode

```
┌─ Source summary bar ──────────────────────────────┐
│ 3 sources · 24 unique results · 62% overlap       │
└────────────────────────────────────────────────────┘

┌─ Consensus ▾ (green tint) ────────────────────────┐
│ ✔ claim text                               [1,3,5] │
│ ✔ another agreed fact                       [2,4]  │
└────────────────────────────────────────────────────┘

┌─ Contradictions ▾ (amber tint) ───────────────────┐
│ Position A (sources 1,3,5):  claim text           │
│ Position B (sources 2,4):    opposing claim       │
└────────────────────────────────────────────────────┘

┌─ Outliers ▾ (accent tint) ────────────────────────┐
│ ◆ unique claim from one source              [7]   │
└────────────────────────────────────────────────────┘

┌─ Source Map ▾ ────────────────────────────────────┐
│ ▓▓▓▓▓  DDG (14)                                   │
│ ▓▓▓▓▓  Bing (11)                                  │
│ ▓▓▓▓▓  Mojeek (9)                                 │
│ ▒ 5 results shared across all three               │
│ Academic 30% · News 25% · Blog 20% · Commercial   │
└────────────────────────────────────────────────────┘
```

### Section behavior

- All sections are collapsible accordions (`<details>` elements or custom
  with `aria-expanded`). Consensus is open by default; Contradictions and
  Outliers are collapsed if empty.
- Citations (`[1,3,5]`) are clickable `<a href="#result-1">` links. On click:
  smooth-scroll the result list to the target result, temporarily apply the
  existing `.citation-target` highlight class (1.6s).
- Each section has an accent color tint — green, amber, accent — applied as a
  thin left border or subtle background tint. No new shadows or gradients.
- Empty section copy replaces missing content: "Sources overwhelmingly agree"
  for empty contradictions, "No uncorroborated outliers found" for empty
  outliers, "Sources agree on this topic" for all-empty consensus.

### Graceful states

| State | UI |
|---|---|
| Loading | 3 skeleton rows per section + shimmer, `aria-busy` on panel |
| All agree | Consensus section filled; Contradictions shows "No significant disagreements found" |
| Too sparse | "Not enough source diversity for perspectives. Try a broader query." with a link to the plain All-tab results |
| AI failed | Fall back to plain Answer mode with a note: "Perspectives unavailable — showing standard answer" |
| All sources down | Standard error card (same pattern as existing rate-limit/offline cards) |

### Result list interaction

In Perspectives mode, the left-rail result list is still visible — numbered
1..30 matching the AI's citation numbers. Results are shown in source-tagged
order, with tiny source badges (`DDG`, `Bing`, `Mojeek`) on each result. The
existing monogram, breadcrumb, title, snippet layout is unchanged. The `Load
more stars` button is hidden in Perspectives mode (single aggregate fetch).

## AI Prompt

### System prompt

```
You are Astra's Perspectives Engine. Analyze search results and identify where
sources agree, disagree, and diverge.

You receive results as: [N] Title | domain | found by: DDG, Bing, Mojeek
followed by a snippet.

Rules:
1. CONSENSUS: claims backed by 3+ results. Be specific — "climate change is
   real" is too vague; "Global temperatures have risen 1.1C since pre-industrial
   levels" is a claim. Cite result numbers.
2. CONTRADICTIONS: genuine disagreements where two groups of sources say
   opposite things about the same question. Different wording of the same
   fact is NOT a contradiction. Show both sides with citations.
3. OUTLIERS: interesting claims from 1-2 results only, uncorroborated.
4. If sources overwhelmingly agree, say so honestly. Never fabricate
   disagreement.
5. Sparse or low-quality results? Signal that rather than hallucinate.
6. Claims: 1-2 sentences. Max 5 entries per section.
7. Output ONLY valid JSON. No markdown, no preamble, no trailing text.
```

### User message

```
Query: {query}

{results formatted as [N] Title | domain | found by: DDG, Bing, Mojeek \n Snippet}
```

### Output format (JSON)

```json
{
  "consensus": [
    { "claim": "...", "citations": [1, 3, 5] }
  ],
  "contradictions": [
    {
      "position_a": { "claim": "...", "citations": [1, 3] },
      "position_b": { "claim": "...", "citations": [5, 7] }
    }
  ],
  "outliers": [
    { "claim": "...", "citation": 8 }
  ],
  "source_map": {
    "ddg": 14,
    "bing": 11,
    "mojeek": 9,
    "overlap_all_three": 5,
    "domain_types": {
      "academic": 30,
      "news": 25,
      "commercial": 20,
      "personal": 15
    }
  }
}
```

`source_map.domain_types` keys are predetermined: academic, news, commercial,
personal, government, other. Percentages should sum to 100 (the AI estimates
from domain names — this is approximate).

### Fallback parsing

If `response_format: json_object` is unavailable or the response fails JSON
parsing, the frontend falls back to a tagged-text regex parser supporting:

```
[CONSENSUS]
claim text [1,3,5]
[/CONSENSUS]
```

The parser is a pure function in `astra-helpers.js` for testability.

### Call params

| Parameter | Value |
|---|---|
| `model` | current model (Saga / Qwen 2.5 VL 9B) |
| `temperature` | 0.3 |
| `max_tokens` | 1500 |
| `stream` | false |
| `web_search` | false |
| `use_thought` | false |

## Architecture

### Files touched

| File | Change |
|---|---|
| `backend/server.py` | New `GET /api/perspectives` endpoint: parallel scrape, dedup+tag, AI call, caching |
| `search/astra.js` | `runPerspectives()`, panel toggle wiring, section rendering, JSON parser, graceful states |
| `search/astra-helpers.js` | `parsePerspectivesJSON()` and `parsePerspectivesTagged()` pure functions |
| `search/index.html` | AI panel header: `Answer | Perspectives` toggle markup |
| `src/site.css` | `[data-page="search"]` section: `.perspectives-*` styles (sections, tints, accordions, source map bar) |
| `test-astra.mjs` | New test cases: parsers, response shape validation, section rendering contracts |

### Build order

1. `backend/server.py` — parallel scrape + AI analysis endpoint
2. `search/astra-helpers.js` — perspectives response parsers
3. `search/astra.js` — `runPerspectives()`, toggle wiring, section DOM builders
4. `search/index.html` — toggle markup in AI panel header
5. `src/site.css` — section styles
6. `test-astra.mjs` — parser and contract tests

### Risks

- **Contradiction detection accuracy** — Qwen 2.5 VL 9B at temperature 0.3
  should be reliable, but early testing on high-controversy queries (politics,
  health) is essential. Mitigation: start with clear-label test queries during
  development.
- **Latency** — parallel scrape (~2-4s) + AI inference (~3-5s) totals ~5-9s.
  Acceptable for a perspectives analysis; show section skeletons during load.
- **LLM hallucination of citations** — the prompt instructs "only cite numbers
  that appear in provided results," but validation is needed. Frontend strips
  any citation number outside `1..results.length`.

## Out Of Scope

- A separate Perspectives tab (stays as AI panel toggle)
- Real-time bias scoring or political-leaning classification
- Fact-checking against external databases
- Source credibility scores beyond domain-type estimation
- Historical/trending perspective comparison
- Multi-hop automated research (related but separate feature)
- Persisting perspectives across sessions or queries
- Any new API keys or paid services
- Changes to the All/Images tab behavior or result ranking
