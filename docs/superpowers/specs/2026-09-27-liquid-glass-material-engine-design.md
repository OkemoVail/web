# Liquid Glass Material Engine - Design Specification

**Date:** 2026-09-27
**Status:** Approved design, pre-plan
**Initial surface:** Dedicated interactive design lab
**Primary reference:** `C:\Users\okemo\Downloads\41958509335-1-192.mp4`, 01:39-01:47

## 1. Purpose

Build a custom browser material and motion engine that reproduces the constrained liquid-glass toolbar shown in the primary reference. The first implementation is an interactive design lab used to tune and validate the material before any production page adopts it.

The target is not a draggable toolbar, a long elastic tendril, or a collection of independently translating glass cards. It is a fixed image-backed track containing separate glass surfaces whose centers move very stiffly while their facing edges stretch locally in exactly one of four cardinal directions. Neighboring surfaces form short optical connections when they approach.

The existing site-wide flat design system remains production behavior during this phase. `design-lab.html` remains the historical flat-system reference. The liquid-glass study gets a new page and isolated runtime.

## 2. Reference-Derived Behavior

The source clip establishes these invariants:

- The rounded photographic outer track is fixed.
- A translucent central slab contains three button subdivisions.
- Separate circular controls sit at the left and right ends.
- The active region's center follows only 5-8% of pointer travel.
- Most pointer travel becomes local edge stretch rather than center translation.
- Stretch uses one dynamically selected dominant direction: up, down, left, or right, never a diagonal combination.
- Neighboring shapes connect only at short range through broad, feathered overlap.
- Icons and labels remain substantially rigid and readable.
- Blur, refraction, cloudy highlights, rim lighting, and geometry respond as one material state.
- Release has a fast initial recovery and a soft settling tail with negligible overshoot.

Detailed observations are recorded in `docs/research/liquid-glass-reference-video-analysis.md`.

## 3. Goals

- Match the reference toolbar's rest, active, connected, and release states.
- Implement the material using a dependency-free raw WebGL2 renderer.
- Keep controls semantic, accessible, and interactive through native DOM elements.
- Keep button and label movement substantially stiffer than the liquid silhouette.
- Drive all visual properties from one deterministic interaction state.
- Support mouse, pen, touch, and keyboard activation.
- Provide a stable non-WebGL fallback.
- Expose a small engine API that can support production component adapters later.
- Keep the lab responsive on mid-tier mobile hardware.

## 4. Non-Goals

- Replacing the site's shipped `.skuo` design system in this phase.
- Automatically enhancing every button, link, field, menu, or panel.
- Connecting unrelated controls across the page.
- Capturing arbitrary live DOM pixels into WebGL.
- Moving the toolbar or its outer track.
- Drawing long-distance tendrils.
- Reproducing the editorial camera movement or surrounding showcase UI from the source video.
- Adding React, a bundler, Three.js, or another runtime dependency.

## 5. Initial Lab Composition

The lab contains one reference toolbar:

1. A fixed rounded track with authored image content.
2. A left circular glass control.
3. A central rounded glass slab divided into three semantic buttons.
4. A right circular glass control.
5. Top and bottom ambient light strips.
6. A diagnostics panel for material and physics tuning.

The DOM defines controls and accessible content. A transparent WebGL canvas sits beneath their labels and renders the glass material. The canvas is clipped to the lab's intended visual region and does not intercept input.

## 6. Architecture

### 6.1 Runtime Modules

`src/liquid-glass.js` owns:

- group registration and destruction;
- DOM measurement;
- pointer, touch, pen, and keyboard input;
- interaction state and pressure-field targeting;
- spring integration;
- resize and visibility handling;
- reduced-motion and capability selection;
- the single `requestAnimationFrame` loop;
- synchronization of DOM content counter-motion.

`src/liquid-glass-renderer.js` owns:

- WebGL2 context creation;
- shader compilation and error reporting;
- canvas and device-pixel-ratio sizing;
- signed-distance shape data;
- material uniforms and drawing;
- background texture lifecycle;
- context loss and restoration;
- adaptive quality settings.

`liquid-glass-lab.html` owns:

