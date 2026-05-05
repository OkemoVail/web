# Chat Dark Mode Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Darken the dark mode background in `AI/chat.html` by overriding `--bg-elevated` to `#1e1e1c` inside the existing `.dark` block.

**Architecture:** One CSS variable override in `chat.html`'s inline `<style id="dynamic-accent-styles">` `.dark` block. All `var(--bg-elevated)` surfaces (main chat area, sidebar, modals) update automatically. No changes to `src/design-tokens.css` or any other file.

**Tech Stack:** Vanilla CSS custom properties, no build step needed.

---

### Task 1: Override --bg-elevated in chat.html's .dark block

**Files:**
- Modify: `AI/chat.html` (`.dark` block inside `<style id="dynamic-accent-styles">`, around line 73–86)

- [ ] **Step 1: Locate the `.dark` block**

In `AI/chat.html`, find `<style id="dynamic-accent-styles">`. The `.dark` block looks like:

```css
.dark {
    --accent-color:    #d97790;
    --accent-glow:     rgba(217, 119, 144, 0.4);
    --accent-contrast: #141413;

    /* dark mode keeps chat bg + sidebar pinned to the same rosewood — no shift */
    --bg-color:           #c96478;
    --sidebar-bg:         #c96478;
    --fade-color:         #c96478;
    --fade-gradient-stop: #c96478;
    --thinking-accent:    color-mix(in srgb, var(--accent-color), white 35%);
    --thinking-side:      var(--border-strong);
}
```

- [ ] **Step 2: Add the --bg-elevated override**

Add `--bg-elevated: #1e1e1c;` after `--accent-contrast`:

```css
.dark {
    --accent-color:    #d97790;
    --accent-glow:     rgba(217, 119, 144, 0.4);
    --accent-contrast: #141413;
    --bg-elevated:     #1e1e1c;

    /* dark mode keeps chat bg + sidebar pinned to the same rosewood — no shift */
    --bg-color:           #c96478;
    --sidebar-bg:         #c96478;
    --fade-color:         #c96478;
    --fade-gradient-stop: #c96478;
    --thinking-accent:    color-mix(in srgb, var(--accent-color), white 35%);
    --thinking-side:      var(--border-strong);
}
```

- [ ] **Step 3: Verify in browser**

Open `AI/chat.html` in a browser, switch to dark mode. The main chat area and sidebar should appear noticeably darker (warm near-black `#1e1e1c` instead of `#30302e`). Light mode should be unchanged.
