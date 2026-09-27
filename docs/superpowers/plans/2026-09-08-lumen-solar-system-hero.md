# Lumen 1.9 Solar-System Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first AI landing-page video slide with an eight-second, hyper-real Solar to Terra to Luna introduction for the single Lumen 1.9 model while preserving both existing videos and providing efficient cinematic and poster fallbacks.

**Architecture:** A small testable policy module chooses poster, video, or WebGL before expensive assets load. `lumen-hero.js` owns one explicit lifecycle and timeline; `lumen-scene.js` owns Three.js only. The existing carousel remains the authority for slide changes and notifies the Lumen controller through `setActive(active)`, so rendering and video never continue offscreen.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, local Three.js ES module, WebGL 2/1, Web Animations API/requestAnimationFrame, HTML video/picture, Node contract tests, Playwright, Sharp-based asset processing, Blender-rendered fallback media.

**Spec:** `docs/superpowers/specs/2026-09-08-lumen-solar-system-hero-design.md`

## Global Constraints

- Lumen 1.9 is landing-page branding only; do not rename Saga in chat, settings, backend requests, prompts, or persisted data.
- The sequence is exactly Solar 0.0-2.0s, Terra 2.0-5.0s, Luna 5.0-6.5s, and Lumen reveal 6.5-8.0s.
- The final Mission title frame holds until the visitor deliberately changes slides or activates Start here.
- The hero contains exactly three slides: Lumen 1.9, the existing Labs21 video, and the existing product video.
- Use locally hosted assets and a locally hosted pinned Three.js build; introduce no runtime asset or script CDN for this feature.
- `prefers-reduced-motion`, `navigator.webdriver`, failed media, and failed WebGL must produce the final poster state immediately.
- Save-Data and conservatively detected weak hardware use cinematic video, not degraded real-time 3D.
- Real-time rendering targets at least 30 FPS, caps device pixel ratio at 1.5, and stops when the slide, page, or tab is inactive.
- Copy and controls remain semantic HTML; canvas and video are decorative and hidden from the accessibility tree.
- Use the existing flat control language, motion tokens, and semantic z-index tokens. Do not add arbitrary page-level z-index values.
- All new JS-driven motion must also bail under `navigator.webdriver` and `prefers-reduced-motion`.
- Preserve `AI/index.html`'s existing lower-page Based AI and BDH content.

## File Structure

- `AI/index.html`: semantic three-slide hero markup and thin carousel lifecycle integration only.
- `AI/js/lumen-hero-policy.js`: pure capability, quality, and timeline decisions; exposes `window.LumenHeroPolicy` and contains no DOM mutation.
- `AI/js/lumen-scene.js`: Three.js scene construction/render/disposal; exposes `window.createLumenScene(options)`.
- `AI/js/lumen-hero.js`: DOM controller, mode selection, fallback handoff, timeline, controls, visibility, and public lifecycle.
- `AI/vendor/three.module.min.js`: pinned production Three.js module copied by the asset build; include the upstream license beside it.
- `AI/assets/lumen/`: generated mobile/desktop textures, poster images, and cinematic fallback videos.
- `tools/lumen-assets.mjs`: repeatable download, checksum, resize, conversion, and vendor-copy pipeline.
- `tools/lumen-assets.json`: exact source URLs, credits, expected checksums, and generated variants.
- `docs/assets/lumen-hero-provenance.md`: human-readable NASA provenance and generated-asset commands.
- `test-lumen-hero.mjs`: dependency-free structural and pure-policy contracts.
- `test-lumen-hero-playwright.mjs`: browser lifecycle, accessibility, and deterministic fallback contracts.
- `package.json` / `package-lock.json`: pinned `three` and `sharp` development inputs for reproducible checked-in browser assets.

---

### Task 1: Lock the Runtime Policy and Timeline

**Files:**
- Create: `AI/js/lumen-hero-policy.js`
- Create: `test-lumen-hero.mjs`

