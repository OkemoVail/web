# Okemo Word Focus Canvas Design

**Date:** 2026-08-20  
**Status:** Approved for planning

## Summary

Redesign `word/index.html` as a quiet editorial workspace called **Focus Canvas**. The document becomes the dominant visual surface, formatting remains immediately available in a compact floating capsule, and Oaky AI moves behind a collapsible right-edge tab until requested.

This is a moderate UX redesign, not a rewrite. Existing document editing, persistence, export, print, formatting, AI chat, selection-aware insertion, keyboard shortcuts, dark mode, and universal navigation remain available.

## Goals

- Make writing the strongest visual priority.
- Reduce competition between navigation, document controls, formatting, and AI.
- Give the page a quiet editorial character consistent with Okemo's warm palette.
- Keep frequent formatting actions continuously accessible without a full-width toolbar.
- Make Oaky easy to summon without permanently reducing document width.
- Improve mobile writing space, control ergonomics, and accessibility.
- Preserve the repository's flat design and motion systems.

## Non-Goals

- Replacing the `contenteditable` editor or `document.execCommand` implementation.
- Changing document storage format or adding cloud persistence.
- Adding document management, collaboration, comments, pagination, or version history.
- Changing the AI backend or adding new AI capabilities.
- Refactoring unrelated shared components or other pages.

## Visual Direction

The workspace uses a quiet editorial treatment:

- Warm neutral desk background with a centered, border-defined paper sheet.
- Generous document padding and readable body typography with a line height in the 1.6-1.75 range.
- Restrained application chrome using solid fills and 1px borders.
- Accent color reserved for selected formatting, Oaky entry points, and important state.
- No gradients, inset effects, resting shadows, hover lifts, or decorative glows.
- `--shadow-float` is used only for the floating formatting capsule, popovers, and other physically floating layers.
- Existing theme tokens continue to drive light and dark modes.

## Desktop Layout

### Document Bar

Replace the current crowded header with a slim document bar beneath the universal floating navigation. It contains:

- A compact Okemo Word identity mark.
- The editable document title as the primary label.
- Save state text, such as `Saved 2:14 PM` or `Unsaved changes`.
- Core document actions: new document and save.
- An overflow action that contains export and print commands.
- An Oaky toggle button.
- The existing profile indicator where space permits.

The document bar must leave room for the injected universal navigation and must use the semantic z-index tokens. Lower-frequency export and print actions move into the overflow menu to reduce visual noise.

### Formatting Capsule

The formatting controls become an always-visible, horizontally arranged capsule centered beneath the document bar and above the paper. It floats over the desk rather than consuming a full-width row.

It preserves:

- Paragraph style selection.
- Bold, italic, underline, and strikethrough.
- Alignment controls.
- Ordered and unordered lists.
- Indent and outdent.
- Link, table, divider, and clear-format actions.

Controls remain grouped with separators. Active formatting uses the shared solid accent state. The capsule may horizontally scroll at constrained widths, but controls are not removed or duplicated.

### Document Canvas

The desk area receives more open space around the sheet on large screens. The paper remains centered and uses the existing flat border-defined treatment, with no resting shadow.

The document measure should remain comfortable for long-form reading rather than expanding to fill all available width. Heading rhythm, paragraph spacing, lists, blockquotes, links, code, tables, and dividers remain visually distinct in both themes.

The animated rainbow caret is removed or reduced to the normal accent caret because continuous decorative motion conflicts with the focused-writing goal.

### Status

Word count, character count, reading time, and save state remain available but should not require a permanent full-width status bar. Word count and reading time may move into a compact status cluster associated with the lower edge of the workspace or document bar. Character count can remain in the cluster at wider breakpoints and be omitted visually on narrow screens without removing it from the DOM.

## Oaky AI Panel

### Collapsed State

Oaky is collapsed by default on desktop. A narrow right-edge accent tab remains visible and clearly labeled for mouse, touch, and keyboard users. It must not cover document text or rely on color alone.

### Open State

Activating the tab opens a narrower right-side panel. The panel preserves:

