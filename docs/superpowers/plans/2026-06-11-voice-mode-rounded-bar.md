# Voice Mode + Rounded Input Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full hands-free voice-conversation mode to the Oaky chat UI and round the input bar so it stays rounded when it expands.

**Architecture:** Two repos joined by an OpenAI-compatible HTTP contract. Backend (`okemollm/`, FastAPI in `train.py`) gains two CPU-only audio endpoints — Whisper STT and Kokoro-82M TTS. Frontend (`web/AI/`) gains a `window.VoiceMode` module that records mic audio → STT → existing `sendMessage()` → streamed reply → TTS → playback, looped, with turns saved to the active thread. The input bar gets a larger radius and a morphing circular button (voice when empty, send when typing).

**Tech Stack:** Python 3 / FastAPI / openai-whisper / kokoro-onnx / soundfile · vanilla JS (`window.*` globals, no bundler) / MediaRecorder / Web Audio / Tailwind CDN · pytest + pytest-asyncio.

**Spec:** `web/docs/superpowers/specs/2026-06-11-voice-mode-rounded-bar-design.md`

---

## Repos & conventions

- **Backend repo:** `C:\Users\okemo\Desktop\Projects\okemollm` (own git). Run tests: `cd okemollm && python -m pytest tests/ -v`.
- **Frontend repo:** `C:\Users\okemo\Desktop\Projects\web` (own git, branch `voice-mode-rounded-bar`). No JS test runner — frontend tasks use **manual browser verification** (open `AI/chat.html`).
- Backend auth is a **global middleware** (`train.py:353`), so new routes inherit Bearer-key auth automatically — no per-route auth code.
- Concurrency guard is `RW_LOCK.read_lock()` (context manager, `train.py:68`).
- `CORS_HEADERS` and `JSONResponse` are already imported/defined in `train.py`.
- Contract deviation from spec: TTS returns **`audio/wav`** (not mp3) to avoid an mp3-encoder dependency. Browsers play wav via `Audio` transparently; the frontend is format-agnostic.

## File Structure

**Backend (`okemollm/`):**
- `train.py` — add `audio` config reader, Whisper + Kokoro loaders/helpers, two routes (one responsibility each, grouped near other `/v1` routes).
- `config.yaml` — add `audio:` block.
- `requirements.txt` — add `kokoro-onnx`, `onnxruntime`.
- `tests/test_audio.py` — **new**, helper + route tests.

**Frontend (`web/AI/`):**
- `chat.html` — bar radius CSS, circular button class, voice overlay markup + CSS, `<script>` tag, settings rows.
- `js/voice.js` — **new**, `window.VoiceMode` (capture, STT/TTS clients, state machine, overlay control).
- `js/ui.js` — `updateUI()` gains the voice/send morph branch.
- `js/settings.js` — voice enable + voice-name persistence handlers.

---

## PHASE 1 — Backend audio endpoints (`okemollm/`)

### Task 1: Add audio config + dependencies

**Files:**
- Modify: `okemollm/config.yaml` (append top-level block)
- Modify: `okemollm/requirements.txt`

- [ ] **Step 1: Add the `audio` block to `config.yaml`**

Append at the end of `okemollm/config.yaml` (top-level key, same indent level as `model:`):

```yaml
audio:
  enabled: true
  stt_model: base          # whisper size: tiny | base | small
  tts_voice: af_sarah      # default Kokoro voice id
```

- [ ] **Step 2: Add dependencies to `requirements.txt`**

Append these two lines to `okemollm/requirements.txt` (whisper/librosa/soundfile are already present):

```
kokoro-onnx>=0.3.0
onnxruntime>=1.17.0
```

- [ ] **Step 3: Document the one-time model assets**

Add this note under a new `## Voice / Audio` heading at the end of `okemollm/CLAUDE.md`:

```markdown
## Voice / Audio

Audio endpoints (`/v1/audio/transcriptions`, `/v1/audio/speech`) need:
- **ffmpeg** on PATH (openai-whisper decodes uploaded audio with it).
- Kokoro model assets in the repo root: `kokoro-v0_19.onnx` and `voices.bin`
  (download per kokoro-onnx README; do NOT commit the weights).
Both audio models run on CPU so they don't contend with GPU training.
```

- [ ] **Step 4: Commit**

```bash
cd C:/Users/okemo/Desktop/Projects/okemollm
git add config.yaml requirements.txt CLAUDE.md
git commit -m "feat(audio): config block + deps for voice endpoints"
```

