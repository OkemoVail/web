// ─── UI State Updates ──────────────────────────────────────────

window.updateUI = () => {
    // 1. Send / Stop button transition
    const iconWrapper = document.getElementById('send-icon-wrapper');
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('user-input');

    const VOICE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="10" x2="4" y2="14"/><line x1="8" y1="7" x2="8" y2="17"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="16" y1="7" x2="16" y2="17"/><line x1="20" y1="10" x2="20" y2="14"/></svg>';

    const voiceReady = !window.isGenerating
        && !(input && input.value.trim().length > 0)
        && !!(window.VoiceMode && window.VoiceMode.isSupported && window.VoiceMode.isSupported());

    if (sendBtn) {
        const hasText = input && input.value.trim().length > 0;
        const shouldEnable = window.isGenerating || hasText || voiceReady;

        const isDarkSend = document.documentElement.classList.contains('dark');
        const sendActive = window.isGenerating || hasText;
        sendBtn.style.backgroundColor = sendActive ? 'var(--accent-color)' : (isDarkSend ? '#3a3a3d' : '#e4e4e7');
        sendBtn.style.color = sendActive ? 'var(--accent-contrast)' : (isDarkSend ? '#e9e9ec' : '#52525b');

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

    // 2. Chat empty state
    if (window.chatHistory.length === 0) {
        document.body.classList.add("chat-empty");
        if (window.els.welcome) window.els.welcome.style.display = 'flex';
        if (window.els.input) window.els.input.placeholder = window.getT('input_placeholder', { model: window.currentModel.name });
    } else {
        document.body.classList.remove("chat-empty");
        if (window.els.welcome) window.els.welcome.style.display = 'none';
        if (window.els.input) window.els.input.placeholder = window.getT('reply_placeholder', { model: window.currentModel.name });
    }

    // 3. Search button
    const isDark = document.documentElement.classList.contains('dark');
    const plusActiveIcon = document.getElementById('plus-active-icon');
    const plusSearchIndicator = document.getElementById('plus-search-indicator');
    const plusResearchIndicator = document.getElementById('plus-research-indicator');
    const plusCanvasIndicator = document.getElementById('plus-canvas-indicator');
    const deepResearchBtn = document.getElementById('deep-research-btn');
    const canvasToggleBtn = document.getElementById('canvas-toggle-btn');
    const activeColor = isDark ? '#ffffff' : 'var(--accent-color)';

    if (window.els.searchBtn) {
        if (window.isWebSearch) {
            window.els.searchBtn.classList.add('active');
            window.els.searchBtn.style.color = activeColor;
            window.els.searchBtn.style.background = 'var(--accent-glow)';
            if (plusSearchIndicator) plusSearchIndicator.style.display = 'flex';
        } else {
            window.els.searchBtn.classList.remove('active');
            window.els.searchBtn.style.color = '';
            window.els.searchBtn.style.background = '';
            if (plusSearchIndicator) plusSearchIndicator.style.display = 'none';
        }
    }

    if (deepResearchBtn) {
        if (window.isDeepResearch) {
            deepResearchBtn.classList.add('active');
            deepResearchBtn.style.color = activeColor;
            deepResearchBtn.style.background = 'var(--accent-glow)';
            if (plusResearchIndicator) plusResearchIndicator.style.display = 'flex';
        } else {
            deepResearchBtn.classList.remove('active');
            deepResearchBtn.style.color = '';
            deepResearchBtn.style.background = '';
            if (plusResearchIndicator) plusResearchIndicator.style.display = 'none';
        }
    }

    const modeLabel = document.getElementById('mode-label');
    const modeDot = document.getElementById('mode-dot');
    if (modeLabel) modeLabel.textContent = window.isThinkingEnabled ? 'Thinking' : 'Fast';
    if (modeDot) modeDot.style.background = window.isThinkingEnabled ? 'var(--accent-color)' : 'var(--text-tertiary)';

    if (canvasToggleBtn) {
        if (window.canvasEnabled) {
            canvasToggleBtn.classList.add('active');
            canvasToggleBtn.style.color = activeColor;
            canvasToggleBtn.style.background = 'var(--accent-glow)';
            if (plusCanvasIndicator) plusCanvasIndicator.style.display = 'flex';
        } else {
            canvasToggleBtn.classList.remove('active');
            canvasToggleBtn.style.color = '';
            canvasToggleBtn.style.background = '';
            if (plusCanvasIndicator) plusCanvasIndicator.style.display = 'none';
        }
    }

    if (plusActiveIcon) {
        plusActiveIcon.style.display = (window.isWebSearch || window.isDeepResearch || window.isThinkingEnabled || window.canvasEnabled) ? 'flex' : 'none';
    }

    // 4. Placeholder
    if (window.els.input) {
        const dict = window.translations[window.settings.lang || 'en'];
        const placeholder = (window.chatHistory && window.chatHistory.length > 0) ? dict.reply_placeholder : dict.input_placeholder;
        window.els.input.placeholder = placeholder.replace('{{model}}', window.currentModel.name);
    }

    // 6. Favicon
    let favicon = document.getElementById('dynamic-favicon');
    if (!favicon) {
        favicon = document.createElement('link');
        favicon.id = 'dynamic-favicon';
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
    }
    const color = window.settings.accent === 'auto' ? '#9EB393' : window.settings.accent;
    favicon.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22${encodeURIComponent(color)}%22 /></svg>`;
};

window.toggleSearch = () => {
    window.isWebSearch = !window.isWebSearch;
    window.updateUI();
    if (window.chatHistory && window.chatHistory.length > 0 && typeof window.save === 'function') {
        window.save();
    }
};

window.toggleDeepResearch = () => {
    window.isDeepResearch = !window.isDeepResearch;
    window.updateUI();
    if (window.chatHistory && window.chatHistory.length > 0 && typeof window.save === 'function') {
        window.save();
    }
};

window.toggleThinking = () => {
    window.isThinkingEnabled = !window.isThinkingEnabled;
    window.updateUI();
    if (window.chatHistory && window.chatHistory.length > 0 && typeof window.save === 'function') {
        window.save();
    }
};

window.setThinkingMode = (on) => {
    window.isThinkingEnabled = !!on;
    window.updateUI();
    if (typeof window.closeAllMenus === 'function') window.closeAllMenus();
    if (window.chatHistory && window.chatHistory.length > 0 && typeof window.save === 'function') {
        window.save();
    }
};

