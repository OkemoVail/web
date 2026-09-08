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

## Review Fixes

All findings from `task-3-review.md` were addressed in a follow-up render and pipeline revision.

- Added `AI/js/lumen-timeline.json` as the single checked-in 0/2/5/6.5/8-second camera, body, light, and mobile-composition source. Blender consumes it directly and Task 4 can consume it verbatim.
- Replaced the uniform Sun with a high-detail 4D procedural granular photosphere and restrained Fresnel corona.
- Replaced nearby icospheres with 1,800 seeded points on a radius-95 celestial sphere.
- Added separate Earth normal, cloud, and atmosphere shells. A geometry-normal dot product against the shared solar direction drives an inverted dark-side mask multiplying city emission.
- Earth and Moon use one directional Sun lamp and roughness/normal responses for ocean/land and lunar regolith.
- Corrected provenance: combined Moon outputs record `moonNear` and `moonFar`; every media output records all six NASA source IDs.
- Tests now recompute every deployed SHA-256, inspect all textures with Sharp for exact dimensions and cloud-only alpha, and invoke FFprobe for one video/no audio stream, H.264, yuv420p, exact dimensions, 30 FPS, 240 decoded frames, eight-second duration, and fast-start `moov` placement.
- Media stage under `C:\Users\okemo\AppData\Local\Temp\opencode\lumen-sources\media-stage`, validate as a complete set, then promote through a rollback-capable swap. Normal builds reject any deployed media differing from immutable hashes.
- Toolchain verified: Blender 5.1.0 SHA-256 `f9d2e744702354e7d182861fb924bc128ea85d8cf0577b91dcb4d92f09cdc287`; FFmpeg 9.0.1 SHA-256 `cf6b46df53d3672e86af7662358bbd2b21c90cc78c133f3f81f46e63acc387b3`; FFprobe SHA-256 `0c49675a5f3098b881b1508368deb22e23d22fe56fa7a197df1b98c4e5ea79bf`; libx264 capability verified.

Exact render command: `npm run build:lumen-assets -- --media --accept-media`. Blender produced 240 PNG frames for desktop 1600x900 and mobile 900x1200. FFmpeg reported libx264 High profile, yuv420p, 30 FPS, fast-start relocation, and no audio. The final corrected-light artifact hashes are: desktop video `6f6780a3586a1e89eb3c879b3c71a08c5717328aeaa0b114835132649fe11457` (666,751 bytes), mobile video `7ee8fc9ce082ae47fd215cd4526bdd16791b5b33cff5c71c02c1f324654bc15d` (456,483 bytes), desktop poster `fbddb74a881735cd818673a6ecb612735effe4aee20cc227ce3248a74fbb8a7c` (70,830 bytes), and mobile poster `6bee4460e68b02d5a12663dba1aee39f3af891de55cf31a2bb45a92d9958d498` (46,472 bytes). Final immutable hashes are pinned in `tools/lumen-assets.json`.

Representative review covered Solar frame 0001, Terra frames 0060/0150, Luna frame 0195, and final frame 0240 at both aspect ratios. Pixel statistics confirmed non-empty, changing phase images: desktop Solar RGB mean 254.92/168.70/146.47; desktop final 31.71/22.10/20.54; mobile final 30.37/20.58/18.69. The rigorous setup review confirms procedural granulation/corona, a shared physical light direction, dark-side city masking, transparent clouds, atmospheric rim, distant point stars, and rough normal-mapped lunar regolith rather than inferring realism from container validity. Remaining concern: Moon normals remain luminance-derived from projected LRO mosaics rather than calibrated LOLA elevation, and final cinematic taste still merits human browser review.

## Fix Round 2: Transactional Acceptance

The review found that `--accept-media` mutated `tools/lumen-assets.json` before promotion completed. A later promotion failure could restore old deployed media while leaving new reviewed hashes on disk.

`tools/lumen-media-transaction.mjs` now owns acceptance as one rollback boundary. It leaves the old live config untouched, copies and validates the complete staged set, moves old deployed files to transaction-local backups, promotes and revalidates all four files, then writes the new config to `lumen-assets.json.tmp` and renames it into place. Any promotion, post-promotion validation, pre-commit, temporary-write, or rename failure removes promoted media and restores every old deployed file; because the final config rename never succeeded, the exact old config remains untouched. The asset pipeline no longer writes accepted hashes before this transaction succeeds.

The focused failure-path contract in `test-lumen-hero.mjs` uses an isolated directory under `C:\Users\okemo\AppData\Local\Temp\opencode`, two synthetic media files, and synthetic old/new reviewed hashes. Its `beforeConfigCommit` hook throws `simulated config failure` after promotion and validation. `assert.rejects` proves the failure occurs, then byte-for-byte assertions prove both deployed files are the old reviewed files and a parsed config assertion proves both old reviewed hashes remain. Real deployed assets are never touched.

RED command: `node test-lumen-hero.mjs`. Output before implementation: `ERR_MODULE_NOT_FOUND: Cannot find module ... tools/lumen-media-transaction.mjs`. GREEN command: `node test-lumen-hero.mjs`. Output: `Lumen hero policy assertions passed.` Full Task 3 verification command: `npm run build:lumen-assets; node test-lumen-hero.mjs; node test-ai-home-theme.mjs; node test-ai-home-bdh.mjs; node test-z-index.mjs`.

## Fix Round 3: Config Operation Coverage

The round-2 production ordering was transactional, but its test hook failed before either real config filesystem operation. `acceptMediaTransaction` now accepts an injectable filesystem adapter and exports the production Node adapter used by default.

The focused contract runs two isolated transactions. In both cases post-promotion validation first reads `new poster` and `new video` from deployed paths, proving promotion completed. Case one injects a rejection from the actual `${configPath}.tmp` write. Case two permits that write and rejects the actual `${configPath}.tmp` to `${configPath}` rename. After each rejection, assertions compare the config as a `Buffer` against the deliberately formatted original bytes and verify every old deployed media file's exact text. No real assets or production config are touched.

RED command: `node test-lumen-hero.mjs`. Output: `AssertionError [ERR_ASSERTION]: Missing expected rejection.` This proved the then-current transaction ignored injected config filesystem failures. GREEN command: `node test-lumen-hero.mjs`. Output: `Lumen hero policy assertions passed.` The final suite command remains `npm run build:lumen-assets; node test-lumen-hero.mjs; node test-ai-home-theme.mjs; node test-ai-home-bdh.mjs; node test-z-index.mjs`.
