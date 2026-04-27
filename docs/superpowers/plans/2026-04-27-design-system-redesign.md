# Design System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the 67.md warm editorial design system (parchment palette, rosewood accent, ring shadows) across the entire site while preserving all JS behavior and the chat app's dynamic accent customization system.

**Architecture:** A new `src/design-tokens.css` file defines all color tokens as CSS custom properties (`:root` + `.dark` override). Every page links this file. Each page's inline Tailwind config is updated to expose token names as Tailwind utility classes. `AI/chat.html` has an existing `<style id="dynamic-accent-styles">` variable block — this is updated in-place (not replaced) so JS-driven accent customization still works; the new global tokens layer sits alongside it.

**Tech Stack:** Vanilla CSS custom properties, CDN Tailwind CSS (inline config per page), Satoshi + Century + JetBrains Mono fonts, no bundler.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/design-tokens.css` | **Create** | All color tokens, JetBrains Mono import, global body reset, `.dark` overrides |
| `index.html` | Modify | Link tokens, switch darkMode to class, replace moss/sage palette |
| `AI/index.html` | Modify | Link tokens, replace primary/secondary palette, light/dark section alternation |
| `AI/chat.html` | Modify | Update `dynamic-accent-styles` block + Tailwind config, restyle components |
| `AI/manage.html` | Modify | Link tokens, replace hardcoded white/rgba colors |
| `AI/editor.html` | Modify | Link tokens, replace palette |
| `AI/research.html` | Modify | Link tokens, replace palette |
| `AI/tos.html` | Modify | Link tokens, replace primary/secondary palette |
| `AI/privacy.html` | Modify | Link tokens, replace primary/secondary palette |
| `AI/goals.html` | Modify | Link tokens, replace primary/secondary palette |
| `AI/version.html` | Modify | Link tokens, replace primary/secondary palette |
| `Themes/Themes.html` | Modify | Link tokens (already uses compiled `src/output.css`) |

**Execution note:** Task 1 must complete first. Tasks 2–12 are independent of each other and can be parallelized.

---

## Task 1: Create `src/design-tokens.css`

**Files:**
- Create: `src/design-tokens.css`

- [ ] **Step 1: Write the token file**

Create `src/design-tokens.css` with this exact content:

```css
/* ── JetBrains Mono ─────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');

/* ── Light tokens ───────────────────────────────────────────── */
:root {
  --bg:              #f5f4ed;
  --bg-elevated:     #faf9f5;
  --bg-white:        #ffffff;
  --text-primary:    #141413;
  --text-secondary:  #5e5d59;
  --text-tertiary:   #87867f;
  --text-dark-link:  #3d3d3a;
  --accent:          #c96478;
  --accent-light:    #d97790;
  --border:          #f0eee6;
  --border-strong:   #e8e6dc;
  --shadow-ring:     #d1cfc5;
  --surface-dark:    #30302e;
  --deep-dark:       #141413;
}

/* ── Dark tokens ────────────────────────────────────────────── */
.dark {
  --bg:              #141413;
  --bg-elevated:     #30302e;
  --bg-white:        #30302e;
  --text-primary:    #faf9f5;
  --text-secondary:  #b0aea5;
  --text-tertiary:   #87867f;
  --text-dark-link:  #d1cfc5;
  --accent:          #d97790;
  --accent-light:    #c96478;
  --border:          #30302e;
  --border-strong:   #3d3d3a;
  --shadow-ring:     #3d3d3a;
  --surface-dark:    #30302e;
  --deep-dark:       #141413;
}

/* ── Global resets ──────────────────────────────────────────── */
body {
  background-color: var(--bg);
  color: var(--text-primary);
  transition: background-color 0.3s ease, color 0.3s ease;
}

code, pre, .font-mono, [class*="code"] {
  font-family: 'JetBrains Mono', monospace;
}

