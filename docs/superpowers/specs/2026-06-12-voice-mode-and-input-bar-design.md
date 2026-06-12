# Voice Mode + Input Bar Redesign — Design

**Date:** 2026-06-12
**Project:** `web` (Oaky AI chat frontend — vanilla JS, no framework, Tailwind via CLI)
**Status:** Approved design, ready for implementation plan

## Overview

Two independent UI changes to `AI/chat.html` and its JS modules:

1. **ChatGPT-style Voice Mode** — restyle the existing voice overlay into a full-black experience with a left rail showing only the orb logo, a large centered pulsing orb, status word, live transcript, and mute/end controls.
2. **Grok-style Input Bar** — restyle the main composer into a single-row pill with circular ends, a `+` button, a Fast/Thinking mode pill (replacing the existing Think button), and a circular up-arrow send button. Theme-aware.

These are presentation-layer changes. No backend, storage, or streaming logic changes. The voice record→transcribe→speak loop in `voice.js` is reused untouched.

---

## Feature 1 — ChatGPT-style Voice Mode

### Current state

- Entry point: `window.VoiceMode.start()` (in `AI/js/voice.js`); the full record→transcribe→speak loop already works.
- Markup: `#voice-overlay` at `chat.html` ~line 4799 — a `position:fixed; inset:0; z-index:200` dark overlay containing `#voice-orb`, `#voice-state`, `#voice-transcript`, and `#voice-mute` / `#voice-end` controls.
- CSS: `chat.html` ~line 2873 (`#voice-overlay`, `#voice-orb`, `.voice-ctrl`, `voice-pulse` keyframes).

### Target look (Variant B — orb + live transcript)

```
┌──────┬─────────────────────────────────────────┐
│      │                                          │
│ ◯    │                  ◯◯◯                     │   ← large pulsing blue orb
│ Voice│                  ◯◯◯                     │
│      │               Speaking…                  │   ← status word
│      │   "…live transcript caption text…"       │   ← user speech + reply
│      │                                          │
│      │              🎤      ✕                    │   ← mute / end controls
└──────┴─────────────────────────────────────────┘
  black     black, centered content
```

- Whole overlay background is near-black (keep existing `rgba(10,10,12,~0.95)` / solid black).
- **Left rail:** a thin (~60px) black column flush-left inside the overlay. At the top, in the same vertical position as the real sidebar logo, render the blue orb glyph with a small "Voice" label beneath it. This recreates the "sidebar shrunk to black, logo stays" look without touching the real sidebar.
- **Main region:** the existing `#voice-orb` (large, pulsing, blue radial-gradient) centered, with `#voice-state` (status word) and `#voice-transcript` (caption) below it.
- **Controls:** existing mute (`#voice-mute`) and end (`#voice-end`) buttons, pinned near the bottom-center.

### Implementation approach (chosen)

Restyle and reorganize the existing `#voice-overlay` markup + CSS only. Add the left orb-logo rail as a child of the overlay. Keep all element IDs so `voice.js`'s `cache()` and `setState`/`setTranscript` continue to work.

- The orb itself can reuse the existing `#voice-orb` styles (blue radial gradient, `voice-pulse` animation, faster pulse on `.speaking`).
- **Transcript behavior:** `voice.js` already calls `setTranscript(text)` with the user's transcribed utterance (line ~101). Extend the loop so the caption also reflects the assistant reply during the "Speaking…" phase (show the spoken reply text). The display swaps: user utterance while thinking, reply while speaking.

*Rejected alternative:* a `body.voice-active` class transforming the real sidebar/main layout — more invasive and more failure modes. The self-contained overlay is preferred.

### Out of scope

- Changing how voice mode is triggered (entry button stays as-is).
- Audio pipeline, silence detection, barge-in (all unchanged).

---

## Feature 2 — Grok-style Input Bar

### Current state (`chat.html` ~line 3415–3614)

- `.input-box-wrap` — rounded-`[30px]` container, `flex flex-col`: a `#user-input` textarea on top, and a controls row below.
- Controls row: left = `#plus-menu-btn` (`+`) opening `#plus-menu` (which contains **Files / Search / Think** buttons + Canvas/Research); right = `#model-selector-input` ("Pisces ▾") and `#send-btn` (circular, accent-colored, paper-plane icon).
- Think toggle: `#think-btn` → `window.toggleThinking()`; state in `window.isThinkingEnabled`; active-mode indicators in `#plus-active-icon` (incl. `#plus-think-indicator`).

