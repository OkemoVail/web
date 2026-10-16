# OkemoVail repository pages

## Context

`/bootstrap/` and `/repo/` are technical repository status pages. They serve
people verifying a source URL and software reading the adjacent JSON, not a
marketing funnel. The interface must make role, identity, and signing status
obvious without competing with the existing OkemoVail website.

## Commitment

- Adjectives: quiet, technical, exact, trustworthy
- Aesthetic essence: quiet technical exactness
- Proposition: the source says precisely what it is and whether it is ready
- Signature move: the URL path is the largest object in the first viewport
- Refused default: no hero CTA, feature-card row, gradient, glass, badges used as
  decoration, or generic package-manager storefront chrome

## System

- Display/body: Satoshi Variable; system monospace only for identifiers
- Type scale: 1.25 ratio from a 17px body, six useful levels
- Spacing: 8px base
- Radius: 2px status labels; 10px reserved for future large surfaces
- Edge: one-pixel defined rules; no shadows
- Palette: off-white/graphite base, blue-green surfaces, Lamina turquoise as the
  sole accent. Colors are implemented as semantic custom properties and adapt
  to a designed dark mode.

## Craft

- Layout: asymmetrical content/status split; stacks to one column below 760px
- Components: underlined links, visible focus ring, textual signing state
- Motion: none; these are status documents
- Imagery/icons: none; repository identity is textual
- Accessibility: semantic landmarks, skip link, responsive text, visible focus,
  status never conveyed by color alone, `prefers-color-scheme` support

## Slop audit

Artifact type: technical status/docs micro-site. The pages prioritize precise
lookup and reassurance. Their bare structure is an asymmetric source label plus
definition list, not a landing-page template. No decorative gradient, generic
card grid, glowing shadow, stock imagery, or gratuitous animation is present.

## Changelog

- 2026-10-16: Established the Lamina package-source page contract.
