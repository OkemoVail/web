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