---

### Task 2: Whisper STT helper (TDD)

**Files:**
- Modify: `okemollm/train.py` (add helpers near the other module-level helpers, e.g. just after the `RW_LOCK = ReadWriteLock()` line ~105)
- Test: `okemollm/tests/test_audio.py` (new)

- [ ] **Step 1: Write the failing test**

Create `okemollm/tests/test_audio.py`:

```python
import sys, os
from unittest.mock import MagicMock
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


def test_transcribe_audio_returns_stripped_text(monkeypatch):
    import train
    fake = MagicMock()
    fake.transcribe.return_value = {"text": "  hello world  "}
    monkeypatch.setattr(train, "_get_whisper", lambda: fake)

    out = train._transcribe_audio(b"\x00\x01fake-audio-bytes")

    assert out == "hello world"
    assert fake.transcribe.called
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd C:/Users/okemo/Desktop/Projects/okemollm && python -m pytest tests/test_audio.py::test_transcribe_audio_returns_stripped_text -v`
Expected: FAIL — `AttributeError: module 'train' has no attribute '_get_whisper'`.

- [ ] **Step 3: Implement the helper**

Add to `train.py` near the top-level helpers (after `RW_LOCK = ReadWriteLock()`). Add `import tempfile` to the imports at the top if not already present (`os` and `Path` are already imported):

```python
# ── Audio: Whisper STT (CPU) ──────────────────────────────────────────────────
import tempfile
_WHISPER = None

def _audio_config() -> dict:
    import yaml
    cfg = yaml.safe_load((Path(__file__).parent / "config.yaml").read_text()) or {}
    return cfg.get("audio", {}) or {}

def _get_whisper():
    global _WHISPER
    if _WHISPER is None:
        import whisper
        _WHISPER = whisper.load_model(_audio_config().get("stt_model", "base"), device="cpu")
    return _WHISPER

def _transcribe_audio(audio_bytes: bytes) -> str:
    suffix = ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp = f.name
    try:
        with RW_LOCK.read_lock():
            result = _get_whisper().transcribe(tmp, fp16=False)
        return (result.get("text") or "").strip()
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
```

- [ ] **Step 4: Run it to verify it passes**

Run: `python -m pytest tests/test_audio.py::test_transcribe_audio_returns_stripped_text -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add train.py tests/test_audio.py
git commit -m "feat(audio): whisper STT helper"
```

---

### Task 3: `/v1/audio/transcriptions` route (TDD)

**Files:**
- Modify: `okemollm/train.py` (add route near `/v1/chat/completions`, ~line 1174)
- Test: `okemollm/tests/test_audio.py`

- [ ] **Step 1: Write the failing tests**

Append to `okemollm/tests/test_audio.py`:

```python
import json
import pytest


class _FakeUpload:
    def __init__(self, data): self._data = data
    async def read(self): return self._data


@pytest.mark.asyncio
async def test_transcriptions_route_returns_text(monkeypatch):
    import train
    monkeypatch.setattr(train, "_transcribe_audio", lambda b: "hi there")
    resp = await train.audio_transcriptions(file=_FakeUpload(b"audio"))
    assert resp.status_code == 200
    assert json.loads(resp.body)["text"] == "hi there"


@pytest.mark.asyncio
async def test_transcriptions_route_rejects_empty(monkeypatch):
    import train
    monkeypatch.setattr(train, "_transcribe_audio", lambda b: "should not run")
    resp = await train.audio_transcriptions(file=_FakeUpload(b""))
    assert resp.status_code == 400
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_audio.py -k transcriptions_route -v`
Expected: FAIL — `module 'train' has no attribute 'audio_transcriptions'`.

- [ ] **Step 3: Implement the route**

Ensure `UploadFile, File` are imported from `fastapi` (add to the existing fastapi import line in `train.py` if missing). Add near the other `/v1` routes:

```python
@app.post("/v1/audio/transcriptions")
async def audio_transcriptions(file: UploadFile = File(...)):
    if not _audio_config().get("enabled", True):
        return JSONResponse({"error": "audio disabled"}, status_code=503, headers=CORS_HEADERS)
    data = await file.read()
    if not data:
        return JSONResponse({"error": "empty audio"}, status_code=400, headers=CORS_HEADERS)
    try:
        text = _transcribe_audio(data)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500, headers=CORS_HEADERS)
    return JSONResponse({"text": text}, headers=CORS_HEADERS)
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_audio.py -k transcriptions_route -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add train.py tests/test_audio.py
git commit -m "feat(audio): POST /v1/audio/transcriptions route"
```