/* ── Scrollbar ──────────────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 10px;
}
```

- [ ] **Step 2: Verify the file exists**

Run: `ls C:/Users/okemo/Desktop/web/src/design-tokens.css`
Expected: file listed, ~50 lines

- [ ] **Step 3: Commit**

```bash
git add src/design-tokens.css
git commit -m "feat: add design token CSS variables (67.md system)"
```

---

## Task 2: Restyle `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add design-tokens.css link and update head**

In `index.html`, replace the opening `<head>` section up to and including the closing `</style>` of the font-face block with:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OkemoVail</title>
  <link rel="stylesheet" href="src/design-tokens.css">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="icon" type="image/x-icon" href="https://avatars.githubusercontent.com/u/179893130?v=4">
  <link rel="apple-touch-icon" href="https://avatars.githubusercontent.com/u/179893130?v=4">
  <script>
    (function() {
      const stored = localStorage.getItem('vail_theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (stored === 'dark' || (!stored && prefersDark)) {
        document.documentElement.classList.add('dark');
      }
    })();
  </script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            parchment:    'var(--bg)',
            ivory:        'var(--bg-elevated)',
            'text-warm':  'var(--text-primary)',
            'olive-gray': 'var(--text-secondary)',
            'stone-gray': 'var(--text-tertiary)',
            rosewood:     'var(--accent)',
            'rose-light': 'var(--accent-light)',
            'border-cream': 'var(--border)',
            'border-warm':  'var(--border-strong)',
            'ring-warm':    'var(--shadow-ring)',
            'surf-dark':    'var(--surface-dark)',
            'deep-dark':    'var(--deep-dark)',
          },
          fontFamily: {
            serif: ['Century', '"Century Schoolbook"', 'Georgia', 'serif'],
            sans:  ['Satoshi', 'Inter', 'sans-serif'],
            mono:  ['"JetBrains Mono"', 'monospace'],
          },
        }
      }
    }
  </script>
  <style>
    @font-face {
      font-family: 'Satoshi';
      src: url('Fonts/Satoshi-Variable.ttf') format('truetype');
      font-weight: 300 900;
      font-display: swap;
      font-style: normal;
    }
    @font-face {
      font-family: 'Satoshi';
      src: url('Fonts/Satoshi-VariableItalic.ttf') format('truetype');
      font-weight: 300 900;
      font-display: swap;
      font-style: italic;
    }
    .serif-text { font-family: 'Century', 'Century Schoolbook', Georgia, serif; }
    .fade-in { animation: fadeIn 1s ease-out forwards; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  </style>
</head>
```

- [ ] **Step 2: Update the nav**

Replace the `<nav>` element with:

```html
<nav class="fixed top-0 w-full z-50 bg-parchment/80 dark:bg-deep-dark/80 backdrop-blur-md border-b border-border-cream dark:border-surf-dark">
  <div class="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
    <a href="/" class="serif-text text-2xl font-medium text-rosewood tracking-tight">okemovail.</a>
    <div class="hidden md:flex space-x-10 text-sm font-medium text-olive-gray dark:text-olive-gray">
      <a href="#work" class="hover:text-text-warm dark:hover:text-text-warm transition-colors">Projects</a>
      <a href="/AI/index.html" class="hover:text-text-warm dark:hover:text-text-warm transition-colors">OkemoAI</a>
      <a href="https://github.com/ar12c" target="_blank" class="hover:text-text-warm dark:hover:text-text-warm transition-colors">GitHub</a>
    </div>
    <a href="/AI/index.html"
      class="md:hidden text-sm font-medium text-olive-gray dark:text-olive-gray hover:text-text-warm transition-all border border-border-warm dark:border-surf-dark px-5 py-2 rounded-full backdrop-blur-sm">
      OkemoAI
    </a>
  </div>
</nav>
```

- [ ] **Step 3: Update the hero section**

Replace the hero `<section>` with:

```html
<section class="py-20 md:py-32 fade-in">
  <div class="mb-10">
    <img
      src="https://avatars.githubusercontent.com/u/179893130?s=400&u=d8a0d805e4137f21f0dd19fcf5163a1c746f02fd&v=4"
      alt="OkemoVail Profile"
      class="w-24 h-24 rounded-2xl border border-border-cream dark:border-surf-dark grayscale hover:grayscale-0 transition-all duration-700 bg-ivory object-cover">
  </div>
  <h1 class="serif-text text-5xl md:text-7xl text-text-warm dark:text-text-warm mb-4">
    Hey, I'm OkemoVail
  </h1>
  <div class="mt-12 flex flex-wrap gap-4">
    <a href="#work"
      class="bg-rosewood text-ivory px-8 py-3 rounded-lg font-medium hover:opacity-90 transition-all"
      style="box-shadow: 0 0 0 1px var(--accent)">
      Explore Projects
    </a>
    <a href="https://github.com/ar12c" target="_blank"
      class="border border-border-warm dark:border-surf-dark text-text-warm dark:text-text-warm px-8 py-3 rounded-lg font-medium hover:bg-ivory dark:hover:bg-surf-dark transition-all">
      GitHub Profile
    </a>
  </div>
</section>
```

- [ ] **Step 4: Update the quote section**

Replace the blockquote `<section>` with:

```html
<section class="py-16 md:py-24 border-t border-border-cream dark:border-surf-dark italic text-center">
  <blockquote class="serif-text text-3xl md:text-4xl text-olive-gray dark:text-olive-gray max-w-2xl mx-auto leading-snug">
    "Stay Hungry, Stay Foolish"
  </blockquote>
  <cite class="block mt-4 text-xs uppercase tracking-[0.2em] font-bold text-stone-gray">— Steve Jobs</cite>
</section>
```

- [ ] **Step 5: Update the projects section**

Replace the `<section id="work">` with:

```html
<section id="work" class="py-20 border-t border-border-cream dark:border-surf-dark">
  <div class="flex items-baseline justify-between mb-12">
    <h2 class="serif-text text-4xl text-text-warm dark:text-text-warm">Projects</h2>
  </div>
  <div>
    <table class="w-full text-left border-collapse">
      <thead class="hidden md:table-header-group">
        <tr class="border-b border-border-cream dark:border-surf-dark">
          <th class="py-4 serif-text text-sm uppercase tracking-widest text-stone-gray font-medium w-1/4">Project</th>
          <th class="py-4 serif-text text-sm uppercase tracking-widest text-stone-gray font-medium">Description</th>
          <th class="py-4 serif-text text-sm uppercase tracking-widest text-stone-gray font-medium text-right">Details</th>
          <th class="py-4 serif-text text-sm uppercase tracking-widest text-stone-gray font-medium text-right">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border-cream dark:divide-surf-dark">
        <tr class="group hover:bg-ivory dark:hover:bg-surf-dark/50 transition-colors flex flex-col md:table-row py-8 md:py-0">
          <td class="md:py-8 pr-4">
            <div class="flex items-center justify-between md:block">
              <h3 class="serif-text text-2xl text-text-warm dark:text-text-warm group-hover:translate-x-1 transition-transform inline-block">Octan</h3>
              <span class="md:hidden text-[10px] uppercase tracking-widest font-bold text-stone-gray">v1.6 • 1B</span>
            </div>
          </td>
          <td class="py-4 md:py-8">
            <p class="text-olive-gray dark:text-olive-gray text-sm leading-relaxed max-w-md">
              Advanced AI model for seamless chatting and deep research integration.
            </p>
          </td>
          <td class="hidden md:table-cell py-8 text-right">
            <span class="text-[10px] uppercase tracking-widest font-bold text-stone-gray">v1.6 • 1B Parameters</span>
          </td>
          <td class="py-4 md:py-8 text-right">
            <a href="/AI/index.html"
              class="inline-block w-full md:w-auto text-center border border-border-warm dark:border-surf-dark text-text-warm dark:text-text-warm px-6 py-2 rounded-lg text-xs font-medium hover:bg-ivory dark:hover:bg-surf-dark transition-all">
              Explore
            </a>
          </td>
        </tr>
        <tr class="group opacity-60 hover:bg-ivory dark:hover:bg-surf-dark/50 transition-colors flex flex-col md:table-row py-8 md:py-0">
          <td class="md:py-8 pr-4">
            <div class="flex items-center justify-between md:block">
              <h3 class="serif-text text-2xl text-text-warm dark:text-text-warm group-hover:translate-x-1 transition-transform inline-block">OkemoAI Labs</h3>
              <span class="md:hidden text-[10px] uppercase tracking-widest font-bold text-stone-gray">Coming Soon</span>
            </div>
          </td>
          <td class="py-4 md:py-8">
            <p class="text-olive-gray dark:text-olive-gray text-sm leading-relaxed max-w-md">
              Exploring the boundaries of agentic coding and autonomous systems.
            </p>
          </td>
          <td class="hidden md:table-cell py-8 text-right">
            <span class="text-[10px] uppercase tracking-widest font-bold text-stone-gray">Coming Soon</span>
          </td>
          <td class="py-4 md:py-8 text-right">
            <span class="block md:inline-block w-full md:w-auto text-center text-xs text-stone-gray italic">
              Under Construction
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</section>
```

- [ ] **Step 6: Update the footer**

Replace the `<footer>` with:

```html
<footer class="py-12 border-t border-border-cream dark:border-surf-dark">
  <div class="flex flex-col md:flex-row justify-between items-center text-[10px] uppercase tracking-[0.2em] font-bold text-stone-gray gap-6">
    <p>2026 OKEMOVAIL.COM</p>
    <div class="flex space-x-8">
      <a href="https://github.com/ar12c" target="_blank" class="hover:text-rosewood transition-colors">Github</a>
      <a href="/AI/index.html" class="hover:text-rosewood transition-colors">OkemoAI</a>
    </div>
  </div>
</footer>
```

- [ ] **Step 7: Verify in browser**

Open `index.html` directly in a browser. Confirm:
- Background is warm parchment (`#f5f4ed`), not white
- "okemovail." logo is rosewood pink
- "Explore Projects" button is rosewood with ring shadow
- Dark mode (toggle via DevTools → add `dark` class to `<html>`) shows warm near-black background

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: apply 67.md design tokens to index.html"
```

---

## Task 3: Restyle `AI/index.html`

**Files:**
- Modify: `AI/index.html`

- [ ] **Step 1: Replace the head section**

Replace everything from `<head>` through the closing `</style>` of the font-face block with:

```html
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Oaky | Stay Curious</title>
    <link rel="icon" type="image/x-icon" href="https://avatars.githubusercontent.com/u/179893130?v=4">
    <link rel="apple-touch-icon" href="https://avatars.githubusercontent.com/u/179893130?v=4">
    <link rel="stylesheet" href="../src/design-tokens.css">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://kit.fontawesome.com/40440288c0.js" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js"></script>
    <script>
        (function() {
            const stored = localStorage.getItem('vail_theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (stored === 'dark' || (!stored && prefersDark)) {
                document.documentElement.classList.add('dark');
            }
        })();
    </script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        parchment:      'var(--bg)',
                        ivory:          'var(--bg-elevated)',
                        'text-warm':    'var(--text-primary)',
                        'olive-gray':   'var(--text-secondary)',
                        'stone-gray':   'var(--text-tertiary)',
                        rosewood:       'var(--accent)',
                        'rose-light':   'var(--accent-light)',
                        'border-cream': 'var(--border)',
                        'border-warm':  'var(--border-strong)',
                        'ring-warm':    'var(--shadow-ring)',
                        'surf-dark':    'var(--surface-dark)',
                        'deep-dark':    'var(--deep-dark)',
                    },
                    fontFamily: {
                        serif: ['Century', 'Georgia', 'serif'],
                        sans:  ['Satoshi', 'Inter', 'sans-serif'],
                        mono:  ['"JetBrains Mono"', 'monospace'],
                    }
                }
            }
        }
    </script>
    <style>
        @font-face {
            font-family: 'Satoshi';
            src: url('../Fonts/Satoshi-Variable.ttf') format('truetype');
            font-weight: 300 900;
            font-display: swap;
            font-style: normal;
        }
        @font-face {
            font-family: 'Satoshi';
            src: url('../Fonts/Satoshi-VariableItalic.ttf') format('truetype');
            font-weight: 300 900;
            font-display: swap;
            font-style: italic;
        }
    </style>
```

- [ ] **Step 2: Find and replace old palette color references**

Do a find-and-replace within `AI/index.html` for the following pairs (exact string match):

| Find | Replace |
|---|---|
| `#5F634F` | `var(--accent)` |
| `#9EB393` | `var(--accent-light)` |
| `#F9F8F6` | `var(--bg)` |
| `#1C1C1A` | `var(--bg)` |
| `#1A1A18` | `var(--text-primary)` |
| `#E8E6E1` | `var(--text-primary)` |
| `color: primary` | `color: rosewood` |
| `bg-primary` | `bg-rosewood` |
| `text-primary` (Tailwind, not CSS var) | `text-text-warm` |
| `bg-bglight` | `bg-parchment` |
| `bg-bgdark` | `bg-deep-dark` |
| `text-textlight` | `text-text-warm` |
| `text-textdark` | `text-text-warm` |
| `border-primary` | `border-border-warm` |

- [ ] **Step 3: Update dark section backgrounds**

For sections with explicit dark backgrounds (alternating section pattern), update inline styles or classes to use `style="background-color: var(--deep-dark);"` and `color: var(--text-primary)`.

- [ ] **Step 4: Update all buttons in the file**

Find every `<a>` or `<button>` CTA. Apply:
- Primary CTA: `class="... bg-rosewood text-ivory rounded-lg"` + `style="box-shadow: 0 0 0 1px var(--accent)"`
- Secondary/ghost: `class="... border border-border-warm text-text-warm rounded-lg hover:bg-ivory"`

- [ ] **Step 5: Verify in browser**

Open `AI/index.html`. Confirm:
- Warm parchment background
- Rosewood accent on CTAs and brand elements
- Dark sections show near-black (`#141413`) background
- No lingering olive-green colors

- [ ] **Step 6: Commit**

```bash
git add AI/index.html
git commit -m "feat: apply 67.md design tokens to AI/index.html"
```

---

## Task 4: Update `AI/chat.html` — tokens & Tailwind config

**Files:**
- Modify: `AI/chat.html` (head section only)

- [ ] **Step 1: Add design-tokens.css link**

In `AI/chat.html`, after the KaTeX stylesheet link (line ~14), add:

```html
<link rel="stylesheet" href="../src/design-tokens.css">
```

- [ ] **Step 2: Replace the `dynamic-accent-styles` block**

Find `<style id="dynamic-accent-styles">` and replace the entire block (from opening `<style>` to closing `</style>`) with:

```html
<style id="dynamic-accent-styles">
    :root {
        /* Dynamic accent — updated by settings.js */
        --accent-color:   #c96478;
        --accent-glow:    rgba(201, 100, 120, 0.4);
        --accent-tint:    rgba(0, 0, 0, 0);
        --sidebar-tint:   rgba(0, 0, 0, 0);
        --accent-contrast: #faf9f5;

        /* Background system */
        --bg-color:               var(--bg);
        --sidebar-bg:             var(--bg-elevated);
        --input-bg:               var(--bg-elevated);
        --bg-elevated-secondary:  var(--bg-elevated);
        --fade-color:             var(--bg);
        --fade-gradient-stop:     var(--bg);

        /* Text & actions */
        --action-btn-color:  var(--text-secondary);
        --thinking-accent:   color-mix(in srgb, var(--accent-color), black 20%);
        --thinking-side:     var(--border-strong);

        /* Layout */
        --sidebar-width:                    260px;
        --sidebar-rail-width:               60px;
        --header-height:                    56px;
        --sidebar-section-first-margin-top: 8px;
    }

    .dark {
        --accent-color:   #d97790;
        --accent-glow:    rgba(217, 119, 144, 0.4);
        --accent-contrast: #141413;

        /* bg-color, sidebar-bg, etc. already handled by design-tokens.css .dark block */
        --thinking-accent: color-mix(in srgb, var(--accent-color), white 35%);
        --thinking-side:   var(--border-strong);
    }
