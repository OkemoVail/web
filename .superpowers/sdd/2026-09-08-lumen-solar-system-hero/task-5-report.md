# Task 5 Report

## Implementation

- Added `AI/js/lumen-hero.js` with the public `window.LumenHero` controller API.
- Added conservative one-time capability signals, WebGL probing, dynamic scene import, warm-up gating, and idempotent WebGL-to-video-to-poster handoffs.
- Kept the poster visible through initialization and deferred fallback video source assignment until video mode is selected.
- Added a single controller-owned requestAnimationFrame scheduler for timeline, scene, HTML location/copy, and video synchronization.
- Added synchronous skip, replay for animated modes only, held rendering, visibility/intersection/resize lifecycle management, and disposal.
- Added only the required carousel hook: existing carousel selection calls `LumenHero.setActive`.

## TDD Evidence

- Browser and source contracts were added before the controller existed.
- Initial browser run failed waiting for `data-state="held"` because the controller did not exist.
- Initial contract run failed with `Lumen controller exists`.
- After implementation, browser coverage includes webdriver and reduced-motion poster states, Start here keyboard activation, all three dot controls, WebGL no-video-download behavior, skip/held/replay behavior, activity lifecycle, and the one-RAF invariant.

## Verification

- `node test-lumen-hero.mjs`
- `node test-lumen-hero-playwright.mjs`
- `git diff --check`

## Self-review

- Controller does not add a second scene RAF; `lumen-scene.js` remains render-on-demand.
- WebGL paths leave all fallback `<source>` values in `data-src`, avoiding eager media fetches.
- Poster policy bypasses scene and video initialization and hides playback controls.
- Runtime scene errors use the shared fallback; video failures terminate at the poster.
- Changes are limited to Task 5 files plus this required report.

## Review Fixes

- Replaced the permanent fallback latch with generation-scoped scene and video attempts. Import, scene creation, context-loss, warm-up, play, replay, resume, error, and ended callbacks now reject stale work; stale resolved scenes are disposed.
- Replaced the synchronous render timing with a capped 12-sample, 500 ms multi-RAF warm-up. The controller still owns one RAF slot across warm-up, playback, held rendering, deactivation, and reactivation.
- Deferred fallback source selection and autoplay whenever the Lumen card, document, or viewport is inactive. Lifecycle pause/resume now keeps video, scene, timeline, and held state aligned without auto-replaying a finalized introduction.
- `destroy()` now settles pending `ready`, invalidates attempts, removes named media listeners, aborts/disposes scene work, clears media sources, and guards later callbacks.
- Initial markup hides playback while retaining poster and held copy presentation before the controller executes. Carousel changes remain limited to the Task 5 lifecycle hook.

## Review RED/GREEN Evidence

- RED: `node test-lumen-hero-playwright.mjs` failed because destroying an unresolved scene returned `{ mode: 'webgl' }` instead of settling `{ mode: 'poster' }`; GREEN after generation checks, stale-scene disposal, and terminal ready settlement.
- RED: strengthened browser contracts initially exposed the missing early hidden playback state and the absence of stale/inactive attempt handling; GREEN after the markup and controller lifecycle changes.
- GREEN coverage now proves WebGL requests six texture families and no fallback video; known-weak video requests no textures; measured warm-up fallback completes texture-backed warm-up before selecting video; inactive failures neither source nor play video; stale video callbacks cannot revive destroyed media.
- GREEN lifecycle coverage tracks one pending controller RAF through skip/deactivate/reactivate, verifies video pause/held/replay behavior, validates card position and Lumen active state, and exercises both Enter and Space dot activation.