### Target look (Variant 1 — exactly like image #4)

```
┌────────────────────────────────────────────────────────────┐
│ ( + )  What do you want to know?      ● Fast ▾   ( ↑ )      │
└────────────────────────────────────────────────────────────┘
   pill shape, fully circular ends (border-radius: 9999px)
```

- **Shape:** single-row stadium pill, `border-radius: 9999px`, fully circular left & right ends. Resting height ~62px. When the textarea wraps to multiple lines the pill grows taller but keeps rounded ends (large radius preserved).
- **Layout (single row):** circular `+` button (far left) → `#user-input` textarea (flex-grow, placeholder **"What do you want to know?"**) → right group: **Fast/Thinking pill** + circular **send** button.
- The `+` menu keeps Files / Search / Canvas / Research. **The Think button is removed** from it.

### Fast/Thinking pill (replaces the Think button)

- A pill button on the right showing the active mode: **Fast** (thinking off) or **Thinking** (thinking on → `<think>` blocks). Small accent-colored dot + chevron.
- Clicking opens a small dropdown (reusing the existing `window.toggleMenu` pattern) with the two options.
- Selecting an option sets thinking state via the existing `window.toggleThinking()` / `window.isThinkingEnabled` so streaming behavior is unchanged. The pill label/dot reflect current state; `window.updateUI()` keeps it in sync.
- The old `#think-btn` and its `#plus-think-indicator` wiring are removed/retired.

### Removed

- **Model selector** (`#model-selector-input` and its menu) — removed from the bar. Only one model (Pisces) is currently exposed; if model switching is needed later it lives in Settings. (Leave `window.selectModel` intact for Settings/programmatic use.)
- **Red ⚠ badge** — not added (Grok-specific; no app equivalent wanted).

### Send button

- Circular `#send-btn`, up-arrow icon (replacing paper-plane).
- **Idle/empty:** neutral gray, disabled.
- **Has text:** brightens to `var(--accent-color)` with `var(--accent-contrast)` arrow (reuse existing enable logic in `ui.js` / `send-icon.js`).
- **Generating:** swaps to a stop `■` (existing stop behavior via `window.handleAction()` / `isGenerating` is preserved).

### Theme accents

- Light/dark: backgrounds, borders, text, and placeholder use existing theme tokens (`var(--bg-*)`, `var(--border)`, `dark:` Tailwind variants already in use) so the pill reads correctly in both themes.
- Accent: the Fast pill's active dot and the active send button use `var(--accent-color)` (and `var(--accent-tint)` for subtle backgrounds), matching the rest of the app.

### Out of scope

- Changing send/stop logic, file upload, search/canvas/research toggles, or streaming.

---

## Affected files

| File | Change |
|---|---|
| `AI/chat.html` | Voice overlay markup + CSS (~2873, ~4799); input-bar markup + CSS (~3415–3614); remove Think button from `+` menu; remove model selector |
| `AI/js/voice.js` | Extend transcript to also show the assistant reply during "Speaking…" |
| `AI/js/ui.js` | Sync Fast/Thinking pill label + dot to `isThinkingEnabled`; send-button accent/stop state (mostly existing) |
| `AI/js/send-icon.js` | Up-arrow icon (idle/active/stop) |

## Testing

No automated test suite (per CLAUDE.md — open HTML in a browser). Manual verification:

- **Voice mode:** trigger voice mode → confirm black screen, left rail with orb logo, centered pulsing orb, status word, live transcript for both user speech and reply, mute toggles, end exits. Check light + dark themes.
- **Input bar:** pill shape with circular ends; placeholder text; `+` menu no longer shows Think; Fast/Thinking pill switches mode and actually toggles `<think>` output; no model selector; send button gray→accent on input and stop while generating; verify in light + dark + a couple of accent colors; verify multi-line growth keeps rounded ends; verify mobile width.

## Rebuild note

Tailwind utility classes are prebuilt into `src/output.css`. If new utility classes are introduced, rebuild with `npx @tailwindcss/cli -i src/input.css -o src/output.css`. Prefer reusing classes already present in `chat.html`, or inline `<style>` (the file already uses extensive inline CSS), to avoid a rebuild dependency.