- Welcome state.
- Conversation messages.
- Selection-aware context.
- Streaming response state.
- Insert below, replace selection, and replace document actions.
- Clear conversation.
- Prompt composer and disclaimer.
- Existing quick-prompt capabilities.

Opening and closing the panel uses transform and opacity with the shared motion tokens. It must respect `prefers-reduced-motion` and the repository's webdriver motion guard where JavaScript-driven motion is introduced.

The panel uses a neutral header with an accent icon or active state rather than a large solid accent banner. Quick actions use Font Awesome mask icons or text labels, not emoji. The prompt area remains visually anchored at the bottom.

### Failure and Busy States

- While generating, the send control is disabled and the existing response indicator remains visible.
- Network failure produces a readable inline error and re-enables sending.
- Insert and replace actions appear only after a usable response exists.
- Existing destructive replacement confirmation remains.

## Responsive Behavior

### Tablet

- The document bar keeps the title, save state, overflow, and Oaky controls; secondary identity/profile details may collapse.
- The formatting capsule remains visible and can scroll horizontally.
- Opening Oaky overlays or partially covers the workspace rather than squeezing the paper below a usable measure.

### Mobile

- The document sheet becomes edge-to-edge within the workspace, with no decorative outer desk margin.
- Paper padding decreases responsively while preserving a readable text inset.
- The formatting capsule spans the available width, remains horizontally scrollable, and uses touch-friendly targets.
- Oaky opens as a full-screen panel below the universal navigation/document bar and includes an explicit close control.
- Key interactive targets are at least 44px where practical on touch layouts.
- The page must not introduce horizontal document scrolling at 320px viewport width.

## Interaction and Accessibility

- Existing keyboard shortcuts for save, print, bold, italic, and underline continue to work.
- All icon-only buttons receive accessible names and visible tooltips or titles.
- The overflow control exposes expanded state and its menu has appropriate menu semantics and keyboard dismissal.
- The Oaky toggle exposes expanded state and identifies the controlled panel.
- Formatting state remains visible through the solid accent treatment and appropriate pressed state.
- Focus indicators use the shared flat focus ring and remain visible in both themes.
- Color is not the only signal for save status, selected formatting, or panel state.
- The editor placeholder and body copy retain sufficient contrast.
- Print output contains only document content and excludes all application chrome.

## Implementation Boundaries

The implementation remains primarily in:

- `word/index.html` for semantic markup and minimal behavior changes.
- The `[data-page="word"]` section of `src/site.css` for page layout and styling.

Existing shared `.skuo`, input, menu, motion, theme, z-index, and navigation conventions must be reused. New page-level overlays use semantic z-index tokens. No framework or build step is introduced.

The current inline JavaScript can be adjusted where required for:

- Overflow menu behavior.
- Oaky toggle semantics and responsive behavior.
- Responsive status presentation.
- Updated classes and labels.

Document persistence keys and stored document records remain unchanged.

## Verification

Because the project has no page-specific automated suite, verification combines repository checks and browser inspection:

- Run `node test-z-index.mjs`.
- Confirm the page loads without console errors.
- Verify light and dark themes.
- Inspect at 320px, 768px, 1024px, and 1440px widths.
- Verify no horizontal page overflow.
- Create, edit, autosave, reload, and create a new document.
- Exercise each formatting group and active state.
- Open and keyboard-dismiss the overflow menu.
- Export HTML/text, copy HTML/text, and print.
- Open, close, and use Oaky on desktop and mobile.
- Verify AI streaming failure restores the send control.
- Verify insert below, replace selection, and replace document.
- Navigate the document bar, formatting capsule, menus, and Oaky controls by keyboard.
- Verify print preview excludes all editor chrome.

## Success Criteria

- The document is visually dominant when the page first opens.
- Formatting remains available without a full-width toolbar.
- Oaky is discoverable but does not consume desktop width until opened.
- Existing document and AI workflows continue to function.
- The UI follows the flat design, semantic z-index, and motion requirements.
- The editor remains usable without horizontal page scrolling from mobile through desktop.
