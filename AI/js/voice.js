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
        try {
            if (audioEl) {
                audioEl.pause();
                if (audioEl.src) { URL.revokeObjectURL(audioEl.src); audioEl.src = ''; }
            }
        } catch (_) {}
        audioEl = null;
        if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
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
