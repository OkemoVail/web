# Labs21 chat experience redesign

## Direction

The user selected a unified version of the two visual studies: light and dark
appearances of the same chat experience, using the current site palette. Scope
is the complete chat experience, not the other website pages. This specification
is ready for user review before implementation planning.

## Appearance and hierarchy

Use the current tokens: light canvas `--bg` (#f5f4ed), elevated surfaces
`--bg-elevated` (#faf9f5), and rosewood #c96478; dark canvas #141413, elevated
surfaces #30302e, and rosewood #d97790. Respect the user's custom accent setting.
Use Satoshi with system-sans fallbacks consistently. Body text is regular weight,
headings medium/semibold, and supporting labels smaller with readable contrast.
Use a consistent 8/12/16/24/32px spacing scale. Themes share identical structure.

The premium direction comes from clear hierarchy, consistent proportions, native
editing, and restraint. Liquid Design supplies the real glass materials on
floating navigation, action groups, menus, and the composer. Avoid independently
glassing every list row or nesting competing glass rims. Preserve reduced motion,
reduced transparency, increased contrast, forced colors, and keyboard focus.

## Conversation layout

- Inset rounded sidebar, with collapse/reopen inside the sidebar; a 60px rail
  remains when collapsed. Desktop sidebar is approximately 260–280px wide.
- Plain visible title in the conversation's top-left and New chat/More in the
  top-right. Keep the title and controls from colliding at narrow widths.
- Center a readable conversation column approximately 680–760px wide. Use calm
  user bubbles and regular-weight assistant text, clear markdown spacing, and
  compact functionally grouped actions. Content itself stays a reading surface.
- Float the roomy rounded rectangle composer above the bottom: full-width native
  textarea above Add and Send, native multiline growth up to 200px. Thread end
  spacing follows actual composer bounds. A soft scroll-edge treatment protects
  chrome readability. Greeting centers in the unobscured conversation area.
- On phones the floating sidebar expands over content from its persistent rail.
  Hidden library content is inert; opening, closing, focus restoration, and
  available visual viewport sizing remain predictable.

## Sidebar

Use a compact brand/header, search, clearly separated commands, recent chats,
folders, and profile/settings at the bottom. Labels use title case. History is
realistic readable content, not empty decorative space. Related commands have
consistent row heights and leading-icon alignment; primary action retains accent.
Selection, hover, loading, and disabled states share one visual language.

## Menus and settings

More uses one anchored glass surface with grouped conversation actions (rename,
title generation/feedback), personalization (Personality and Memories), and
appearance. Availability reflects current chat state, without hiding access to
personalization in empty chats. Preserve existing callbacks and features.

Rework existing Settings into a coherent grouped layout. On wide screens use
category navigation beside the selected content; on phones use a navigable
single-column sheet. Keep existing categories and settings IDs. Inputs, switches,
segmented controls, and action rows share consistent alignment, sizing, and
disabled/selected states. Personality and Memories panels use the same layout
language, including their consent, empty, loading, and failure states.

Dialogs use a clear title, concise body, and predictable primary/cancel placement.
Dangerous actions retain semantic red. Popovers originate near their control and
remain inside the viewport. Preserve Escape, focus trapping/restoration, and
accessible labels. Toasts and status cues remain quiet and legible.

## Integration and implementation boundaries

Keep chat history/storage formats, APIs, model selection, language support,
streaming, uploads/tool availability, and native textarea behavior. Preserve
functional element IDs and callback names unless a deliberate compatibility
adapter is provided. No backend work or unrelated page redesign is included.

`AI/chat.html` owns semantic structure; the chat section of `src/site.css` owns
hand-written appearance; `AI/js/chat-glass.js` owns chrome/menu/material wiring.
Existing settings, modal, personality, memory, render, and streaming modules keep
their feature responsibilities. Consolidate superseded chat-layout overrides as
part of this work so appearance is no longer a cascade of conflicting versions.

## Delivery and verification

Implement in three reviewable slices: conversation/sidebar foundations, settings
and personalization, then menus/dialogs/status. Each slice must render actual
representative content in light/dark desktop/tablet/mobile before completion.
Use existing Playwright harnesses and extend meaningful contracts for new flows.
Verify native/shell Chromium and WebKit, multiline input, sidebar rail, keyboard
viewport, scroll reachability, action targets, focus behavior, and accessibility
preferences. Do not accept passing geometry tests as proof of visual quality:
inspect rendered light/dark populated chat and settings previews.

## Reference

Apple's adopting Liquid Glass guidance:
https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass

Apply content-first hierarchy, functional grouping, concentric shapes, legibility,
safe areas, and selective material use. This is a web adaptation, not native iPadOS.