</style>
```

- [ ] **Step 3: Update the inline Tailwind config**

Find the `tailwind.config = {` block in `AI/chat.html` and add/update the `colors` section:

```js
tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                parchment:      'var(--bg)',
                ivory:          'var(--bg-elevated)',
                'text-warm':    'var(--text-primary)',
                'olive-gray':   'var(--text-secondary)',
                'stone-gray':   'var(--text-tertiary)',
                rosewood:       'var(--accent)',
                'rose-light':   'var(--accent-light)',
                'border-cream': 'var(--border)',
                'border-warm':  'var(--border-strong)',
                'ring-warm':    'var(--shadow-ring)',
                'surf-dark':    'var(--surface-dark)',
                'deep-dark':    'var(--deep-dark)',
                accent:         'var(--accent-color)',
                'accent-glow':  'var(--accent-glow)',
            },
            fontFamily: {
                serif: ['Century', 'Georgia', 'serif'],
                sans:  ['Satoshi', 'Inter', 'sans-serif'],
                mono:  ['"JetBrains Mono"', 'monospace'],
            },
        }
    }
}
```

- [ ] **Step 4: Verify chat.html loads without JS errors**

Open `AI/chat.html` in browser. Open DevTools console. Confirm: no errors, page loads, chat input is visible.

- [ ] **Step 5: Commit**

```bash
git add AI/chat.html
git commit -m "feat: wire design-tokens.css into chat.html, update accent to rosewood"
```

---

## Task 5: Restyle `AI/chat.html` — sidebar & navigation

**Files:**
- Modify: `AI/chat.html` (sidebar HTML + related inline styles)

- [ ] **Step 1: Update sidebar background styles**

Find inline `style` attributes or classes setting sidebar background colors. Replace hardcoded hex values with CSS variables:

| Find (in style attributes or inline CSS) | Replace |
|---|---|
| `background: #0C0D0B` | `background: var(--bg)` |
| `background: #111210` | `background: var(--bg-elevated)` |
| `background-color: #0C0D0B` | `background-color: var(--bg)` |
| `background-color: #F9F9F7` | `background-color: var(--bg)` |
| `background-color: #F2F2F0` | `background-color: var(--bg-elevated)` |
| `color: #7abf6c` | `color: var(--accent-color)` |
| `border-color: rgba(255,255,255,0.1)` (sidebar borders) | `border-color: var(--border)` |
| `border-color: rgba(0,0,0,0.05)` (sidebar borders) | `border-color: var(--border)` |

