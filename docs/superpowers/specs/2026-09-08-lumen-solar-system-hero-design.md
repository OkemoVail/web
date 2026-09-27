# Lumen 1.9 Solar-System Hero Design

**Date:** 2026-09-08  
**Status:** Approved design  
**Scope:** `AI/index.html` landing-page hero only

## Summary

Replace the AI landing page's first video slide with an animation-first, hyper-real solar-system journey introducing one model named **Lumen 1.9**. The eight-second sequence travels from the Sun to Earth and the Moon, then settles into an asymmetric "Mission title" composition with Terra in the upper-right and the Lumen identity in the lower-left.

The existing two videos remain available as the second and third carousel slides. The animation does not automatically advance into them. After the reveal, the final frame holds until the visitor deliberately swipes, clicks an arrow, or selects a dot.

Capable devices receive an adaptive Three.js scene using locally hosted, NASA-derived imagery. Lower-end devices receive a matching pre-rendered cinematic fallback, and reduced-motion or automation contexts receive the final poster immediately. This design favors consistent photorealism over degraded real-time graphics.

This work changes the landing-page presentation only. The existing chat model remains Saga unless it is renamed in a separate project.

## Goals

- Make the landing experience animation-first before presenting product videos.
- Introduce one model, **Lumen 1.9**, without suggesting separate Solar, Terra, or Luna products.
- Achieve NASA-cinematic realism with plausible light, materials, atmosphere, and lunar relief.
- Keep the experience smooth and legible on low-end phones and computers.
- Retain the current video carousel, swipe behavior, navigation arrows, dots, and player controls.
- Preserve accessibility, reduced-motion behavior, and deterministic automated testing.

## Non-Goals

- Renaming Saga in chat, settings, backend requests, prompts, or persisted data.
- Building a scientifically proportional solar-system simulator.
- Adding interactive camera controls, planet selection, exploration, or orbital diagrams.
- Streaming textures or scripts from NASA or another runtime CDN.
- Showing fictional planets, exaggerated star streaks, decorative orbit rings, or prominent lens flares.
- Automatically moving visitors from the animation into a video.

## Experience

### Carousel Structure

The hero carousel contains three slides:

1. Lumen 1.9 solar-system journey
2. Existing Labs21 hero video
3. Existing product video with full player controls

The first slide is active on initial load. Arrows, dots, touch scrolling, and scroll-snap continue to select slides. The dot labels describe their destinations: Lumen 1.9, Labs21 video, and Product video.

When the visitor leaves the Lumen slide, its rendering loop pauses. Returning to it restores the held final frame rather than replaying the introduction automatically. Replay is always deliberate.

### Eight-Second Sequence

The camera path is choreographed rather than physically proportional. Distances and apparent sizes are compressed for a readable cinematic composition, while lighting and surface treatment remain plausible.

#### 0.0-2.0 seconds: Solar

- Begin close to a turbulent solar limb rather than centered on a complete graphic sun.
- Use animated or shader-driven surface variation, a restrained corona, and warm light scattering.
- Show the location caption `SOLAR` briefly in semantic HTML.
- Avoid fantasy flares, glow blooms that obscure the limb, and rapid rotation.

#### 2.0-5.0 seconds: Terra

- Move through deep space and ease toward a partially sunlit Earth.
- Render separate Earth surface, cloud, and atmospheric layers.
- Preserve ocean specular response, restrained city-light detail on the night side, and a thin atmospheric rim.
- Show the location caption `TERRA` briefly.
- Motion should read as a camera journey, not a star-field screensaver; stars remain effectively distant and do not streak.

#### 5.0-6.5 seconds: Luna

- Let the Moon cross the foreground with visible crater and normal detail.
- Keep Earth in the scene to establish relative depth.
- Show the location caption `LUNA` briefly.
- Lunar lighting must match the scene's solar direction.

#### 6.5-8.0 seconds: Lumen Reveal