---

### Task 4: Kokoro TTS helper (TDD)

**Files:**
- Modify: `okemollm/train.py`
- Test: `okemollm/tests/test_audio.py`

- [ ] **Step 1: Write the failing test**

Append to `okemollm/tests/test_audio.py`:

```python
def test_synthesize_speech_returns_wav_bytes(monkeypatch):
    import numpy as np
    import train
    fake = MagicMock()
    fake.create.return_value = (np.zeros(2400, dtype="float32"), 24000)
    monkeypatch.setattr(train, "_get_kokoro", lambda: fake)

    out = train._synthesize_speech("hello", "af_sarah")

    assert isinstance(out, (bytes, bytearray))
    assert out[:4] == b"RIFF"          # WAV header
    fake.create.assert_called_once()
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_audio.py::test_synthesize_speech_returns_wav_bytes -v`
Expected: FAIL — no attribute `_get_kokoro`.

- [ ] **Step 3: Implement the helper**

Add to `train.py` after the Whisper helpers:

```python
# ── Audio: Kokoro-82M TTS (CPU) ───────────────────────────────────────────────
_KOKORO = None

def _get_kokoro():
    global _KOKORO
    if _KOKORO is None:
        from kokoro_onnx import Kokoro
        base = Path(__file__).parent
        _KOKORO = Kokoro(str(base / "kokoro-v0_19.onnx"), str(base / "voices.bin"))
    return _KOKORO

def _synthesize_speech(text, voice=None):
    import io
    import soundfile as sf
    voice = voice or _audio_config().get("tts_voice", "af_sarah")
    samples, sample_rate = _get_kokoro().create(text, voice=voice, speed=1.0, lang="en-us")
    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV")
    return buf.getvalue()
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_audio.py::test_synthesize_speech_returns_wav_bytes -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add train.py tests/test_audio.py
git commit -m "feat(audio): kokoro TTS helper"
```

---

### Task 5: `/v1/audio/speech` route (TDD)

**Files:**
- Modify: `okemollm/train.py`
- Test: `okemollm/tests/test_audio.py`

- [ ] **Step 1: Write the failing tests**

Append to `okemollm/tests/test_audio.py`:

```python
class _FakeReq:
    def __init__(self, payload): self._payload = payload
    async def json(self): return self._payload


@pytest.mark.asyncio
async def test_speech_route_returns_audio(monkeypatch):
    import train
    monkeypatch.setattr(train, "_synthesize_speech", lambda text, voice=None: b"RIFFxxxx")
    resp = await train.audio_speech(_FakeReq({"input": "hello", "voice": "af_sarah"}))
    assert resp.status_code == 200
    assert resp.media_type == "audio/wav"
    assert resp.body == b"RIFFxxxx"


@pytest.mark.asyncio
async def test_speech_route_rejects_empty_input(monkeypatch):
    import train
    monkeypatch.setattr(train, "_synthesize_speech", lambda text, voice=None: b"x")
    resp = await train.audio_speech(_FakeReq({"input": "   "}))
    assert resp.status_code == 400
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_audio.py -k speech_route -v`
Expected: FAIL — no attribute `audio_speech`.

- [ ] **Step 3: Implement the route**

Ensure `Request` is imported from `fastapi` and `Response` from `fastapi.responses` (the file already imports `Request` for the auth middleware; add `Response` to the `fastapi.responses` import line). Add near the transcriptions route:

```python
@app.post("/v1/audio/speech")
async def audio_speech(req: Request):
    if not _audio_config().get("enabled", True):
        return JSONResponse({"error": "audio disabled"}, status_code=503, headers=CORS_HEADERS)
    body = await req.json()
    text = (body.get("input") or "").strip()
    if not text:
        return JSONResponse({"error": "empty input"}, status_code=400, headers=CORS_HEADERS)
    try:
        audio = _synthesize_speech(text, body.get("voice"))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500, headers=CORS_HEADERS)
    return Response(content=audio, media_type="audio/wav", headers=CORS_HEADERS)
```

- [ ] **Step 4: Run the full audio suite**

