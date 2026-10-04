# Persistent live-glass navigation

## Goal and approved intent

The user approved replacing screenshot-based cross-page control transitions with
a persistent live-material layer. Glass must carry drag deformation, touch light,
and release velocity through page changes. Reference recordings:

- `Downloads/ScreenRecording_10-04-2026 18-11-34_1.MP4`: iOS Notes, toolbar grows
  into search, content briefly defocuses, independent compose control persists,
  page slides beneath.
- `Videos/2026-10-04 18-30-22.mp4`: current site's mismatched transition and
  gesture handoff. Earlier fixes removed some ghosts but did not preserve physics.

## Root cause

`src/glass-navigation.js` pairs snapshots. The live controllers in
`liquid-design/source/liquid-design-live-demo.js` belong to the outgoing document.
Navigation destroys those controllers; the next document creates zeroed springs.
CSS then stretches and blurs static old/new snapshots. It cannot preserve pointer
capture, update touch light, or respond to interruption. Changing easing alone
cannot solve this mismatch.

## Architecture choice

Use a persistent outer shell containing the actual glass navigation controls and
same-origin page frames beneath them. Every page remains directly addressable.
The first eligible document becomes the shell and loads its page content into a
frame using an explicit internal mode. Subsequent internal navigation loads a new
frame without reloading the shell. Frames retain their own document, scripts,
storage access, API requests, and page globals.

Alternatives considered:

1. Fetch and replace body HTML in one document. This needs lifecycle cleanup and
   reentrant initialization for every page; current chat/Astra/inline scripts
   cannot safely be replayed together. Not selected.
2. Serialize spring state across full document navigation. It improves release
   continuity but still destroys the actual nodes and pointer capture and leaves
   noninteractive transition snapshots. Does not meet the approved goal.

The shell/frame approach requires explicit route, focus, and theme coordination,
but preserves each page's existing initialization model.

## Responsibilities

### Shell router

- Own eligible internal navigation, browser URL, title, history, scroll restore,
  load/abort state, and page transition direction.
- Intercept plain same-origin link activations and applicable native GET search
  submissions. Preserve modified clicks, downloads, new tabs, external targets,
  and in-page anchor behavior.
- Use a declared route inventory of the site's HTML pages. Resolve directory
  aliases and relative URLs without changing destination queries or fragments.
- One request token owns the pending frame. Later navigation cancels stale work;
  only the current destination can commit its title, route, theme, and controls.
- Do not blank the active page during loading. Commit once the incoming bridge
  and required layout are ready. Failed loads expose retry and native navigation.
- Back/Forward restore the matching history entry and content scroll position.
  A reload or new tab loads the actual address normally and recreates the shell.
- Unsupported/file-origin environments retain ordinary page navigation.

### Page bridge

- Explicit same-origin framed mode suppresses duplicate universal navigation and
  cross-document screenshot transitions. Do not infer mode merely from framing.
- Report page readiness, title, resolved navigation configuration, destination
  anchor measurements, route changes, and theme changes to the shell.
- Coordinate Astra's own query/tab history with the outer URL without double
  entries or navigation loops. The current child handles its local route changes.
- Preserve page functionality: native forms, search autocomplete, streaming,
  clipboard, dialogs, editing, and media. Grant needed same-origin iframe
  permissions deliberately and verify them with the real app harnesses.
- Focus entering a page moves to its main heading/content, except navigation
  triggered by an active gesture keeps focus/capture on that control until release.
- Settle page reveal animations before a page is exposed by the shell.
- Keep at most the active and incoming/outgoing frames during a transition. Remove
  obsolete frames after handoff; dispose Lumen resources explicitly before removal.

### Persistent glass controls

- Root-level shell controls are initialized once with the existing engine.
  Do not clone, replace, destroy/recreate, or reparent an actively held control.
- Persistent roles: leading Socials/Back, menu Tools/Pages, primary Labs21/Chat/Home,
  and theme. Labels, destinations, menu items, and anchor targets update in place.
- Retarget geometry with spring state; do not set instantaneous transforms or
  restart an unrelated CSS animation. Layout target and gesture deformation are
  distinct state composed once at render time.
- Preserve fixed layout hitboxes and the approved dominant-axis drag model:
  facing-edge stretch, stiff center movement, no direct diagonal control dragging.