- Pull back and settle into the approved Mission title composition.
- Terra occupies the upper-right and may crop beyond the frame.
- Luna appears smaller and deeper in the composition.
- The lower-left HTML copy resolves in this order: small maker/model label, `Lumen 1.9`, one short supporting sentence, and the `Start here` button.
- The final copy must remain concise enough to preserve the cinematic frame. Final wording can be tuned during implementation without changing the information hierarchy.

#### Held State

- After eight seconds, the camera stops traveling.
- Earth rotation and cloud motion continue at an almost imperceptible rate on the WebGL path.
- The title and controls remain visible indefinitely.
- The visitor must deliberately select a later slide to reach a video.

## Controls

### Skip Intro

- A subtle `Skip intro` button is available from the beginning of the sequence.
- Activating it immediately places the scene, captions, and copy in their final held state.
- Skipping must not trigger the video carousel or navigate away.

### Replay

- Once the sequence completes or is skipped, the same control position becomes `Replay`.
- Replay resets the camera, captions, and title reveal, then runs the sequence from zero.
- Leaving the slide during replay pauses rendering and timeline progression. Returning resumes the held frame if the carousel change deliberately finalized the intro; it must not surprise the user with an automatic replay.

### Start Here

- `Start here` remains a semantic link or button navigating to `chat.html`.
- It becomes visible during the final reveal and remains keyboard reachable.
- On reduced-motion and poster-only paths, it is visible immediately.

## Visual Direction

### Realism Standard

The target is NASA-cinematic realism, not strict scientific scale and not a CSS illustration. The scene uses:

- High-quality Earth day, night, cloud, and relief data derived from public-domain NASA sources.
- A high-quality lunar albedo map plus normal or displacement-derived surface relief.
- Physically plausible directional light shared by Earth and Moon.
- Atmospheric scattering or a restrained atmosphere shader around Earth.
- Tone mapping that preserves highlights without turning space gray.
- Subtle stars with no visible repetition at normal viewing size.
- Solar surface treatment that reads as plasma rather than a flat orange sphere.

The scene does not use visible orbit lines, labeled product tiers, fantasy nebula backgrounds, fake chromatic aberration, or continuous dramatic lens flare.

### Typography and UI

The final frame uses the approved Mission title composition:

- Copy is lower-left aligned and asymmetrical.
- Terra provides the dominant visual mass in the upper-right.
- Lumen 1.9 is the largest text but does not cover important planetary detail.
- Location captions use small, restrained mono typography.
- Controls follow the site's existing shared flat control language.
- Floating skip/replay chrome may use `--shadow-float` because it physically floats over the scene.
- Existing semantic z-index tokens are used; no arbitrary page-level z-index values are added.

The copy remains semantic HTML over the canvas or fallback media. It is never baked into a texture or video, ensuring crisp rendering, accessibility, and easy editing.

## Rendering Architecture

### Module Boundary

A dedicated plain-script module at `AI/js/lumen-hero.js` owns the hero scene. It exposes a small browser-global interface suitable for the existing non-module page:

- initialize the Lumen slide
- notify it when its carousel slide becomes active or inactive
- skip or replay the timeline
- pause and resume for page visibility
- dispose scene resources if initialization fails or the page unloads

The existing carousel script remains responsible for slide selection and video playback. It calls the Lumen hero interface rather than reaching into renderer internals.

### Three.js Loading

Three.js is not part of the initial critical path for visitors who will not receive WebGL. The landing page first renders the poster and semantic copy shell. After capability selection chooses the real-time path, it loads a pinned, locally hosted production build of Three.js. No runtime CDN request is introduced.

The scene uses a single renderer, one camera, a small fixed object graph, and no post-processing pipeline unless profiling demonstrates that a single lightweight effect remains inside the performance budget. Photorealism comes primarily from source textures, materials, light, tone mapping, and camera composition rather than stacked effects.

