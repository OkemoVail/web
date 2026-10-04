# Mip-Assisted Blur Architecture Review

Date: 2026-09-30

## Review Inputs

- Reviewed `.worktrees/liquid-glass/mip-blur-report.md`, the effective liquid-glass worktree, `docs/superpowers/specs/2026-09-29-ipad-liquid-glass-demo-design.md`, and its implementation plan.
- `mip-blur-review.diff` was not present in the plan workspace, repository, or registered worktrees. The implementation files are untracked relative to the shared base, so findings reference the effective files directly rather than attributing lines to a missing patch.

## Verdicts

**Spec verdict: PASS.** The `ipad-fluid` branch implements a complete WebGL2 mipmapped texture path, exact-`v_uv` blur-only sampling, normalized center-symmetric 9/5/5-fetch tiers at LOD 4/3/2, and materially smaller documented footprints. The normal engineering lab retains its level-zero `LINEAR` upload and original optical branch. High-tier frequency, line-spread, variance, alignment, tint, seam, highlight, and motion coverage remains present; medium and low receive alignment, no-ringing, and changed-output coverage.

**Quality verdict: PASS WITH MINOR TEST RESIDUALS.** The architecture is a credible replacement for the 225-fetch kernel and the performance claims are carefully bounded to Chromium cadence on the current machine. No GPU timing or iPad Safari capability is claimed. Two non-blocking evidence gaps remain: restoration is lifecycle-tested with a mock GL context rather than visually exercised after a real browser context restore, and tier distinctness is compared high-to-medium and high-to-low but not medium-to-low directly.

## Findings

### Low

1. **Real-browser restoration does not prove the restored mip texture visually.** `src/liquid-glass-renderer.js:467-487` recreates resources and calls `uploadTexture()`, which re-applies filters, uploads level zero, and regenerates mipmaps. `test-liquid-glass.mjs:795-842` verifies this call sequence and count with the mock context, while the browser suite proves the initial real texture and shader render correctly. It does not induce `WEBGL_lose_context`, restore the context, then verify a non-black aligned blurred framebuffer at explicit LOD. The code is correct by WebGL2 rules, but the report's “mip upload/restoration lifecycle contracts” should continue to mean structural lifecycle coverage, not browser restoration evidence.

2. **Quality-tier output distinctness is not pairwise asserted.** `test-liquid-glass-playwright.mjs:1126-1146` verifies both medium and low differ materially from the saved high profile. It never compares medium directly with low, so a regression making those two outputs equal could still pass if both remain different from high. The current shader is genuinely distinct (`src/liquid-glass-renderer.js:181-215`): medium uses LOD 3 with a 0.5 ring and its own weights, while low uses LOD 2 with a 0.392857143 ring and different weights. A direct medium-versus-low profile assertion would make the test match the full three-tier claim.

## WebGL2 Correctness

- The 1200x648 source is NPOT, but WebGL2 permits NPOT mipmapped textures with `CLAMP_TO_EDGE`. `gl.generateMipmap(gl.TEXTURE_2D)` generates the full floor-halved chain through 1x1, so LODs 2, 3, and 4 exist and the default base/max-level range does not make the texture incomplete.
- `uploadTexture()` binds the newly created texture, sets `LINEAR_MIPMAP_LINEAR` only for `ipad-fluid`, sets `LINEAR` magnification and clamp wrapping, uploads level zero, then generates mipmaps before setting `controller.ready`. No draw can sample the temporarily incomplete texture between parameter setup and mip generation.
- Context restoration calls `setupResources()` first, which creates a new texture object, then repeats `uploadTexture()` when the image is decoded. The decode/restoration race is handled in both orders: restoration before decode leaves the new texture waiting for the decode callback; decode before restoration causes restoration to upload immediately.
- `textureLod` is valid in the WebGL2 fragment shader (`#version 300 es`). The selected explicit levels are within the generated chain. Trilinear filtering is meaningful even with integer LODs for footprint filtering and remains correctly configured; integer LOD selects one mip level rather than blending adjacent levels.
- The normal renderer selects `LINEAR`, never calls `generateMipmap`, and does not execute the early-return fluid branch. Its level-zero texture remains complete because a non-mip minification filter is used.

## Kernel And Visual Review

- High uses 9 fetches, medium 5, and low 5, satisfying both the spec's exact 9/5/5 architecture and the requested ceilings of 13/9/5.
- Every tier starts with offset `[0, 0]`, so one tap is exactly `v_uv`. All other coordinates are `v_uv + offset * blurStep`; the fluid branch returns before normal-mode magnification, refraction, chromatic separation, or transformed backdrop coordinates are computed.
- Weights are positive and sum to one within the static tolerance. Every offset has an equal-weight negated partner. This preserves centering and cannot create negative-lobe convolution ringing.
- The high tier combines diagonal and axial symmetric pairs. Medium and low use symmetric crosses with different LODs, offsets, and weights. Their calculated sigma/support values are monotonic: approximately 5px/14px, 3.5px/9.5px, and 2.7px/6.8px.
- Browser tests verify high-frequency attenuation, broadly monotonic frequency falloff, no secondary line-spread peaks, limited alternating rises, and warm/cool fiducial position and spacing. Medium and low separately retain no-ringing and alignment checks and differ from high.

## Performance Honesty

- The public cadence harness runs the non-deterministic demo for at least five seconds under held pointer deformation and reports median, p95, proportions above 34ms and 25ms, frame count, elapsed time, and selected quality.
- The acceptance limits are permissive enough for the observed approximately 30fps-quantized headless environment, but the report says so explicitly. It describes rejection of catastrophic stalls, not 60fps performance.
- The quality controller observes JavaScript/CPU frame duration, and the report correctly states that remaining at high or medium is not GPU-headroom evidence.
- No claim is made for EXT timer-query measurements, isolated fragment cost, physical iPad thermals, Safari behavior, device display cadence, or reference pixel equivalence. A physical iPad claim would still require live-device evidence.

## Fresh Verification

- `node test-liquid-glass-physics.mjs`: passed.
- `node test-liquid-glass.mjs`: passed; optional reference extraction skipped because `LIQUID_GLASS_REFERENCE_VIDEO` was unset.
- `node test-liquid-glass-playwright.mjs`: passed. Fresh cadence was desktop high median 33.4ms / p95 50.1ms / 24.6% above 34ms, and mobile-emulation medium median 33.3ms / p95 33.4ms / 1.3% above 34ms.
- `git diff --check`: exited zero with LF-to-CRLF working-copy warnings only.
