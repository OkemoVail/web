# Voice Mode + Rounded Input Bar — Design Spec

**Date:** 2026-06-11
**Status:** Approved for planning
**Spans two repos:** `web/` (frontend, "Oaky") and `okemollm/` (backend, "Cadance")

## 1. Overview

Add a full hands-free **voice conversation mode** to the Oaky chat UI (`web/AI/chat.html`),
and restyle the input bar with a more rounded shape that stays rounded when it expands.

Two coordinated parts, one combined plan:

- **A — Rounded input bar** (frontend, CSS/markup only).
- **B — Voice conversation** (frontend overlay + two new backend audio endpoints).

The two repos meet at a small OpenAI-compatible HTTP contract (Section 3). The frontend
talks to the backend at the URL already resolved by `api.js` / `vail_custom_backend_url`
(default `https://api.okemovail.com`, port 8001 locally).

### Goals

- Tap a circular button in the input bar (when empty) to enter voice mode.
- Speak → see a transcript → hear the model's reply spoken back → it listens again, looped.
- Voice turns go through the **existing** `sendMessage` pipeline, use the **current model**,
  and are **saved into the active chat thread** like typed messages.
- Input bar reads as a rounded "bar," not a rectangle, including the multi-line expanded state.

### Non-goals (YAGNI)

- No separate push-to-talk dictation mic (voice-conversation only).
- No voice cloning, no multi-speaker, no server-side conversation state.
- No backend changes beyond the two audio endpoints.
- No change to input bar **width** (stays `max-w-2xl`).

## 2. Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Target page | `web/AI/chat.html` (Oaky) |
| Voice scope | Full hands-free voice conversation (not dictation) |
| Chat integration | Same thread, saved (normal `sendMessage` + `save()`) |
| STT engine | `openai-whisper` (already a backend dependency), run on CPU |
| TTS engine | **Kokoro-82M** (ONNX, CPU) |
| Build approach | One combined spec / plan covering both repos |
| Bar rounding | ~30px even corners, width unchanged |
| Voice entry | Circular send button morphs: empty → voice icon, has-text → send arrow |
| Button color | Accent-colored circle (matches existing theme), not reference white |

## 3. Shared HTTP Contract

Both endpoints are added to the existing FastAPI app in `okemollm/train.py`, sit alongside
`POST /v1/chat/completions`, and require the same `Authorization: Bearer <API key>` auth.

### 3.1 `POST /v1/audio/transcriptions` (STT)

- **Request:** `multipart/form-data` with `file` = recorded audio blob (e.g. `audio/webm`
  or `audio/wav`), optional `model` field (ignored / defaults to configured Whisper model).
- **Response:** `200 application/json` → `{ "text": "<transcript>" }`.
- **Errors:** `400` on missing/empty/undecodable audio; `401` on bad auth.

### 3.2 `POST /v1/audio/speech` (TTS)

- **Request:** `application/json` → `{ "input": "<text>", "voice": "<kokoro voice id>",
  "model": "kokoro", "format": "mp3" }`. `voice` optional → configured default.
- **Response:** `200 audio/mpeg` → raw mp3 bytes. (May stream; v1 may return full buffer.)
- **Errors:** `400` on empty input; `401` on bad auth.

These mirror the OpenAI audio API shapes so the frontend client stays conventional.

## 4. Backend Design (`okemollm/train.py`, "Cadance")

The server trains Qwen3-8B while serving inference, sharing the GPU through a `ReadWriteLock`.
Audio must not starve training, so **both audio models run on CPU**.

### 4.1 STT — Whisper

- Use `openai-whisper` (already in `requirements.txt`, with `librosa` + `soundfile`).
- Load a single Whisper model once at startup on CPU; size from config
  (`audio.stt_model`, default `base`; `small` optional).
- Decode uploaded audio to a waveform (`soundfile`/`librosa`), run `model.transcribe`,
  return text. Guard with a module-level lock so concurrent requests serialize on the
  single Whisper instance.

### 4.2 TTS — Kokoro-82M

