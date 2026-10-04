# Liquid Glass Bounded Follow-up Review

Date: 2026-09-29

## Verdicts

**Spec verdict: PASS WITH RESIDUALS.** The bounded follow-up closes the prior discrete pressure-center, immediate keyboard-release, asynchronous terminal-fallback, and empty-ghost findings. Demo mode is one presentation state over one real engine, exposes no deterministic API without both gates, keeps a visible quality/fallback status, supplies an Open controls link, and hides the engineering UI. Two interaction edge cases and two test-honesty gaps remain below.

**Quality verdict: NEEDS MINOR FOLLOW-UP.** The implementation is reasonably separated into physics, renderer, and runtime layers and the terminal fallback flow is now coherent. No Critical or High regression was found. The global keyboard state needs cancellation handling, and release retargeting should not jump back to the press-origin control.

## Findings

### Medium

1. **Keyboard contact can remain permanently pressed when `keyup` is delivered outside the five-button group.** The runtime starts global interaction state from each button's `keydown`, but listens for release only on those same buttons (`followup-review.diff:2034-2053`). If the user holds Enter or Space and focus leaves the group/window before release, no handler clears `input.active`/`input.kind`. The contact spring therefore continues targeting `keyboardPressure`, `group.awake` remains true, `data-liquid-feedback="pressed"` remains set, and the shared RAF never sleeps (`followup-review.diff:2091-2096,2128-2144,2205-2206`). Add a cancellation path for blur/focus loss (and teardown-safe document/window key release) that sends the existing contact spring to zero without synthesizing a click. Current tests cover only an in-group, normally paired `keydown`/`keyup`.

2. **Cross-slab semantic retargeting reverses as soon as pointer release begins.** During drag, `controlAtPointer()` correctly chooses the nearest semantic control while `pressureCenter()` remains continuous (`followup-review.diff:1921-1940`). `release()` then sets `input.kind = 'none'` before the next frame (`followup-review.diff:1987-1994`), causing `controlAtPointer()` to return the original `input.element`, not the most recently retargeted control. The release spring consequently moves `activeControl` and the translated/ghosted content back to the press-origin button (`followup-review.diff:2070-2071,2168-2195`) even though the material itself is merely decaying. Preserve the last semantic target through release, then clear it at rest. The tests assert continuity and semantic switching before pointer-up, but never inspect the release target.

### Low

3. **The demo responsiveness claim is not exercised.** Demo mode is opened only at `1440x900` (`followup-review.diff:4238-4248`). The desktop/tablet/mobile loop that checks overflow and controls runs the normal deterministic lab, not `?demo=1` (`followup-review.diff:4250-4268`). The CSS appears responsive, but the report's unqualified responsive claim lacks browser evidence for the actual presentation layout.

4. **Ghost acceptance is mostly source-shape testing, not rendered-behavior testing.** The suite proves five non-empty `aria-hidden` nodes and matches CSS text for opacity and low-quality suppression (`followup-review.diff:2744-2776`), but it never checks computed visibility/opacity, visual-wrapper-relative bounds, fallback/reduced suppression, or pixels/screenshots with the ghost independently observable. The implementation itself does paint duplicated content inside an absolutely positioned `inset: 0` child of the transformed visual wrapper and disables it for low/fallback/reduced motion (`followup-review.diff:285-317,591-607`), so this is a test-honesty gap rather than an implementation failure.

5. **A fallback assertion contains the same key twice.** The expected diagnostics object repeats `compression: 0` (`followup-review.diff:3953-3957`). JavaScript silently keeps the latter property, so the test passes but the duplication weakens review clarity and can conceal an accidental missing field.

## Compliance Notes

- Continuous slab pressure center is real: pointer X is converted to track-local space and clamped continuously, while nearest-control selection affects only the semantic/content target (`followup-review.diff:1921-1940,2070-2075`). The boundary test verifies a one-pixel center change while the semantic label switches (`followup-review.diff:3581-3591`).
- Keyboard compression is a distinct `springContact` integrated by the shared spring solver and included in settling (`followup-review.diff:1820-1824,2091-2096,2128-2143`). Normal Enter/Space activation remains native and occurs once in the browser test (`followup-review.diff:4275-4283`); all five controls receive the same spring path (`followup-review.diff:4284-4300`).
- Asynchronous image decode failure terminalizes the runtime, publishes fallback diagnostics, and synchronizes/disables the lab selector through the real callback (`followup-review.diff:1660-1665,1772-1775,2235-2266,786-807`). A real browser-injected decode rejection verifies selector and status synchronization (`followup-review.diff:4445-4457`).
- The chromatic ghost has real duplicated glyph/text pixels, remains inside the transformed visual wrapper rather than changing button geometry, is `aria-hidden`, and is disabled for low, fallback, and reduced motion (`followup-review.diff:279-317,591-607`).
- Demo mode uses the same single `LiquidGlass.create()` call and same five native controls. It hides diagnostics/long engineering copy, shows concise instruction, visible material status, and Open controls, and does not expose `window.liquidGlassLab` (`followup-review.diff:339-397,727-816,4238-4247`).
- The deterministic API remains protected by both the query and pre-init Symbol identity boundary; ordinary and query-only visits expose no instance (`followup-review.diff:757-762,816,2938-2965,4232-4240`).
- The approved residuals remain honestly bounded: no reference pixel-equivalence claim, adaptive quality is CPU-cost based, and neck dimensions are labeled estimates rather than framebuffer measurements.
