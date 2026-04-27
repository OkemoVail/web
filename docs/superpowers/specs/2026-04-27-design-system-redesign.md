# Design System Redesign Spec
**Date:** 2026-04-27  
**Source:** `67.md` (Claude/Anthropic-inspired design system)  
**Scope:** Full site — all HTML pages + chat UI

---

## Goal

Apply the 67.md warm editorial design system across the entire site while preserving all existing functionality. No JS behavior changes. CSS and markup only.

---

## Decisions

| Question | Decision |
|---|---|
| Serif font | Keep **Century / Century Schoolbook** (current) |
| Dark mode | Keep full dark mode, rethemed with warm dark palette |
| Scope | Everything — including `AI/chat.html` |
| Accent color | Full **Rosewood** (`#c96478`) replacing moss/sage |

---

## 1. Token Architecture

### New file: `src/design-tokens.css`

Single CSS file linked by every page. Defines all color tokens as custom properties plus font-face declarations. All pages add:

```html
<link rel="stylesheet" href="/src/design-tokens.css">
```

(Relative path adjusted per page depth: `../src/design-tokens.css` for pages in `AI/`.)

### Token definitions

```css
:root {
  --bg:             #f5f4ed;  /* Parchment */
  --bg-elevated:    #faf9f5;  /* Ivory */
  --bg-white:       #ffffff;
  --text-primary:   #141413;  /* Anthropic Near Black */
  --text-secondary: #5e5d59;  /* Olive Gray */
  --text-tertiary:  #87867f;  /* Stone Gray */
  --text-dark-link: #3d3d3a;
  --accent:         #c96478;  /* Rosewood Brand */
  --accent-light:   #d97790;  /* Rose Accent */
  --border:         #f0eee6;  /* Border Cream */
  --border-strong:  #e8e6dc;  /* Border Warm */
  --shadow-ring:    #d1cfc5;
  --surface-dark:   #30302e;
  --deep-dark:      #141413;
}

.dark {
  --bg:             #141413;
  --bg-elevated:    #30302e;
  --text-primary:   #faf9f5;
  --text-secondary: #b0aea5;  /* Warm Silver */
  --text-tertiary:  #87867f;
  --accent:         #d97790;  /* Rose Accent on dark */
  --accent-light:   #c96478;
  --border:         #30302e;
  --border-strong:  #3d3d3a;
  --shadow-ring:    #3d3d3a;
}
```

### JetBrains Mono

Loaded via Google Fonts CDN in `design-tokens.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
```

Applied to all `<code>`, `<pre>`, `.code-*` elements site-wide.

---

## 2. Typography

| Role | Font | Size | Weight | Line-height |
|---|---|---|---|---|
| Display / Hero | Century serif | 64px | 500 | 1.10 |
| Section heading | Century serif | 52px | 500 | 1.20 |
| Sub-heading | Century serif | 32–36px | 500 | 1.30 |
| Feature title | Century serif | 20–25px | 500 | 1.20 |
| Body large | Satoshi | 20px | 400 | 1.60 |
| Body standard | Satoshi | 16–17px | 400–500 | 1.60 |
| Body small / caption | Satoshi | 14–15px | 400 | 1.43 |
| Label / overline | Satoshi | 10–12px | 400–500 | 1.60 |
| Code | JetBrains Mono | 15px | 400 | 1.60 |

**Rules:**
- All serif headings use weight 500 only — no bold
- Body line-height minimum 1.60
- Labels ≤12px get letter-spacing 0.12px+

---

## 3. Component Patterns

### Buttons

**Primary (Rosewood)**
```
background: var(--accent)
color: #faf9f5
border-radius: 8px
padding: 8px 16px
box-shadow: 0 0 0 1px var(--accent)
```

**Secondary (Sand)**
```
background: var(--border-strong)
color: var(--text-primary)
border-radius: 8px
padding: 0px 12px 0px 8px
box-shadow: 0 0 0 1px var(--shadow-ring)
```

**Ghost / Outline**
```
background: transparent
border: 1px solid var(--border-strong)
color: var(--text-primary)
border-radius: 8px
```

**Dark Primary** (for dark surfaces)
```
background: var(--deep-dark)
color: var(--text-secondary)
border: 1px solid var(--surface-dark)
border-radius: 12px
padding: 9.6px 16.8px
```

