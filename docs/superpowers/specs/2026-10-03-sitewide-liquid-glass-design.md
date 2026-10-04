# Site-wide liquid glass

Approved in conversation: apply the tested portable plugin to every production
button, retaining accent, selected, brand and destructive-action tints. The user
explicitly requests one subagent for each web page.

## Integration

Ship the standalone plugin from `.worktrees/liquid-glass/liquid-glass/` in the
main workspace. A single `src/liquid-glass-site.js` adapter owns initialization,
newly inserted buttons, button-like links, content replacement and removal.
Each production page loads the plugin CSS, plugin script, then site adapter
using depth-relative URLs. Regular editorial links stay regular links.

All native buttons receive glass, including dynamic chat/settings/dialog controls.
Preserve DOM node identity, handlers, IDs, layout dimensions, native disabled,
keyboard activation, accessible names and visible focus. Preserve semantic color
and selected states through live CSS tint tokens. Latest user correction:
production uses separate Apple-style button surfaces. Disable automatic sibling
grouping and shared unions/connections altogether for production buttons,
including toolbars and navigation. Every button owns its own glass and rim.
Focus rings must survive the plugin's owned box-shadow. Existing page animations
must not fight the plugin's spring or duplicate its press transform.

Nearby-color tuning remains .24 maximum, 85px inward fade, 80px proximity, using
explicit real colored sources. Production pages do not load playground objects.
Keep reduced-motion and webdriver guards; backdrop-filter failure remains readable.

## Lifecycle and performance

Observe added/removed controls with batched scoped updates, not full rescans per
streamed token. Owned decoration must not cause an observer repaint loop. Handle
buttons whose innerHTML/textContent is replaced by host code and prune disposed
controls/resources. Observe relevant class/style/disabled changes without reacting
recursively to spring-owned style updates. Keep hidden controls measurable after
opening and keep dynamic accent/theme updates synchronized.

## Pages and verification

Production scope: index, whitename, design, Themes, Word, Astra, AI landing,
chat, editor, manage, research, goals, privacy, tos and version. Historical
design-lab and motion-demo remain reference pages. Synchronize the deployed root
landing copy in the adjacent okemollm repo after checking local changes.

Browser checks cover initial and dynamic enhancement, native actions, submit,
innerHTML replacement, disabled/selected/tint changes, navigation expand/collapse,
chat generation updates, focus, mobile overflow and teardown. Run existing page
contracts and z-index/Astra suites. Do not commit or deploy without instruction.