- [ ] **Step 2: Update sidebar chat item hover/active states**

Find the chat list item styles (`.chat-item`, `.sidebar-item`, or equivalent classes in inline `<style>` blocks). Update:

```css
/* Replace any hardcoded green accent on active items */
.chat-item.active, .sidebar-item.active {
    background-color: var(--bg-elevated);
    border: 1px solid var(--border-strong);
}
.chat-item:hover, .sidebar-item:hover {
    background-color: var(--bg-elevated);
}
```

- [ ] **Step 3: Update the top navigation bar**

Find the main `<header>` or top nav element. Update:
- Background: `var(--bg)` or `var(--bg-elevated)`
- Border-bottom: `1px solid var(--border)`
- Icon/button colors: `var(--text-secondary)`
- Brand/logo accent: `var(--accent-color)`

- [ ] **Step 4: Update "New Chat" button**

Find the new chat / compose button. Apply primary button pattern:
- `background-color: var(--accent-color)`
- `color: var(--accent-contrast)`
- `border-radius: 8px`
- `box-shadow: 0 0 0 1px var(--accent-color)`

- [ ] **Step 5: Verify sidebar visually**

Open `AI/chat.html`. Confirm:
- Sidebar background is parchment/ivory (light) or near-black (dark)
- Active chat item has ivory background with warm border
- New chat button is rosewood

