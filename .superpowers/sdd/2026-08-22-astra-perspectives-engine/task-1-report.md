# Task 1 Report: Backend Perspectives Endpoint

## Status: DONE

## Summary

Added `GET /api/perspectives?q=...&n=15` endpoint to `backend/server.py` (the sync temp backend).

## Changes

- **Commit:** `25aaeb1` — `feat: add /api/perspectives endpoint for multi-source consensus analysis`
- **File modified:** `backend/server.py`
- **Lines added:** 137

### What was implemented

1. **Import:** Added `import concurrent.futures` (line 9)
2. **Cache:** Added `_perspectives_cache = {}` alongside other caches (line 145)
3. **Helper:** Added `_extract_domain(url)` (lines 508-512) — extracts hostname, strips `www.` prefix, returns `""` on malformed URLs
4. **Endpoint:** `@app.get("/api/perspectives")` → `def api_perspectives(q, n)` (lines 593-717), inserted after `/api/preview`

### Endpoint behavior

- Empty query → `{query, results:[], perspectives:null}`
- Normalizes `n` to 5–30 range
- Fetches DDG, Bing, and Mojeek in parallel via `concurrent.futures.ThreadPoolExecutor(max_workers=3)`
- Deduplicates by URL, merging source tags (`[ddg], [bing], [mojeek]`, or combinations)
- Caps results at `n`
- Calls `chat_completions(body_dict)` directly with `stream=False`, `use_thought=False`, `temperature=0.3`, `max_tokens=1500`
- Extracts content from `resp_dict["choices"][0]["message"]["content"]`
- Strips markdown code fences from model output, parses JSON
- Graceful fallback: returns results without perspectives on any failure (model exception, missing keys, JSON parse failure)
- Caches complete response per query (10-min TTL, consistent with other endpoints)

### Syntax verification

`python -m py_compile backend\server.py` — passed.

## Concerns

- The model call runs synchronously inside a FastAPI route handler, which will block the single-threaded server for the duration of generation. This is consistent with the existing `chat_completions` non-streaming path but means the perspectives endpoint will serialize with any concurrent requests. A future improvement could dispatch the model call to a background thread.
- The endpoint uses the same `_fetch_ddg`/`_fetch_bing`/`_fetch_mojeek` functions that `/api/search` uses, so rate-limit and upstream-failure semantics are inherited consistently.

## Fix Round 1

### Changed Files

- `backend/server.py`: removed the stale internal model label and added backend-derived `perspectives.source_map.missing` data for partial source failures.
- `backend/tests/test_search.py`: added focused perspectives endpoint coverage, perspectives cache cleanup, and a test-only MLX import fallback for non-MLX platforms.

### Verification

- Preferred command check: `backend\.venv\Scripts\python.exe` did not exist, so the available `python` interpreter was used.
- Red run: `python -m pytest backend\tests\test_search.py -k perspectives -v` — 2 failed, 3 passed. Failures identified the stale model field and incorrect model-provided missing-source value.
- Focused green run: `python -m pytest backend\tests\test_search.py -k perspectives -v` — 5 passed, 46 deselected.
- Full search suite: `python -m pytest backend\tests\test_search.py -v` — 51 passed in 0.47s.
- Syntax check: `python -m py_compile backend\server.py` — passed with exit code 0 and no output.

### Concerns

- MLX is unavailable in the Windows Python environment, so `test_search.py` installs minimal import-only test stubs when `mlx.core` cannot be imported. Search and perspectives tests do not execute model generation; `chat_completions` is monkeypatched for perspectives coverage.
