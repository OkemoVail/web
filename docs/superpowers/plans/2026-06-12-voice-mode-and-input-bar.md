# Voice Mode + Input Bar Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the chat composer into a Grok-style circular pill (with a Fast/Thinking mode pill) and turn the voice overlay into a ChatGPT-style black screen with a logo rail, centered orb, and live transcript.

**Architecture:** Pure presentation-layer changes to `AI/chat.html` (markup + inline `<style>`) and three JS modules (`ui.js`, `send-icon.js`, `voice.js`). No backend, storage, or streaming changes. The voice record→transcribe→speak loop is reused; only its presentation and one transcript line change. Existing element IDs are preserved so cached references keep working.

**Tech Stack:** Vanilla JS (no framework, `window.*` globals), Tailwind v4 utility classes (prebuilt into `src/output.css`) + extensive inline `<style>` in `chat.html`, feather-icons + Font Awesome (CDN).

**Testing note:** This project has **no automated test suite** (per `CLAUDE.md` — "Open HTML files directly in a browser"). Each task therefore ends with an explicit **manual browser verification** step and a commit. Open `AI/chat.html` in a browser; toggle dark mode via the theme control; the accent color lives in Settings.

**Rebuild note:** Prefer inline `<style>` and Tailwind classes already present in `chat.html`. If you add a *new* Tailwind utility class not already in the file, rebuild once at the end: `cd web && npx @tailwindcss/cli -i src/input.css -o src/output.css`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `AI/chat.html` | All markup + inline CSS | Input-bar markup → pill (single row, remove model selector); add Fast/Thinking pill + menu; remove Think button from `+` menu; voice-overlay markup → rail + stage; CSS for pill radius + voice black theme |
| `AI/js/ui.js` | `updateUI()` button/state sync; `toggleThinking` | Sync Fast/Thinking pill label+dot; conditional send-button color; remove old `#think-btn` sync block; add `setThinkingMode` |
| `AI/js/send-icon.js` | Direct send-icon setter | Idle icon → arrow-up (was paper-plane) |
| `AI/js/voice.js` | Voice loop | Show assistant reply in transcript during "Speaking…" |

---

## Task 1: Input bar — single-row pill + remove model selector

**Files:**
- Modify: `AI/chat.html` (`.input-box-wrap` CSS ~line 1020; input-bar markup ~lines 3419–3613)

- [ ] **Step 1: Make the wrap a full pill (CSS)**

In `AI/chat.html`, find the `.input-box-wrap` rule (~line 1015) and change its `border-radius`:

```css
        .input-box-wrap {
            background-color: var(--bg-elevated);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--border-strong);
            border-radius: 9999px;
```

(Only the `border-radius: 30px;` line changes to `border-radius: 9999px;`. The `::before` animated border inherits this radius, so it stays correct.)

- [ ] **Step 2: Update the wrap's markup class**

Find the opening `.input-box-wrap` div (~line 3419-3420) and change `rounded-[30px]` to `rounded-full`:

```html
            <div
                class="input-box-wrap mb-2 transition-all duration-300 group focus-within:ring-0 focus-within:outline-none rounded-full relative flex flex-col !overflow-visible pointer-events-auto">
```

- [ ] **Step 3: Restructure the inner markup into a single row**

Replace the entire inner block of `.input-box-wrap` — from the `<div id="upload-preview-container"` line (~3422) through the closing of the controls row `</div>` just before `</div>` that closes `.input-box-wrap` (~3613). Replace with the following. **Note:** this removes the `#model-selector-input` button and its `#model-menu-input` menu entirely, and reorders elements into one flex row. The `#plus-menu-container` block (the `+` button and its `#plus-menu`) is preserved verbatim — keep it exactly as it currently is, only moved to be the first child of the new row.