- [ ] **Step 6: Commit**

```bash
git add AI/chat.html
git commit -m "feat: restyle chat.html sidebar to 67.md tokens"
```

---

## Task 6: Restyle `AI/chat.html` — message list & input bar

**Files:**
- Modify: `AI/chat.html`

- [ ] **Step 1: Update message bubble styles**

Find inline styles or CSS classes for user and assistant message bubbles. Apply:

**User bubbles** — find `.user-message`, `.user-bubble`, or equivalent:
```css
background-color: var(--bg-elevated);
border: 1px solid var(--border-strong);
border-radius: 12px;
box-shadow: 0 0 0 1px var(--shadow-ring);
color: var(--text-primary);
```

**Assistant bubbles** — find `.assistant-message`, `.bot-message`, or equivalent:
```css
background-color: transparent;
color: var(--text-primary);
/* No border — open layout */
```

- [ ] **Step 2: Update thought block styles**

Find `.thought-container`, `.think-block`, or equivalent (where `<think>` content renders). Apply:
```css
border-left: 2px solid var(--border-strong);
color: var(--text-tertiary);
background-color: transparent;
padding-left: 12px;
```

The thought header/toggle button:
```css
color: var(--text-tertiary);
font-size: 12px;
letter-spacing: 0.12px;
```

- [ ] **Step 3: Update code block styles**

Find `pre`, `code`, or `.code-block` styles. Apply:
```css
background-color: var(--surface-dark);
color: #faf9f5;
font-family: 'JetBrains Mono', monospace;
border-radius: 8px;
```
Note: Code blocks intentionally use dark surface even in light mode — this is per 67.md.

- [ ] **Step 4: Update the input bar**