**Interfaces:**
- Produces: `window.LumenHeroPolicy.chooseMode(signals) -> 'poster' | 'video' | 'webgl'`.
- Produces: `window.LumenHeroPolicy.chooseQuality(signals) -> { textureTier: 'mobile' | 'desktop', pixelRatio: number, antialias: boolean }`.
- Produces: `window.LumenHeroPolicy.timelineAt(ms) -> { phase: 'solar' | 'terra' | 'luna' | 'reveal' | 'held', progress: number, label: string, copyVisible: boolean }`.
- `signals` is `{ reduceMotion, automated, saveData, webgl, deviceMemory, hardwareConcurrency, width, dpr, warmupFps }`; optional numeric hints use `null`, never guessed defaults.

- [ ] **Step 1: Write failing pure-policy tests**

Add a VM loader and assertions to `test-lumen-hero.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(
  readFileSync(new URL('./AI/js/lumen-hero-policy.js', import.meta.url), 'utf8'),
  context,
);
const policy = context.window.LumenHeroPolicy;

assert.equal(policy.chooseMode({ reduceMotion: true }), 'poster');
assert.equal(policy.chooseMode({ automated: true }), 'poster');
assert.equal(policy.chooseMode({ saveData: true, webgl: true }), 'video');
assert.equal(policy.chooseMode({ webgl: false }), 'video');
assert.equal(policy.chooseMode({ webgl: true, deviceMemory: 2, hardwareConcurrency: 4 }), 'video');
assert.equal(policy.chooseMode({ webgl: true, deviceMemory: 8, hardwareConcurrency: 8, warmupFps: 55 }), 'webgl');
assert.equal(policy.timelineAt(0).phase, 'solar');
assert.equal(policy.timelineAt(2000).phase, 'terra');
assert.equal(policy.timelineAt(5000).phase, 'luna');
assert.equal(policy.timelineAt(6500).phase, 'reveal');
assert.equal(policy.timelineAt(8000).phase, 'held');
assert.equal(policy.timelineAt(6500).copyVisible, true);
```

- [ ] **Step 2: Run the contract to verify it fails**

Run: `node test-lumen-hero.mjs`  
Expected: FAIL because `AI/js/lumen-hero-policy.js` does not exist.

- [ ] **Step 3: Implement the pure policy**

Use an IIFE so Node can evaluate it and the browser can consume it without a bundler. Keep thresholds in named constants:

```js
(function () {
  'use strict';

  var DURATION = 8000;

  function chooseMode(s) {
    if (s.reduceMotion || s.automated) return 'poster';
    if (s.saveData || !s.webgl) return 'video';
    if (s.deviceMemory !== null && s.deviceMemory < 4) return 'video';
    if (s.hardwareConcurrency !== null && s.hardwareConcurrency < 6) return 'video';
    if (s.warmupFps !== null && s.warmupFps < 40) return 'video';
    return 'webgl';
  }

  function chooseQuality(s) {
    var mobile = s.width <= 768 || (s.deviceMemory !== null && s.deviceMemory < 8);
    return {
      textureTier: mobile ? 'mobile' : 'desktop',
      pixelRatio: Math.min(s.dpr || 1, mobile ? 1 : 1.5),
      antialias: !mobile && (s.warmupFps === null || s.warmupFps >= 50),
    };
  }

  function timelineAt(ms) {
    var time = Math.max(0, ms);
    if (time >= DURATION) return { phase: 'held', progress: 1, label: '', copyVisible: true };
    if (time >= 6500) return { phase: 'reveal', progress: (time - 6500) / 1500, label: '', copyVisible: true };
    if (time >= 5000) return { phase: 'luna', progress: (time - 5000) / 1500, label: 'LUNA', copyVisible: false };
    if (time >= 2000) return { phase: 'terra', progress: (time - 2000) / 3000, label: 'TERRA', copyVisible: false };
    return { phase: 'solar', progress: time / 2000, label: 'SOLAR', copyVisible: false };
  }

  window.LumenHeroPolicy = { DURATION: DURATION, chooseMode: chooseMode, chooseQuality: chooseQuality, timelineAt: timelineAt };
})();
```