```html
                <div id="upload-preview-container" class="hidden px-4 pt-3 flex gap-2 overflow-x-auto w-full"></div>

                <div class="flex items-end gap-2 w-full px-2 py-1.5">

                    <!-- LEFT: keep the existing #plus-menu-container block here, unchanged -->
                    <div id="plus-menu-container" class="relative z-50 shrink-0">
                        <!-- ⚠ PASTE the existing #plus-menu-btn button and #plus-menu div here, unchanged.
                             They currently live at chat.html ~lines 3438–3551. Move them verbatim. -->
                    </div>

                    <!-- MIDDLE: growable textarea -->
                    <div class="relative flex-1">
                        <input type="file" id="file-upload-input" class="hidden"
                            onchange="window.handleFileUpload(event)" />
                        <textarea id="user-input" placeholder="What do you want to know?" data-t-placeholder="ph_type_something"
                            rows="1"
                            class="w-full bg-transparent px-2 py-2.5 outline-none resize-none text-base max-h-[200px] no-scrollbar leading-relaxed text-zinc-900 dark:text-[#ececec] placeholder-zinc-400 dark:placeholder-zinc-500 font-sans min-h-[44px]"></textarea>
                    </div>

                    <!-- RIGHT: Fast/Thinking pill (Task 2) + send button -->
                    <div class="flex items-center gap-2 shrink-0 pb-0.5">
                        <!-- Fast/Thinking pill is added in Task 2 -->

                        <button id="send-btn" onclick="window.handleAction()" disabled
                            class="skuomorphic-btn w-10 h-10 flex items-center justify-center rounded-full opacity-50 cursor-not-allowed transition-all active:scale-95"
                            style="transition: background 0.2s, opacity 0.2s;">
                            <span id="send-icon-wrapper" class="flex items-center justify-center h-full w-full">
                                <i class="fa-solid fa-arrow-up text-sm"></i>
                            </span>
                        </button>
                        <span id="kv-cache-badge"
                              style="display:none; align-items:center; gap:4px; font-size:11px;
                                     color:var(--accent-color); opacity:0.8; cursor:default;"
                              title="">
                            ⚡ <span class="kv-seq"></span>
                        </span>
                    </div>
                </div>
```

> Important: when you move the `#plus-menu-container`, copy the existing `+` button (`#plus-menu-btn`) and its `#plus-menu` dropdown exactly as they are in the current file (~lines 3438–3551). Do not retype them. The only later change to that block is removing the Think button (Task 2).

- [ ] **Step 4: Verify in browser**

Open `AI/chat.html`. Expected:
- The composer is now a single-row **pill with fully circular left/right ends**.
- Placeholder reads "What do you want to know?".
- `+` on the left; send button on the right; **no "Pisces" model selector**.
- Type several lines → the pill grows taller and keeps rounded ends.
- Check both light and dark mode.

- [ ] **Step 5: Commit**

```bash
cd web && git add AI/chat.html && git commit -m "feat(input): pill-shaped composer, remove model selector"
```

---

## Task 2: Fast/Thinking pill (replaces the Think button)

**Files:**
- Modify: `AI/chat.html` (add pill markup in the right group; remove `#think-btn` from `#plus-menu`; remove `#plus-think-indicator` span)
- Modify: `AI/js/ui.js` (replace `thinkBtn` sync block with pill sync; add `window.setThinkingMode`)

- [ ] **Step 1: Add the Fast/Thinking pill markup**

In the right-group `<div class="flex items-center gap-2 shrink-0 pb-0.5">` from Task 1, insert this **before** the `#send-btn` button:

```html
                        <div id="mode-selector-container" class="relative z-50">
                            <button id="mode-pill-btn" onclick="window.toggleMenu(event, 'mode-menu-input')"
                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-900/10 dark:hover:bg-zinc-100/10 transition-all cursor-pointer">
                                <span id="mode-dot" class="w-1.5 h-1.5 rounded-full" style="background: var(--accent-color);"></span>
                                <span id="mode-label">Fast</span>
                                <i data-feather="chevron-down" class="w-3 h-3"></i>
                            </button>
                            <div id="mode-menu-input"
                                class="absolute bottom-full right-0 mb-2 w-44 bg-white dark:bg-[#1e1d1b] border border-zinc-200 dark:border-zinc-700/50 rounded-xl shadow-xl opacity-0 invisible transition-all duration-200 z-50 transform origin-bottom-right">
                                <div class="p-1 flex flex-col gap-1">
                                    <button onclick="window.setThinkingMode(false)"
                                        class="w-full text-left px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 transition-colors flex flex-col">
                                        <span class="text-xs font-semibold">Fast</span>
                                        <span class="text-[10px] opacity-50">Quick replies</span>
                                    </button>
                                    <button onclick="window.setThinkingMode(true)"
                                        class="w-full text-left px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 transition-colors flex flex-col">
                                        <span class="text-xs font-semibold">Thinking</span>
                                        <span class="text-[10px] opacity-50">Step-by-step reasoning</span>
                                    </button>
                                </div>
                            </div>
                        </div>
```

- [ ] **Step 2: Remove the Think button from the `+` menu**

In the moved `#plus-menu` block, delete the entire `#think-btn` `<button>` (the one with `onclick="window.toggleThinking(); window.closeAllMenus()"` and the brain SVG + `data-t="btn_think"` label). The grid that held Files / Search / Think now holds Files / Search — change the grid wrapper from `grid-cols-3` to `grid-cols-2`:

```html
                                    <div class="grid grid-cols-2 gap-1.5">
```

- [ ] **Step 3: Remove the now-unused think indicator span**

In `#plus-active-icon` (~line 3441), delete the entire `<span id="plus-think-indicator" ...>...</span>` block (the brain-icon indicator). Leave the search/research/canvas indicator spans untouched.

- [ ] **Step 4: Add `setThinkingMode` and update the pill sync in `ui.js`**

In `AI/js/ui.js`, **replace** the `thinkBtn` sync block (currently lines ~101–113, the `if (thinkBtn) { ... }` block) with this pill-sync block:

```javascript
    const modeLabel = document.getElementById('mode-label');
    const modeDot = document.getElementById('mode-dot');
    if (modeLabel) modeLabel.textContent = window.isThinkingEnabled ? 'Thinking' : 'Fast';
    if (modeDot) modeDot.style.background = window.isThinkingEnabled ? 'var(--accent-color)' : 'var(--text-tertiary)';
```