Find the chat input container (textarea wrapper / `.input-bar` / `#input-container` or equivalent). Apply:
```css
background-color: var(--bg-elevated);
border: 1px solid var(--border-strong);
border-radius: 16px;
```

The textarea itself:
```css
background-color: transparent;
color: var(--text-primary);
```

The send button:
- Active (has text): `background-color: var(--accent-color)`, `color: var(--accent-contrast)`, `border-radius: 8px`
- Inactive (empty): secondary button style — `background-color: var(--border-strong)`, `color: var(--text-secondary)`

- [ ] **Step 5: Update web search & thinking toggle buttons**

Find the toolbar buttons (web search toggle, thinking toggle). Apply secondary button pattern:
```css
background-color: var(--border-strong);
color: var(--text-secondary);
border-radius: 8px;
box-shadow: 0 0 0 1px var(--shadow-ring);
```
Active state:
```css
background-color: var(--accent-color);
color: var(--accent-contrast);
box-shadow: 0 0 0 1px var(--accent-color);
```

- [ ] **Step 6: Verify message list & input**

Open `AI/chat.html`, send a test message. Confirm:
- User messages: ivory background with warm ring border
- Assistant messages: no background, warm text
- Thought blocks: left-border only, stone-gray text
- Code blocks: dark surface background, JetBrains Mono
- Input bar: ivory background, warm border, rosewood send button

- [ ] **Step 7: Commit**

```bash
git add AI/chat.html
git commit -m "feat: restyle chat message list, thought blocks, and input bar"
```

---

## Task 7: Restyle `AI/chat.html` — modals & settings panel

**Files:**
- Modify: `AI/chat.html`

- [ ] **Step 1: Update modal container styles**

Find modal wrappers (`.modal`, `#settings-modal`, `#profile-modal`, or equivalent overlay elements). Apply:
```css
/* Overlay */
background-color: rgba(20, 20, 19, 0.6);

/* Modal panel */
background-color: var(--bg-elevated);
border: 1px solid var(--border);
border-radius: 16px;
box-shadow: rgba(0,0,0,0.05) 0px 4px 24px;
```

- [ ] **Step 2: Update settings panel inputs and controls**

Find `<input>`, `<select>`, `<textarea>` inside settings panels. Apply:
```css
background-color: var(--bg);
border: 1px solid var(--border-strong);
border-radius: 8px;
color: var(--text-primary);
padding: 8px 12px;
```
Focus ring:
```css
outline: 2px solid #3898ec;
outline-offset: 1px;
```

- [ ] **Step 3: Update settings section labels and text**

Find label elements inside settings. Apply:
- Section labels: `color: var(--text-tertiary); font-size: 12px; letter-spacing: 0.12px; text-transform: uppercase;`
- Values/descriptions: `color: var(--text-secondary);`
- Headings: `color: var(--text-primary); font-weight: 500;`

- [ ] **Step 4: Update accent color picker in settings**

The accent color picker in settings updates `--accent-color` via JS — do NOT change this behavior. Only update the surrounding UI:
- Picker container: `background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px;`
- Active swatch ring: `box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent-color);`

- [ ] **Step 5: Update profile modal**

Find the profile/onboarding modal. Apply same modal container styles from Step 1. Update:
- Avatar upload area: `border: 2px dashed var(--border-strong); border-radius: 12px; background: var(--bg);`
- Save/update button: primary rosewood pattern

- [ ] **Step 6: Verify modals**

Open `AI/chat.html`. Open Settings panel (and Profile modal if accessible). Confirm:
- Modal backdrop is dark semi-transparent warm overlay
- Panel background is ivory/elevated surface
- Inputs have warm border, focus ring is blue (accessibility)
- Accent picker ring uses current accent color

- [ ] **Step 7: Commit**

```bash
git add AI/chat.html
git commit -m "feat: restyle chat.html modals and settings panel"
```

---

## Task 8: Restyle `AI/manage.html`

**Files:**
- Modify: `AI/manage.html`

- [ ] **Step 1: Add design-tokens.css link and update inline styles**

After the existing `<script src="https://cdn.tailwindcss.com">` tag, add:
```html
<link rel="stylesheet" href="../src/design-tokens.css">
```

Then add this Tailwind config block before the closing `</head>`:
```html
<script>
    tailwind.config = {
        darkMode: 'class',
        theme: {
            extend: {
                colors: {
                    parchment:      'var(--bg)',
                    ivory:          'var(--bg-elevated)',
                    'text-warm':    'var(--text-primary)',
                    'olive-gray':   'var(--text-secondary)',
                    'stone-gray':   'var(--text-tertiary)',
                    rosewood:       'var(--accent)',
                    'border-cream': 'var(--border)',
                    'border-warm':  'var(--border-strong)',
                    'surf-dark':    'var(--surface-dark)',
                    'deep-dark':    'var(--deep-dark)',
                },
                fontFamily: {
                    sans: ['Satoshi', 'Inter', 'sans-serif'],
                    mono: ['"JetBrains Mono"', 'monospace'],
                }
            }
        }
    }
</script>
```

- [ ] **Step 2: Replace hardcoded colors in inline `<style>` block**

In the `<style>` block, replace:

