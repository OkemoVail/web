# Liquid Glass Material Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated interactive lab whose fixed-track liquid-glass toolbar matches the approved 01:39-01:47 video reference without changing the production flat design system.

**Architecture:** A pure UMD physics module computes stiff center motion, dynamic four-direction stretch, connections, and release motion. A raw WebGL2 renderer draws image-backed signed-distance glass beneath native DOM buttons, while a small runtime owns input, measurement, quality selection, and one shared animation loop. CSS fallback preserves the exact controls when WebGL2, motion, or shader setup is unavailable.

**Tech Stack:** Vanilla JavaScript, UMD/CommonJS test exports, raw WebGL2/GLSL ES 3.00, HTML, `src/site.css`, Node `assert`, Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-09-27-liquid-glass-material-engine-design.md`

## Global Constraints

- Keep `design-lab.html` as the historical flat-system reference; create `liquid-glass-lab.html` separately.
- Do not change production `.skuo` behavior or adopt the material on production pages.
- Use no React, bundler, Three.js, or new runtime dependency.
- Keep the outer track and DOM layout fixed during interaction. Material centers may move only through bounded 5-8% pointer coupling; DOM content moves less.
- Use native buttons for all interactive controls; the canvas is `aria-hidden` and `pointer-events: none`.
- Resolve every drag frame to exactly one dynamically selected direction: up, down, left, or right. Never combine axes into diagonal translation or stretch.
- Center coupling defaults to 6%, remains adjustable only from 5-8%, and saturates quickly. Directional edge stretch must carry most of the visible response.
- Connections use signed edge distance and form short, broad necks only between the central slab and either end circle.
- Release settles in 180-280ms with negligible overshoot.
- All lab and engine styles initially live under `[data-page="liquid-glass-lab"]` in `src/site.css`.
- Bail to a stable CSS fallback for reduced motion, automation without explicit deterministic opt-in, unavailable WebGL2, or unrecoverable context failure.
- New motion code must guard both `prefers-reduced-motion` and `navigator.webdriver`.
- Do not modify or revert unrelated worktree changes.
- Commit steps in this plan require explicit user authorization at execution time.

## File Map

- Create `src/liquid-glass-physics.js`: pure pressure, connection, spring, quality, and derived-state functions; UMD export to browser and CommonJS.
- Create `src/liquid-glass-renderer.js`: WebGL2 lifecycle, shaders, texture upload, resizing, draw API, adaptive render quality, and context recovery.
- Create `src/liquid-glass.js`: public runtime, group lifecycle, DOM measurement, input, animation scheduling, and diagnostics.
- Create `liquid-glass-lab.html`: exact reference composition, native controls, diagnostics, and local script wiring.
- Create `assets/liquid-glass-track.svg`: local authored image texture used by the fixed track and WebGL sampler.
- Modify `src/site.css`: add only the page-scoped liquid-glass lab layout, fallback material, content, diagnostic, and responsive rules.
- Create `test-liquid-glass-physics.mjs`: dependency-free numerical solver contracts.
- Create `test-liquid-glass.mjs`: static source, semantics, and public API contracts.
- Create `test-liquid-glass-playwright.mjs`: browser interaction, fallback, context-loss, responsive, and deterministic visual-state contracts.
- Create `tools/liquid-glass-reference-frames.mjs`: optional local extraction helper for the user-owned reference video; outputs only to the approved temp directory.
- Modify `CLAUDE.md`: record the new lab, modules, commands, constraints, and rollout boundary after implementation passes.

---

### Task 1: Pure Pressure And Release Solver

**Files:**
- Create: `src/liquid-glass-physics.js`
- Create: `test-liquid-glass-physics.mjs`

**Interfaces:**
- Consumes: plain numeric configuration and state; no DOM or WebGL.
- Produces: `LiquidGlassPhysics.DEFAULTS`, `resolveDirection(dx, dy, previousDirection, hysteresis)`, `rubberBand(displacement, coupling, limit)`, `connectionStrength(edgeDistance, outerRadius, innerRadius)`, `deriveMaterialState(input, geometry, config)`, `stepSpring(state, target, dt, config)`, `isSettled(state, epsilon)`, and `chooseQuality(capabilities)`.

- [ ] **Step 1: Write failing bounded-pressure and connection tests**

```js
import assert from 'node:assert/strict';
import Physics from './src/liquid-glass-physics.js';

