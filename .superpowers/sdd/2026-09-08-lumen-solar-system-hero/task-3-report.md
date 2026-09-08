# Task 3 Report: Reproducible Local Asset Pipeline

**Status:** BLOCKED

Task 3 is not complete and was not committed. The implementation stops at the required realism boundary rather than substituting illustrative or unverified assets.

## Completed Work

- Added failing asset contracts to `test-lumen-hero.mjs` before implementation. The initial run failed on missing `tools/lumen-assets.json` as required.
- Installed and pinned `three@0.180.0` and `sharp@0.34.3` as development dependencies.
- Added `npm run build:lumen-assets`.
- Added a deterministic build script at `tools/lumen-assets.mjs` that:
  - uses only `C:\Users\okemo\AppData\Local\Temp\opencode\lumen-sources` for source caching;
  - verifies cached and downloaded SHA-256 values;
  - uses manual redirect handling and rejects redirects instead of following an unverified destination;
  - generates 1024x512 and 2048x1024 WebP texture tiers;
  - derives wrap-aware restrained normal maps from elevation/luminance data;
  - derives cloud alpha from cloud luminance;
  - copies the pinned Three.js module and license into `AI/vendor/`;
  - hashes deployed outputs into `AI/assets/lumen/manifest.json`;
  - preserves existing reviewed media in normal mode and makes `--media` fail if any reviewed media output is absent.
- Resolved, downloaded, and checksummed four official NASA-hosted Earth inputs:
  - Earth day: `b5e0139834c638d10c2c747f4bac63df5f9387680c00d87e5a2a9ed9a3dfea71`
  - Earth night: `373e5a08c9f378a2ce6320214a613148e4b1e3946b3f39a516c9093b76cb7124`
  - Earth clouds: `daddaad84d7a33bbbc86cdda3f591099f57cee8607b7bcf3b67eb7e4f7a1c793`
  - Earth topography/bathymetry: `594d132b6110756214ac1927abca0048a8b88f03677e9e3ed1fe4097474ba89f`
- Generated and manifested eight Earth outputs:
  - `earth-day-mobile.webp` (60,950 bytes)
  - `earth-day-desktop.webp` (190,464 bytes)
  - `earth-night-mobile.webp` (29,296 bytes)
  - `earth-night-desktop.webp` (112,790 bytes)
  - `earth-clouds-mobile.webp` (503,670 bytes)
  - `earth-clouds-desktop.webp` (1,799,648 bytes)
  - `earth-normal-mobile.webp` (15,200 bytes)
  - `earth-normal-desktop.webp` (37,458 bytes)
- Generated `AI/vendor/three.module.min.js` and `AI/vendor/three-LICENSE.txt` from the pinned package.
- Added human-readable provenance and blocked-source details in `docs/assets/lumen-hero-provenance.md`.

## Unresolved NASA Inputs

The official source page is `https://svs.gsfc.nasa.gov/4720/`. Both the repository web fetcher and `curl.exe` failed against the NASA SVS host with connection resets. Attempts included the canonical page, its `/vis/a000000/a004700/a004720/` asset directory, the API path, and likely direct Moon Kit filenames. Because the task requires exact official direct URLs and checksums, no mirror, guessed checksum, non-HTTPS URL, or non-NASA substitute was accepted.

Missing outputs:

- `moon-albedo-mobile.webp`
- `moon-albedo-desktop.webp`
- `moon-normal-mobile.webp`
- `moon-normal-desktop.webp`

## Rendering Blocker

- `where.exe blender`: no executable found.
- `where.exe ffmpeg`: no executable found.
- Blender MCP: connection failed at `localhost:9876`; Blender is not running with the MCP server available.

Therefore the required reviewed, photoreal fallback renders could not be produced:

- `poster-mobile.webp`
- `poster-desktop.webp`
- `journey-mobile.mp4`
- `journey-desktop.mp4`