Run: `python -m pytest tests/test_audio.py -v`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add train.py tests/test_audio.py
git commit -m "feat(audio): POST /v1/audio/speech route"
```

---

## PHASE 2 — Rounded input bar (`web/`)

### Task 6: Increase bar radius

**Files:**
- Modify: `web/AI/chat.html` (CSS `~1020`, wrapper class `~3400`)

- [ ] **Step 1: Bump the CSS radius**

In `web/AI/chat.html`, in the `.input-box-wrap` rule (~line 1020), change:

```css
            border-radius: 16px;
```
to:
```css
            border-radius: 30px;
```

- [ ] **Step 2: Match the Tailwind utility on the wrapper**

On the wrapper div (~line 3400), change the class token `rounded-2xl` → `rounded-[30px]`:

```html
                class="input-box-wrap mb-2 transition-all duration-300 group focus-within:ring-0 focus-within:outline-none rounded-[30px] relative flex flex-col !overflow-visible pointer-events-auto">
```

- [ ] **Step 3: Manual verification**

Open `web/AI/chat.html` in a browser. Confirm:
- The input bar corners are visibly rounder (~30px), width unchanged (still centered `max-w-2xl`).
- Press Shift+Enter several times to expand to multiple lines — the **bottom corners stay rounded** (no square bottom).
- Toggle dark mode — still rounded in both themes.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/okemo/Desktop/Projects/web
git add AI/chat.html
git commit -m "style(input): round input bar to 30px, holds when expanded"
```

---

### Task 7: Circular morphing button (voice ⇄ send)

**Files:**
- Modify: `web/AI/chat.html` (send button class, ~3580)
- Modify: `web/AI/js/ui.js` (`updateUI`, the send-button + icon blocks)

> The voice branch calls `window.VoiceMode.start()`. `VoiceMode` is created in Task 9; until then the empty-state button stays a disabled send arrow (the `isSupported()` guard returns falsy when `VoiceMode` is undefined). This task is safe to ship before Task 9.

- [ ] **Step 1: Make the button a circle**

In `web/AI/chat.html` (~line 3580), change the send button's `rounded-xl` → `rounded-full`:

```html
                        <button id="send-btn" onclick="window.handleAction()" disabled
                            class="skuomorphic-btn w-10 h-10 flex items-center justify-center rounded-full opacity-50 cursor-not-allowed transition-all active:scale-95"
                            style="background-color: var(--accent-color); color: var(--accent-contrast); transition: background 0.2s, opacity 0.2s; margin-left: 5px;">
```

- [ ] **Step 2: Replace the send-button logic in `updateUI`**

In `web/AI/js/ui.js`, replace the whole `if (sendBtn) { ... }` block AND the following `if (iconWrapper) { ... }` block (the first ~28 lines of `updateUI`) with:

```javascript
    const VOICE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="10" x2="4" y2="14"/><line x1="8" y1="7" x2="8" y2="17"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="16" y1="7" x2="16" y2="17"/><line x1="20" y1="10" x2="20" y2="14"/></svg>';

    const voiceReady = !window.isGenerating
        && !(input && input.value.trim().length > 0)
        && !!(window.VoiceMode && window.VoiceMode.isSupported && window.VoiceMode.isSupported());

    if (sendBtn) {
        const hasText = input && input.value.trim().length > 0;
        const shouldEnable = window.isGenerating || hasText || voiceReady;

        if (shouldEnable) {
            sendBtn.disabled = false;
            sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            sendBtn.classList.add('opacity-100', 'cursor-pointer', 'hover:opacity-90');
        } else {
            sendBtn.disabled = true;
            sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
            sendBtn.classList.remove('opacity-100', 'cursor-pointer', 'hover:opacity-90');
        }

        if (window.isGenerating || hasText) {
            sendBtn.onclick = () => window.handleAction();
        } else if (voiceReady) {
            sendBtn.onclick = () => window.VoiceMode.start();
        } else {
            sendBtn.onclick = () => window.handleAction();
        }
    }

    if (iconWrapper) {
        if (window.isGenerating) {
            iconWrapper.innerHTML = '<i class="fa-solid fa-square text-sm"></i>';
        } else if (input && input.value.trim().length > 0) {
            iconWrapper.innerHTML = '<i class="fa-solid fa-arrow-up text-sm"></i>';
        } else if (voiceReady) {
            iconWrapper.innerHTML = VOICE;
        } else {
            iconWrapper.innerHTML = '<i class="fa-solid fa-arrow-up text-sm"></i>';
        }
    }
```

- [ ] **Step 3: Manual verification**

