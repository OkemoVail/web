# Portable Liquid Design

```html
<link rel="stylesheet" href="liquid-design/liquid-design.css">
<script defer src="liquid-design/liquid-design.js"></script>

<button data-liquid-design type="button">Click me</button>
```

Liquid Design is the public plugin name. Attributes use `data-liquid-design-*`,
appearance variables use `--liquid-design-*`, and the JavaScript API is
`LiquidDesign.refresh()` / `LiquidDesign.destroy()`.

Load `liquid-design.css`, then `liquid-design.js`. Mark standalone controls with
`data-liquid-design`, and call `LiquidDesign.refresh(scope)` for inserted content.
`LiquidDesign.destroy(scope)` releases listeners, springs and owned decorations.
Native link actions and editable `data-liquid-design="surface"` content remain
native. The engine is a browser approximation of Apple-inspired material.

Production pages additionally load `src/site.css` and
`src/liquid-design-site.js` after the plugin. The adapter automatically enhances
buttons and explicitly button-like links, repairs content replacement and prunes
removed controls. `LiquidDesignSite.destroy()` stops automatic enhancement and
restores controls; `LiquidDesignSite.refresh(scope)` restarts it.

Every production control uses `data-liquid-design-independent`, which overrides
both automatic sibling grouping and `data-liquid-design-group`. Each control owns
its material and rim, including during overlapping drags. Standalone opt-in groups
retain their existing behavior. Theme and semantic tint rules live in the shared
production section of `src/site.css`; application inline background-color updates
are transferred into an inherited glass tint instead of repainting a solid face.

Build the shipped script with `node liquid-design/build.mjs`. Sources are vendored
under `source/`; normal builds do not require the reference worktree. They contain
the approved component engine but no playground initialization/script. Explicit
nearby `data-liquid-color-source` objects retain the approved .24 strength,
85px inward falloff and 80px proximity.

Run `node test-liquid-glass-site.mjs` for the self-contained browser fixture.
`node test-liquid-glass-site.mjs --approved-portability` runs the reference
worktree's complete portability suite against this main-workspace bundle.
`LIQUID_BROWSER=webkit` selects WebKit for the self-contained test if installed.

## Approved portable material (2026-10-04)

The plugin now supplies the approved material without the site stylesheet:
64% near-white light veil, 18% charcoal dark veil, 12px backdrop blur, a .5px
quiet contour and 1.25px light/.75px dark reflected rim. Pointer-inert clipped
touch highlights paint above content. Restrained prismatic edges respond to the
existing contact spring. Editable and nested controls share the current material
scale exactly once; native typing, actions, and fixed layout hitboxes remain.
Existing `--liquid-design-*` overrides remain supported. Explicit
`data-liquid-design-theme="light|dark"` overrides the operating-system theme.

## Coordinated Options and Tools

Wrap an existing Options/Tools pair with `data-liquid-design-navigation`.
Put `data-liquid-design-move` on the positioned wrapper around Options. The host
still owns position and size. The plugin closes Tools when Options opens, moves
an overlapping menu below the Tools trigger with a 12px gap (click, keyboard,
and hold), and slides the Options wrapper off the left edge when expanded Tools
overlaps it. Closing Tools returns the wrapper over 560ms. Controls never shrink.
Reduced motion and automation resolve immediately. Destroy restores owned styles
and listeners. `--liquid-design-navigation-gap` customizes clearance;
`--liquid-design-menu-offset-y` is available for manually positioned menus.

The complete portable example is
`.worktrees/liquid-glass/liquid-design/example.html`; copy that entire
`liquid-design/` folder to use it on another website. Runtime needs only its CSS
and JS; `playground.js` is optional demo scenery.

Run `node test-liquid-glass-port.mjs` for standalone visual/interaction contracts.
Build and sync approved sources back into the original plugin with
`node liquid-design/build.mjs --export-portable`. The original worktree also
builds independently with `node tools/build-liquid-design-plugin.mjs`.
