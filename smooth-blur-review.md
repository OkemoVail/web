# Smooth Medium Blur Review

Date: 2026-09-30

## Review Inputs

- Reviewed `.worktrees/liquid-glass/smooth-blur-report.md`, the current liquid-glass worktree, `docs/superpowers/specs/2026-09-29-ipad-liquid-glass-demo-design.md`, and its implementation plan.
- `smooth-blur-review.diff` was not present in the plan workspace, the repository, or any registered worktree. The liquid-glass implementation is untracked relative to the shared base, so this review uses the effective files directly. This prevents precise attribution of which lines belong only to the smooth-blur correction.

## Verdicts

**Spec verdict: PASS WITH A PERFORMANCE RESIDUAL.** The fluid branch implements the specified dense, normalized, symmetric 15x15 Gaussian-product kernel with an exact `v_uv` center, 2 CSS px spacing, exactly +/-14 CSS px support, and approximately 5 CSS px per-axis sigma. It remains blur-only and preserves the content, motion, highlight, fallback, and engineering-lab contracts covered by the existing suites. No kernel-level ringing mechanism was found.

**Quality verdict: NEEDS MAJOR PERFORMANCE FOLLOW-UP BEFORE AN IPAD-TARGET CLAIM.** The optical result is smooth and medium strength, but the 225-fetch shader runs over the full stage for every rendered fragment at every WebGL quality tier. Current adaptation cannot reliably detect that GPU load and cannot reduce tap count. The tests and report do not establish acceptable iPad frame performance.

## Findings

### High

1. **Adaptive quality does not measure the 225-fetch GPU cost.** `src/liquid-glass-renderer.js:459-552` records the synchronous CPU time surrounding uniform setup and `gl.drawArrays`. WebGL draw submission is asynchronous, so this generally excludes fragment execution and texture-fetch latency. `src/liquid-glass.js:246-262` downgrades only when that CPU-side mean exceeds 20ms. A GPU-bound iPad can therefore miss frames while the recorded submission remains fast and quality never changes. The test at `test-liquid-glass-playwright.mjs:1060-1061` is deterministic, and deterministic mode bypasses live timing at `src/liquid-glass.js:610-613`; its assertion that quality stays high is therefore not a performance result.

2. **Quality tiers do not reduce fluid-kernel work.** `blurredFluidTrack` always executes nested 15-iteration loops (`src/liquid-glass-renderer.js:169-190`) regardless of `uQuality`. A downgrade only lowers the canvas DPR cap from 2 to 1.5 to 1 (`src/liquid-glass-renderer.js:8,556-569`). On a 760x410 stage, high DPR2 is about 1.25 million fragments and roughly 280 million texture fetches per frame; touch-selected medium DPR1.5 is about 700 thousand fragments and roughly 158 million fetches per frame, before blending and SDF/highlight work. The shader also computes the blur before using shape coverage (`src/liquid-glass-renderer.js:194-210`), so transparent pixels outside the relatively small material pay the same 225-fetch cost. This is not credible as an iPad-safe budget without device evidence or a materially cheaper adaptive path.

### Medium

3. **The iPad performance claim is untested.** The framebuffer suite uses desktop Chromium with viewport/DPR emulation. The mobile DPR2 optics context at `test-liquid-glass-playwright.mjs:1101-1111` omits `hasTouch`, while real touch capability selects `medium` (`src/liquid-glass-physics.js:276-280`). There is no iPad Safari/device run, sustained live animation benchmark, requestAnimationFrame cadence assertion, dropped-frame threshold, GPU timer query, thermal/load test, or test proving a real slow fluid render causes an adaptive downgrade. The report statement that browser verification confirms high quality without an unexpected downgrade should be narrowed to deterministic desktop Chromium visual verification.

4. **The non-ringing browser contract is useful but narrowly calibrated.** The implementation is intrinsically non-ringing because every Gaussian-product coefficient is positive and symmetric, and the static tests verify positivity, normalization, symmetry, support, and sigma (`test-liquid-glass.mjs:682-714`). The browser line-spread check additionally rejects visible satellite peaks and allows at most one raster-tolerance rise (`test-liquid-glass-playwright.mjs:1060-1075`). However, this rendered profile is tested only at rest on the desktop deterministic/high path, not at touch-selected medium quality, DPR changes, stretch, or stage edges. This is not an implementation defect because the fluid kernel currently ignores quality and remains aligned during deformation, but the test description should not imply broad adaptive-tier coverage.

### Low

5. **The 90% variance threshold alone is weak, but the frequency tests make the medium-strength claim reasonable.** A 10% variance reduction would not independently establish a visibly medium blur. Here it is supplemented by exact sigma/support contracts and three authored frequency bands that must each attenuate below 85%, show broadly monotonic falloff, and separate high from low frequency (`test-liquid-glass-playwright.mjs:1062-1070`). Against the spec's explicit approximately 5px sigma definition, the strength requirement is implemented honestly. The authored calibration stripes are fixtures rather than natural-scene evidence, so this supports conformance, not perceptual equivalence to the recording.

## Compliance Notes

- Exact alignment is real: the fluid branch calls `blurredFluidTrack(v_uv, blurStep)` and each tap is `uv + offset`; the offset grid contains zero and center-symmetric neighbors. No refracted, magnified, chromatically split, or transformed backdrop coordinate is evaluated before the fluid branch returns (`src/liquid-glass-renderer.js:169-212`).
- The kernel is a separable Gaussian product evaluated as a direct 2D convolution. Positive normalized weights cannot create convolution overshoot/ringing; bilinear texture filtering further smooths between texels. The tests independently derive approximately 5px sigma and unit two-axis weight.
- The authored SVG adds deterministic grain, three stripe frequencies, and an isolated line fixture without gradients or external references. Warm/cool fiducials retain their documented centers.
- Existing tests continue to cover fixed native hitbox, content-to-liquid bounds tracking, single-bounce release, top-over-bottom highlights, neutral tint, enhanced-mode transparency, fallback usability, no ghost, and engineering-lab behavior. The sequential focused runtime, physics, and browser suites passed during this review; `git diff --check` reported only LF-to-CRLF notices.
- No claim of pixel equivalence to the reference recording was introduced.

## Required Follow-up

Before describing the correction as suitable for the iPad target, obtain a sustained live-device Safari trace or equivalent frame-cadence evidence and make adaptation sensitive to actual rendered-frame/GPU pressure. A lower-cost fluid tier must reduce fragment work, not only DPR; otherwise the 225-fetch path remains active after every downgrade.