### Scene Components

- Solar limb mesh and material
- Earth sphere with surface material
- Separate Earth cloud shell
- Earth atmosphere shell or shader
- Moon sphere with surface and normal detail
- Static or minimally procedural star background
- Shared sunlight and minimal fill needed for legibility
- Choreographed camera timeline

The implementation must keep each component independently degradable. For example, lower real-time quality can omit cloud shadows or reduce normal-map resolution without changing the sequence or copy.

## Capability Selection

Capability selection is conservative. A visitor receives real-time WebGL only if the browser supports the required APIs and no strong low-resource signal is present.

Signals considered include:

- `prefers-reduced-motion`
- `navigator.webdriver`
- `navigator.connection.saveData`, when available
- WebGL support and renderer creation success
- `navigator.deviceMemory`, when available
- `navigator.hardwareConcurrency`, when available
- viewport size and device pixel ratio
- a short, non-disruptive renderer warm-up or frame-budget check

No single optional browser hint is treated as perfect hardware detection. Missing hints do not automatically imply a strong device. If capability remains uncertain or initialization exceeds its time budget, the experience falls back rather than exposing visibly poor 3D.

### Paths

#### Real-Time Path

Used only on devices expected to sustain the scene cleanly.

- Device pixel ratio is capped.
- Texture resolution is selected from mobile and desktop variants.
- Antialiasing is enabled only for a stronger quality tier.
- Rendering pauses when the slide is inactive, the page is hidden, or the hero is sufficiently offscreen.
- Texture and renderer failures immediately hand off to fallback media.

#### Cinematic Video Path

Used for supported autoplay environments that do not qualify for real-time rendering.

- Plays a pre-rendered eight-second sequence matching the WebGL camera path and final composition.
- Uses separate optimized desktop and mobile sources where the crop or bitrate requires it.
- Remains muted and plays inline.
- Skip seeks to or replaces the video with the final poster state without waiting for decoding.
- The HTML title and controls follow the same timeline as the WebGL path.

#### Poster Path

Used for reduced motion, automation, failed autoplay, failed media, or other unsupported conditions.

- Shows the final Mission title frame immediately.
- Shows Lumen 1.9 copy and Start here immediately.
- Exposes no fake playback state.
- Under reduced motion, Replay is omitted or disabled rather than launching the moving sequence.

## Performance Budget

Implementation must validate concrete budgets against the selected assets, but begins with these limits:

- Poster visible without waiting for Three.js or large textures.
- No long blank or black state while assets load.
- Real-time path targets a stable 30 FPS minimum during camera travel; devices that cannot sustain it fall back.
- Renderer pixel ratio capped at 1.5, with lower caps for mobile tiers.
- Only the active hero slide renders continuously.
- Texture variants avoid loading desktop-resolution assets on mobile.
- The real-time scene and cinematic video are not downloaded simultaneously before a path is selected.
- All asset requests are locally hosted, cacheable, and use explicit dimensions or aspect ratios to avoid layout shift.

The implementation plan must include an asset-size audit once NASA source files and fallback renders exist. Quality tiers should be changed by asset resolution and optional material features, not by removing the defining atmospheric, cloud, or lunar cues.

## Asset Provenance

NASA-derived images must be:

- sourced from official NASA or NASA-affiliated public-domain repositories
- recorded in a small attribution/provenance document with source title and URL
- processed locally into web-ready variants
- stored under a dedicated Lumen hero asset directory
- free of runtime hotlinks

Generated normal maps, compressed variants, poster frames, and fallback videos must be traceable to their source assets and build process. The repository should retain the processing commands or script needed to reproduce web assets without checking unnecessarily large source files into the deployed path.

## Accessibility

