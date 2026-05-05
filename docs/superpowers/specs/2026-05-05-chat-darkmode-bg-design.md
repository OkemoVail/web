# Design: Darker Dark Mode Background in chat.html

## Change
Override `--bg-elevated` in the `.dark` block of `chat.html`'s `<style id="dynamic-accent-styles">` to `#1e1e1c`.

## Why
Current dark value (`#30302e`) reads as medium-dark gray. `#1e1e1c` is a warmer near-black midpoint that gives a meaningfully darker feel without going full `#141413`.

## Scope
- **File:** `AI/chat.html` only
- **Token affected:** `--bg-elevated` under `.dark` (line ~80 area)
- **No change to:** `:root` defaults, `src/design-tokens.css`, or any other page

## Result
All `var(--bg-elevated)` usages in `chat.html` (main area, sidebar, modals, elevated surfaces) darken together consistently in dark mode.