Open `web/AI/chat.html`. With `VoiceMode` not yet present:
- Empty input → button is a circle showing an up-arrow, disabled (dimmed). Typing text → stays an up-arrow, enabled, sends on click/Enter. (No regression to send.)
- During generation → shows the stop square. All states are circular now.

- [ ] **Step 4: Commit**

```bash
git add AI/chat.html AI/js/ui.js
git commit -m "feat(input): circular send button with voice-aware morph hook"
```

---

## PHASE 3 — Voice mode (`web/`)

### Task 8: Voice overlay markup + styles

**Files:**
- Modify: `web/AI/chat.html` (overlay markup before the closing `</body>`; CSS in the main `<style>`)

- [ ] **Step 1: Add overlay CSS**

In `web/AI/chat.html`, inside the main `<style>` block (anywhere among the other rules), add:

```css
        #voice-overlay {
            position: fixed; inset: 0; z-index: 200; display: none;
            flex-direction: column; align-items: center; justify-content: center; gap: 26px;
            background: rgba(10, 10, 12, 0.92); backdrop-filter: blur(18px);
        }
        #voice-overlay.active { display: flex; }
        #voice-orb {
            width: 132px; height: 132px; border-radius: 9999px;
            background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent-color), white 35%), var(--accent-color) 60%, color-mix(in srgb, var(--accent-color), black 25%) 100%);
            box-shadow: 0 0 50px color-mix(in srgb, var(--accent-color), transparent 45%);
            animation: voice-pulse 2.4s ease-in-out infinite; cursor: pointer;
        }
        #voice-overlay.speaking #voice-orb { animation: voice-pulse 0.9s ease-in-out infinite; }
        @keyframes voice-pulse { 0%,100%{transform:scale(1);} 50%{transform:scale(1.08);} }
        #voice-state { color: #ececec; font-size: 19px; font-weight: 600; }
        #voice-transcript { color: #9a9aa0; font-size: 14px; max-width: 70%; text-align: center; min-height: 20px; }
        .voice-ctrl { width: 54px; height: 54px; border-radius: 9999px; background: #1c1c20; color: #dcdce0;
            display: flex; align-items: center; justify-content: center; border: 1px solid #2c2c31; cursor: pointer; }
        .voice-ctrl.end { background: #3a1116; color: #ff6b6b; border-color: #52181d; }
        .voice-ctrl.muted { color: #ff6b6b; }
```

- [ ] **Step 2: Add overlay markup**

Just before `</body>` in `web/AI/chat.html`, add:

```html
    <div id="voice-overlay" role="dialog" aria-label="Voice mode">
        <div id="voice-orb" onclick="window.VoiceMode && window.VoiceMode.interrupt()"></div>
        <div id="voice-state">Listening…</div>
        <div id="voice-transcript"></div>
        <div style="display:flex; gap:18px;">
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
```

- [ ] **Step 3: Manual verification**

Temporarily add `class="active"` to `#voice-overlay` in devtools (or set `display:flex`). Confirm the overlay covers the screen, orb pulses in the accent color, controls render. Remove the temporary class.

- [ ] **Step 4: Commit**

```bash
git add AI/chat.html
git commit -m "feat(voice): full-screen voice overlay markup + styles"
```

---

### Task 9: `window.VoiceMode` skeleton + wiring

**Files:**
- Create: `web/AI/js/voice.js`
- Modify: `web/AI/chat.html` (script tag after `chat-actions.js`, ~line 3666)

- [ ] **Step 1: Create `voice.js` with the module shell**

Create `web/AI/js/voice.js`:

```javascript
// ─── Voice Mode ────────────────────────────────────────────────
// Full hands-free voice conversation. Reuses window.sendMessage + chatHistory.
(function () {
    const els = {};
    let active = false;
    let muted = false;

    function cache() {
        els.overlay = document.getElementById('voice-overlay');
        els.orb = document.getElementById('voice-orb');
        els.state = document.getElementById('voice-state');
        els.transcript = document.getElementById('voice-transcript');
        els.mute = document.getElementById('voice-mute');
    }

    function setState(label, speaking) {
        if (els.state) els.state.innerText = label;
        if (els.overlay) els.overlay.classList.toggle('speaking', !!speaking);
    }
    function setTranscript(t) { if (els.transcript) els.transcript.innerText = t || ''; }

    function isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
                  window.MediaRecorder &&
                  !(window.settings && window.settings.voiceEnabled === false));
    }

    async function start() {
        if (active || !isSupported()) return;
        cache();
        active = true;
        els.overlay.classList.add('active');
        setTranscript('');
        setState('Listening…', false);
        // Capture/loop wired in Task 10.
    }

    function stop() {
        active = false;
        if (els.overlay) els.overlay.classList.remove('active', 'speaking');
        setTranscript('');
        if (window.updateUI) window.updateUI();
    }

    function toggleMute() {
        muted = !muted;
        if (els.mute) els.mute.classList.toggle('muted', muted);
    }

    function interrupt() { /* barge-in wired in Task 11 */ }

    window.VoiceMode = {
        start, stop, toggleMute, interrupt, isSupported,
        isActive: () => active,
        _internal: { setState, setTranscript, get muted() { return muted; }, get els() { return els; } },
    };
})();
```