Producing these files requires Blender with the connected MCP add-on or a Blender CLI, plus an H.264 encoder capable of muted 30 FPS `yuv420p` MP4 with fast-start metadata. The render also requires the unresolved official Moon Kit assets.

## Verification

- RED: `node test-lumen-hero.mjs` failed on missing `tools/lumen-assets.json` before production changes.
- Partial build: `npm run build:lumen-assets` exits 0 and deterministically rebuilds the eight resolved Earth textures, local Three.js module/license, and partial runtime manifest.
- Required final build: `npm run build:lumen-assets -- --media` exits nonzero with `--media requires reviewed render output: poster-mobile.webp`.
- Required contract: `node test-lumen-hero.mjs` exits nonzero with `source manifest records NASA inputs`, correctly identifying that the Moon source records and generated Moon/media assets are absent.
- Dependency check: `npm ls three sharp --depth=0` reports `three@0.180.0` and `sharp@0.34.3`.

## Required Capability To Resume

1. Network access to `https://svs.gsfc.nasa.gov/4720/` and its HTTPS direct-file host so the Moon albedo/elevation files can be resolved, downloaded, and checksummed.
2. A running connected Blender MCP instance or Blender CLI.
3. An available H.264 encoder, either through Blender's FFmpeg support or an `ffmpeg` executable.
4. Human review of the generated desktop/mobile cinematic and final-frame posters before Task 3 can pass and be committed.

## Resume Evidence

**Final status:** COMPLETE

The task resumed after Blender and FFmpeg were located outside `PATH` and the NASA-source ruling permitted another official LRO product. The build now supports `BLENDER_PATH` and `FFMPEG_PATH`, with defaults at `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` and `C:\Program Files\Softdeluxe\Free Download Manager\ffmpeg.exe`.

Two reachable, official NASA-hosted LRO mosaics replaced the unavailable SVS kit:

- NASA LRO Moon mosaic: `7d0b642c84f2d6fd2f017ee729c29f333438c469afba53b241f801b122e37271`
- NASA Images LRO far-side original: `4ea44621e567d733f4e8fff5aec7d99e498137fbb6dea45b299f89042cf6aaa3`

The deterministic projector maps the near and far orthographic hemispheres into 1024x512 and 2048x1024 equirectangular albedo textures, then derives restrained wrap-aware normal maps. Quality limitation: these are rendered mosaics, not calibrated native global albedo/LOLA elevation rasters. Limb stretching is possible, and normal strength represents visual relief rather than scientific elevation. This is recorded in provenance.

`npm run build:lumen-assets -- --media` completed with Blender 5.1 Eevee and FFmpeg 4.3.1 Media Foundation H.264. It produced 240-frame, 30 FPS, eight-second, no-audio, yuv420p, fast-start videos and exact final-frame posters:

- `poster-mobile.webp`: 10,542 bytes, `1db8efd12ddfcd9558fef17f1dbbb4cfc101d70b7ad4c5bec10eac54bcf9847e`
- `poster-desktop.webp`: 12,882 bytes, `067b01c3badba90b1994f905bf838e516aafc3aa85763c267e45c50cc8fa5909`
- `journey-mobile.mp4`: 1,365,947 bytes, `a99028c664d154d193311da0520c0cbe46a8dd3903147e2004393ae4221e94f0`
- `journey-desktop.mp4`: 2,451,611 bytes, `59984857cb4bf062089bfa2acc8b2c4fcd2dcca52cdf7b130d28324e04df7ba1`

FFmpeg inspection reported desktop 1600x900 and mobile 900x1200, H.264 Constrained Baseline, yuv420p, 30 FPS, eight seconds, with no audio stream. `moov` relocation ran for both files. Representative frame statistics were inspected at Solar, Terra, Luna and final-frame points; generated texture metadata confirmed exact power-of-two dimensions and retained cloud alpha. Automated media could not be visually interpreted by this text-only controller, so the main residual review concern is aesthetic framing rather than file validity or provenance.