- [ ] **Step 4: Run the contract and verify it passes**

Run: `node test-lumen-hero.mjs`  
Expected: all policy assertions pass.

- [ ] **Step 5: Commit the policy slice**

```bash
git add AI/js/lumen-hero-policy.js test-lumen-hero.mjs
git commit -m "test: define Lumen hero runtime policy"
```

### Task 2: Build the Semantic Three-Slide Hero Shell

**Files:**
- Modify: `AI/index.html:88-359`
- Modify: `src/site.css:1199-1538`
- Modify: `test-lumen-hero.mjs`
- Modify: `test-ai-home-theme.mjs`

**Interfaces:**
- Consumes: `window.LumenHeroPolicy` from Task 1.
- Produces DOM IDs: `#lumen-hero`, `#lumen-stage`, `#lumen-poster`, `#lumen-fallback`, `#lumen-copy`, `#lumen-location`, `#lumen-playback`, `#lumen-status`.
- Produces exactly three `.hero-card` elements with `data-card="0"`, `data-card="1"`, and `data-card="2"`.
- Produces state attributes on `#lumen-hero`: `data-mode="poster|video|webgl"` and `data-state="loading|playing|held|failed"`.

- [ ] **Step 1: Extend the structural contract before changing markup**

Read `AI/index.html` and `src/site.css` in `test-lumen-hero.mjs`, then assert:

```js
const html = readFileSync(new URL('./AI/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');

assert.equal((html.match(/class="hero-card(?:\s|\")/g) || []).length, 3);
assert.match(html, /id="lumen-hero"[^>]*data-card="0"/);
assert.match(html, /id="lumen-stage"/);
assert.match(html, /id="lumen-poster"[^>]*aria-hidden="true"/);
assert.match(html, /id="lumen-fallback"[^>]*muted[^>]*playsinline[^>]*aria-hidden="true"/s);
assert.match(html, /id="lumen-location"[^>]*aria-hidden="true"/);
assert.match(html, /id="lumen-playback"[^>]*>\s*Skip intro\s*</);
assert.match(html, /href="chat\.html"[^>]*>[^<]*Start here/s);
assert.match(html, /Lumen 1\.9/);
assert.match(html, /solar limb, Earth, and Moon/i);
assert.doesNotMatch(html, /aria-live="assertive"/);
assert.match(css, /\[data-page="ai-home"\] \.lumen-copy/s);
assert.match(css, /z-index:\s*var\(--z-chrome\)/);
```

- [ ] **Step 2: Run tests and verify the new assertions fail**

Run: `node test-lumen-hero.mjs && node test-ai-home-theme.mjs && node test-ai-home-bdh.mjs`  
Expected: the first command fails on missing Lumen markup; the existing two tests still pass independently.

- [ ] **Step 3: Replace the first card and shift existing videos**

In `AI/index.html`:

- Make card 0 `id="lumen-hero"` with a poster `<picture>`, decorative muted fallback `<video>`, empty `#lumen-stage`, visually hidden description, location caption, Mission title copy, Start here link, and Skip intro button.
- Move `labs21-hero.mp4` to card 1 without changing its replay behavior.
- Move `comp1.mp4` / `comp1-mobile.mp4` and the full player to card 2.
- Add a third dot and accurate labels.
- Load `js/lumen-hero-policy.js`, `js/lumen-hero.js`, and the existing `motion.js`/`nav.js` in dependency order at the bottom. `lumen-scene.js` remains dynamically imported only by the WebGL path.
- Keep all visible Lumen copy in HTML, not in media.

- [ ] **Step 4: Replace first-card CSS with a responsive scene shell**

In the existing AI-home section of `src/site.css`:

- Preserve `.hero-section`, `.hero-scroll-wrap`, `.hero-scroll`, `.hero-card`, arrows, dots, and player rules.
- Add absolute layers for poster/video/canvas, with all media using `object-fit: cover`.
- Place `.lumen-copy` lower-left on desktop and mobile, constrain it to avoid Terra's upper-right crop, and use a localized left/bottom scrim only behind text.
- Keep `#lumen-playback` at upper-right below the universal nav, using `z-index: var(--z-chrome)` and `--shadow-float`.
- Use state selectors such as `[data-state="held"] .lumen-copy` instead of inline style mutations.
- Add `@media (prefers-reduced-motion: reduce)` rules that remove Lumen transitions and slow held-state motion.

- [ ] **Step 5: Update the existing theme contract narrowly**

Keep the current flex assertion and add checks that the hero card's fallback background is dark regardless of site theme while the surrounding section still uses theme tokens. Do not weaken or delete the current assertion.

- [ ] **Step 6: Run shell contracts**

Run: `node test-lumen-hero.mjs && node test-ai-home-theme.mjs && node test-ai-home-bdh.mjs && node test-z-index.mjs`  
Expected: all pass.

- [ ] **Step 7: Commit the semantic shell**

```bash
git add AI/index.html src/site.css test-lumen-hero.mjs test-ai-home-theme.mjs
git commit -m "feat: add Lumen cinematic hero shell"
```

### Task 3: Create the Reproducible Local Asset Pipeline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tools/lumen-assets.json`
- Create: `tools/lumen-assets.mjs`
- Create: `docs/assets/lumen-hero-provenance.md`
- Create: `AI/vendor/three.module.min.js`
- Create: `AI/vendor/three-LICENSE.txt`
- Create: `AI/assets/lumen/*`
- Modify: `test-lumen-hero.mjs`

**Interfaces:**
- Produces `npm run build:lumen-assets`.
- Produces `AI/assets/lumen/manifest.json` containing `{ files: Record<string, { bytes, sha256, source }> }`.
- Produces texture keys consumed by `lumen-scene.js`: `earthDay`, `earthNight`, `earthClouds`, `earthNormal`, `moonAlbedo`, `moonNormal`, each with `mobile` and `desktop` paths.
- Produces `poster-mobile.webp`, `poster-desktop.webp`, `journey-mobile.mp4`, `journey-desktop.mp4`.

- [ ] **Step 1: Add failing asset-manifest contracts**

Add assertions that the source manifest, provenance file, local Three.js build/license, generated manifest, six texture families, two posters, and two videos exist. Parse both manifests and assert every source URL uses `https://` and every runtime path begins `assets/lumen/` rather than an external origin.

Also assert asset budgets:

```js
assert.ok(runtime.files['poster-mobile.webp'].bytes <= 180_000);
assert.ok(runtime.files['poster-desktop.webp'].bytes <= 350_000);
assert.ok(runtime.files['journey-mobile.mp4'].bytes <= 2_500_000);
assert.ok(runtime.files['journey-desktop.mp4'].bytes <= 5_000_000);
```

- [ ] **Step 2: Run the contract and verify missing assets fail**

Run: `node test-lumen-hero.mjs`  
Expected: FAIL on missing `tools/lumen-assets.json` or generated files.

- [ ] **Step 3: Add pinned build inputs**

Run: `npm install --save-dev three@0.180.0 sharp@0.34.3`  
Add `"build:lumen-assets": "node tools/lumen-assets.mjs"` to `scripts` in `package.json`.

- [ ] **Step 4: Define exact source provenance**

Create `tools/lumen-assets.json` with explicit source records and SHA-256 checksums for:

- NASA Earth Observatory Blue Marble Next Generation surface imagery: `https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/`
- NASA Visible Earth Blue Marble/cloud and city-light layers: `https://science.nasa.gov/resource/blue-marble/`
- NASA Scientific Visualization Studio CGI Moon Kit albedo/elevation data: `https://svs.gsfc.nasa.gov/4720/`

