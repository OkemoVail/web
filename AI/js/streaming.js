// ─── Streaming & Typewriter Display ────────────────────────────

window.updateAssistantDisplay = (text, isFinal = false) => {
    const lastProse = window.els.chatMsgs.querySelector('.ai-row:last-child .prose-target');
    if (!lastProse) return;
    const thinkingPlaceholder = lastProse.querySelector('.thinking-container');
    if (thinkingPlaceholder) thinkingPlaceholder.remove();

    const { thought, content } = window.parseThought(text);

    let thoughtContainer = lastProse.querySelector('.thought-container');
    if (thought) {
        if (!thoughtContainer) {
            const thoughtHtml = `
                <div class="thought-container">
                    <div class="thought-header" onclick="window.toggleThought(this)">
                        <span>${window.currentGenerationIsSearch ? "Surfing the web..." : "Thinking Process"}</span>
                        <i data-feather="chevron-down" class="w-3 h-3 transition-transform duration-200 chevron-icon" style="transform: rotate(180deg)"></i>
                    </div>
                    <div class="thought-content expanded">
                        <div class="thought-body whitespace-pre-wrap"></div>
                    </div>
                </div>`;
            lastProse.insertAdjacentHTML('afterbegin', thoughtHtml);
            feather.replace({ 'stroke-width': 2, 'width': 16, 'height': 16 }, lastProse.querySelector('.thought-header'));
            thoughtContainer = lastProse.querySelector('.thought-container');
        }
        const body = thoughtContainer.querySelector('.thought-body');
        if (body) body.innerText = thought;
    }

    let mainContentDiv = lastProse.querySelector('.main-response-content');
    if (!mainContentDiv) {
        mainContentDiv = document.createElement('div');
        mainContentDiv.className = 'main-response-content';
        lastProse.appendChild(mainContentDiv);
    }
    if (content.trim()) {
        const displayContent = !isFinal ? window.ensureClosedCodeBlocks(window.sanitizeText(content)) : window.sanitizeText(content);
        mainContentDiv.innerHTML = marked.parse(displayContent);
        window.applyContentFeatures(mainContentDiv);
    }
    window.els.chatCont.scrollTop = window.els.chatCont.scrollHeight;
};

window.startTypewriter = () => {
    if (window.typeInterval) return;
    window.typeInterval = setInterval(() => {
        if (window.streamQueue.length === 0) {
            if (!window.isGenerating) {
                clearInterval(window.typeInterval);
                window.typeInterval = null;
                window.updateAssistantDisplay(window.typedResponseText, true);
            }
            return;
        }
        const speed = window.isInsideThought(window.typedResponseText) ? window.TYPE_SPEED_THOUGHT : window.TYPE_SPEED_MAIN;
        window.charAccu += speed / 20;
        let charsAdded = 0;
        while (window.charAccu >= 1 && window.streamQueue.length > 0) {
            window.typedResponseText += window.streamQueue[0];
            window.streamQueue = window.streamQueue.substring(1);
            window.charAccu -= 1;
            charsAdded++;
        }
        if (charsAdded > 0) {
            window.updateAssistantDisplay(window.typedResponseText);
        }
    }, 50);
};