- Add **Kokoro-82M** (ONNX runtime, CPU). New dependency (e.g. `kokoro-onnx` + `onnxruntime`)
  and a one-time download of the model + voices file (document in repo README; do not commit
  the weights).
- Load once at startup. Synthesize `input` → PCM → encode mp3 via `soundfile` (or equivalent),
  return bytes with `Content-Type: audio/mpeg`.
- Default voice from config (`audio.tts_voice`); expose available voice ids for the frontend
  picker (static list in the frontend is acceptable for v1).

### 4.3 Config (`config.yaml`)

```yaml
audio:
  enabled: true
  stt_model: base          # whisper size: base | small
  tts_voice: <kokoro default voice id>
```

When `audio.enabled` is false, both endpoints return `503` and the frontend hides voice mode.

### 4.4 Backend tests (`okemollm/tests/`)

- `test_audio_transcriptions.py`: posting a short sample wav returns non-empty `text`;
  missing file → 400; missing/wrong auth → 401.
- `test_audio_speech.py`: posting `{input:"hello"}` returns non-empty `audio/mpeg` bytes;
  empty input → 400; wrong auth → 401.
- Keep fixtures tiny (a <1s wav) to keep CI fast. Models may be monkeypatched/stubbed so
  tests don't require the full weights where the existing suite stubs models.

## 5. Frontend — Rounded Input Bar (`web/AI/chat.html`)

- `.input-box-wrap` CSS: `border-radius: 16px` → `30px`. The Tailwind class on the wrapper
  div changes `rounded-2xl` → `rounded-[30px]` so utility and CSS agree.
- `body.chat-empty .input-box-wrap` and any other radius overrides reviewed for consistency.
- Width unchanged (`max-w-2xl`). Because the radius lives on the growing wrapper, the
  expanded multi-line state stays rounded — no square bottom.
- **Morphing action button** (`#send-btn`):
  - Becomes a circle (`rounded-full`), accent-colored (keep `var(--accent-color)` /
    `var(--accent-contrast)`).
  - Empty textarea → shows a voice-waveform icon, `aria-label="Start voice mode"`,
    `onclick` → `window.VoiceMode.start()`; **not** disabled when empty (today it is).
  - Non-empty textarea → shows the paper-plane/arrow send icon, `onclick` →
    `window.handleAction()` (current behavior).
  - The existing input handler that toggles `#send-btn` disabled state is extended to swap
    icon + handler intent based on whether the textarea has content.
  - If `MediaRecorder` or mic is unavailable, the empty-state never shows the voice icon
    (falls back to a disabled send look), so voice is progressively enhanced.

## 6. Frontend — Voice Mode (`web/AI/js/voice.js` → `window.VoiceMode`)

### 6.1 Load order & wiring

- New file `AI/js/voice.js`, added to the `<script>` list in `chat.html` **after**
  `chat-actions.js` (it calls `window.sendMessage`) and before `ui.js`.
- Overlay markup added to `chat.html` (hidden by default), id `voice-overlay`.
- Follows the codebase convention: attaches `window.VoiceMode` (no module system).

### 6.2 Public interface

```js
window.VoiceMode = {
  start(),        // open overlay, request mic, enter LISTENING
  stop(),         // close overlay, release mic, return to text input
  toggleMute(),   // pause/resume mic capture
  isActive(),     // boolean
}
```

### 6.3 State machine

`IDLE → LISTENING → TRANSCRIBING → THINKING → SPEAKING → LISTENING …` until `stop()`.

1. **LISTENING** — `getUserMedia` + `MediaRecorder` captures audio. End an utterance on
   silence (simple VAD via Web Audio RMS threshold) or a tap. Produces an audio blob.
2. **TRANSCRIBING** — POST blob to `/v1/audio/transcriptions`; show transcript in overlay.
   Empty/again-silent transcript → return to LISTENING without sending.
3. **THINKING** — call `window.sendMessage(transcript)`. This renders the user turn,
   streams the assistant reply through the existing pipeline, saves to `chatHistory`.
   Voice mode observes the streamed/finished assistant text.
