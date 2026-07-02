# Floating Sidebar Refresh — Design

**Date:** 2026-07-02
**Page:** `AI/chat.html` (Oaky chat)
**Type:** Visual refresh (behavior unchanged)

## Goal

Reimagine the chat sidebar as a **floating, detached panel** that matches the
site-wide floating-nav language (`.ov-nav__bar` in `src/design-tokens.css`),
and refresh its **overall surface & depth** and **search & history** areas in
the spirit of the `design.html` design system. All existing behavior is
preserved — this is a look-and-feel change only.

### Motivation (from brainstorming)

- User wants a **visual refresh** (same structure/features, fresher look).
- The design language is defined in `design.html` / `src/design-tokens.css`;
  use it as **inspiration** (fresh look in its spirit), not a strict
  component-swap.
- Highest-priority focus areas: **overall surface & depth** and
  **search & history**.
- The sidebar should **float** to match the overall webpage (the universal
  floating nav capsule).

## Design decisions (locked during brainstorming)

1. **Shell finish:** match the floating nav — a *solid refined surface*
   (whisper 180° gradient + hairline border + inset top highlight + soft lift
   shadow), rounded corners, inset from the edges. Not translucent glass.
2. **Collapsed state:** a narrow **floating rail** (icons only) that stays
   detached and rounded — same floating language in both states.
3. **Internal treatment:** the "Refined plane + accent-chip rows" approach —
   3-layer depth read, `.ui-field`-style search, accent-chip active rows.
4. **Mobile:** off-canvas drawer behavior kept, but rendered as the same
   floating inset rounded panel.

## Current state (what exists today)

- `<aside id="sidebar">` is a **full-height flush plane** docked to the left
  edge. On `lg+` it is `position: static` in the flex row; below `lg` it is
  `fixed` and slides in via `-translate-x-full` → `translate-x-0`.
- Its surface is a bespoke recessed plane driven by tokens defined inline in
  `AI/chat.html`'s `<style>`:
  - `--sidebar-surface`, `--sb-edge`, `--sb-edge-highlight`, `--sb-divider`,
    `--sb-item-hover`, `--sb-active`, `--sb-active-soft`, `--sb-active-top`,
    `--sb-active-bottom`, `--sb-depth`.
  - `#sidebar` box-shadow = `inset 0 1px 0 edge-highlight, inset -1px 0 0 edge,
    var(--sb-depth)` (a right-side depth shadow that reads as a docked plane).
- Collapse: `body.sidebar-collapsed` shrinks the aside to
  `var(--sidebar-rail-width)` (44px) flush at the edge; `.sb-row-text` and
  `#sidebar-history-area` fade out.
- Structure (top→bottom): header (Labs21 wordmark + collapse toggle) → New chat
  button → nav tiles (Research, Try VoidAI) → search (`#chat-search-input`,
  `.sb-search-input`) → folders (`#folders-section`/`#folders-list`) → recents
  (`#history-list`, `.history-btn-container`, `.history-item-active`) →
  profile footer (`#sidebar-bottom-actions`).
- History active row uses a flat two-stop vertical gradient
  (`--sb-active-top`/`--sb-active-bottom`) + inset ring + a left accent bar
  (collapsed only). Search uses bespoke `.sb-search-input` inset shadows.

## Target design

### 1. The floating shell

The `<aside id="sidebar">` becomes a **detached, rounded, floating panel**:

