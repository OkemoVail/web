# Task 7 Validation Report

Date: 2026-09-08

## Status

Deterministic validation corrections are complete. External representative-device profiling and subjective visual review remain open.

## Deterministic Posters

Playwright generated ignored full-page snapshots for:

- `tools/snapshots/after/lumen-poster-desktop-1440x900.png`
- `tools/snapshots/after/lumen-poster-tablet-768x1024.png`
- `tools/snapshots/after/lumen-poster-mobile-390x844.png`

The test asserts exact screenshot dimensions, navigation clearance, four-edge copy/CTA containment, lower-left copy placement, upper-right Earth projection, visible Moon projection, zero horizontal overflow, and non-black image entropy. Stable body projections exist only behind `?lumen-test=1`. The initial poster is also tested while texture requests are deliberately held.

## Failure Matrix

The Playwright suite covers reduced motion, Save-Data, WebGL probe failure, scene import failure, texture-load failure, renderer-creation failure, missing fallback media, autoplay rejection, video error, touch swipes, rapid carousel/dot navigation, and held-state viewport resize. The actual Three.js canvas receives `webglcontextlost`, and its visibility/resize behavior is exercised when Chromium exposes WebGL; otherwise the suite reports the case as explicitly unsupported rather than passing a stub.

## Objective Visual Checks

- FFmpeg reproducibly extracts Solar, Terra, Luna, and held frames for mobile and desktop and records command/version, requested and decoded timestamps, dimensions, and entropy in an ignored JSON manifest.
- Light- and dark-theme copy/control regions meet WCAG 2 contrast requirements through rendered-pixel or computed-background sampling.
- Poster and extracted fallback held frames are registered to 400x300 and limited to 2.5% mismatch.
- Actual WebGL and fallback held frames use the same registration with a documented 38% cross-renderer tolerance, broad enough for Eevee/Three.js shading differences but narrow enough to catch framing or missing-body regressions.

## Visual/Source Review

No claim of human visual taste review or representative hardware profiling is made. Deterministic inspection is limited to browser geometry, contrast, registered pixel comparison, pixel statistics, metadata, and rendering source:

- One checked-in light direction drives Earth, Moon, and night-side masking in both Blender and Three.js.
- Earth uses separate day, city-light, transparent cloud, normal, and atmosphere layers.
- Moon uses NASA-derived near/far albedo and restrained normal mapping with high roughness.
- Equirectangular textures have exact 2:1 dimensions; runtime code adds no orbit lines, streaks, bloom, lens flare, or postprocessing.
- Final runtime and fallback compositions consume the same timeline/body positions; mobile applies the same explicit Earth/Moon offsets.
- Extracted Solar, Terra, Luna, and held fallback frames are non-empty and have recorded entropy from 2.61 to 4.47.

Residual concern: only a human image review can conclusively reject subjective illustrative appearance, subtle seams, relief inversion, or a materially perceptual fallback mismatch. The generated files are ready at the paths above for that review.

## Changes

- Added reproducible frame extraction and ignored evidence manifests.
- Added geometry, contrast, registered cross-path pixel, touch/swipe, failure, and actual-WebGL lifecycle coverage.
- Darkened the page-local Lumen Start fill to meet 4.5:1 contrast and added a test-only projection hook.
- Removed unsupported profiling claims from provenance.

## Evidence (2026-09-09)

- `node test-lumen-hero.mjs`: PASS.
- `node test-lumen-hero-playwright.mjs`: PASS; actual WebGL path exercised on this Chromium run.
- `node test-ai-home-theme.mjs`: PASS.
- `node test-ai-home-bdh.mjs`: PASS.
- `node test-z-index.mjs`: PASS.
- `git diff --check`: PASS (line-ending conversion warnings only; no whitespace errors).