| Find | Replace |
|---|---|
| `background: rgba(255, 255, 255, 0.7)` (header-island light) | `background: color-mix(in srgb, var(--bg-elevated) 85%, transparent)` |
| `background: rgba(0, 0, 0, 0.5)` (header-island dark) | `background: color-mix(in srgb, var(--bg-elevated) 85%, transparent)` |
| `border-color: rgba(255, 255, 255, 0.1)` | `border-color: var(--border)` |
| `border: 1px solid rgba(0, 0, 0, 0.05)` (manage-card) | `border: 1px solid var(--border)` |
| `background: white` (manage-card) | `background: var(--bg-elevated)` |

- [ ] **Step 3: Update Tailwind color classes in HTML**

Do a find-and-replace in the HTML body:
- `bg-white` → `bg-ivory`
- `text-gray-*` → use `text-olive-gray` (secondary) or `text-stone-gray` (tertiary) based on context
- `border-gray-*` → `border-border-cream` or `border-border-warm`
- Any green/olive accent classes → `rosewood` equivalents

- [ ] **Step 4: Verify in browser**

Open `AI/manage.html`. Confirm:
- Background is parchment
- Cards are ivory with warm cream border
- No white/rgba white backgrounds remaining

- [ ] **Step 5: Commit**

```bash
git add AI/manage.html
git commit -m "feat: apply design tokens to manage.html"
```

---

## Task 9: Restyle `AI/editor.html`

**Files:**
- Modify: `AI/editor.html`

- [ ] **Step 1: Add design-tokens.css link + Tailwind config**

After the Tailwind CDN script tag, insert:
```html
<link rel="stylesheet" href="../src/design-tokens.css">
<script>
    tailwind.config = {
        darkMode: 'class',
        theme: {
            extend: {
                colors: {
                    parchment:      'var(--bg)',
                    ivory:          'var(--bg-elevated)',
                    'text-warm':    'var(--text-primary)',
                    'olive-gray':   'var(--text-secondary)',
                    'stone-gray':   'var(--text-tertiary)',
                    rosewood:       'var(--accent)',
                    'border-cream': 'var(--border)',
                    'border-warm':  'var(--border-strong)',
                    'surf-dark':    'var(--surface-dark)',
                    'deep-dark':    'var(--deep-dark)',
                },
                fontFamily: {
                    serif: ['Century', 'Georgia', 'serif'],
                    sans:  ['Satoshi', 'Inter', 'sans-serif'],
                    mono:  ['"JetBrains Mono"', 'monospace'],
                }
            }
        }
    }
</script>
```

- [ ] **Step 2: Replace palette references**

Do find-and-replace throughout `AI/editor.html`:

| Find | Replace |
|---|---|
| `#5F634F` | `var(--accent)` |
| `#9EB393` | `var(--accent-light)` |
| `#F9F8F6` or `#F9F9F7` | `var(--bg)` |
| `#1C1C1A` or `#0C0D0B` | `var(--deep-dark)` |
| `bg-primary` | `bg-rosewood` |
| `text-primary` (Tailwind class) | `text-text-warm` |
| `bg-bglight` | `bg-parchment` |
| `bg-bgdark` | `bg-deep-dark` |
| `border-primary` | `border-border-warm` |

- [ ] **Step 3: Update editor textarea / content area**

Find the main editor textarea or contenteditable div. Apply:
```css
background-color: var(--bg-elevated);
border: 1px solid var(--border-strong);
border-radius: 8px;
color: var(--text-primary);
font-family: 'Satoshi', 'Inter', sans-serif;
line-height: 1.60;
```

- [ ] **Step 4: Verify in browser**

Open `AI/editor.html`. Confirm parchment background, rosewood accents, warm borders on editor area.

- [ ] **Step 5: Commit**

```bash
git add AI/editor.html
git commit -m "feat: apply design tokens to editor.html"
```

---

## Task 10: Restyle `AI/research.html`

**Files:**
- Modify: `AI/research.html`

- [ ] **Step 1: Add design-tokens.css link + Tailwind config**

Same pattern as Task 9 Step 1 — insert after Tailwind CDN:
```html
<link rel="stylesheet" href="../src/design-tokens.css">
<script>
    tailwind.config = {
        darkMode: 'class',
        theme: {
            extend: {
                colors: {
                    parchment:      'var(--bg)',
                    ivory:          'var(--bg-elevated)',
                    'text-warm':    'var(--text-primary)',
                    'olive-gray':   'var(--text-secondary)',
                    'stone-gray':   'var(--text-tertiary)',
                    rosewood:       'var(--accent)',
                    'border-cream': 'var(--border)',
                    'border-warm':  'var(--border-strong)',
                    'surf-dark':    'var(--surface-dark)',
                    'deep-dark':    'var(--deep-dark)',
                },
                fontFamily: {
                    serif: ['Century', 'Georgia', 'serif'],
                    sans:  ['Satoshi', 'Inter', 'sans-serif'],
                    mono:  ['"JetBrains Mono"', 'monospace'],
                }
            }
        }
    }
</script>
```

- [ ] **Step 2: Replace palette references**

Same find-and-replace as Task 9 Step 2.

- [ ] **Step 3: Update search input**