- **Inset** from the viewport on `lg+`: a margin (~`1rem`, aligned with the
  nav's `top: 1.1rem`) on top / bottom / left so the chat canvas shows around
  it. The panel is full-height-minus-margins, not edge-to-edge.
- **Surface** = the `.ov-nav__bar` recipe (light + dark):
  - Light: `background-image: linear-gradient(180deg,
    color-mix(in srgb, var(--bg-elevated), white 7%),
    color-mix(in srgb, var(--bg-elevated), black 7%))`;
    `border: 1px solid color-mix(in srgb, var(--bg-elevated), black 14%)`;
    `box-shadow: inset 0 1px 0 rgba(255,255,255,.5),
    0 1px 2px -1px rgba(0,0,0,.12), 0 6px 22px -8px rgba(0,0,0,.18)`.
  - Dark: mirror `.dark .ov-nav__bar` (white 8% / black 8% gradient,
    `border-color: rgba(0,0,0,.5)`, deeper lift shadow).
- **Radius** ~18–20px (panel-scale, not the nav's full 999px pill).
- **Retire** the docked-plane look: remove the `inset -1px 0 0 edge` and
  `--sb-depth` right-edge shadow; depth now comes from the all-around lift
  shadow. The bespoke `--sidebar-surface` / `--sb-edge*` values are replaced by
  the shared recipe (some `--sb-*` interaction tokens like `--sb-item-hover`
  may be kept/retuned for row states).
- **Layout implication:** because the panel is inset, `<main>` no longer sits
  flush against it. The chat column, `#top-left-chat-title` island, and
  `#top-right-actions` must still align — account for the surrounding gutter
  (e.g. the flex row gets the sidebar as a fixed/absolute floating element with
  a matching left gutter on `main`, or the aside keeps a layout slot with
  transparent margins). Implementation plan will choose the mechanism that
  least disturbs the existing `lg:static` flex arrangement.

### 2. Depth system (3 layers)

A clear read against the floating shell:

1. **Shell** — raised, gradient surface (above).
2. **Row** — flush/transparent by default; calm `--sb-item-hover` on hover.
3. **Active row** — a raised **accent chip**: whisper accent fill
   (`--skuo-accent` surface) + faint `--skuo-glow` + hairline top highlight,
   replacing the current flat two-stop gradient. "New chat" (the primary) and
   the active chat both read as accent chips. This matches the design system's
   "selected = accent tint, hierarchy by intensity not hue."

### 3. Search & history

- **Search** → `.ui-field`-style: a leading search icon over the shared unified
  input surface + accent focus ring. Drops the bespoke `.sb-search-input`
  box-shadow stack in favor of the token/`.ui-field` recipe. Placeholder,
  `oninput="window.filterChats(...)"`, and i18n attributes are preserved.
- **Recents rows** → calmer hover, tighter radius consistent with the chips;
  **active row = accent chip** (§2). Pin / hover action buttons
  (`.history-action-btn`) stay but adopt the `.skuo-icon` language.
- **Section label + count** → muted uppercase caps; the count may use
  `.ui-badge--tiny`.
- **Folders** — functionally identical (drag/drop, collapse, rename, etc.);
  visuals inherit the new row language.

### 4. Collapsed = floating rail

Collapsing shrinks the floating panel to a **narrow (~56px) detached, rounded
rail** with icons centered — same floating surface, not docked to the edge.

- Reuse the existing `window.toggleSidebar()` / `body.sidebar-collapsed`
  machinery and the icon-centering approach; only widths and margins change
  (rail width bumps from 44px to ~56px to sit comfortably as a floating
  capsule, TBD-confirmed during implementation against the 44px icon slots).
- `.sb-row-text` / `#sidebar-history-area` fade behavior is unchanged.
- The left accent bar on the active chat (currently shown only when collapsed)
  is retained for the rail.

### 5. Mobile (`< lg`)

- Keep the off-canvas drawer behavior (`-translate-x-full` →
  `translate-x-0`, overlay, `window.toggleSidebar()`).
- Render the drawer as the **same floating inset rounded panel** — it slides in
  with a margin, rounded corners, and the lift shadow, rather than a flush
  full-height drawer.

## Scope / non-goals

- **Behavior unchanged**: sidebar toggle, drag-to-reorder, folders (create /
  drag / drop / rename / collapse), search filter, profile submenu, settings,
  storage line, pin, clear-all — all preserved.
- Header, New-chat button, nav tiles, and the profile footer get only the
  incidental restyle needed to sit correctly inside the floating shell; no
  structural change (they were not the requested focus areas).
- No changes to any other page. All work is confined to `AI/chat.html`
  (its inline `<style>` + sidebar markup). Shared recipe values are *reused*
  from `src/design-tokens.css`; the shared file is not modified unless a small
  reusable addition proves cleaner (to be decided in the plan, and only if it
  does not affect other pages).
- No JS behavior changes beyond what a width/margin restyle requires.

## Risks & considerations

- **Layout alignment:** floating (inset) the sidebar must not break the chat
  column, the top title island, or the top-right actions cluster alignment.
  This is the main integration risk and is called out in §1.
- **Collapsed rail width:** icon slots are 44px today; a ~56px floating rail
  needs the icon centering re-verified.
- **Scroll within a rounded panel:** the recents list scrolls inside the
  floating shell; ensure the rounded corners clip cleanly and the bottom fade /
  overscroll still looks right.
- **Reduced motion:** existing `prefers-reduced-motion` guards for the sidebar
  transitions must continue to apply to the new width/margin transitions.

## Success criteria

- The sidebar reads as a floating panel visually consistent with `.ov-nav`
  (surface, border, shadow) in both light and dark modes.
- Surface/depth reads as 3 clear layers; the active chat and New chat read as
  accent chips.
- Search matches the `.ui-field` language; history rows feel calmer and
  on-system.
- Collapsed state is a floating rail; mobile is a floating inset drawer.
- All listed behaviors still work; no regressions on other pages.
