// ─── Chat Actions (send, regen, copy, feedback, etc.) ──────────

window.handleAction = () => {
    console.log("handleAction: isGenerating?", window.isGenerating);
    if (window.isGenerating) {
        console.log("🛑 Stop button clicked. Terminating job:", window.currentJobId);

        window.isGenerating = false;
        window.toggleSendIcon('send');

        if (window.abortController) { window.abortController.abort(); window.abortController = null; }
        if (window.typeInterval) { clearInterval(window.typeInterval); window.typeInterval = null; }
        window.streamQueue = "";

        if (window.currentJobId) {
            try {
                const baseUrl = window.currentModel.id.split('/gradio')[0];
                console.log("Sending kill signal to:", baseUrl + "/cancel_job");
                fetch(baseUrl + '/cancel_job', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ job_id: window.currentJobId })
                }).then(r => console.log("Stop signal sent, response ok:", r.ok))
                    .catch(err => console.error("Kill signal fetch failed:", err));
            } catch (e) { console.error("Failed to construct kill URL:", e); }
        }

        try { if (window.currentJob) window.currentJob.cancel(); } catch (e) { console.warn("Internal Gradio cancel failed (safe to ignore):", e); }

        if (window.chatHistory.length > 0) {
            window.chatHistory[window.chatHistory.length - 1][1] = (window.chatHistory[window.chatHistory.length - 1][1] || "") + `\n\n<p class='opacity-40 text-xs uppercase tracking-widest mt-2'>${window.translations[window.settings.lang || 'en'].terminated}</p>`;
        }

        window.render(); window.updateUI(); window.save();
    } else {
        window.sendMessage();
    }
};