assert.equal(Physics.rubberBand(0, 0.15, 36), 0);
assert.ok(Physics.rubberBand(100, 0.15, 36) < 15);
assert.ok(Physics.rubberBand(10000, 0.15, 36) <= 36);
assert.equal(Physics.connectionStrength(21, 20, 8), 0);
assert.equal(Physics.connectionStrength(8, 20, 8), 1);
assert.ok(Physics.connectionStrength(14, 20, 8) > 0);
assert.ok(Physics.connectionStrength(14, 20, 8) < 1);
```

- [ ] **Step 2: Run the test and confirm the module is missing**

Run: `node test-liquid-glass-physics.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/liquid-glass-physics.js`.

- [ ] **Step 3: Implement the UMD shell and pure pressure functions**

```js
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LiquidGlassPhysics = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var DEFAULTS = Object.freeze({
    centerCoupling: 0.06,
    centerLimit: 14,
    stretchLimit: 40,
    axisHysteresis: 6,
    connectionOuter: 20,
    connectionInner: 8,
    springFrequency: 18,
    springDamping: 1,
    maxDelta: 1 / 30,
  });
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function smoothstep(min, max, value) {
    var t = clamp((value - min) / (max - min), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function rubberBand(displacement, coupling, limit) {
    var sign = displacement < 0 ? -1 : 1;
    return sign * limit * (1 - Math.exp(-Math.abs(displacement) * coupling / limit));
  }
  function connectionStrength(edgeDistance, outerRadius, innerRadius) {
    return 1 - smoothstep(innerRadius, outerRadius, edgeDistance);
  }
  return { DEFAULTS: DEFAULTS, rubberBand: rubberBand, connectionStrength: connectionStrength };
});
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `node test-liquid-glass-physics.mjs`

Expected: PASS through the current assertions.

- [ ] **Step 5: Add failing cardinal-direction, derived-state, and spring-convergence tests**

Append tests proving:

```js
var geometry = { trackHalfWidth: 180, slabHalfWidth: 112, circleRadius: 42, circleCenters: [-150, 150] };
var derived = Physics.deriveMaterialState(
  { activeCenter: 0, pointerDx: 600, pointerDy: 200, velocityX: 0, velocityY: 0 },
  geometry,
  Physics.DEFAULTS,
);
assert.equal(derived.stretchDirection, 'right');
assert.ok(Math.abs(derived.centerOffsetX) <= Physics.DEFAULTS.centerLimit);
assert.equal(derived.centerOffsetY, 0);
assert.ok(derived.stretchAmount > Math.abs(derived.centerOffsetX));

assert.equal(Physics.resolveDirection(80, 20, 'right', 6), 'right');
assert.equal(Physics.resolveDirection(20, 80, 'right', 6), 'down');
assert.equal(Physics.resolveDirection(-90, 20, 'down', 6), 'left');
assert.equal(Physics.resolveDirection(20, -90, 'left', 6), 'up');

var diagonal = Physics.deriveMaterialState(
  { activeCenter: 0, pointerDx: 120, pointerDy: 100, velocityX: 0, velocityY: 0 },
  geometry,
  Physics.DEFAULTS,
);
assert.equal(diagonal.stretchDirection, 'right');
assert.equal(diagonal.centerOffsetY, 0);

var state = { x: 36, velocity: 0 };
var elapsed = 0;
var maxCrossing = 0;
while (elapsed < 0.5 && !Physics.isSettled(state, 0.05)) {
  state = Physics.stepSpring(state, 0, 1 / 60, Physics.DEFAULTS);
  elapsed += 1 / 60;
  if (state.x < 0) maxCrossing = Math.max(maxCrossing, Math.abs(state.x));
}
assert.ok(elapsed >= 0.18 && elapsed <= 0.28, `settled in ${elapsed}s`);
assert.ok(maxCrossing < 0.5, `overshoot ${maxCrossing}px`);
```

- [ ] **Step 6: Run and confirm missing functions fail for the expected reason**

Run: `node test-liquid-glass-physics.mjs`

Expected: FAIL because `resolveDirection`, `deriveMaterialState`, `stepSpring`, and `isSettled` are not functions.

- [ ] **Step 7: Implement derived state, clamped delta integration, and deterministic quality selection**

