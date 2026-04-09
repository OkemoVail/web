// ─── UI State Updates ──────────────────────────────────────────

window.updateUI = () => {
    // 1. Send / Stop button transition
    const iconWrapper = document.getElementById('send-icon-wrapper');
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
        const greeting = window.__currentRandomGreeting || "How can I help you today?";
        if (window.els.greeting) window.els.greeting.innerText = greeting;
    } else {
        document.body.classList.remove("chat-empty");
    }

    // 3. Search button
    if (window.els.searchBtn) {
        if (window.isWebSearch) {
            window.els.searchBtn.classList.add('active');
            window.els.searchBtn.style.color = 'var(--accent-color)';
            window.els.searchBtn.style.background = 'var(--accent-glow)';
        } else {
            window.els.searchBtn.classList.remove('active');
            window.els.searchBtn.style.color = '';
            window.els.searchBtn.style.background = '';
        }
    }

    // 4. Thinking button
    if (window.els.thoughtBtn) {
        if (window.isThinkingEnabled) {
            window.els.thoughtBtn.classList.add('active');
            window.els.thoughtBtn.style.color = 'var(--accent-color)';
            window.els.thoughtBtn.style.background = 'var(--accent-glow)';
        } else {
            window.els.thoughtBtn.classList.remove('active');
            window.els.thoughtBtn.style.color = '';
            window.els.thoughtBtn.style.background = '';
        }
    }

    // 5. Placeholder
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
    const color = window.settings.accent === 'auto' ? '#BFD7B5' : window.settings.accent;
    favicon.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22${encodeURIComponent(color)}%22 /></svg>`;
};

window.toggleSearch = () => {
    window.isWebSearch = !window.isWebSearch;
    window.updateUI();
};

window.toggleThinking = () => {
    window.isThinkingEnabled = !window.isThinkingEnabled;
    window.updateUI();
};