window.sendMessage = async (txt = null, forceSearch = false) => {
    console.log("sendMessage called, isGenerating:", window.isGenerating);
    if (window.isGenerating) {
        console.log("Blocked: still generating");
        return;
    }
    let msg = txt || window.els.input.value.trim();
    if (!msg) return;

    let displayMsg = msg;
    if (displayMsg.startsWith('/search ')) {
        displayMsg = displayMsg.substring(8).trim();
    }

    window.streamQueue = "";
    window.typedResponseText = "";
    window.charAccu = 0;
    window.els.input.value = ""; window.els.input.style.height = "auto";

    console.log("Attempting to connect to:", window.currentModel.id);

    let lastProse = null;

    window.chatHistory.push([displayMsg, null, null, Date.now()]);
    window.currentGenerationIsSearch = window.isWebSearch || forceSearch;
    window.isGenerating = true;
    window.currentJobId = Math.random().toString(36).substring(7);
    window.render(); window.els.chatCont.scrollTo({ top: window.els.chatCont.scrollHeight, behavior: 'smooth' });
    window.updateUI();
    window.toggleSendIcon('stop');
    try {
        const baseUrl = await window.getOpenAIClient();
        console.log("Connecting to OpenAI Stream at:", baseUrl + "/v1/chat/completions");

        const messages = [];
        if (window.settings.systemPrompt) {
            messages.push({ role: "system", content: window.settings.systemPrompt });
        }

        for (const [u, a] of window.chatHistory.slice(0, -1)) {
            messages.push({ role: "user", content: u });
            if (a) messages.push({ role: "assistant", content: a });
        }
        messages.push({ role: "user", content: msg });

        window.abortController = new AbortController();
        const response = await fetch(baseUrl + "/v1/chat/completions", {
            method: "POST",
            signal: window.abortController.signal,
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
                "bypass-tunnel-reminder": "true",
                ...(window.settings.apiKey ? { "Authorization": `Bearer ${window.settings.apiKey.trim()}` } : {})
            },
            body: JSON.stringify({
                model: window.currentModel.id,
                messages: messages,
                max_tokens: window.settings.max_tokens || 4096,
                stream: true,
                web_search: window.currentGenerationIsSearch,
                use_thought: window.isThinkingEnabled,
                temperature: window.settings.temp,
                top_p: window.settings.top_p || 0.9,
                chat_id: window.currentChatId,
                job_id: window.currentJobId
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let responseText = "";
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                const cleanLine = line.trim();
                if (!cleanLine || !cleanLine.startsWith("data: ")) continue;
                const dataStr = cleanLine.substring(6).trim();
                if (dataStr === "[DONE]") break;

                try {
                    const data = JSON.parse(dataStr);
                    const delta = data.choices[0].delta?.content || "";
                    const finishReason = data.choices[0].finish_reason;
                    if (delta !== "__DONE__") {
                        responseText += delta;
                        window.streamQueue += delta;
                        window.startTypewriter();
                    }

                    // --- LIVE VOICE TTS STREAMING ---
                    if (window.isVoiceActive && delta) {
                        window.voiceManager.addDelta(delta);
                    }
                    // --------------------------------

                    if (finishReason === "stop" || finishReason === "length") {
                        break;
                    }
                } catch (e) {
                    console.warn("SSE stream parse error:", e);
                }
            }
        }

        responseText = window.sanitizeText(responseText);
        window.chatHistory[window.chatHistory.length - 1][1] = responseText;
        window.isGenerating = false;
        if (typeof stopTokenPolling === 'function') stopTokenPolling();
        window.updateUI();
        window.toggleSendIcon('send');

        const lastProseEl = window.els.chatMsgs.querySelector('.ai-row:last-child .prose-target');
        if (lastProseEl && responseText) {
            const { thought, content } = window.parseThought(responseText);

            let thoughtContainer = lastProseEl.querySelector('.thought-container');
            if (thought) {
                if (!thoughtContainer) {
                    const thoughtHtml = `
                        <div class="thought-container">
                            <div class="thought-header" onclick="window.toggleThought(this)">
                                <span>Thinking Process</span>
                                <i data-feather="chevron-down" class="w-3 h-3 transition-transform duration-200 chevron-icon" style="transform: rotate(180deg)"></i>
                            </div>
                            <div class="thought-content expanded">
                                <div class="thought-body whitespace-pre-wrap"></div>
                            </div>
                        </div>`;
                    lastProseEl.insertAdjacentHTML('afterbegin', thoughtHtml);
                    thoughtContainer = lastProseEl.querySelector('.thought-container');
                }
                const body = thoughtContainer.querySelector('.thought-body');
                if (body) body.innerText = thought;
            }

            let mainContentDiv = lastProseEl.querySelector('.main-response-content');
            if (!mainContentDiv) {
                mainContentDiv = document.createElement('div');
                mainContentDiv.className = 'main-response-content';
                lastProseEl.appendChild(mainContentDiv);
            }
            mainContentDiv.innerHTML = marked.parse(window.sanitizeText(content));
            window.applyContentFeatures(mainContentDiv);
        }

        if (lastProseEl) {
            if (!lastProseEl.parentNode.querySelector('.ai-msg-actions')) {
                const actionRow = document.createElement('div');
                actionRow.className = 'ai-msg-actions animate-fade-in';
                actionRow.innerHTML = `
                    <button onclick="window.copyMsg(${window.chatHistory.length - 1}, this)" class="ai-action-btn" title="Copy"><i data-feather="copy" class="w-4 h-4"></i></button>
                    <button onclick="window.regenMsg(${window.chatHistory.length - 1})" class="ai-action-btn" title="Regenerate"><i data-feather="rotate-cw" class="w-4 h-4"></i></button>
                    <button onclick="window.sendFeedback(${window.chatHistory.length - 1}, 'good', this)" class="ai-action-btn feedback-btn" title="Good response"><i data-feather="thumbs-up" class="w-4 h-4"></i></button>
                    <button onclick="window.sendFeedback(${window.chatHistory.length - 1}, 'bad', this)" class="ai-action-btn feedback-btn" title="Bad response"><i data-feather="thumbs-down" class="w-4 h-4"></i></button>
                    <span class="msg-timestamp ai-timestamp">${window.formatDate(window.chatHistory[window.chatHistory.length - 1][3])}</span>
                `;
                lastProseEl.parentNode.appendChild(actionRow);
                feather.replace({ 'stroke-width': 2, 'width': 16, 'height': 16 }, actionRow);
            }
        }
        window.currentJob = null;
        console.log("Streaming complete");

        if (window.chatHistory.length > 0 && window.chatHistory[0][1] && !window[`_generatingTitle_${window.currentChatId}`]) {
            const existingTitle = window.allChats[window.currentChatId]?.title;
            const fallback = window.chatHistory[0][0].substring(0, 30);
            if (!existingTitle || existingTitle === fallback) {
                window.generateChatTitle(window.currentChatId, window.chatHistory[0][0], window.chatHistory[0][1]);
            }
        }

        window.render();
        window.updateUI();
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log("Stream aborted by user.");
        } else {
            console.error("Chat Error Detail:", e);
            if (window.chatHistory.length > 0 && window.chatHistory[window.chatHistory.length - 1][1] === null) {
                window.chatHistory[window.chatHistory.length - 1][1] = `⚠️ [${e.message || 'Unknown'}]`;
            }
            window.render();
        }
    } finally {
        window.isGenerating = false;
        window.updateUI();
        window.toggleSendIcon('send');
        if (window.typeInterval) {
            clearInterval(window.typeInterval);
            window.typeInterval = null;
        }
        window.save();
    }
};

window.copyMsg = (idx, btnEl) => {
    const content = window.chatHistory[idx][1] || '';
    navigator.clipboard.writeText(content);
    const originalHTML = btnEl.innerHTML;
    btnEl.innerHTML = feather.icons.check.toSvg({ class: 'w-4 h-4' });
    setTimeout(() => { btnEl.innerHTML = originalHTML; }, 2000);
};

window.copyUserMsg = (idx, btnEl) => {
    const content = window.chatHistory[idx][0] || '';
    navigator.clipboard.writeText(content);
    const originalHTML = btnEl.innerHTML;
    btnEl.innerHTML = feather.icons.check.toSvg({ class: 'w-3 h-3' });
    setTimeout(() => { btnEl.innerHTML = originalHTML; }, 2000);
};

window.editMsg = (idx) => {
    if (window.isGenerating) return;
    const msg = window.chatHistory[idx][0];
    window.chatHistory = window.chatHistory.slice(0, idx);
    window.els.input.value = msg;
    window.els.input.style.height = 'auto';
    window.els.input.style.height = window.els.input.scrollHeight + 'px';
    window.els.input.focus();
    window.render(); window.updateUI(); window.save();
};

window.regenMsg = (idx) => { if (!window.isGenerating) { const msg = window.chatHistory[idx][0]; window.chatHistory = window.chatHistory.slice(0, idx); window.sendMessage(msg); } };

window.regenMsgWithSearch = (idx) => {
    if (!window.isGenerating) {
        const msg = window.chatHistory[idx][0];
        window.chatHistory = window.chatHistory.slice(0, idx);
        window.sendMessage(msg, true);
    }
};
