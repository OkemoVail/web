// ─── Main Render Function ──────────────────────────────────────

window.render = () => {
    if (!window.els.chatMsgs) return;

    if (window.chatHistory.length === 0) {
        document.body.classList.add("chat-empty");
        const greeting = window.__currentRandomGreeting || "How can I help you today?";
        if (window.els.greeting) window.els.greeting.innerText = greeting;
        window.els.chatMsgs.innerHTML = "";
        window.updateChatTitleDisplay(null);
        return;
    }

    document.body.classList.remove("chat-empty");
    window.els.chatMsgs.innerHTML = "";

    window.chatHistory.forEach((msg, idx) => {
        const isUser = msg[1] === null && idx === window.chatHistory.length - 1 && window.isGenerating ? false : (idx % 2 === 0);
        // Special case for generating state where last item might be the AI response being built
        const actualIsUser = (msg[1] === null && idx === window.chatHistory.length - 1 && window.isGenerating) ? false : (idx % 2 === 0);

        if (idx % 2 === 0) {
            // USER MESSAGE
            const row = document.createElement('div');
            row.className = 'user-row animate-fade-in group';
            row.innerHTML = `
                <div class="user-bubble-container">
                    <div class="user-bubble">
                        <div class="prose-target">${marked.parse(msg[0])}</div>
                        <div class="user-bubble-actions">
                            <button onclick="window.copyUserMsg(${idx}, this)" title="Copy"><i data-feather="copy" class="w-3 h-3"></i></button>
                            <button onclick="window.editMsg(${idx})" title="Edit"><i data-feather="edit-2" class="w-3 h-3"></i></button>
                        </div>
                    </div>
                </div>
            `;
            window.els.chatMsgs.appendChild(row);
        } else {
            // AI MESSAGE
            const row = document.createElement('div');
            row.className = 'ai-row animate-fade-in';
            const isLast = idx === window.chatHistory.length - 1;
            const responseText = msg[1];
            const feedback = msg[2];

            let contentHtml = "";
            if (responseText === null && isLast && window.isGenerating) {
                contentHtml = `<div class="thinking-container"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div>`;
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

            row.innerHTML = `
                <div class="ai-bubble-container group">
                    <div class="prose-target">${contentHtml}</div>
                    ${(responseText && (!isLast || !window.isGenerating)) ? `
                    <div class="flex items-center justify-between gap-4 mt-3 w-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <div class="flex items-center gap-4">
                            <button onclick="window.copyMsg(${idx}, this)" class="opacity-70 hover:opacity-100 transition-all" style="color: var(--accent-color)"><i data-feather="copy" class="w-4 h-4"></i></button>
                            <button onclick="window.regenMsg(${idx - 1})" class="opacity-70 hover:opacity-100" style="color: var(--accent-color)" title="Regenerate"><i data-feather="rotate-cw" class="w-4 h-4"></i></button>
                            <button onclick="window.regenMsgWithSearch(${idx - 1})" class="opacity-70 hover:opacity-100" style="color: var(--accent-color)" title="Regenerate with Web Search"><i data-feather="globe" class="w-4 h-4"></i></button>
                            <button onclick="window.sendFeedback(${idx}, 'good', this)" class="opacity-70 hover:opacity-100 transition-all feedback-btn ${feedback === 'good' ? 'active-good' : ''}" style="color: ${feedback === 'good' ? '#22c55e' : 'var(--accent-color)'}" title="Nice message"><i data-feather="thumbs-up" class="w-4 h-4"></i></button>
                            <button onclick="window.sendFeedback(${idx}, 'bad', this)" class="opacity-70 hover:opacity-100 transition-all feedback-btn ${feedback === 'bad' ? 'active-bad' : ''}" style="color: ${feedback === 'bad' ? '#ef4444' : 'var(--accent-color)'}" title="Bad message"><i data-feather="thumbs-down" class="w-4 h-4"></i></button>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="hallucination-disclaimer">Ontologics are prone to hallucinations.</div>
                            <div class="opacity-40 w-4 h-4 flex items-center justify-center pointer-events-none" style="color: var(--accent-color)" title="${window.currentModel.name}">
                                ${window.currentModel.icon}
                            </div>
                        </div>
                    </div>` : ''}
                </div>
            `;
            window.els.chatMsgs.appendChild(row);
            window.applyContentFeatures(row);
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