- the reference toolbar markup;
- authored background imagery;
- diagnostic controls and status readouts;
- fallback markup;
- lab-only explanatory copy.

All initial styles, including engine structure, live in the `[data-page="liquid-glass-lab"]` section of `src/site.css`. Moving structural rules into the shared component section is deferred until a production adapter demonstrates that they are reusable.

### 6.2 Public API

The initial runtime exposes one global because this repository uses plain scripts:

```js
window.LiquidGlass.create(root, options)
```

It returns an instance with:

```js
instance.destroy()
instance.refresh()
instance.setQuality(level)
instance.getDiagnostics()
```

The root contains declarative roles:

```html
<div data-liquid-group>
  <div data-liquid-track></div>
  <button data-liquid-shape="circle"></button>
  <div data-liquid-shape="slab">...</div>
  <button data-liquid-shape="circle"></button>
</div>
```

The renderer receives normalized geometry from the runtime. It does not query or mutate the DOM directly.

## 7. State Model

Each group uses one explicit state:

```js
{
  phase: 'rest' | 'press' | 'track' | 'release' | 'fallback',
  pointerType,
  activeControl,
  pointerX,
  pointerY,
  centerOffsetX,
  centerOffsetY,
  stretchDirection,
  stretchAmount,
  velocityX,
  velocityY,
  compression,
  expansion,
  leftConnection,
  rightConnection,
  quality
}
```

There is no independent CSS animation state. Every frame derives shape geometry, optical uniforms, and content offsets from this object. This prevents highlights or refraction from lagging behind geometry.

State transitions:

- `rest -> press` on pointer down or keyboard activation;
- `press -> track` after movement exceeds a small intent threshold;
- `press -> release` on pointer up without a drag;
- `track -> release` on pointer up or cancellation;
- `release -> rest` once position and velocity enter the convergence epsilon;
- any phase -> `fallback` after unrecoverable context failure.

## 8. Interaction Solver

### 8.1 Constrained Pressure

Pointer motion does not directly translate a control. It targets a stiff center offset plus a stronger local stretch field.

- Center coupling defaults to 6% of pointer displacement and remains adjustable from 5-8% in the lab.
- A nonlinear rubber-band curve saturates center movement quickly at the configured limit.
- The solver compares absolute horizontal and vertical displacement every frame and selects exactly one dominant axis and sign: left, right, up, or down.
- Direction is not locked at pointer-down. It switches during the drag when the other axis becomes dominant.
- A small crossover hysteresis prevents rapid direction flicker near equal X/Y displacement without allowing diagonal deformation.
- Only the selected axis receives center offset and stretch; the perpendicular center component returns toward zero.
- Stretch is derived separately from center offset and carries most of the visible response. The facing edge moves while the opposite edge remains comparatively stable.
- The active control determines the field's resting center. Crossing between central buttons moves the field continuously without restarting the animation.

The exact coupling and limit remain tunable in the lab. Initial ranges:

- center coupling: 0.05-0.08;
- center offset limit: 8-18 CSS pixels;
- directional edge stretch: 18-48 CSS pixels;
- perpendicular compression: 0.94-0.99;
- axis-switch hysteresis: 4-10 CSS pixels;
- neighbor attraction: 10-35% of active edge bias;
- drag intent threshold: 3-6 CSS pixels.

### 8.2 Connection Field

Connections are based on signed edge distance, not center distance.

- No connection exists outside the configured radius.
- At the outer threshold, facing edges receive subtle attraction and highlight convergence.
- As distance closes, the SDF blend creates a short, broad neck.
- Connection strength uses a smoothstep curve to avoid visible threshold popping.
- The central slab can connect only to the left or right end circle in the initial lab.
- The neck must remain shorter than its width; a long narrow bridge fails the reference match.

Initial connection range: 8-20 CSS pixels between visible edges. The diagnostics panel exposes this range for tuning.

### 8.3 Release

Release uses a critically damped or slightly underdamped spring integrated by the shared frame loop.

- Fast initial recovery.
- Total visible settling: 180-280ms.
- Negligible overshoot.
- Connection strength decays continuously with recovering edge distance.
- Pointer cancellation and lost capture use the same release path.
- Long background-tab frame gaps are clamped so the solver cannot explode.