The implementer must resolve each page's direct downloadable asset once, record that exact direct URL and checksum in the JSON, and never scrape those pages at runtime. `docs/assets/lumen-hero-provenance.md` repeats the title, source page, direct file, credit line, transformation, and output names for each source.

- [ ] **Step 5: Implement deterministic asset generation**

`tools/lumen-assets.mjs` must:

1. Download to `C:\Users\okemo\AppData\Local\Temp\opencode\lumen-sources` only when a cached checksum does not match.
2. Reject redirects to non-HTTPS destinations and reject checksum mismatches.
3. Use Sharp to resize equirectangular textures to power-of-two mobile (1024x512) and desktop (2048x1024) WebP variants.
4. Derive restrained normal maps from elevation/luminance inputs and write them as WebP.
5. Copy `node_modules/three/build/three.module.min.js` and `node_modules/three/LICENSE` into `AI/vendor/`.
6. Hash every deployed output and write `AI/assets/lumen/manifest.json`.
7. Refuse to overwrite poster/video outputs unless `--media` is supplied, preventing texture rebuilds from deleting reviewed renders.

- [ ] **Step 6: Generate and inspect textures**

Run: `npm run build:lumen-assets`  
Expected: six texture families and local Three.js files are generated; the script prints each byte size and checksum and exits 0.

Open the generated textures directly and verify: no seam at longitude wrap, no accidental vertical flip, clouds retain transparency, Earth night lights are not baked into the day layer, and Moon relief is not inverted.

- [ ] **Step 7: Produce the reviewed fallback renders**

Build the desktop and mobile eight-second fallbacks from the same camera keyframes and assets used by WebGL. Use Blender through the connected Blender tooling or an installed Blender CLI; render H.264 MP4 with muted/no audio, `yuv420p`, fast-start metadata, desktop 1600x900, mobile 900x1200, and a 30 FPS timeline. Export the exact final frame as the two WebP posters.

If Blender or its video encoder is unavailable, stop this task and install/locate the rendering tool with the user rather than substituting illustrative CSS assets. Do not mark the task complete until all four reviewed media outputs exist and meet the byte budgets.

- [ ] **Step 8: Refresh the generated manifest and run contracts**

Run: `npm run build:lumen-assets -- --media && node test-lumen-hero.mjs`  
Expected: asset generation and all manifest, provenance, locality, and budget assertions pass.

- [ ] **Step 9: Commit reproducible assets**

```bash
git add package.json package-lock.json tools/lumen-assets.json tools/lumen-assets.mjs docs/assets/lumen-hero-provenance.md AI/vendor AI/assets/lumen test-lumen-hero.mjs
git commit -m "build: add local Lumen space assets"
```

### Task 4: Implement and Test the Three.js Scene Boundary

**Files:**
- Create: `AI/js/lumen-scene.js`
- Modify: `test-lumen-hero.mjs`

**Interfaces:**
- Consumes: local `../vendor/three.module.min.js` and quality/asset options.
- Produces: `window.createLumenScene({ mount, quality, assets, onContextLost }) -> Promise<LumenScene>`.
- `LumenScene` is `{ render(state, deltaMs), resize(width, height), pause(), resume(), dispose() }`.
- `render` consumes the exact object returned by `LumenHeroPolicy.timelineAt(ms)` plus `elapsedMs` when held.

- [ ] **Step 1: Add failing source-level scene contracts**

Assert `lumen-scene.js`:

- imports only `../vendor/three.module.min.js`
- exports no network URLs
- creates Earth surface, cloud shell, atmosphere, Moon, solar limb, and stars
- registers `webglcontextlost`
- defines `dispose()` and calls `dispose()` on geometries, materials, textures, and renderer
- caps renderer pixel ratio from the passed quality profile

- [ ] **Step 2: Run and verify scene contracts fail**