Find the research query input. Apply:
```css
background-color: var(--bg-elevated);
border: 1px solid var(--border-strong);
border-radius: 12px;
color: var(--text-primary);
padding: 8px 12px;
```

- [ ] **Step 4: Update result cards**

Find research result card elements. Apply:
```css
background-color: var(--bg-elevated);
border: 1px solid var(--border);
border-radius: 8px;
box-shadow: rgba(0,0,0,0.05) 0px 4px 24px;
```

- [ ] **Step 5: Verify in browser**

Open `AI/research.html`. Confirm parchment background, ivory cards, rosewood accents.

- [ ] **Step 6: Commit**

```bash
git add AI/research.html
git commit -m "feat: apply design tokens to research.html"
```

---

## Task 11: Restyle static info pages

**Files:**
- Modify: `AI/tos.html`, `AI/privacy.html`, `AI/goals.html`, `AI/version.html`

All four pages use the same old olive palette and Tailwind config. Apply the same changes to each.

- [ ] **Step 1: Update `AI/tos.html` head**

After the Tailwind CDN script tag, insert:
```html
<link rel="stylesheet" href="../src/design-tokens.css">
<script>
    tailwind.config = {
        darkMode: 'class',
        theme: {
            extend: {
                colors: {
                    parchment:      'var(--bg)',
                    ivory:          'var(--bg-elevated)',
                    'text-warm':    'var(--text-primary)',
                    'olive-gray':   'var(--text-secondary)',
                    'stone-gray':   'var(--text-tertiary)',
                    rosewood:       'var(--accent)',
                    'border-cream': 'var(--border)',
                    'border-warm':  'var(--border-strong)',
                    'surf-dark':    'var(--surface-dark)',
                    'deep-dark':    'var(--deep-dark)',
                },
                fontFamily: {
                    serif: ['Century', 'Georgia', 'serif'],
                    sans:  ['Satoshi', 'Inter', 'sans-serif'],
                }
            }
        }
    }
</script>
```

Also remove `class="dark"` from the `<html>` tag — dark mode is now driven by the init script. Add the dark mode init script in `<head>`:
```html
<script>
    (function() {
        const stored = localStorage.getItem('vail_theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (stored === 'dark' || (!stored && prefersDark)) {
            document.documentElement.classList.add('dark');
        }
    })();
</script>
```

Do the find-and-replace from Task 9 Step 2 on `tos.html`.

- [ ] **Step 2: Repeat for `AI/privacy.html`**

Apply exact same head changes and find-and-replace as Step 1.

- [ ] **Step 3: Repeat for `AI/goals.html`**

Apply exact same head changes and find-and-replace as Step 1.

- [ ] **Step 4: Repeat for `AI/version.html`**

Apply exact same head changes and find-and-replace as Step 1.

- [ ] **Step 5: Verify all four pages in browser**

Open each page. Confirm parchment background replaces white/gray backgrounds, no olive-green accents remain.

- [ ] **Step 6: Commit**

```bash
git add AI/tos.html AI/privacy.html AI/goals.html AI/version.html
git commit -m "feat: apply design tokens to static info pages"
```

---

## Task 12: Update `Themes/Themes.html`

**Files:**
- Modify: `Themes/Themes.html`

- [ ] **Step 1: Add design-tokens.css link**

`Themes/Themes.html` already links `/src/output.css` (compiled Tailwind). After that link, add:
```html
<link rel="stylesheet" href="/src/design-tokens.css">
```

- [ ] **Step 2: Add dark mode init script**

Add the standard dark mode init in `<head>`:
```html
<script>
    (function() {
        const stored = localStorage.getItem('vail_theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (stored === 'dark' || (!stored && prefersDark)) {
            document.documentElement.classList.add('dark');
        }
    })();
</script>
```

- [ ] **Step 3: Replace any hardcoded hex colors**

Scan `Themes/Themes.html` for any hardcoded color values (hex or named). Replace with nearest CSS variable. Common pattern: `background: #fff` → `background: var(--bg-elevated)`.

- [ ] **Step 4: Verify in browser**

Open `Themes/Themes.html`. Confirm the page background respects parchment token, no white flash or mismatched colors.

- [ ] **Step 5: Commit**

```bash
git add Themes/Themes.html
git commit -m "feat: apply design tokens to Themes.html"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Token foundation ✓, typography ✓, buttons ✓, cards ✓, chat UI ✓, all pages listed ✓, dark mode ✓, whitename.html skipped ✓
- [x] **No placeholders:** All steps have concrete code or find-replace tables
- [x] **Type consistency:** `var(--bg)`, `var(--bg-elevated)`, `var(--accent)`, `var(--text-primary/secondary/tertiary)`, `var(--border)`, `var(--border-strong)`, `var(--shadow-ring)`, `var(--surface-dark)`, `var(--deep-dark)` used consistently across all tasks
- [x] **chat.html accent system preserved:** Dynamic `--accent-color` kept, settings.js accent picker still works, defaulted to rosewood
- [x] **JetBrains Mono:** Already loaded in chat.html (existing Google Fonts link); imported via `@import` in design-tokens.css for all other pages
- [x] **Dark mode init script:** Consistent pattern used across all pages that don't already have theme.js