### 8.4 Keyboard

Keyboard activation preserves normal button semantics and creates a brief centered pressure pulse:

- `Space` and `Enter` use native activation.
- The selected control receives contact compression and highlight response.
- No synthetic horizontal drag is shown.
- The pulse releases through the same spring solver.

## 9. WebGL Material

### 9.1 Geometry

The fragment shader evaluates signed-distance functions for:

- the central rounded rectangle;
- left and right circles;
- local pressure ellipses;
- edge-biased deformation terms.

Smooth minimum operations combine neighboring fields only when connection strength is nonzero. Geometry is passed in CSS-pixel-relative normalized coordinates so resizing does not alter the material proportions.

### 9.2 Background Sampling

WebGL cannot safely or continuously read arbitrary live DOM pixels. The lab therefore uses an explicitly supplied image texture matching the fixed track background.

The shader samples this texture with:

- localized blur;
- slight magnification beneath thicker glass;
- pressure-driven refraction offsets;
- restrained RGB channel separation near high-curvature edges.

Future production adapters must supply an authored image, a known canvas/video source, or accept CSS backdrop blur. Live DOM rasterization is explicitly excluded.

### 9.3 Surface Lighting

The material includes:

- an asymmetric thin rim based on SDF gradient and ambient light direction;
- a cloudy internal highlight centered near the pressure field;
- stronger edge intensity at an imminent or active connection;
- top and bottom ambient colors supplied as uniforms;
- a subtle shadow beneath the material to maintain contrast over varied imagery.

Top and bottom ambient strips use authored color samples derived from the visible page. They do not mirror readable content.

### 9.4 DOM Content

Icons and labels remain native DOM content above the material canvas.

- Active content translates by no more than half of the already stiff material-center offset.
- Compression is capped so glyphs remain legible.
- A low-opacity chromatic ghost follows active content to suggest refraction without replacing readable content; reduced-motion and low-quality modes disable it.
- Focus rings render in the DOM and remain outside shader clipping.
- DOM geometry never changes during deformation, avoiding layout thrash.

## 10. Render Loop And Performance

One frame loop serves every registered group.

Frame order:

1. Consume the latest pointer target and resolve one dominant cardinal direction.
2. Integrate center offset, directional stretch, and release springs with clamped delta time.
3. Derive one-axis geometry and connection strengths.
4. Update WebGL uniforms and draw dirty groups.
5. Apply DOM content transforms.
6. Stop requesting frames once all groups are at rest.

Measurements occur on initialization, explicit `refresh()`, resize, and observed geometry changes. Pointer movement stores input only; it does not perform layout reads.

Adaptive quality levels:

- `high`: full blur taps, chromatic separation, high-DPR canvas up to a cap;
- `medium`: fewer blur taps and reduced DPR;
- `low`: simplified refraction, no chromatic separation, DPR 1;
- `fallback`: CSS material, no canvas deformation.

The runtime starts at `medium` quality on touch devices. It drops one quality level when the rolling average of 60 active frames exceeds 20ms, with a 10-second cooldown between reductions. Quality never increases automatically during the session. Geometry and interaction behavior remain identical across quality levels.

## 11. Accessibility And Input Safety

- Real `button` elements remain focusable and clickable.
- The canvas is `aria-hidden` and has `pointer-events: none`.
- Labels are never rendered only in WebGL.
- Existing click, keyboard, and assistive-technology behavior remains native.
- Drag begins only after the intent threshold; a short press still activates the button.
- Touch targets remain at least 44 by 44 CSS pixels.
- Focus-visible styling remains crisp and independent of material highlights.
- Reduced motion removes continuous tracking deformation and uses a short static pressure/highlight state.
- The engine does not trap focus or suppress browser gestures outside the registered group.

## 12. Fallback And Failure Handling

Capability selection checks WebGL2, required texture limits, shader compilation, reduced motion, and automation.

Fallback behavior:

- Render stable rounded CSS glass surfaces with `backdrop-filter` when available.
- Preserve the same DOM layout and controls.
- Use fill and highlight changes for pointer and keyboard feedback.
- Do not attempt shape connections.