Implement the named exports without browser globals. `resolveDirection` must choose one cardinal direction from the dominant signed axis, preserve the previous direction only inside the crossover hysteresis, and permit dynamic switching during one drag. `deriveMaterialState` must zero the perpendicular center component, derive bounded 5-8% center motion separately from the larger directional edge stretch, and derive left/right edge distances from normalized geometry. `stepSpring` clamps `dt` to `DEFAULTS.maxDelta`. `chooseQuality({ webgl2, reducedMotion, automated, deterministic, touch })` returns `fallback`, `medium`, or `high` according to the spec.

- [ ] **Step 8: Run all solver contracts**

Run: `node test-liquid-glass-physics.mjs`

Expected: PASS and print `liquid glass physics contracts passed`.

- [ ] **Step 9: Commit the solver slice if authorized**

```bash
git add src/liquid-glass-physics.js test-liquid-glass-physics.mjs
git commit -m "feat: add liquid glass physics solver"
```

---

### Task 2: WebGL2 Renderer Foundation

**Files:**
- Create: `src/liquid-glass-renderer.js`
- Create: `test-liquid-glass.mjs`
- Create: `assets/liquid-glass-track.svg`

**Interfaces:**
- Consumes: `canvas`, image URL, quality level, normalized geometry, and material state from Task 1.
- Produces: `LiquidGlassRenderer.create(canvas, options)`, returning `{ ready, resize(rect, dpr), setQuality(level), draw(frame), destroy(), getDiagnostics() }`.

- [ ] **Step 1: Write failing renderer source and asset contracts**

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

