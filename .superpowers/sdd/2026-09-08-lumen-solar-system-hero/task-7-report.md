# Task 7 Validation Report

Date: 2026-09-08

## Status

Validation automation and profiling are complete. No production threshold, scene, CSS, or generated-asset correction was justified by the measured results.

## Deterministic Posters

Playwright generated ignored full-page snapshots for:

- `tools/snapshots/after/lumen-poster-desktop-1440x900.png`
- `tools/snapshots/after/lumen-poster-tablet-768x1024.png`
- `tools/snapshots/after/lumen-poster-mobile-390x844.png`

The test asserts that the hero clears the floating navigation, copy and CTA remain inside the card, no horizontal overflow occurs, and the rendered card has non-black image entropy. The initial poster is also tested while texture requests are deliberately held, proving it paints before WebGL initialization completes.

## Failure Matrix

The Playwright suite now explicitly covers reduced motion, Save-Data, WebGL probe failure, scene import failure, fallback autoplay rejection, fallback video error, context loss, tab visibility pause/resume, rapid carousel/dot navigation, and held-state viewport resize. Every branch asserts a held readable poster or a visible intentionally active fallback. Save-Data and WebGL-probe branches additionally prove that texture assets are not requested.

## Real-Time Profile

Headed Chromium was run with a non-WebDriver policy signal. Detailed measurements and reproduction commands are recorded in `docs/assets/lumen-hero-provenance.md`.

- Desktop natural warm-up: 22.5 FPS, correctly classified to video.
- Desktop forced diagnostic active path: 60.0 FPS at effective DPR 1.500.
- Mobile natural warm-up: 55.4 FPS, eligible for WebGL.
- Mobile active path: 58.0 FPS at effective DPR 0.999.
- Deactivation produced no further real WebGL draw calls.
- Successful WebGL requested no journey video; fallback-only paths requested no textures.

## Visual/Source Review

The browser snapshots and representative video frames were generated, but this model cannot visually decode image attachments. No claim of human visual taste review is made. Inspection was therefore limited to browser geometry, pixel statistics, asset metadata, and rendering source:

- One checked-in light direction drives Earth, Moon, and night-side masking in both Blender and Three.js.
- Earth uses separate day, city-light, transparent cloud, normal, and atmosphere layers.
- Moon uses NASA-derived near/far albedo and restrained normal mapping with high roughness.
- Equirectangular textures have exact 2:1 dimensions; runtime code adds no orbit lines, streaks, bloom, lens flare, or postprocessing.
- Final runtime and fallback compositions consume the same timeline/body positions; mobile applies the same explicit Earth/Moon offsets.
- Extracted Solar, Terra, Luna, and held fallback frames are non-empty and have entropy from 3.05 to 4.47.

Residual concern: only a human image review can conclusively reject subjective illustrative appearance, subtle seams, relief inversion, or a materially perceptual fallback mismatch. The generated files are ready at the paths above for that review.

## Changes

- Expanded `test-lumen-hero-playwright.mjs` with deterministic snapshot, loading-order, failure-matrix, lifecycle, resource-request, resize, and optional real-scene profile coverage.
- Added measured verification data to `docs/assets/lumen-hero-provenance.md`.
- Production and generated asset files were unchanged.