Run: `node test-lumen-hero.mjs`  
Expected: FAIL because `lumen-scene.js` does not exist.

- [ ] **Step 3: Implement scene construction**

Use `SphereGeometry` with desktop/mobile segment counts, `MeshStandardMaterial` for Earth/Moon, a transparent cloud shell, a back-face atmosphere shader, a procedural solar-limb shader, and a fixed seeded star point field. Configure shared directional sunlight, ACES filmic tone mapping, and sRGB output.

Do not add EffectComposer, bloom, lens flare, physics, controls, or an animation library. `render(state, deltaMs)` maps each phase to fixed camera position/target keyframes with smooth interpolation and applies only slow held-state Earth/cloud rotation after completion.

- [ ] **Step 4: Implement lifecycle safety**

- `pause()` stops the internal requestAnimationFrame loop without losing state.
- `resume()` restarts at the supplied controller time rather than wall-clock time.
- `resize()` updates renderer size and camera aspect without resetting the timeline.
- Context loss calls `preventDefault()`, pauses, and invokes `onContextLost()` once.
- `dispose()` removes listeners, the canvas, and every GPU resource.

- [ ] **Step 5: Run contracts**

Run: `node test-lumen-hero.mjs`  
Expected: all pure-policy, asset, and scene-boundary assertions pass.

- [ ] **Step 6: Commit the renderer boundary**

```bash
git add AI/js/lumen-scene.js test-lumen-hero.mjs
git commit -m "feat: render the Lumen solar journey"
```

### Task 5: Implement the Hero Controller, Fallback Handoffs, and Controls

**Files:**
- Create: `AI/js/lumen-hero.js`
- Modify: `AI/index.html`
- Modify: `test-lumen-hero.mjs`
- Create: `test-lumen-hero-playwright.mjs`

**Interfaces:**
- Consumes: `window.LumenHeroPolicy`, `window.createLumenScene`, and Task 2 DOM IDs.
- Produces: `window.LumenHero = { ready, setActive(active), skip(), replay(), destroy(), getState() }`.
- `ready` is a Promise resolving to `{ mode: 'poster' | 'video' | 'webgl' }`.
- `getState()` returns `{ mode, state, active, elapsedMs, phase }` for diagnostics/tests.

- [ ] **Step 1: Add failing browser controller contracts**

Use a local static server in `test-lumen-hero-playwright.mjs`, launch Chromium, and add init scripts before navigation:

```js
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => true });
});
await page.goto(baseUrl + '/AI/index.html');
await expect(page.locator('#lumen-hero')).toHaveAttribute('data-mode', 'poster');
await expect(page.locator('#lumen-hero')).toHaveAttribute('data-state', 'held');
await expect(page.locator('#lumen-copy')).toBeVisible();
await expect(page.locator('#lumen-playback')).toBeHidden();
```

Add a second context that stubs `matchMedia('(prefers-reduced-motion: reduce)')` true and expects the same immediate held state. Add keyboard checks for Start here and all three dots.

- [ ] **Step 2: Run browser tests and verify failure**

Run: `node test-lumen-hero-playwright.mjs`  
Expected: FAIL because `window.LumenHero` and state transitions do not exist.

- [ ] **Step 3: Implement conservative signal collection and mode selection**

In `lumen-hero.js`:

- Read reduced motion, webdriver, Save-Data, device memory, hardware concurrency, viewport, and DPR once during initialization.
- Probe WebGL with a temporary canvas and release its context.
- Show the poster during every async operation.
- Select poster immediately for reduced motion/automation.
- Select video immediately for known weak/save-data/no-WebGL signals.
- For otherwise eligible devices, dynamically import `./lumen-scene.js`, perform a capped warm-up, then either retain WebGL or hand off to video.
- Never preload WebGL textures and fallback video together.

- [ ] **Step 4: Implement one timeline shared by visual and HTML layers**