- Preserve pointer ID, gesture origin, spring positions and velocities, contact,
  and touch-light state during route retargeting. A captured gesture continues on
  the original native node even if its destination geometry changes.
- Correspondence is explicit: `data-glass-key` declares a persistent identity;
  `data-glass-to` targets a destination identity. Default shared nav identities
  use semantic roles. Unmatched controls retain their geometry and fade out;
  new unmatched controls fade in. Do not invent shrinking/merging relationships.
- Labels may briefly defocus during substitution. Blur material backgrounds with
  native backdrop filtering; do not blur the whole control as a screenshot.
- Menus and route geometry use interruptible state with continuous position and
  velocity. Reversal retargets from current state instead of resetting the clock.

### Search continuity

- Home/Astra search needs a shared native input/material controller in the shell
  when those routes participate in the search morph. The page bridge supplies the
  corresponding slot geometry and delegates query submission/autocomplete to the
  active page. Keep input value, selection, focus, and composition state intact.
- A page without a search slot causes a fade-out at current geometry; do not leave
  an unmatched search snapshot over its content or force it into another control.
- Application-specific controls elsewhere stay inside their page runtime. They
  retain current in-page glass behavior; cross-route persistence applies to shared
  navigation/search identities rather than unrelated buttons being guessed as pairs.

## Motion and appearance

- Slide page content beneath persistent chrome; eliminate overlapping root-title
  cross-fades and post-arrival reveal replays.
- Forward/back route transitions follow a consistent horizontal direction. A rapid
  reversal continues from current visual position, without a blank intermediate.
- Geometry and gesture release share damped motion derived from current state.
  Tune against extracted Apple frames, with a restrained single settle rather than
  independent bounce pulses.
- Retain approved light/dark veil, 12px backdrop blur, rim, palette, typography,
  fixed hitboxes, and mobile collision rules.
- Avoid permanent transition names, filters, opacity, or clipping on an ancestor
  that would create a backdrop root around live glass.
- Reduced motion and webdriver settle route geometry immediately; dedicated live
  motion tests explicitly disable the webdriver guard to exercise real physics.

## Accessibility and resilience

- Universal navigation remains keyboard operable; Escape closes menus and restores
  focus. Inert outgoing content cannot receive input during page slide-out.
- Announce destination titles through a quiet live status region, not duplicate
  titles from active and hidden frames.
- Preserve shell control focus and native pointer capture during transition.
- Parent and child theme are synchronized from the explicit stored/site theme;
  OS dark preference cannot overwrite a saved light choice.
- No-JS links and direct HTML pages continue working. Native navigation is the
  fallback when route bridging or frame readiness fails.
- Verify server headers permit the intended same-origin frames; do not bypass
  deployment policies. If a route forbids framing, it uses native navigation.

## Verification and acceptance

Automated verification must assert behavior rather than only transition names:

1. Same native primary/menu/leading nodes and controllers before/after navigation.
2. Hold/pull a control, trigger navigation, move again, and release: pointer capture
   survives; material geometry reacts throughout; release continues from its real
   position and velocity with no reset frame.
3. Record consecutive rendered bounds around commit and interruptions. Check for
   discontinuities against the measured frame interval and incoming velocity.
4. Reverse navigation during loading and during settling; no stale destination,
   duplicate navigation, blank page, or stuck inert/focus state.
5. Render high-contrast content through live glass, including frame content, and
   verify actual blur and live touch-light movement rather than CSS declarations.
6. Home↔AI, AI↔Goals/Privacy, Home↔Astra, Back/Forward, query/tab history, fragment
   links, native search Enter/submit, modified clicks, and destination failure.
7. Real chat SSE send/stop, settings, clipboard, Astra suggestion/summary/dialog,
   editor/Word input, theme sync, and Lumen intro lifecycle.
8. Desktop and narrow phones, light/dark, reduced motion, Chromium and WebKit.
   Distinguish Windows WebKit's native blur rasterization limitation explicitly.
9. Render sequence/contact sheets for side-by-side comparison with Apple. A passing
   endpoint screenshot or paired name is not evidence of seamless motion.

## Delivery order

Build the live shell and role controller through the real Home↔AI vertical slice
first, proving node/gesture/velocity continuity before extending the route
inventory. Then connect info/app pages and shared Home/Astra search. Finish with
failure/history/accessibility verification and documentation. The slice is a
checkpoint, not completion of the user's site-wide request.
