# Task 1 Report: Lumen Hero Runtime Policy and Timeline

## Status

DONE

## Implementation

- Added `AI/js/lumen-hero-policy.js` as a browser-compatible IIFE exposing `window.LumenHeroPolicy`.
- Implemented `chooseMode(signals)` with the specified reduced-motion, automation, data-saving, WebGL, hardware, and warmup thresholds.
- Implemented `chooseQuality(signals)` with the specified texture tier, pixel ratio cap, and antialias policy.
- Implemented `timelineAt(ms)` with the specified Solar, Terra, Luna, reveal, and held boundaries and output fields.
- Treated omitted optional numeric signals like `null` by using nullish checks for `deviceMemory`, `hardwareConcurrency`, and `warmupFps`.
- Added `test-lumen-hero.mjs`, which evaluates the browser script in a Node VM and checks mode selection, omitted hints, quality selection, timeline boundaries, and reveal visibility.

## TDD Evidence

1. RED: Created `test-lumen-hero.mjs` before the production file.
2. Ran `node test-lumen-hero.mjs`; it failed with `ENOENT` because `AI/js/lumen-hero-policy.js` did not exist.
3. GREEN: Added the minimal policy implementation.
4. The first green run exposed a cross-realm `deepStrictEqual` issue in the VM test, not a production defect. Replaced those object-level assertions with field-level strict assertions.
5. Re-ran `node test-lumen-hero.mjs`; all assertions passed.

## Self-Review

- Spec: All three required public functions and `DURATION` are exposed with the exact timeline and policy values from the brief.
- Preflight ruling: Omitted optional numeric hints follow the same branches as explicit `null` values.
- Scope: No existing application files or unrelated worktree changes were modified.
- Maintainability: Threshold logic remains direct and local; no speculative abstractions were added.
- Mutation check: Mode branch thresholds, quality tier/caps, timeline boundaries, and copy visibility are each covered by observable assertions.

## Verification

`node test-lumen-hero.mjs` -> PASS (`Lumen hero policy assertions passed.`)

## Concerns

None.

## Review Fix (2026-09-08)

### Findings Addressed

- Guarded `width` before the mobile breakpoint comparison, so omitted and `null` width hints remain neutral instead of coercing to zero.
- Replaced the tautological omitted-versus-null quality comparison with literal assertions that both unknown-width cases select desktop textures, pixel ratio `1`, and antialiasing.
- Expanded timeline coverage to assert phase, progress, label, and copy visibility for negative time and immediately before and at every phase boundary.

### Covering Tests

- `test-lumen-hero.mjs`

### TDD Evidence

- RED command: `node test-lumen-hero.mjs`
- RED output: `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: actual 'mobile', expected 'desktop'` at `test-lumen-hero.mjs:32`.
- GREEN command: `node test-lumen-hero.mjs`
- GREEN output: `Lumen hero policy assertions passed.`

### Self-Review

- The width check now follows the same explicit nullish-guard pattern as the other optional numeric hints.
- Literal quality expectations catch both omitted and explicit-null width regressions independently.
- Timeline cases cover negative clamping and both sides of the `2000`, `5000`, `6500`, and `8000` millisecond boundaries without changing the specified API.
- Only Task 1 implementation, test, and report files were changed for this fix.

### Concerns

None.