- [ ] **Step 2: Add the script tag**

In `web/AI/chat.html`, immediately after the `chat-actions.js` line (~3666), add:

```html
    <script src="js/voice.js"></script>
```

- [ ] **Step 3: Manual verification**

Open `web/AI/chat.html`. With an empty input, the send button now shows the **waveform** icon (because `VoiceMode.isSupported()` is true in Chrome/Edge). Click it → the voice overlay opens showing "Listening…" and the pulsing orb. Click the red stop → overlay closes and the button returns to the waveform/arrow state. In a browser without `MediaRecorder`, the empty button stays a plain arrow.

- [ ] **Step 4: Commit**

```bash
git add AI/js/voice.js AI/chat.html
git commit -m "feat(voice): VoiceMode module shell + overlay wiring"
```

---

### Task 10: Capture → transcribe → respond → speak loop

**Files:**
- Modify: `web/AI/js/voice.js`

- [ ] **Step 1: Add the audio clients + capture + loop**

In `web/AI/js/voice.js`, inside the IIFE, add these helpers above the `start` function:

```javascript
    let mediaStream = null, recorder = null, audioEl = null;

    async function backendBase() {
        return (window.getOpenAIClient ? await window.getOpenAIClient() : '');
    }
    function authHeaders() {
        const key = (window.settings && window.settings.apiKey) || '';
        return key ? { Authorization: 'Bearer ' + key } : {};
    }

    async function transcribe(blob) {
        const base = await backendBase();
        const fd = new FormData();
        fd.append('file', blob, 'speech.webm');
        const res = await fetch(base + '/v1/audio/transcriptions', { method: 'POST', headers: authHeaders(), body: fd });
        if (!res.ok) throw new Error('STT ' + res.status);
        return ((await res.json()).text || '').trim();
    }

    async function synthesize(text) {
        const base = await backendBase();
        const voice = (window.settings && window.settings.voiceName) || undefined;
        const res = await fetch(base + '/v1/audio/speech', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
            body: JSON.stringify({ input: text, voice: voice, model: 'kokoro', format: 'wav' }),
        });
        if (!res.ok) throw new Error('TTS ' + res.status);
        return URL.createObjectURL(await res.blob());
    }

    // Record one utterance: resolve with a Blob when silence is detected or mic stops.
    function recordUtterance() {
        return new Promise((resolve, reject) => {
            const chunks = [];
            recorder = new MediaRecorder(mediaStream);
            recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
            recorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }));
            recorder.onerror = (e) => reject(e.error || new Error('recorder error'));
            recorder.start();

            // Simple silence detection via Web Audio RMS.
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const src = ctx.createMediaStreamSource(mediaStream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            src.connect(analyser);
            const buf = new Uint8Array(analyser.fftSize);
            let silenceStart = performance.now();
            let spoke = false;
            (function poll() {
                if (!recorder || recorder.state === 'inactive') { ctx.close(); return; }
                analyser.getByteTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
                const rms = Math.sqrt(sum / buf.length);
                const now = performance.now();
                if (rms > 0.04 && !muted) { spoke = true; silenceStart = now; }
                if (spoke && now - silenceStart > 1100) { try { recorder.stop(); } catch (_) {} ctx.close(); return; }
                if (!spoke && now - silenceStart > 9000) { try { recorder.stop(); } catch (_) {} ctx.close(); return; }
                requestAnimationFrame(poll);
            })();
        });
    }

    async function loopOnce() {
        setState('Listening…', false);
        const blob = await recordUtterance();
        if (!active) return;
        setState('Transcribing…', false);
        const text = await transcribe(blob);
        if (!active) return;
        if (!text) { return loopOnce(); }            // heard nothing → listen again
        setTranscript(text);
        setState('Thinking…', false);
        await window.sendMessage(text);              // renders + streams + saves to thread
        if (!active) return;
        const last = window.chatHistory[window.chatHistory.length - 1];
        const reply = (last && last[1]) ? String(last[1]) : '';
        if (reply) {
            setState('Speaking…', true);
            const url = await synthesize(reply.replace(/<[^>]+>/g, ' ').slice(0, 2000));
            await playAudio(url);
        }
        if (active) return loopOnce();
    }

    function playAudio(url) {
        return new Promise((resolve) => {
            audioEl = new Audio(url);
            audioEl.onended = () => { URL.revokeObjectURL(url); resolve(); };
            audioEl.onerror = () => { resolve(); };
            audioEl.play().catch(() => resolve());
        });
    }
```