### Cards & Containers
```
background: var(--bg-elevated)
border: 1px solid var(--border)
border-radius: 8px (standard) / 16px (featured) / 32px (hero)
box-shadow: rgba(0,0,0,0.05) 0px 4px 24px  /* elevated only */
```

### Inputs / Forms
```
background: var(--bg-elevated)
border: 1px solid var(--border-strong)
border-radius: 12px
padding: 8px 12px
color: var(--text-primary)
focus: outline 2px solid #3898ec  /* only cool color — accessibility */
```

### Navigation
```
background: var(--bg) at 80% opacity with backdrop-blur
border-bottom: 1px solid var(--border)
links: var(--text-secondary) → var(--text-primary) on hover
CTA: Primary (Rosewood) button
```

---

## 4. Chat UI Specifics (`AI/chat.html`)

- **Sidebar**: `var(--bg-elevated)` background, `var(--border)` right border
- **User message bubbles**: `var(--bg-elevated)`, ring shadow `0 0 0 1px var(--border-strong)`, `12px` radius
- **Assistant message**: no background card — open layout, `var(--text-primary)` text
- **Thought blocks**: left border `2px solid var(--border-strong)`, `var(--text-tertiary)` text, collapsible
- **Input bar**: `var(--bg-elevated)`, `1px solid var(--border-strong)`, `16px` radius
- **Send button**: Rosewood primary when active, secondary style when empty
- **Modals / settings panel**: `var(--bg-elevated)` surface, `var(--border)` borders, ring shadows on interactive elements
- **Code blocks**: `var(--surface-dark)` background (light mode too — dark code block is intentional contrast), JetBrains Mono

---

## 5. Per-Page Change Summary

### `src/design-tokens.css` *(new)*
- All token definitions (Section 1)
- JetBrains Mono import
- Global resets: `body { background: var(--bg); color: var(--text-primary); }`
- `.dark` override block

### `index.html` (portfolio landing)
- Link `src/design-tokens.css`
- Switch `darkMode: 'media'` → `'class'` in inline Tailwind config
- Add dark mode init script (read `localStorage` → `prefers-color-scheme` fallback)
- Replace `moss/sage/paper/obsidian` with token variables throughout
- Update nav, hero buttons, projects table, footer to component patterns
- Fix footer link: `/ai.html` → `/AI/index.html`

### `AI/index.html` (Oaky landing)
- Link `../src/design-tokens.css`
- Replace `primary/secondary/bglight/bgdark` with token variables
- Apply light/dark section alternation (dark sections use `--deep-dark` / `--surface-dark` directly)
- Update all buttons, cards, nav to component patterns

### `AI/chat.html` (chat UI)
- Link `../src/design-tokens.css`
- Update inline Tailwind config palette to token names
- Restyle sidebar, message list, input bar, thought blocks, settings panel, modals
- Preserve all JS — class name changes only where needed

### `AI/manage.html`, `AI/editor.html`, `AI/research.html`
- Link `../src/design-tokens.css`
- Swap palette references to token variables
- Apply button/card/typography patterns
- No structural or JS changes

### `AI/tos.html`, `AI/privacy.html`, `AI/goals.html`, `AI/version.html`
- Link `../src/design-tokens.css`
- Replace old `primary/secondary/bglight/bgdark` Tailwind config with token variables
- Apply button/typography patterns; no structural changes

### `Themes/Themes.html`
- Link `/src/design-tokens.css`
- Already uses compiled `src/output.css` — token variable updates propagate automatically via the build
- Update any hardcoded color values to token variables

### `whitename.html`
- **Skip** — Discord video embedder with no UI styling

---

## 6. Dark Mode Unification

All pages switch to class-based `.dark` on `<html>`. Consistent init pattern:

```js
(function() {
  const stored = localStorage.getItem('vail_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (stored === 'dark' || (!stored && prefersDark)) {
    document.documentElement.classList.add('dark');
  }
})();
```

`index.html` gets this script added. `AI/chat.html` already has `theme.js` handling this — no change needed.

---

## 7. What Does NOT Change

- All JavaScript behavior and logic
- HTML structure and element hierarchy
- Class names that JS depends on (checked before removal)
- Font loading for Satoshi (already in place on most pages)
- CDN dependencies (marked, KaTeX, feather-icons, anime.js, Google GSI, Font Awesome)
- Build command: `npx @tailwindcss/cli -i src/input.css -o src/output.css --watch`
