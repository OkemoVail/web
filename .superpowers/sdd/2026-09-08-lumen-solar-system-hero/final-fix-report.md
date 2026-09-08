# Final Review Fix Report

Date: 2026-09-09

## Findings Addressed

- Earth city lights now convert Three.js's view-space `transformedNormal` with `inverseTransformDirection(..., viewMatrix)` before comparing it to the shared world-space Sun vector. The source contract rejects the previous double transform, and an executable WebGL shader test renders the mask under identity and rotated camera transforms and requires identical world-light-facing output.
- Committed WebGL now monitors travel cadence only after a 1000 ms setup grace. It requires a full 45-frame window whose average is below 30 FPS and whose slow-frame ratio is at least 80%, then switches to the already-loaded poster, disposes the scene, and never loads fallback video. Deterministic tests cover sustained slow known/unknown hints, isolated-stall survival, disposal, and no-double-download.
- The product seek control now supplies and updates `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext`; Arrow keys seek by five seconds and Home/End seek to bounds. All paths retain the active-card guard. Playwright covers value state, keys, bounds, and inactive controls.
- Carousel transitions now put `aria-current="true"` on exactly the active dot and remove it from all others. Browser tests cover initial and transitioned states.
- The retained Chrome profile now identifies the measured clean implementation as commit `8bce8ca`, tree `c1192d5da9a3f17d384e82655376c4d8628c161d`, and records SHA-256 values for the measured runtime sources. Documentation explicitly scopes it to that tree and does not claim it measured this later fix.
- The profiler emits the same reproducible source identity for future captures and refuses to overwrite evidence unless `--replace` is explicit. `npm run profile:lumen:replace` is the documented safe refresh command, with unit coverage.

## Verification

- `node test-lumen-hero.mjs`
- `node test-lumen-hero-playwright.mjs`
- `node --test test-lumen-profile.mjs`
- `node test-ai-home-theme.mjs`
- `node test-ai-home-bdh.mjs`
- `node test-z-index.mjs`
- `git diff --check`

The expensive external installed-Chrome profile was not rerun. Existing measurements remain attached to their now-reproducible measured tree.
