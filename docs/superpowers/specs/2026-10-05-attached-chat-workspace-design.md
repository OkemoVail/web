# Attached chat workspace

Approved by the user on 2026-10-05 following the in-chat layout proposal.

## Structure

Use an attached split-pane workspace. Desktop/tablet library occupies a full-height column and can collapse to its existing rail. Mobile retains the library drawer. The main pane contains three layout rows: header, scrollable conversation, and composer. Header and composer reserve their own space; messages cannot scroll behind either. The composer retains a full-width multiline writing row above Add and Send.

## Appearance

Keep the site's Satoshi typography and rosewood accent. Use the existing Liquid Design engine for persistent reflective edges on functional surfaces and important controls. Header and library boundaries are subtly defined, without detached inset islands or floating shadows. Grouped actions share one surface; message and history rows remain quiet content. Pane geometry stays stable while small controls retain their existing glass response. Light/dark, reduced transparency, increased contrast, forced colors, and reduced motion remain supported.

## Integration

Preserve functional DOM IDs, native textarea editing, existing send/stop logic, title actions, sidebar toggling, and shell routing. Remove floating-dock measurements and scroll-edge overlays: layout supplies the available conversation space. Root-level action menus retain viewport clamping and keyboard navigation. Visual viewport resizing adjusts mobile workspace height without introducing document scrolling.

## Verification

Update `test-chat-liquid-glass.mjs` to assert attached sidebar geometry, non-overlapping header/thread/composer bounds, natural composer growth, persistent engine-owned rims, native scrolling, menu keyboard behavior, editing, stable hitboxes, and accessibility preferences. Run native/shell desktop/tablet/mobile cases in Chromium and WebKit and inspect rendered stills.

## Apple reference

https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass

Apply clear navigation hierarchy, functional grouping, concentric corners, safe areas, legibility, and selective material use. The attached layout is the user's chosen web adaptation, not a claim of native platform equivalence.
