# Lumen Hero Asset Provenance

The generated browser assets are local derivatives of public NASA imagery. Run `npm run build:lumen-assets` to verify cached source checksums, rebuild textures, copy the pinned Three.js distribution, and refresh `AI/assets/lumen/manifest.json`. Source downloads and temporary render frames are confined to `C:\Users\okemo\AppData\Local\Temp\opencode\lumen-sources`.

Run `npm run build:lumen-assets -- --media` only to reproduce an already pinned reviewed media set. New output hashes are rejected. After visual review, `npm run build:lumen-assets -- --media --accept-media` explicitly pins newly reviewed hashes. The renderer uses `BLENDER_PATH`, `FFMPEG_PATH`, and `FFPROBE_PATH` when set, otherwise the local Windows defaults recorded below.

## Sources And Transformations

| Output | Source title | Source page | Direct file | Credit | Transformation |
| --- | --- | --- | --- | --- | --- |
| `earth-day-{mobile,desktop}.webp` | Blue Marble land, ocean, and ice | [Blue Marble: Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/) | [PNG](https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.png) | NASA Earth Observatory | Lanczos resize to 1024x512 and 2048x1024; WebP encoding. |
| `earth-night-{mobile,desktop}.webp` | Earth at Night 2012 | [Blue marble](https://science.nasa.gov/resource/blue-marble/) | [JPEG](https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg) | NASA Earth Observatory/NOAA NGDC | Lanczos resize; WebP encoding. Kept separate from the day layer. |
| `earth-clouds-{mobile,desktop}.webp` | Blue Marble cloud layer | [Blue marble](https://science.nasa.gov/resource/blue-marble/) | [JPEG](https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg) | NASA Earth Observatory | Lanczos resize; luminance-derived alpha; WebP encoding. |
| `earth-normal-{mobile,desktop}.webp` | Blue Marble Next Generation topography and bathymetry | [Blue Marble: Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/) | [JPEG](https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/images/bmng/bmng-topography-bathymetry/august/world.topo.bathy.200408.3x5400x2700.jpg?w=5400&h=2700&fit=clip&crop=faces%2Cfocalpoint) | NASA Earth Observatory | Resize; restrained wrap-aware luminance gradient normal derivation; WebP encoding. |
| `moon-albedo-{mobile,desktop}.webp` | NASA LRO Moon mosaic and The Far Side of the Moon | [Near-side mosaic](https://science.nasa.gov/resource/moon-mosaic/), [far-side record](https://images.nasa.gov/details/GSFC_20171208_Archive_e001939) | [Near-side PNG](https://assets.science.nasa.gov/content/dam/science/psd/earths-moon/outreach-materials/NASA-LRO-Moon-mosaic.png), [far-side JPEG](https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001939/GSFC_20171208_Archive_e001939~orig.jpg) | NASA/GSFC/Arizona State University | Deterministic orthographic-to-equirectangular projection using near and far hemispheres; WebP encoding. |
| `moon-normal-{mobile,desktop}.webp` | Same LRO mosaics | Same pages and direct files | NASA/GSFC/Arizona State University | Restrained wrap-aware luminance gradient normal derivation from the projected global mosaic; WebP encoding. |
| `journey-{mobile,desktop}.mp4`, `poster-{mobile,desktop}.webp` | All sources above | All pages above | All direct files above | Credits above | Blender 5.1 Eevee render driven verbatim by `AI/js/lumen-timeline.json`; FFmpeg 9.0.1/libx264 encode at 30 FPS, yuv420p, no audio, fast-start; frame 240 exported as WebP. Runtime `sources` lists all six source IDs. |

## Toolchain

- Blender default: `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`
- FFmpeg/FFprobe default: WinGet `Gyan.FFmpeg.Shared` 9.0.1 under the user package directory
- Browser renderer: `three@0.180.0`, copied with its MIT license
- Texture processing: `sharp@0.34.3`

The manifest pins executable SHA-256 values and the pipeline verifies Blender version, FFmpeg version, libx264 capability, FFprobe checksum, staged stream metadata, and immutable media hashes. Media bytes are reviewed immutable artifacts, not claimed to be cross-host deterministic.

Acceptance is transactional: the complete staged set is copied and validated, deployed media are moved behind rollback backups, the promoted set is validated again, and only then is the updated source manifest written through a temporary file and rename. Any promotion, validation, or config-commit failure restores both the prior deployed media and prior manifest bytes.

## Quality Limitations

NASA SVS remained unreachable, so the source set uses reachable official NASA Science and NASA Images LRO products. These are orthographic near-side and far-side mosaics rather than a native global equirectangular albedo/elevation pair. Their deterministic projection provides complete spherical coverage, but the limb regions stretch and the normal map is a relief cue derived from mosaic luminance, not calibrated LOLA elevation. This is suitable for the small, moving Moon in the hero and is explicitly not scientific topography.

The fallback render uses a procedural granular photosphere and corona, a distant point-based star sphere, separate Earth surface/city-light/cloud/normal/atmosphere layers, and projected LRO Moon albedo/normal layers. City emission is multiplied by a normal-to-solar-direction dark-side mask, and one checked-in direction drives that mask and the Sun light shared by Earth and Moon. It contains no baked title copy because the accessible HTML overlay remains authoritative.