Use `performance.now()` plus accumulated active time, not nested timeouts. Each frame calls `timelineAt(elapsedMs)`, updates `#lumen-location`, toggles copy state, and calls either scene render or video synchronization. `skip()` sets elapsed time to 8000, pauses/seeks fallback video, and enters held state synchronously.

- [ ] **Step 5: Implement replay and failure handoff**

- Replay exists only for WebGL/video users and resets elapsed time to zero.
- Reduced-motion/poster users do not receive a misleading Replay control.
- Scene import, texture, warm-up, renderer, context-loss, or runtime errors call a single idempotent `fallBack(reason)` function.
- Video `error`, autoplay rejection, and decode failure call `showPoster(reason)`.
- `#lumen-status` contains a polite one-time status such as `Lumen introduction ready`; captions themselves are not live announcements.

- [ ] **Step 6: Implement activity and visibility lifecycle**

- `setActive(false)` pauses requestAnimationFrame/video and finalizes to the held frame.
- `setActive(true)` resumes only slow held-state rendering; it never auto-replays.
- `visibilitychange` pauses hidden tabs and resumes only if the Lumen slide remains active.
- An IntersectionObserver pauses when the hero is outside the viewport.
- ResizeObserver calls the scene's `resize()` without restarting the timeline.
- `destroy()` removes observers/listeners and disposes the scene.

- [ ] **Step 7: Run browser and contract tests**

Run: `node test-lumen-hero.mjs && node test-lumen-hero-playwright.mjs`  
Expected: all poster, reduced-motion, keyboard, lifecycle, and source contracts pass.

- [ ] **Step 8: Commit the controller**

```bash
git add AI/js/lumen-hero.js AI/index.html test-lumen-hero.mjs test-lumen-hero-playwright.mjs
git commit -m "feat: control Lumen playback and fallbacks"
```

### Task 6: Integrate Lumen with the Existing Video Carousel

**Files:**
- Modify: `AI/index.html:162-359`
- Modify: `test-lumen-hero.mjs`
- Modify: `test-lumen-hero-playwright.mjs`

**Interfaces:**
- Consumes: `window.LumenHero.setActive(active)` and `window.LumenHero.ready`.
- Keeps carousel API internal; card indices are Lumen `0`, Labs21 `1`, product player `2`.

- [ ] **Step 1: Add failing three-slide interaction tests**

Add Playwright cases that:

- see dot 0 active initially
- click Next and observe card 1 / dot 1 active
- verify Lumen state becomes held and inactive
- click Next and observe card 2 / dot 2 active
- verify only the active card's video is playing
- click Previous twice and observe the Lumen held frame without replay
- click Replay and observe `data-state="playing"` only after deliberate activation

Add source contracts that every array access and card-specific initializer uses indices 0/1/2 correctly and no old two-card assumptions remain.

- [ ] **Step 2: Run and verify the integration tests fail**

Run: `node test-lumen-hero-playwright.mjs`  
Expected: FAIL on incorrect card indices or missing lifecycle calls.

- [ ] **Step 3: Refactor carousel card initialization by role**

Replace positional comments and shared `cards[0]`/`cards[1]` assumptions with named references:

```js
var lumenCard = cards[0];
var labsVideoCard = cards[1];
var productVideoCard = cards[2];
```

Keep the current video source switching and full product-player logic, but point them to the named cards. In `setActive(i)`, call `window.LumenHero.setActive(i === 0)`, pause all non-active video elements, and play only the selected video after source application.

- [ ] **Step 4: Make scroll positioning robust**

Replace `i * scroller.clientWidth` with `cards[i].offsetLeft - scroller.offsetLeft` so the existing desktop gap does not accumulate positioning error across three cards. Preserve native smooth scrolling, snap behavior, touch input, and hidden boundary arrows.

- [ ] **Step 5: Run the full hero suite**

