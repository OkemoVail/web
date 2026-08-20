# Astra Cosmic Clarity Design

**Date:** 2026-08-20
**Status:** Approved
**Builds on:** Astra v2 through v2.3 and the site-wide flat design language

## Goal

Polish Okemo Astra without replacing its established "Google bones, cosmic
playground skin" identity. Improve accessibility, privacy, loading feedback,
recovery, responsive behavior, and visual hierarchy while keeping the existing
vanilla-JS architecture and backend API.

## Visual Direction

The approved direction is **Cosmic Clarity**, a polished evolution rather than
a redesign. Keep the warm parchment canvas, accent gradient wordmark, dry copy,
flat controls, restrained stars, conic generation ring, tilted result markers,
and desktop left-rail result grammar.

On mobile, the results header changes from one row to a compact vertical stack:
the centered `✦ Astra` logo appears above a full-width search bar. Desktop keeps
the horizontal logo-and-bar arrangement.

## Search And Suggestions

Both search fields become WAI-ARIA comboboxes. Each input exposes
`aria-autocomplete`, `aria-expanded`, `aria-controls`, and
`aria-activedescendant`. Suggestion containers are listboxes and suggestions
are options with stable IDs and selected state. Existing debounce, stale-result,
keyboard, click, and silent-error behavior remains.

Placeholder quips stop competing for attention while an input is focused.

## Results

Google's favicon service is removed. Each result gets a deterministic local
domain monogram derived from its hostname. Monograms use a small fixed palette,
remain legible in light and dark mode, and preserve Astra's alternating static
tilt without making network requests.

Initial searches show skeleton rows matching loaded-result geometry. Result
breadcrumbs truncate rather than breaking every character. Links continue to
open in a new tab, with accessible text announcing that behavior.

Empty results become actionable: explain how to broaden or correct the query,
offer an Edit search action that focuses the results input, and offer an Images
action that preserves the query and changes the URL tab state.

## Loading More

Keep pre-emptive IntersectionObserver loading, but make it progressive
enhancement over a persistent `Load more stars` button. The button is keyboard
accessible, reports busy state, and remains the recovery control after a page
failure. Loaded results never disappear on later-page failure. End-of-results
copy replaces the control at the cap or empty page.

## AI Panel

Add a concise provenance line explaining that Astra is AI-generated and
grounded in up to the first five results. Render compact source chips for those
grounding results. Chips link to the same citation targets inline and open the
source in fullscreen.

The existing first-token behavior is preserved: the thinking row hides on the
first streamed token, handing off directly to the typewriter. Citation jumps
temporarily highlight the target result so users can locate it.

If the Marked CDN is unavailable, AI output renders as safe plain text rather
than failing. AI errors remain isolated from ordinary web results.

## Tabs And Status

The All and Images controls use a proper tablist/tab pattern with
`aria-selected`, roving `tabindex`, and associated tab panels. Search metadata,
result loading, errors, result counts, and AI state use polite live status and
`aria-busy` without announcing every streamed token.

The AI toggle's accessible name reflects its current on/off state.

## Overlays

Image preview and fullscreen AI behave as accessible modal dialogs. Opening a
layer stores focus, moves focus inside, traps Tab and Shift+Tab, marks background
content inert, locks body scrolling, and restores focus on close. Escape closes
the topmost layer. Dialog labels and expanded state remain synchronized.

The image preview image gets a meaningful title-based alt value. On narrow
phones, preview actions wrap or stack and include bottom safe-area padding.

## Motion And Flat Design

No resting-surface shadows, blur, hover lift, or new decorative gradients are
introduced. The existing conic generation treatment remains an intentional
brand effect. Result skeleton shimmer, highlights, and entrances respect
`prefers-reduced-motion` and `navigator.webdriver`. Placeholder motion pauses
while users interact with an input.

## Architecture And Testing

Keep `search/astra.js` as the browser script. Add a tiny pure-helper file loaded
before it and exported through both `window.AstraHelpers` and CommonJS. This
allows dependency-free Node tests without converting the page to modules or
installing packages.

The Node harness covers deterministic monograms, route/tab normalization,
citation linkification, safe markdown fallback, and static accessibility
contracts. Browser smoke checks cover responsive layout, keyboard combobox use,
focus trapping/restoration, live statuses, dark mode, and reduced motion.

## Out Of Scope

- Backend or ranking changes
- Accounts, history, filters, news, or video tabs
- A frontend framework or package-based test runner
- A universal nav on Astra
- A backend favicon proxy