On `webglcontextlost`, prevent the browser's default disposal, pause drawing, and show the CSS fallback. Attempt one restoration through `webglcontextrestored`; if shader or resource setup fails again, remain in fallback for the session.

All runtime failures are contained to the enhanced group. The page remains usable.

## 13. Lab Diagnostics

The lab exposes controls for:

- center coupling and maximum center offset;
- directional stretch, perpendicular compression, and axis-switch hysteresis;
- connection radius and blend softness;
- spring frequency and damping;
- blur, magnification, and refraction strength;
- chromatic separation;
- rim and cloudy-highlight intensity;
- top and bottom ambient colors;
- quality level and effective DPR.

Diagnostics show phase, active control, stretch direction, center offset, stretch amount, velocity, left/right connection strength, frame time, and current quality. A reset action restores the approved baseline values.

## 14. Verification

### 14.1 Unit Contracts

Dependency-free Node tests cover pure solver functions:

- center movement remains strongly sublinear, bounded, and within 5-8% coupling;
- each frame resolves to only up, down, left, right, or rest;
- diagonal input activates only its dominant axis;
- changing axis dominance during a drag switches direction without restarting the interaction;
- crossover hysteresis prevents flicker near equal axis displacement;
- stretch exceeds center movement by the approved ratio;
- connection strength is zero outside the radius;
- connection strength is continuous at both thresholds;
- the release solver converges within 180-280ms at nominal frame cadence;
- release overshoot remains below the approved tolerance;
- large frame deltas are clamped;
- quality selection returns deterministic capabilities.

### 14.2 DOM Contracts

Static and browser tests verify:

- all controls are native buttons with accessible names;
- the canvas is hidden from accessibility APIs and input;
- keyboard activation triggers the pulse without blocking click;
- short pointer presses remain clicks;
- drag intent does not accidentally activate a button;
- fallback selection preserves all controls;
- destruction removes listeners, observers, canvas resources, and loop participation.

### 14.3 Visual Verification

Capture deterministic frames for:

- rest;
- maximum resisted pressure over each central button;
- left connection;
- right connection;
- early release;
- settled rest;
- CSS fallback;
- reduced motion.

Compare these with representative frames extracted from the primary reference. The comparison focuses on silhouette, connection width/length, control stability, highlight placement, and content legibility rather than the source video's editorial camera motion.

Automation receives deterministic state injection and disables time-dependent noise. Interactive motion remains disabled under `navigator.webdriver` unless the test explicitly enables deterministic engine stepping.

### 14.4 Performance Verification

- No layout reads occur in pointer-move handlers.
- The frame loop sleeps at rest.
- No sustained long tasks are introduced.
- Mid-tier mobile testing remains responsive during continuous tracking.
- DPR and blur taps stay within configured caps.
- WebGL resource counts return to baseline after `destroy()`.

## 15. Acceptance Criteria

- The outer track remains fixed during pointer interaction.
- A control's material center moves only 5-8% of pointer displacement and remains bounded.
- Most pointer travel appears as directional edge stretch, not button translation.
- Every active frame deforms in exactly one direction: up, down, left, or right.
- Dominant direction can switch during a drag without diagonal interpolation or an animation restart.
- The central pressure field moves continuously among all three buttons.
- The active region compresses and expands locally without moving the DOM layout.
- Approaching either end creates a short, broad, visually seamless connection.
- Separating connected surfaces produces no visible pop or single-frame gap.
- Release settles in 180-280ms with negligible overshoot.
- Labels and icons remain readable in every state.
- Shape, blur, refraction, rim light, and cloudy highlight remain synchronized.
- The lab remains usable with WebGL disabled, reduced motion enabled, touch input, and keyboard input.
- The renderer and solver expose enough diagnostics to tune the visual match without editing shader constants.

## 16. Rollout Boundary

The initial implementation ends when the dedicated lab matches the approved reference states and passes the verification above. Production adoption is a separate design and implementation cycle.

That later cycle may define adapters for navigation capsules, segmented controls, menus, or contextual toolbars. It must explicitly choose valid connection groups and background sources. The engine must never infer that arbitrary nearby site controls should merge solely because their screen rectangles overlap.
