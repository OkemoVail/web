# Liquid Glass Reference Video Analysis

**Primary source:** `C:\Users\okemo\Downloads\41958509335-1-192.mp4`, 01:39-01:47

## Observed Construction

- A fixed, rounded photographic track contains the material system.
- The controls are not one uniformly deforming slab. The system has a central translucent three-button slab and separate circular controls at both ends.
- The central slab and end controls share blur, tint, rim lighting, and highlight behavior, which makes them read as one material family.
- The central buttons remain subdivisions inside their shared slab. Their icons and labels stay legible and mostly rigid.

## Observed Motion

- The outer track does not move.
- The active material center follows only a very small fraction of the inferred gesture, producing strong resistance.
- Most pointer travel appears as local stretch rather than translation. Stretch resolves to one dominant direction at a time: up, down, left, or right.
- The dominant direction can change during one drag as the pointer crosses axes; the material never stretches diagonally.
- The pulled edge travels substantially farther than the center while the opposite edge remains comparatively stable.
- When the gap becomes small, the facing edges swell and overlap into a short, broad neck. Blur, feathered alpha, and refraction hide the seam.
- The material recovers quickly on release, then settles over a softer tail with little visible overshoot.
- Approximate timing from the source: 60-100ms contact compression and 180-280ms release/settling.

## Rendering Implications

- Do not translate the complete toolbar or let a control follow the pointer directly.
- Do not draw a long elastic tendril from a fixed slab to arbitrary controls.
- Represent the central slab and end circles as separate signed-distance shapes in one shared material field.
- Merge shapes only when their edge distance enters a small connection radius.
- Keep semantic DOM controls over the renderer. Move icons and labels even less than the already stiff material center.
- Drive shape bias, refraction offset, cloudy highlight movement, and edge lighting from the same interaction state.

## Recommended Prototype Target

Build the exact fixed-track composition first: circular end control, central three-button slab, circular end control. Dragging inside the central slab should select the current dominant axis dynamically. The material center follows roughly 5-8% of pointer displacement while the facing edge stretches much farther in exactly one of four directions. Near either horizontal end, left or right stretch can widen the slab edge and form a short metaball bridge to the adjacent circle. Release should be critically damped with minimal overshoot.