- [ ] **Step 2: Drive the loop from `start`, release in `stop`**

Replace the `start` and `stop` functions added in Task 9 with:

```javascript
    async function start() {
        if (active || !isSupported()) return;
        cache();
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            if (window.showToast) window.showToast('Microphone access needed for voice mode');
            return;
        }
        active = true;
        els.overlay.classList.add('active');
        setTranscript('');
        try {
            await loopOnce();
        } catch (e) {
            if (window.showToast) window.showToast('Voice error: ' + (e.message || e));
            stop();
        }
    }

    function stop() {
        active = false;
        try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch (_) {}
        try { if (audioEl) audioEl.pause(); } catch (_) {}
        if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
        if (els.overlay) els.overlay.classList.remove('active', 'speaking');
        setTranscript('');
        if (window.updateUI) window.updateUI();
    }
```

- [ ] **Step 3: Manual verification (backend must be running)**

Start the backend (`cd okemollm && python train.py`) with Kokoro assets present and ffmpeg installed. Open `web/AI/chat.html`, set your API key in Settings. Click the voice button, allow the mic, and speak a short question. Confirm: transcript appears → a normal assistant turn streams into the thread → the reply is spoken aloud → it returns to "Listening…". Reload the page and confirm the spoken exchange persisted in the chat. Click stop to exit; the mic light turns off.

- [ ] **Step 4: Commit**

```bash
git add AI/js/voice.js
git commit -m "feat(voice): capture→STT→sendMessage→TTS conversation loop"
```

---

### Task 11: Barge-in + mute behavior

**Files:**
- Modify: `web/AI/js/voice.js`

- [ ] **Step 1: Implement `interrupt` (barge-in)**

Replace the placeholder `interrupt` function with:

```javascript
    function interrupt() {
        // Tapping the orb during playback stops speech and returns to listening.
        if (audioEl) { try { audioEl.pause(); } catch (_) {} audioEl.onended = null; audioEl = null; }
        if (els.overlay) els.overlay.classList.remove('speaking');
    }
```

- [ ] **Step 2: Make mute actually gate capture**

Mute already suppresses RMS voice-detection (the `!muted` check in `recordUtterance`). Update `toggleMute` to also reflect a hint in the state label:

```javascript
    function toggleMute() {
        muted = !muted;
        if (els.mute) els.mute.classList.toggle('muted', muted);
        if (active && muted) setState('Muted', false);
        else if (active) setState('Listening…', false);
    }
```

- [ ] **Step 3: Manual verification**

Enter voice mode, ask something, and while the reply is being spoken, **tap the orb** — playback stops and it returns to Listening. Toggle the mute control — the label shows "Muted" and your speech no longer ends the utterance until unmuted.

- [ ] **Step 4: Commit**

```bash
git add AI/js/voice.js
git commit -m "feat(voice): barge-in interrupt + mute gating"
```

---

### Task 12: Voice settings (enable toggle + voice picker)

**Files:**
- Modify: `web/AI/chat.html` (settings panel rows)
- Modify: `web/AI/js/settings.js` (handlers)

- [ ] **Step 1: Add settings handlers**

Append to `web/AI/js/settings.js`:

```javascript
window.toggleVoiceEnabled = (on) => {
    window.settings.voiceEnabled = !!on;
    window.saveSettings();
    if (window.updateUI) window.updateUI();
};

window.updateVoiceName = (val) => {
    window.settings.voiceName = val;
    window.saveSettings();
};
```

- [ ] **Step 2: Add settings UI**

In `web/AI/chat.html`, find the settings parameters area containing `id="settings-param-max-tokens"` and add this block just after that parameter's row/container:

```html
                <div class="flex items-center justify-between py-2">
                    <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Voice mode</span>
                    <input type="checkbox" id="settings-voice-enabled" checked
                           onchange="window.toggleVoiceEnabled(this.checked)" />
                </div>
                <div class="flex items-center justify-between py-2">
                    <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Voice</span>
                    <select id="settings-voice-name" onchange="window.updateVoiceName(this.value)"
                            class="bg-transparent text-sm text-zinc-700 dark:text-zinc-300 outline-none">
                        <option value="af_sarah">Sarah (US female)</option>
                        <option value="am_adam">Adam (US male)</option>
                        <option value="bf_emma">Emma (UK female)</option>
                        <option value="bm_george">George (UK male)</option>
                    </select>
                </div>
```

- [ ] **Step 3: Reflect saved values on settings open**

In `web/AI/js/settings.js`, inside the function that populates settings inputs (the one setting `settings-param-max-tokens` ~line 29), add:

```javascript
        const vEn = document.getElementById('settings-voice-enabled');
        if (vEn) vEn.checked = window.settings.voiceEnabled !== false;
        const vName = document.getElementById('settings-voice-name');
        if (vName) vName.value = window.settings.voiceName || 'af_sarah';
```

- [ ] **Step 4: Manual verification**

Open Settings: the Voice toggle and voice dropdown appear and reflect stored values. Turn Voice mode **off** → the input button reverts to a plain send arrow when empty and the voice button no longer opens the overlay. Turn it on, pick a different voice, reload — selection persists, and the spoken reply uses the chosen voice.

- [ ] **Step 5: Commit**

```bash
git add AI/chat.html AI/js/settings.js
git commit -m "feat(voice): settings toggle + voice picker"
```

---

### Task 13: Backend-disabled fallback + docs + final pass

**Files:**
- Modify: `web/AI/js/voice.js`
- Modify: `web/CLAUDE.md`

- [ ] **Step 1: Treat 503 / network failure as "voice unavailable"**

In `web/AI/js/voice.js`, replace the `catch` inside `start` (the one wrapping `await loopOnce()`) with a clearer message that also exits cleanly on a disabled/unreachable backend:

```javascript
        try {
            await loopOnce();
        } catch (e) {
            const msg = /50\d/.test(String(e.message)) ? 'Voice is unavailable on the server right now'
                                                       : 'Voice error: ' + (e.message || e);
            if (window.showToast) window.showToast(msg);
            stop();
        }
```

- [ ] **Step 2: Document in `web/CLAUDE.md`**

Add a row to the JS load-order table / notes in `web/CLAUDE.md` describing the new file:

```markdown
- `AI/js/voice.js` — `window.VoiceMode`: full hands-free voice conversation. Records mic
  (MediaRecorder) → `POST /v1/audio/transcriptions` (Whisper) → `window.sendMessage()` →
  `POST /v1/audio/speech` (Kokoro-82M) → playback, looped. Loaded after `chat-actions.js`.
  Backend audio endpoints live in the separate `okemollm/` repo (`train.py`).
```

- [ ] **Step 3: Full manual checklist (from the spec §8)**

Open `web/AI/chat.html` against the running backend and verify each:
1. Bar shows 30px rounding; Shift+Enter expand keeps the bottom rounded; width unchanged.
2. Empty input shows the voice icon; typing swaps to send arrow and sends normally.
3. Voice → mic prompt → speak → transcript → reply renders in thread and is spoken.
4. Reload → voice turns persisted in the chat.
5. Tap orb interrupts playback; stop/end exits and releases the mic.
6. Deny mic permission → graceful toast, no uncaught console errors.
7. Set `audio.enabled: false` in `okemollm/config.yaml`, restart backend → voice attempt shows "unavailable" toast and exits; typed send still works.

- [ ] **Step 4: Commit**

```bash
git add AI/js/voice.js CLAUDE.md
git commit -m "feat(voice): graceful backend-unavailable fallback + docs"
```

---

## Done — definition of complete

- Backend: `cd okemollm && python -m pytest tests/test_audio.py -v` all green; both `/v1/audio/*` routes live behind existing auth, CPU-only.
- Frontend: rounded 30px bar that stays rounded when expanded; circular morphing button; working voice overlay that loops listen→transcribe→respond→speak, saves to the thread, with barge-in, mute, settings, and graceful fallbacks.
- Both repos committed on their respective branches.
