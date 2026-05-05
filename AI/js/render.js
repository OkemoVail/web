// ─── Main Render Function ──────────────────────────────────────

window.render = () => {
    if (!window.els.chatMsgs) return;

    if (window.chatHistory.length === 0) {
        document.body.classList.add("chat-empty");
        if (window.els.welcome) window.els.welcome.style.display = 'flex';
        const greeting = window.__currentRandomGreeting || "How can I help you today?";
        if (window.els.greeting) window.els.greeting.innerText = greeting;
        window.els.chatMsgs.innerHTML = "";
        window.updateChatTitleDisplay(null);
        return;
    }

    document.body.classList.remove("chat-empty");
    if (window.els.welcome) window.els.welcome.style.display = 'none';
    window.els.chatMsgs.innerHTML = "";

    window.chatHistory.forEach((pair, pairIdx) => {
        const [userMsg, responseText, feedback, timestamp] = pair;

        // 1. Render USER Row
        const userRow = document.createElement('div');
        userRow.className = 'user-row animate-fade-in group';
        userRow.innerHTML = `
            <div class="user-bubble-container">
                <div class="user-msg-bubble">
                    <div class="prose-target">${marked.parse(userMsg)}</div>
                </div>
                <div class="user-msg-actions">
                    <span class="msg-timestamp">${window.formatDate(timestamp)}</span>
                    <button onclick="window.copyUserMsg(${pairIdx}, this)" title="Copy" class="user-msg-action-btn"><i data-feather="copy"></i></button>
                    <button onclick="window.editMsg(${pairIdx})" title="Edit" class="user-msg-action-btn"><i data-feather="edit-2"></i></button>
                </div>
            </div>
        `;
        window.els.chatMsgs.appendChild(userRow);

        // 2. Render AI Row (if exists or generating)
        const isLast = pairIdx === window.chatHistory.length - 1;
        if (responseText !== null || (isLast && window.isGenerating)) {
            const aiRow = document.createElement('div');
            aiRow.className = 'ai-row animate-fade-in';
            
            let contentHtml = "";
            if (responseText === null && isLast && window.isGenerating) {
                const _thinkingPhrases = ['Pondering...','Scheming...','Hallucinating...','Vibing...','Cooking...','Brewing...','Buffering...','Noodling...','Marinating...','Ruminating...','Conspiring...','Daydreaming...','Manifesting...','Simmering...','Deliberating...','Cogitating...','Calculating...','Contemplating...','Overcooking...','Zoning out...'];
                const _phrase = _thinkingPhrases[Math.floor(Math.random() * _thinkingPhrases.length)];
                contentHtml = `<div class="thinking-container"><span class="thinking-shimmer">${_phrase}</span></div>`;
            } else if (responseText) {
                const { thought, content } = window.parseThought(responseText);
                if (thought) {
                    contentHtml += `
                        <div class="thought-container">
                            <div class="thought-header" onclick="window.toggleThought(this)">
                                <span>${window.currentGenerationIsSearch ? "Surfing the web..." : "Thinking Process"}</span>
                                <i data-feather="chevron-down" class="w-3 h-3 transition-transform duration-200 chevron-icon" style="transform: rotate(0deg)"></i>
                            </div>
                            <div class="thought-content">
                                <div class="thought-body whitespace-pre-wrap">${thought}</div>
                            </div>
                        </div>`;
                }
                contentHtml += `<div class="main-response-content">${marked.parse(window.sanitizeText(content))}</div>`;
            }

            aiRow.innerHTML = `
                <div class="ai-bubble-container group">
                    <div class="prose-target">${contentHtml}</div>
                    ${(responseText && (!isLast || !window.isGenerating)) ? `
                    <div class="ai-msg-actions">
                        <div class="ai-actions-left">
                            <button onclick="window.copyMsg(${pairIdx}, this)" class="ai-action-btn" title="Copy"><i data-feather="copy" class="w-4 h-4"></i></button>
                            <button onclick="window.regenMsg(${pairIdx})" class="ai-action-btn" title="Regenerate"><i data-feather="rotate-cw" class="w-4 h-4"></i></button>
                        </div>
                        <div class="ai-actions-right">
                            <button onclick="window.sendFeedback(${pairIdx}, 'good', this)" class="ai-action-btn feedback-btn" style="${feedback === 'good' ? 'color:#22c55e' : ''}" title="Good response"><i data-feather="thumbs-up" class="w-4 h-4"></i></button>
                            <button onclick="window.sendFeedback(${pairIdx}, 'bad', this)" class="ai-action-btn feedback-btn" style="${feedback === 'bad' ? 'color:#ef4444' : ''}" title="Bad response"><i data-feather="thumbs-down" class="w-4 h-4"></i></button>
                            <span class="msg-timestamp ai-timestamp">${window.formatDate(timestamp)}</span>
                        </div>
                    </div>` : ''}
                </div>
            `;
            window.els.chatMsgs.appendChild(aiRow);
            window.applyContentFeatures(aiRow);
        }
    });

    feather.replace({ 'stroke-width': 2, 'width': 16, 'height': 16 });
    if (!window.isGenerating) {
        window.els.chatCont.scrollTop = window.els.chatCont.scrollHeight;
    }

    const currentTitle = window.allChats[window.currentChatId]?.title;
    window.updateChatTitleDisplay(currentTitle);
};

window.formatTokenCount = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};