4. **SPEAKING** — send assistant text to `/v1/audio/speech`; play returned mp3 via an
   `Audio` element. Orb animates to a "speaking" style.
5. **Loop** — on playback end, return to LISTENING. Repeat until the user ends the session.

**Barge-in:** tapping the orb (or detected speech) during SPEAKING stops playback and jumps
to LISTENING.

### 6.4 Internal units (kept separable)

- **Audio capture** — wraps `getUserMedia`/`MediaRecorder` + silence detection; emits blobs.
- **STT client** — `transcribe(blob) → text` (POST multipart).
- **TTS client** — `synthesize(text, voice) → audioUrl` (POST json, blob URL).
- **Playback queue** — serial `Audio` playback; supports interrupt for barge-in.
- **Overlay controller** — renders state label, transcript line, orb animation, controls.

### 6.5 Overlay UI

- Full-screen overlay: animated **orb** (pulse when listening, shimmer when speaking),
  **state label** (Listening / Thinking / Speaking), **live transcript** line, and two
  controls: **mute mic** and **end session** (✕ / ■). Matches the approved mockup.

### 6.6 Settings (`settings.js`, `vail_settings_v4`)

- `voiceEnabled` (bool) and `voiceName` (Kokoro voice id) added to settings JSON.
- A voice picker + toggle in the settings panel. Static list of Kokoro voice ids for v1.

## 7. Error Handling

| Condition | Behavior |
|---|---|
| Mic permission denied | Toast "Microphone access needed for voice mode"; close overlay |
| `MediaRecorder`/mic unavailable | Voice icon never shown; text input only |
| STT request fails / network down | Toast; return to LISTENING (retry) or exit gracefully |
| TTS request fails | Skip playback, keep the text reply in the thread; toast |
| Backend `audio.enabled=false` / 503 | Hide voice entry; voice button reverts to plain send |

All failures are non-blocking and never lose the typed/spoken text already in the thread.

## 8. Testing & Verification

- **Backend:** pytest tests in Section 4.4 (`okemollm/tests/`), run with the existing suite.
- **Frontend:** no automated suite exists (vanilla, open-in-browser). Manual checklist:
  1. Bar shows 30px rounding; expand with Shift+Enter → bottom stays rounded; width unchanged.
  2. Empty input shows voice icon; typing swaps to send arrow and sends normally.
  3. Tap voice → mic prompt → speak → transcript appears → reply renders in thread + is spoken.
  4. Reply turn is persisted (reload → voice turns still in the chat).
  5. Barge-in interrupts playback; ✕/■ exits cleanly and releases the mic.
  6. Deny mic permission → graceful toast, no console errors.
  7. Backend audio disabled → voice entry hidden, normal send works.

## 9. Files Touched

**Frontend (`web/`):**
- `AI/chat.html` — bar CSS/markup, morphing button, voice overlay markup, script tag.
- `AI/js/voice.js` — **new**, `window.VoiceMode`.
- `AI/js/settings.js` — voice settings + picker.
- (CSS for `.input-box-wrap` lives inline in `chat.html`.)

**Backend (`okemollm/`):**
- `train.py` — two FastAPI routes + CPU model loading.
- `config.yaml` — `audio:` block.
- `requirements.txt` — add Kokoro/ONNX runtime deps.
- `tests/test_audio_transcriptions.py`, `tests/test_audio_speech.py` — **new**.
- `README`/`CLAUDE.md` — note one-time Kokoro weight download.

## 10. Open Implementation Notes

- Pick the exact Kokoro Python package (`kokoro-onnx` vs `kokoro`) during planning; confirm
  CPU inference latency is acceptable for short replies.
- Confirm uploaded mime type from `MediaRecorder` (likely `audio/webm;codecs=opus`) decodes
  cleanly for Whisper; transcode with `librosa`/`ffmpeg` if needed.
- Silence-detection threshold/timeout tuned during implementation.
