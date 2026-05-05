// ─── UI State Updates ──────────────────────────────────────────

window.updateUI = () => {
    // 1. Send / Stop button transition
    const iconWrapper = document.getElementById('send-icon-wrapper');
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('user-input');

    if (sendBtn) {
        const hasText = input && input.value.trim().length > 0;
        const shouldEnable = window.isGenerating || hasText;

        if (shouldEnable) {
            sendBtn.disabled = false;
            sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            sendBtn.classList.add('opacity-100', 'cursor-pointer', 'hover:opacity-90');
        } else {
            sendBtn.disabled = true;
            sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
            sendBtn.classList.remove('opacity-100', 'cursor-pointer', 'hover:opacity-90');
        }
    }

    if (iconWrapper) {
        if (window.isGenerating) {
            iconWrapper.innerHTML = '<i class="fa-solid fa-square text-sm"></i>';
        } else {
            iconWrapper.innerHTML = '<i class="fa-solid fa-paper-plane text-sm"></i>';
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
    const plusThinkIndicator = document.getElementById('plus-think-indicator');
    const deepResearchBtn = document.getElementById('deep-research-btn');
    const thinkBtn = document.getElementById('think-btn');
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

    if (thinkBtn) {
        if (window.isThinkingEnabled) {
            thinkBtn.classList.add('active');
            thinkBtn.style.color = activeColor;
            thinkBtn.style.background = 'var(--accent-glow)';
            if (plusThinkIndicator) plusThinkIndicator.style.display = 'flex';
        } else {
            thinkBtn.classList.remove('active');
            thinkBtn.style.color = '';
            thinkBtn.style.background = '';
            if (plusThinkIndicator) plusThinkIndicator.style.display = 'none';
        }
    }

    if (plusActiveIcon) {
        plusActiveIcon.style.display = (window.isWebSearch || window.isDeepResearch || window.isThinkingEnabled) ? 'flex' : 'none';
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
};

window.toggleDeepResearch = () => {
    window.isDeepResearch = !window.isDeepResearch;
    window.updateUI();
};

window.toggleThinking = () => {
    window.isThinkingEnabled = !window.isThinkingEnabled;
    window.updateUI();
};