Then delete the now-dead `const thinkBtn = ...` line (~69) and the `const plusThinkIndicator = ...` line (~66) — they are no longer referenced. (Line ~130's `plusActiveIcon` display check still references `window.isThinkingEnabled` directly; leave it.)

Finally, add `setThinkingMode` next to `toggleThinking` (after the `window.toggleThinking` definition ~line 174):

```javascript
window.setThinkingMode = (on) => {
    window.isThinkingEnabled = !!on;
    window.updateUI();
    if (typeof window.closeAllMenus === 'function') window.closeAllMenus();
    if (window.chatHistory && window.chatHistory.length > 0 && typeof window.save === 'function') {
        window.save();
    }
};
```

- [ ] **Step 5: Verify in browser**

Open `AI/chat.html`. Expected:
- The right side of the pill shows a **Fast** pill with a colored dot + chevron.
- Clicking it opens a menu with **Fast** and **Thinking**.
- Selecting **Thinking** changes the pill label to "Thinking"; selecting **Fast** changes it back. The dot uses the accent color when Thinking, a muted color when Fast.
- The `+` menu no longer contains a **Think** button (only Files / Search in the grid, plus Canvas / Research below).
- Send a message with **Thinking** selected → confirm a `<think>` reasoning block renders (proves `window.isThinkingEnabled` is wired). With **Fast**, no think block.

- [ ] **Step 6: Commit**

```bash
cd web && git add AI/chat.html AI/js/ui.js && git commit -m "feat(input): Fast/Thinking mode pill replaces Think button"
```

---

## Task 3: Send button — neutral idle, accent when active

**Files:**
- Modify: `AI/js/ui.js` (`updateUI` send-button block ~lines 15–36)
- Modify: `AI/js/send-icon.js` (idle icon)

Context: `updateUI` already swaps the icon to `fa-arrow-up` when there is text, `fa-square` while generating, and a voice-waveform icon when empty (which starts voice mode on click — **preserve this**, it is the voice-mode entry point). This task only changes the button's **background color** so it reads gray when idle and accent when actively sending — matching image #4 — instead of always accent.

- [ ] **Step 1: Set the send button color conditionally in `ui.js`**

In `AI/js/ui.js`, inside `if (sendBtn) {` (~line 15), add the color logic. After the existing `const shouldEnable = ...` line and before the `if (shouldEnable) {` block, insert:

```javascript
        const isDarkSend = document.documentElement.classList.contains('dark');
        const sendActive = window.isGenerating || hasText;
        sendBtn.style.backgroundColor = sendActive ? 'var(--accent-color)' : (isDarkSend ? '#3a3a3d' : '#e4e4e7');
        sendBtn.style.color = sendActive ? 'var(--accent-contrast)' : (isDarkSend ? '#e9e9ec' : '#52525b');
```

(The button no longer carries an inline accent background from the markup — that was removed in Task 1 Step 3 — so `updateUI` is now the single source of truth for its color.)

- [ ] **Step 2: Update the idle icon in `send-icon.js`**

In `AI/js/send-icon.js`, change the non-stop branch from paper-plane to arrow-up so any direct `toggleSendIcon('send')` calls stay consistent:

```javascript
    if (state === 'stop') {
        iconWrapper.innerHTML = '<i class="fa-solid fa-square text-sm"></i>';
    } else {
        iconWrapper.innerHTML = '<i class="fa-solid fa-arrow-up text-sm"></i>';
    }
```

- [ ] **Step 3: Verify in browser**

Open `AI/chat.html`. Expected:
- **Empty composer:** send button is **gray** and shows the voice-waveform icon; clicking it starts voice mode (if mic supported).
- **After typing:** button background turns to the **accent color** with an up-arrow.
- **While generating:** button shows the stop square.
- Check light + dark mode (gray differs per theme) and a non-default accent color.

- [ ] **Step 4: Commit**

```bash
cd web && git add AI/js/ui.js AI/js/send-icon.js && git commit -m "feat(input): neutral idle send button, accent when active"
```

---

## Task 4: Voice overlay — rail + stage markup, reply transcript

**Files:**
- Modify: `AI/chat.html` (`#voice-overlay` markup ~lines 4799–4813)
- Modify: `AI/js/voice.js` (`loopOnce` ~lines 105–111)

- [ ] **Step 1: Restructure the voice overlay markup**

In `AI/chat.html`, replace the entire `#voice-overlay` block (~lines 4799–4813) with this. All existing IDs (`#voice-orb`, `#voice-state`, `#voice-transcript`, `#voice-mute`, `#voice-end`) are preserved so `voice.js`'s `cache()` keeps working:

```html
    <div id="voice-overlay" role="dialog" aria-label="Voice mode">
        <div id="voice-rail">
            <div id="voice-rail-logo"></div>
            <span id="voice-rail-label">Voice</span>
        </div>
        <div id="voice-stage">
            <div id="voice-orb" onclick="window.VoiceMode && window.VoiceMode.interrupt()"></div>
            <div id="voice-state">Listening…</div>
            <div id="voice-transcript"></div>
            <div id="voice-controls">
                <button id="voice-mute" class="voice-ctrl" title="Mute mic"
                        onclick="window.VoiceMode && window.VoiceMode.toggleMute()">
                    <i class="fa-solid fa-microphone text-sm"></i>
                </button>
                <button id="voice-end" class="voice-ctrl end" title="End voice"
                        onclick="window.VoiceMode && window.VoiceMode.stop()">
                    <i class="fa-solid fa-stop text-sm"></i>
                </button>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: Show the assistant reply in the transcript while speaking (`voice.js`)**

In `AI/js/voice.js`, inside `loopOnce`, find the `if (reply) {` block (~line 107) and add a `setTranscript(reply)` so the caption shows the spoken reply. Replace:

```javascript
        if (reply) {
            setState('Speaking…', true);
            const url = await synthesize(reply.replace(/<[^>]+>/g, ' ').slice(0, 2000));
            await playAudio(url);
        }
```

with:

```javascript
        if (reply) {
            setState('Speaking…', true);
            const spoken = reply.replace(/<[^>]+>/g, ' ').slice(0, 2000);
            setTranscript(spoken);
            const url = await synthesize(spoken);
            await playAudio(url);
        }
```

- [ ] **Step 3: Verify in browser**

Open `AI/chat.html`, start voice mode (gray send button when empty, mic permitted). Expected (layout will be unstyled until Task 5, but structure should be present): the overlay shows a left rail, an orb, a status word, a transcript line, and mute/end buttons. Speak → the status cycles Listening→Transcribing→Thinking→Speaking, your words appear, then the reply text appears while it speaks.

- [ ] **Step 4: Commit**

```bash
cd web && git add AI/chat.html AI/js/voice.js && git commit -m "feat(voice): rail+stage overlay structure, show reply transcript"
```

---

## Task 5: Voice overlay — ChatGPT-style black theme CSS

**Files:**
- Modify: `AI/chat.html` (voice CSS block ~lines 2873–2892)

- [ ] **Step 1: Replace the voice overlay CSS**

In `AI/chat.html`, replace the voice CSS block (from `#voice-overlay {` ~line 2873 through `.voice-ctrl.muted { ... }` ~line 2892) with this. The orb, state, and transcript styles are kept; a black background, a left logo rail, and a centered stage are added:

```css
        #voice-overlay {
            position: fixed; inset: 0; z-index: 200; display: none;
            background: #000; flex-direction: row;
        }
        #voice-overlay.active { display: flex; }

        #voice-rail {
            width: 60px; flex: none; background: #000;
            border-right: 1px solid #141416;
            display: flex; flex-direction: column; align-items: center;
            padding-top: 14px; gap: 6px;
        }
        #voice-rail-logo {
            width: 30px; height: 30px; border-radius: 9999px;
            background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent-color), white 40%), var(--accent-color) 60%, color-mix(in srgb, var(--accent-color), black 25%) 100%);
            box-shadow: 0 0 14px color-mix(in srgb, var(--accent-color), transparent 45%);
        }
        #voice-rail-label { color: #8a8a8f; font-size: 10px; font-weight: 600; }

        #voice-stage {
            flex: 1; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 24px; position: relative;
        }
        #voice-orb {
            width: 132px; height: 132px; border-radius: 9999px;
            background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent-color), white 35%), var(--accent-color) 60%, color-mix(in srgb, var(--accent-color), black 25%) 100%);
            box-shadow: 0 0 50px color-mix(in srgb, var(--accent-color), transparent 45%);
            animation: voice-pulse 2.4s ease-in-out infinite; cursor: pointer;
        }
        #voice-overlay.speaking #voice-orb { animation: voice-pulse 0.9s ease-in-out infinite; }
        @keyframes voice-pulse { 0%,100%{transform:scale(1);} 50%{transform:scale(1.08);} }

        #voice-state { color: #ececec; font-size: 19px; font-weight: 600; }
        #voice-transcript { color: #9a9aa0; font-size: 14px; max-width: 70%; text-align: center; min-height: 20px; line-height: 1.5; }

        #voice-controls { position: absolute; bottom: 34px; display: flex; gap: 18px; }
        .voice-ctrl { width: 54px; height: 54px; border-radius: 9999px; background: #1c1c20; color: #dcdce0;
            display: flex; align-items: center; justify-content: center; border: 1px solid #2c2c31; cursor: pointer; }
        .voice-ctrl.end { background: #3a1116; color: #ff6b6b; border-color: #52181d; }
        .voice-ctrl.muted { color: #ff6b6b; }
```

- [ ] **Step 2: Verify in browser**

Open `AI/chat.html`, start voice mode. Expected (matches the approved Variant B mockup):
- Whole screen is **black**.
- A thin black **left rail** with a small glowing orb logo near the top and a "Voice" label beneath it.
- A large pulsing orb **centered** in the main stage; status word below it; live transcript caption below that; mute/end controls near the bottom.
- Speak → orb pulses faster while "Speaking…", reply text shows in the caption.
- Tap the orb mid-speech → playback stops and it returns to Listening.
- Click the red end button → overlay closes, returns to chat.
- Change the accent color in Settings → the orb + rail logo follow the accent (theme accents).

- [ ] **Step 3: Commit**

```bash
cd web && git add AI/chat.html && git commit -m "feat(voice): ChatGPT-style black overlay with logo rail"
```

---

## Task 6: Final pass — Tailwind rebuild check + full walkthrough

**Files:**
- Possibly modify: `web/src/output.css` (only if a new Tailwind class was introduced)

- [ ] **Step 1: Rebuild Tailwind if needed**

The plan reuses existing utility classes and inline styles, so a rebuild is usually unnecessary. If anything renders unstyled (e.g. a Tailwind class that wasn't previously compiled), run:

```bash
cd web && npx @tailwindcss/cli -i src/input.css -o src/output.css
```

- [ ] **Step 2: Full manual walkthrough**

Open `AI/chat.html` and confirm end-to-end, in **both light and dark mode** and with at least one non-default accent color:
- Pill composer: circular ends, "What do you want to know?" placeholder, grows on multiline.
- `+` menu: Files / Search / Canvas / Research (no Think).
- Fast/Thinking pill: switches mode, dot uses accent, actually toggles `<think>` output.
- Send button: gray when empty (voice icon, starts voice), accent + arrow-up when text, stop while generating.
- Voice mode: black screen, rail + orb logo, centered pulsing orb, status, live transcript (user + reply), mute/end, tap-to-interrupt, end closes.
- Regression: sending a normal text message still streams and renders correctly; web search and canvas toggles still work.

- [ ] **Step 3: Commit (if Step 1 changed output.css)**

```bash
cd web && git add src/output.css && git commit -m "build: rebuild tailwind for composer/voice styles"
```

---

## Self-Review

**Spec coverage:**
- Voice mode Variant B (black, rail+logo, orb, status, live transcript incl. reply, controls) → Tasks 4–5. ✓
- Reuse `voice.js` loop untouched except transcript → Task 4 Step 2. ✓
- Input bar Variant 1 pill, circular ends, grows multiline → Task 1. ✓
- Placeholder "What do you want to know?" → Task 1 Step 3. ✓
- Fast/Thinking pill replaces Think button, wired to `isThinkingEnabled` → Task 2. ✓
- Model selector removed; `window.selectModel` left intact for Settings → Task 1 Step 3 (only bar markup removed; `selectModel` in `state.js`/`chat.html` model menu of Settings untouched). ✓
- Red badge not added → not introduced anywhere. ✓
- Send button up-arrow / accent-on-text / stop-on-generating → Task 3 (+ preserves voice-idle entry). ✓
- Theme accents (light/dark + accent color) → Task 1 (theme tokens), Task 2 (accent dot), Task 3 (accent bg), Task 5 (accent orb). ✓

**Placeholder scan:** No "TBD/TODO" left. The one "paste existing block" instruction (Task 1 `#plus-menu-container`) is intentional — the block is large and unchanged, and retyping it risks transcription errors; exact source line range is given.

**Type/name consistency:** `setThinkingMode` (defined Task 2 Step 4, called Task 2 Step 1 markup); `mode-label`/`mode-dot`/`mode-pill-btn`/`mode-menu-input` consistent between Task 2 markup and `ui.js` sync; voice IDs (`voice-orb`, `voice-state`, `voice-transcript`, `voice-mute`, `voice-end`) consistent between Task 4 markup, Task 5 CSS, and existing `voice.js` `cache()`. ✓
