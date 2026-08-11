// ─── Streaming & Typewriter Display ────────────────────────────

window.updateAssistantDisplay = (text, isFinal = false) => {
    const lastProse = window.els.chatMsgs.querySelector('.ai-row:last-child .prose-target');
    if (!lastProse) return;
    const thinkingPlaceholder = lastProse.querySelector('.thinking-container');
    if (thinkingPlaceholder) thinkingPlaceholder.remove();

    if (isFinal) {
        // Extract <remember> tags → summarize via API, strip from displayed text
        const rememberRe = /<remember>([\s\S]*?)<\/remember>/g;
        let remMatch;
        const rawMemories = [];
        while ((remMatch = rememberRe.exec(text)) !== null) {
            const memText = remMatch[1].trim();
            if (memText) rawMemories.push(memText);
        }
        if (rawMemories.length > 0) {
            text = text.replace(/<remember>[\s\S]*?<\/remember>/g, '').replace(/\n{3,}/g, '\n\n').trim();
            window.typedResponseText = text;
            if (window.chatHistory.length > 0) window.chatHistory[window.chatHistory.length - 1][1] = text;
            rawMemories.forEach(raw => {
                if (typeof window.summarizeAndSaveMemory === 'function') {
                    window.summarizeAndSaveMemory(raw);
                } else {
                    if (!Array.isArray(window.settings.memories)) window.settings.memories = [];
                    window.settings.memories.push({ id: Date.now().toString(36), text: raw, source: 'model', createdAt: new Date().toISOString() });
                    window.saveSettings();
                }
            });
        }

        const genHeader = lastProse.querySelector('.model-generating-header');
        if (genHeader) {
            genHeader.classList.add('done');
            setTimeout(() => genHeader.remove(), 420);
        }
    }

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
    const visibleContent = content
        .replace(/<remember>[\s\S]*?<\/remember>/gi, '')
        .replace(/<remember>[^]*$/i, '')
        .trim();
    if (visibleContent) {
        const displayContent = !isFinal ? window.ensureClosedCodeBlocks(window.sanitizeText(visibleContent)) : window.sanitizeText(visibleContent);
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
                if (typeof window.finalizeLastAIMessage === 'function') {
                    try { window.finalizeLastAIMessage(); } catch (e) { console.error('finalizeLastAIMessage failed:', e); }
                }
            }
            return;
        }
        // Adaptive drain: floor = the classic typewriter speed; when the queue
        // outruns the floor, accelerate proportionally (backlog drains in ~6
        // ticks), capped at 50 chars/tick (1000 chars/s) so it never "dumps".
        const speedFloor = window.isInsideThought(window.typedResponseText) ? window.TYPE_SPEED_THOUGHT : window.TYPE_SPEED_MAIN;
        window.charAccu += Math.min(Math.max(speedFloor / 20, window.streamQueue.length / 6), 50);
        let charsAdded = 0;
        while (window.charAccu >= 1 && window.streamQueue.length > 0) {
            window.typedResponseText += window.streamQueue[0];
            window.streamQueue = window.streamQueue.substring(1);
            window.charAccu -= 1;
            charsAdded++;
        }
        if (charsAdded > 0) {
            if (window.chatHistory.length > 0) {
                window.chatHistory[window.chatHistory.length - 1][1] = window.typedResponseText;
            }
            window.updateAssistantDisplay(window.typedResponseText);
        }
    }, 50);
};