- The canvas and video are decorative and hidden from the accessibility tree.
- A concise text alternative describes the visual journey for non-visual users.
- Skip intro, Replay, Start here, arrows, dots, and video controls have accurate names and visible focus states.
- Location captions are not announced repeatedly as live-region events.
- Reduced-motion users receive the final state without camera travel, orbiting, or slow background motion.
- Keyboard interaction never traps focus inside the hero.
- Contrast is tested against the brightest and darkest portions of the final poster; a restrained localized scrim may support copy legibility without flattening the full scene.

## Failure Handling

- Three.js load failure: activate cinematic video if available, otherwise poster.
- WebGL context creation or context loss: dispose renderer state and activate fallback.
- Texture load failure: do not show partially textured planets; activate fallback.
- Video autoplay rejection: show the final poster and semantic copy immediately.
- Missing fallback media: preserve a readable solid-space background and semantic copy rather than leaving an empty card.
- Rapid carousel navigation: cancel stale timeline callbacks and prevent inactive slides from restarting media.
- Resize or orientation change: recompute camera framing without restarting the completed introduction.

## Files and Responsibilities

Expected implementation areas:

- `AI/index.html`: first-slide markup, third carousel dot, local Three.js script loading hook, and carousel-to-Lumen lifecycle calls.
- `AI/js/lumen-hero.js`: capability selection, scene setup, timeline, controls, fallback coordination, visibility handling, and cleanup.
- `src/site.css`: AI-home scene layout, Mission title overlay, captions, controls, responsive framing, and reduced-motion presentation.
- `AI/assets/lumen/`: optimized runtime textures, poster, fallback media, and generated supporting assets.
- `tools/`: reproducible asset processing or render scripts if needed.
- `docs/`: NASA source provenance and processing notes.
- AI-home contract tests: markup, fallback, reduced-motion, carousel, and accessibility expectations.

## Verification

### Automated Contracts

- Existing `test-ai-home-theme.mjs` passes or is deliberately updated for the new three-slide structure.
- Existing `test-ai-home-bdh.mjs` continues to pass because the lower page remains unchanged.
- A new dependency-free Lumen hero contract verifies semantic controls, slide ordering, local asset references, no external texture/CDN use, reduced-motion hooks, and lifecycle integration.
- `test-z-index.mjs` passes after overlay additions.
- Automation receives the deterministic poster path through `navigator.webdriver`.

### Browser Verification

- Desktop and mobile carousel navigation works with mouse, touch, and keyboard.
- Skip lands on the exact held composition and does not advance slides.
- Replay runs only when explicitly requested.
- Returning from a video shows the held final frame.
- Product video controls continue to work and inactive video slides pause.
- Reduced-motion shows the final poster immediately.
- Save-Data and simulated weak-device conditions select fallback.
- WebGL initialization failure and context loss produce a seamless fallback.
- Hidden tabs and inactive slides stop rendering and timeline work.
- Resize and orientation changes preserve composition and readable copy.
- Light and dark site themes do not reduce scene-control contrast.

### Visual and Performance Review

- Compare WebGL, video, and poster paths at their final frame to ensure composition and copy alignment match.
- Profile representative low-, mid-, and high-tier devices or throttled equivalents.
- Confirm no low-tier device is left running visibly choppy 3D.
- Audit transferred bytes by path so fallback users do not download unused Three.js textures.
- Review Earth atmosphere, clouds, lunar relief, solar limb, and shared lighting for the approved NASA-cinematic standard.

## Success Criteria

The redesign succeeds when:

- A first-time capable-device visitor sees a smooth eight-second Solar-to-Terra-to-Luna journey ending on Lumen 1.9.
- A low-end or constrained visitor sees the same cinematic idea without choppy real-time graphics.
- A reduced-motion visitor immediately receives the complete, readable final hero.
- The final state remains until the visitor intentionally chooses a video or starts chat.
- Solar, Terra, and Luna read only as celestial locations; Lumen 1.9 is clearly the sole model.
- Existing videos and the rest of the AI landing page continue to function.