assert.ok(existsSync(new URL('./assets/liquid-glass-track.svg', import.meta.url)));
const renderer = readFileSync(new URL('./src/liquid-glass-renderer.js', import.meta.url), 'utf8');
assert.match(renderer, /getContext\(['"]webgl2/);
assert.match(renderer, /#version 300 es/);
assert.match(renderer, /sdRoundRect/);
assert.match(renderer, /sdCircle/);
assert.match(renderer, /webglcontextlost/);
assert.match(renderer, /webglcontextrestored/);
assert.match(renderer, /pointerEvents\s*=\s*['"]none/);
```

- [ ] **Step 2: Run and confirm missing files fail**

Run: `node test-liquid-glass.mjs`

Expected: FAIL on the missing track asset.

- [ ] **Step 3: Create the authored track texture**

Create a local SVG with a 1200x360 viewBox, clipped rounded frame, photographic-style geometric color blocks, and no external image references. Use muted blue, warm tan, rose, near-black, and green areas so blur and refraction remain visible. Keep all content decorative and license-free because it is authored in-repo.

- [ ] **Step 4: Implement renderer creation and a rest-state SDF pass**

The renderer must:

- request WebGL2 with `{ alpha: true, antialias: true, premultipliedAlpha: true }`;
- compile one full-screen-triangle vertex shader and one fragment shader;
- implement `sdRoundRect` and `sdCircle` in GLSL;
- upload the authored SVG to a texture only after `image.decode()` succeeds;
- render the slab and two circles in normalized track coordinates;
- cap effective DPR by quality (`2`, `1.5`, `1`);
- set `canvas.ariaHidden = 'true'` and `canvas.style.pointerEvents = 'none'`;
- return `{ ready: false, reason }` rather than throwing when setup fails.

- [ ] **Step 5: Run static contracts**

Run: `node test-liquid-glass.mjs`

Expected: PASS through renderer and asset assertions.

- [ ] **Step 6: Add failing lifecycle contract assertions**

Add VM or source-level contracts requiring `deleteTexture`, `deleteProgram`, `deleteBuffer`, one restoration attempt, and diagnostics containing `mode`, `quality`, `effectiveDpr`, `frameMs`, and `resourceCount`.

- [ ] **Step 7: Implement complete renderer lifecycle**

Use explicit cleanup for every created WebGL resource. On context loss, call `event.preventDefault()`, invoke `options.onFallback('context-lost')`, and pause drawing. On the first restoration, recreate resources and texture; on another setup failure, remain in fallback.

- [ ] **Step 8: Re-run renderer contracts**

Run: `node test-liquid-glass.mjs`

Expected: PASS and no warnings.

- [ ] **Step 9: Commit the renderer foundation if authorized**

```bash
git add assets/liquid-glass-track.svg src/liquid-glass-renderer.js test-liquid-glass.mjs
git commit -m "feat: add liquid glass WebGL renderer"
```

---

### Task 3: Runtime, Public API, And Native Input

**Files:**
- Create: `src/liquid-glass.js`
- Modify: `test-liquid-glass.mjs`

**Interfaces:**
- Consumes: `window.LiquidGlassPhysics`, `window.LiquidGlassRenderer`, and a root containing the declarative data roles.
- Produces: `window.LiquidGlass.create(root, options)` and instance methods `destroy()`, `refresh()`, `setQuality(level)`, `getDiagnostics()`.

- [ ] **Step 1: Add failing public API and lifecycle source contracts**

Require exact selectors and methods:

```js
const runtime = readFileSync(new URL('./src/liquid-glass.js', import.meta.url), 'utf8');
assert.match(runtime, /LiquidGlass\s*=.*create/s);
for (const name of ['destroy', 'refresh', 'setQuality', 'getDiagnostics']) {
  assert.match(runtime, new RegExp(`${name}\\s*:`));
}
for (const role of ['data-liquid-track', 'data-liquid-shape', 'data-liquid-controls']) {
  assert.match(runtime, new RegExp(role));
}
assert.match(runtime, /ResizeObserver/);
assert.match(runtime, /setPointerCapture/);
assert.match(runtime, /prefers-reduced-motion/);
assert.match(runtime, /navigator\.webdriver/);
```

- [ ] **Step 2: Run and confirm the runtime is missing**

Run: `node test-liquid-glass.mjs`

Expected: FAIL reading `src/liquid-glass.js`.

- [ ] **Step 3: Implement group creation, validation, and measurement**

`create(root, options)` must validate exactly one track, one central slab, two end circles, and at least one native button. It creates and prepends the canvas, measures all roles during `refresh()`, converts rectangles into track-local normalized geometry, and passes only plain objects to the renderer.

- [ ] **Step 4: Implement input and single-loop scheduling**

Pointer handlers store coordinates and timestamps only. The animation frame consumes input, dynamically resolves the current dominant cardinal direction, calls Task 1 functions, sends one frame object to the renderer, applies content CSS variables at no more than half the material-center offset, and sleeps when `isSettled` is true. A 3-6px intent threshold distinguishes click from drag. Lost capture and cancellation enter the same release path.

- [ ] **Step 5: Implement keyboard pulse and teardown**

Listen for native `keydown`/`keyup` on central buttons. `Enter` and `Space` set a centered pressure target but do not prevent the native click. `destroy()` removes listeners, disconnects `ResizeObserver`, destroys the renderer, removes the canvas, clears content variables, and unregisters the group from the shared loop.

- [ ] **Step 6: Run source contracts**

Run: `node test-liquid-glass.mjs`

Expected: PASS through runtime contracts.

- [ ] **Step 7: Commit the runtime slice if authorized**

```bash
git add src/liquid-glass.js test-liquid-glass.mjs
git commit -m "feat: add liquid glass runtime"
```

---

### Task 4: Exact Reference Lab Composition

**Files:**
- Create: `liquid-glass-lab.html`
- Modify: `src/site.css`
- Modify: `test-liquid-glass.mjs`

**Interfaces:**
- Consumes: Task 2 and 3 browser globals in script order: physics, renderer, runtime.
- Produces: one initialized `[data-liquid-group]`, diagnostic form inputs, accessible controls, and visible fallback markup.

- [ ] **Step 1: Add failing markup and style contracts**

Assert:

```js
const html = readFileSync(new URL('./liquid-glass-lab.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');
assert.match(html, /<body[^>]+data-page="liquid-glass-lab"/);
assert.equal((html.match(/data-liquid-shape="circle"/g) || []).length, 2);
assert.equal((html.match(/data-liquid-control/g) || []).length, 3);
assert.match(html, /assets\/liquid-glass-track\.svg/);
assert.match(html, /src\/liquid-glass-physics\.js[\s\S]*src\/liquid-glass-renderer\.js[\s\S]*src\/liquid-glass\.js/);
assert.match(css, /\[data-page="liquid-glass-lab"\]/);
```

- [ ] **Step 2: Run and confirm the lab page is missing**

Run: `node test-liquid-glass.mjs`

Expected: FAIL reading `liquid-glass-lab.html`.

- [ ] **Step 3: Build semantic reference markup**

Use one fixed track with:

- left `button[data-liquid-shape="circle"]` with an accessible name;
- central `[data-liquid-shape="slab"][data-liquid-controls]` containing exactly three native buttons;
- right circular native button;
- one `canvas` created by the runtime rather than authored in markup;
- diagnostics in a `<form>` with labels for center coupling, center limit, directional stretch, perpendicular compression, axis-switch hysteresis, connection radius, blend softness, spring frequency, damping, blur, magnification, refraction, chromatic split, rim, cloud, ambient colors, and quality;
- output elements for phase, pressure, velocity, connection strengths, frame time, quality, and DPR;
- reset button restoring the baseline.

- [ ] **Step 4: Add page-scoped responsive and fallback CSS**

Append a clearly labeled page section to `src/site.css`. Use semantic z-index tokens for page-level fixed layers. The track remains fixed and rounded; central labels stay above the canvas; fallback glass uses a translucent solid, border, and `backdrop-filter` without a goo filter. At `<=768px`, scale the track to fit width without reducing any target below 44px.

- [ ] **Step 5: Wire diagnostics to `create()` options**

Initialize once after scripts load, passing one mutable `materialConfig` object in the creation options. Input events update that object's named numeric properties and call `instance.refresh()`; reset copies a frozen baseline object's values back into `materialConfig`. Do not recreate the runtime on every slider input.

- [ ] **Step 6: Run markup contracts and the global stacking regression**

Run: `node test-liquid-glass.mjs`

Expected: PASS.

Run: `node test-z-index.mjs`

Expected: PASS with all existing shared layer contracts unchanged.

- [ ] **Step 7: Commit the lab composition if authorized**

```bash
git add liquid-glass-lab.html src/site.css test-liquid-glass.mjs
git commit -m "feat: add liquid glass reference lab"
```

---

### Task 5: Full Material Shader And Deterministic States

**Files:**
- Modify: `src/liquid-glass-renderer.js`
- Modify: `src/liquid-glass.js`
- Modify: `liquid-glass-lab.html`
- Modify: `test-liquid-glass.mjs`

**Interfaces:**
- Consumes: frame objects `{ geometry, material, optics, ambient, time }` and lab diagnostic values.
- Produces: reference-like blurred/refraction material plus `instance.setDebugState(name)` and `instance.stepDebugFrame(dt)` only when `options.deterministic === true`.

- [ ] **Step 1: Add failing shader-feature contracts**

Require shader uniforms and operations for `uPressure`, `uConnection`, `uBlur`, `uMagnification`, `uRefraction`, `uChromatic`, `uRim`, `uCloud`, `uAmbientTop`, `uAmbientBottom`, and a smooth-min helper. Require deterministic state names `rest`, `left-pressure`, `center-pressure`, `right-pressure`, `left-connected`, `right-connected`, and `release`.

- [ ] **Step 2: Run and confirm missing shader features fail**

Run: `node test-liquid-glass.mjs`

Expected: FAIL on the first missing material uniform.

- [ ] **Step 3: Implement SDF deformation and connection**

In the fragment shader:

- bias the slab SDF with one directional stretch field centered on the stiffly moving active center;
- move only the facing edge along the selected cardinal axis, keep the opposite edge comparatively stable, and apply mild perpendicular compression;
- reject diagonal deformation by consuming the solver's single direction and scalar stretch amount;
- evaluate visible edge distance to each circle;
- use polynomial smooth-min only when its corresponding connection strength is nonzero;
- cap the blend so the neck length remains shorter than its width;
- keep circle centers and outer track coordinates immutable.

- [ ] **Step 4: Implement optical sampling**

Sample the authored texture through track-local UVs. Use quality-dependent symmetric blur taps, inward SDF-gradient magnification, pressure/velocity refraction, RGB separation only at high/medium quality, asymmetric rim light, and a pressure-centered cloudy highlight. All uniforms come from the same frame state.

- [ ] **Step 5: Add content counter-motion and deterministic debug states**

The runtime applies `--liquid-content-x`, `--liquid-content-y`, and `--liquid-content-scale-y` to the active DOM content. Translation is capped at half the material-center offset to preserve the very stiff button feel and legibility. A low-opacity chromatic ghost is visible only above low quality. `setDebugState(name)` bypasses live input only for deterministic test instances; `stepDebugFrame(dt)` advances that fixed state without requesting a live animation frame. The lab assigns its instance to `window.liquidGlassLab` only when `?liquid-test=1` is present.

- [ ] **Step 6: Run shader and API contracts**

Run: `node test-liquid-glass.mjs`

Expected: PASS and no undeclared deterministic API in normal mode.

- [ ] **Step 7: Commit the material slice if authorized**

```bash
git add src/liquid-glass-renderer.js src/liquid-glass.js liquid-glass-lab.html test-liquid-glass.mjs
git commit -m "feat: render connected liquid glass material"
```

---

### Task 6: Browser Semantics, Fallback, And Adaptive Quality

**Files:**
- Create: `test-liquid-glass-playwright.mjs`
- Modify: `src/liquid-glass.js`
- Modify: `src/liquid-glass-renderer.js`
- Modify: `src/site.css`

**Interfaces:**
- Consumes: the completed lab and public runtime.
- Produces: verified mouse/touch/keyboard behavior, reduced-motion fallback, context recovery, and deterministic quality downgrade.

- [ ] **Step 1: Write the failing Playwright harness**

Follow the local static-server pattern in `test-word-focus.mjs`. Test desktop `1440x900`, tablet `768x900`, and mobile `390x844`. Capture page and console errors. Assert five native named buttons, one `canvas[aria-hidden="true"]`, `pointer-events: none`, no horizontal overflow, and initial diagnostics.

- [ ] **Step 2: Run and confirm the first browser behavior failure**

Run: `node test-liquid-glass-playwright.mjs`

Expected: FAIL on missing browser-exposed deterministic diagnostics or semantics, not on server setup.

- [ ] **Step 3: Add pointer and click discrimination tests**

Use Playwright mouse events to verify:

- a 2px movement still fires one native click;
- a 20px drag changes phase to `track` and suppresses activation;
- the outer track and DOM control bounding boxes remain unchanged within 0.5px even though the rendered material center moves;
- pointer paths that change from horizontal-dominant to vertical-dominant switch the reported direction during the same drag;
- diagonal pointer paths report exactly one cardinal direction and zero perpendicular center offset;
- directional stretch remains greater than center translation, while content translation remains no more than half the center translation;
- release reaches `rest` using deterministic frame stepping;
- left and right debug states report connection strength greater than `0.8`.

- [ ] **Step 4: Add keyboard and touch tests**

Verify `Enter` and `Space` activate the focused central button once, briefly enter `press`, and return to `rest`. Use touchscreen context on mobile and assert the same cardinal-direction, center-coupling, and stretch bounds.

- [ ] **Step 5: Add fallback and context tests**

Create separate browser contexts:

- reduced motion: assert fallback mode, no animated canvas connection, controls usable;
- WebGL2 stubbed unavailable before page load: assert CSS fallback and zero page errors;
- `WEBGL_lose_context`: lose then restore once, assert recovery; lose and fail setup again, assert persistent fallback.

- [ ] **Step 6: Add quality downgrade tests**

In deterministic mode, inject 60 frame durations above 20ms and assert one-level downgrade. Inject another 60 before the 10-second cooldown and assert no second downgrade. Advance past cooldown, inject again, and assert the next downgrade. Assert quality never rises automatically.

- [ ] **Step 7: Implement the minimum runtime changes to pass each browser contract**

Keep pointer handlers free of layout reads. Store press origin, drag intent, and pending click suppression explicitly. Add a rolling 60-frame mean and cooldown timestamp. Ensure reduced motion and automation select fallback unless `?liquid-test=1` explicitly enables deterministic stepping.

- [ ] **Step 8: Run all focused verification**

Run: `node test-liquid-glass-physics.mjs`

Expected: PASS.

Run: `node test-liquid-glass.mjs`

Expected: PASS.

Run: `node test-liquid-glass-playwright.mjs`

Expected: PASS across all three viewports and fallback contexts with no page or console errors.

- [ ] **Step 9: Commit browser hardening if authorized**

```bash
git add test-liquid-glass-playwright.mjs src/liquid-glass.js src/liquid-glass-renderer.js src/site.css
git commit -m "test: harden liquid glass interactions"
```

---

### Task 7: Reference Extraction, Visual Baselines, And Documentation

**Files:**
- Create: `tools/liquid-glass-reference-frames.mjs`
- Modify: `test-liquid-glass-playwright.mjs`
- Modify: `CLAUDE.md`
- Modify: `docs/research/liquid-glass-reference-video-analysis.md`

**Interfaces:**
- Consumes: optional `LIQUID_GLASS_REFERENCE_VIDEO` environment variable and deterministic lab states.
- Produces: temp-only reference frames, deterministic screenshot artifacts under ignored `tools/snapshots/after/`, and current repository documentation.

- [ ] **Step 1: Write failing extraction helper contracts**

Add source assertions that the tool:

- requires `LIQUID_GLASS_REFERENCE_VIDEO` rather than hard-coding a user path;
- uses timestamps `99` through `107` seconds;
- invokes `ffprobe` before `ffmpeg`;
- writes under `C:\Users\okemo\AppData\Local\Temp\opencode\liquid-glass-reference`;
- never writes extracted copyrighted frames into the repository.

- [ ] **Step 2: Run and confirm the helper is missing**

Run: `node test-liquid-glass.mjs`

Expected: FAIL reading `tools/liquid-glass-reference-frames.mjs`.

- [ ] **Step 3: Implement safe local frame extraction**

Use `execFile` with argument arrays, verify the input file and temp parent, probe duration before extraction, then generate an 8fps contact sheet plus selected one-second detail sheets. Return paths as JSON. If the environment variable or ffmpeg is absent, print a concise skip message and exit zero because reference extraction is an optional local review aid.

- [ ] **Step 4: Add deterministic visual captures**

In the Playwright test, set `?liquid-test=1`, call debug states, and capture:

```js
for (const state of ['rest', 'left-pressure', 'center-pressure', 'right-pressure', 'left-connected', 'right-connected', 'release']) {
  await page.evaluate((name) => window.liquidGlassLab.setDebugState(name), state);
  await page.evaluate(() => window.liquidGlassLab.stepDebugFrame(1 / 60));
  await page.locator('[data-liquid-group]').screenshot({ path: `tools/snapshots/after/liquid-${state}.png` });
}
```

Assert fixed track dimensions, short/wide connection diagnostics, readable content opacity, and no one-frame blank material during separation. Do not commit generated screenshots because the directory is ignored.

- [ ] **Step 5: Update project documentation**

Add a concise `CLAUDE.md` section documenting:

- `liquid-glass-lab.html` as an isolated experimental lab;
- the three module responsibilities and script order;
- the exact test commands;
- the fixed-track and native-DOM invariants;
- the WebGL background-source limitation;
- the rule that production adoption requires a separate approved cycle.

Update the research note with the final tuned baseline values and links to the spec and plan; do not claim pixel equivalence to the reference.

- [ ] **Step 6: Run complete regression verification**

Run: `node test-liquid-glass-physics.mjs`

Run: `node test-liquid-glass.mjs`

Run: `node test-liquid-glass-playwright.mjs`

Run: `node test-z-index.mjs`

Run: `node test-astra.mjs`

Expected: every command exits zero. The liquid browser harness reports no page/console errors, and existing shared-system tests remain unchanged.

- [ ] **Step 7: Inspect final worktree scope**

Run: `git status --short`

Run: `git diff --check`

Run: `git diff -- liquid-glass-lab.html src/liquid-glass-physics.js src/liquid-glass-renderer.js src/liquid-glass.js src/site.css assets/liquid-glass-track.svg test-liquid-glass-physics.mjs test-liquid-glass.mjs test-liquid-glass-playwright.mjs tools/liquid-glass-reference-frames.mjs CLAUDE.md docs/research/liquid-glass-reference-video-analysis.md`

Expected: only intended liquid-glass files and page-scoped CSS are included; unrelated existing changes remain untouched; no whitespace errors.

- [ ] **Step 8: Commit the verified lab if authorized**

```bash
git add liquid-glass-lab.html src/liquid-glass-physics.js src/liquid-glass-renderer.js src/liquid-glass.js src/site.css assets/liquid-glass-track.svg test-liquid-glass-physics.mjs test-liquid-glass.mjs test-liquid-glass-playwright.mjs tools/liquid-glass-reference-frames.mjs CLAUDE.md docs/research/liquid-glass-reference-video-analysis.md docs/superpowers/specs/2026-09-27-liquid-glass-material-engine-design.md docs/superpowers/plans/2026-09-27-liquid-glass-material-engine.md
git commit -m "feat: add liquid glass material lab"
```