Run: `node test-lumen-hero.mjs && node test-lumen-hero-playwright.mjs && node test-ai-home-theme.mjs && node test-ai-home-bdh.mjs && node test-z-index.mjs`  
Expected: all pass.

- [ ] **Step 6: Commit carousel integration**

```bash
git add AI/index.html test-lumen-hero.mjs test-lumen-hero-playwright.mjs
git commit -m "feat: integrate Lumen with hero videos"
```

### Task 7: Validate Visual Fidelity, Performance, and Failure Modes

**Files:**
- Modify: `AI/js/lumen-hero-policy.js` only if measured thresholds need correction
- Modify: `AI/js/lumen-scene.js` only if profiling exposes a rendering issue
- Modify: `src/site.css` only if responsive composition/contrast needs correction
- Modify: `AI/assets/lumen/*` only through the asset pipeline
- Modify: `docs/assets/lumen-hero-provenance.md` if generated outputs change
- Modify: `test-lumen-hero-playwright.mjs`

**Interfaces:**
- Consumes all prior interfaces; produces no new runtime API.

- [ ] **Step 1: Capture deterministic poster snapshots**

Run the Playwright test with webdriver enabled at 1440x900, 768x1024, and 390x844. Save screenshots under the existing ignored `tools/snapshots/after/` directory. Verify Terra is upper-right, copy is lower-left, Luna remains visible, controls do not collide with nav, and no text clips.

- [ ] **Step 2: Exercise fallback matrices**

Add and run Playwright cases for:

- reduced motion
- Save-Data
- WebGL probe failure
- dynamic scene import failure
- fallback video autoplay rejection
- video error
- `webglcontextlost`
- tab visibility changes
- rapid dot navigation during the intro
- orientation/viewport resize after completion

Each case must end in a readable held poster or an intentionally paused active experience, never an empty black card.

- [ ] **Step 3: Profile the real-time path**

Use a non-webdriver browser session and browser performance tools. Record desktop and mobile-tier warm-up FPS, active FPS, texture bytes, total transferred bytes, and GPU memory estimate in a verification section of `docs/assets/lumen-hero-provenance.md`.

Acceptance criteria:

- poster paints before Three.js/textures finish
- eligible real-time path stays at or above 30 FPS through the journey
- DPR never exceeds 1.5
- switching slides stops requestAnimationFrame work
- fallback users do not download Three.js textures
- real-time users do not download fallback video before a failure

- [ ] **Step 4: Perform visual realism review**

Inspect Solar, Terra, Luna, and final held frames on desktop and mobile. Reject the build if any of these are true: flat CSS-like spheres, mismatched Earth/Moon light direction, opaque cloud shell, inverted lunar relief, obvious texture seams, orbit lines, fantasy star streaks, excessive bloom, unreadable copy, or a final composition materially different from the fallback poster.

- [ ] **Step 5: Run final verification**

Run:

```bash
node test-lumen-hero.mjs
node test-lumen-hero-playwright.mjs
node test-ai-home-theme.mjs
node test-ai-home-bdh.mjs
node test-z-index.mjs
git diff --check
```

Expected: every command exits 0 with no whitespace errors.

- [ ] **Step 6: Review the final diff and commit validation fixes**

Run: `git status --short` and `git diff -- AI/index.html AI/js/lumen-hero-policy.js AI/js/lumen-scene.js AI/js/lumen-hero.js src/site.css test-lumen-hero.mjs test-lumen-hero-playwright.mjs docs/assets/lumen-hero-provenance.md`.

Stage only Lumen-related files, then commit:

```bash
git add AI/index.html AI/js/lumen-hero-policy.js AI/js/lumen-scene.js AI/js/lumen-hero.js AI/assets/lumen AI/vendor src/site.css tools/lumen-assets.json tools/lumen-assets.mjs docs/assets/lumen-hero-provenance.md test-lumen-hero.mjs test-lumen-hero-playwright.mjs package.json package-lock.json
git commit -m "test: verify Lumen hero experience"
```
