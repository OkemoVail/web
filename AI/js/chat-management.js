// ─── Chat Management (title, save, load, delete, history) ──────

window.generateChatTitle = async (chatId, userMsg, aiMsg, force = false) => {
    if (!force && window[`_generatingTitle_${chatId}`]) return;
    try {
        const baseUrl = await window.getOpenAIClient();
        const response = await fetch(baseUrl + "/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
                "bypass-tunnel-reminder": "true",
                ...(window.settings.apiKey ? { "Authorization": `Bearer ${window.settings.apiKey.trim()}` } : {})
            },
            body: JSON.stringify({
                model: window.currentModel.id,
                messages: [
                    { "role": "system", "content": "You output a chat title. Nothing else.\n\nOutput format: 5 to 10 words, Title Case, on one line. That is the entire response.\n\nABSOLUTE RULES:\n- DO NOT THINK. No reasoning, no <think>, no <thought>, no internal monologue, no \"let me\", no planning out loud. Go straight to the title.\n- Output ONLY the title text — no preface (\"Title:\", \"Here is\", \"Sure\", \"Okay\"), no explanation, no commentary, no follow-up.\n- NO quotes, backticks, asterisks, brackets, or markdown.\n- NO trailing punctuation (period, exclamation, ellipsis).\n- NO ChatML markers or any tags.\n- NO newlines — single line only.\n- Exactly 5 to 10 words. Be specific to the topic, not generic.\n\nExamples (the entire model response is just the title):\nPython Linked List Reversal Using Iteration And Recursion\nCommon Symptoms And Causes Of Iron Deficiency Anemia\nShort Poem About Autumn Leaves And Falling Color\nHow Black Holes Form From Collapsing Massive Stars" },
                    { "role": "user", "content": `Conversation:\nUser: "${userMsg}"\nAssistant: "${(aiMsg || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim().substring(0, 300).replace(/[\r\n]+/g, ' ')}"\n\nRespond with the title only. 5-10 words. No thinking. No other text.` }
                ],
                temperature: 0.3,
                max_tokens: 40,
                stream: false,
                use_thought: false,
                think: false,
                thinking: false
            })
        });

        if (response.ok) {
            const data = await response.json();
            let newTitle = data.choices[0].message.content || '';
            // Strip reasoning blocks, ChatML markers, and any stray tags before the title
            newTitle = newTitle
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g, '')
                .replace(/<\|im_start\|>|<\|im_end\|>/g, '')
                .replace(/<\/?[a-zA-Z][^>]*>/g, '')   // any remaining HTML/XML-ish tags
                .replace(/[\r\n]+/g, ' ')
                .trim();
            // If multiple lines/sentences slipped through, keep the first clause
            newTitle = newTitle.split(/(?<=[.!?])\s+/)[0] || newTitle;
            newTitle = newTitle.replace(/^["'`*\s]+|["'`*\s.]+$/g, '').trim();

            if (window.allChats[chatId]) {
                window.allChats[chatId].title = newTitle;
                await window.StorageController.saveChat(window.allChats[chatId]);
                if (window.currentChatId === chatId) {
                    window.updateChatTitleDisplay(newTitle);
                    window.allChats[chatId].titleFeedback = null;
                    window.updateTitleFeedbackUI(chatId);
                }
                window.renderHistory();
            }
        }
    } catch (e) {
        console.error("Failed to generate title", e);
    } finally {
        delete window[`_generatingTitle_${chatId}`];
    }
};

window.updateChatTitleDisplay = (title) => {
    const titleEl = document.getElementById('top-left-chat-title');
    if (!titleEl) return;

    if (window.chatHistory.length > 0 && title) {
        const textEl = document.getElementById('chat-title-text');
        if (textEl) textEl.innerText = window.truncateTitle(title);
        titleEl.classList.remove('opacity-0');
        titleEl.classList.add('opacity-100', 'pointer-events-auto');
    } else {
        titleEl.classList.remove('opacity-100', 'pointer-events-auto');
        titleEl.classList.add('opacity-0');
    }
};

window.regenerateCurrentTitle = () => {
    if (!window.currentChatId || window.chatHistory.length === 0) return;
    const userMsg = window.chatHistory[0][0];
    const aiMsg = window.chatHistory[0][1];

    const titleEl = document.getElementById('top-left-chat-title');
    if (titleEl) titleEl.classList.add('shimmer-active');

    const btn = document.querySelector('#top-left-chat-title button[onclick*="regenerateCurrentTitle"] i');
    window.generateChatTitle(window.currentChatId, userMsg, aiMsg, true).finally(() => {
        if (titleEl) titleEl.classList.remove('shimmer-active');
    });

    if (window.updateTitleFeedbackUI) window.updateTitleFeedbackUI(window.currentChatId);
    if (btn) {
        btn.classList.add('animate-spin');
        setTimeout(() => btn.classList.remove('animate-spin'), 1000);
    }
};

window.renameChat = async (id) => {
    if (!window.allChats[id]) return;
    const oldTitle = window.allChats[id].title;
    const rawNewTitle = prompt("Enter new chat title:", oldTitle);
    if (rawNewTitle !== null && rawNewTitle.trim() !== "" && rawNewTitle !== oldTitle) {
        const newTitle = rawNewTitle.replace(/[\r\n]+/g, ' ').trim();
        window.allChats[id].title = newTitle;
        await window.StorageController.saveChat(window.allChats[id]);
        if (id === window.currentChatId) {
            window.updateChatTitleDisplay(newTitle);
        }
        window.renderHistory();
    }
};

window.renameCurrentChat = () => {
    if (window.currentChatId) window.renameChat(window.currentChatId);
};

window.save = () => {
    if (!window.chatHistory.length) return;

    const existingChat = window.allChats[window.currentChatId];
    let chatTitle = existingChat?.title;
    const defaultFallbackTitle = window.chatHistory[0][0].substring(0, 30);

    if (!chatTitle || chatTitle === defaultFallbackTitle) {
        chatTitle = defaultFallbackTitle;
    }

    const chat = {
        ...existingChat,
        id: window.currentChatId,
        title: chatTitle,
        history: window.chatHistory,
        timestamp: Date.now(),
        isWebSearch: window.isWebSearch,
        isDeepResearch: window.isDeepResearch,
        isThinkingEnabled: window.isThinkingEnabled,
        canvasEnabled: window.canvasEnabled
    };
    window.allChats[window.currentChatId] = chat;

    window.StorageController.saveChat(chat).then(() => {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => {
                window.renderHistory();
                window.updateStorageUsage();
                if (window.isGoogleSignedIn) window.syncChatsToGoogle();
            });
        } else {
            setTimeout(() => {
                window.renderHistory();
                window.updateStorageUsage();
                if (window.isGoogleSignedIn) window.syncChatsToGoogle();
            }, 100);
        }
    }).catch(err => {
        console.error('Save failed:', err);
    });
};

window.togglePin = async (id) => {
    if (window.allChats[id]) {
        window.allChats[id].pinned = !window.allChats[id].pinned;
        await window.StorageController.saveChat(window.allChats[id]);
        window.renderHistory();
    }
};

window.delChat = async (id) => {
    window.showCustomConfirm(
        'Delete Chat',
        'Are you sure you want to delete this conversation? This action cannot be undone.',
        async () => {
            delete window.allChats[id];
            await window.StorageController.deleteChat(id);
            if (id === window.currentChatId) {
                window.currentChatId = crypto.randomUUID();
                window.updateChatTokens();
                window.chatHistory = [];
                window.render();
            }
            window.renderHistory();
            window.updateStorageUsage();
        },
        true
    );
};

window.loadChat = (id) => {
    if (!window.allChats[id]) return;

    // Exit canvas when loading another chat
    if (typeof window.closeCanvas === 'function') {
        window.closeCanvas();
    }

    const chat = window.allChats[id];
    // Restore toggles if saved, or default to false
    window.isWebSearch = !!chat.isWebSearch;
    window.isDeepResearch = !!chat.isDeepResearch;
    window.isThinkingEnabled = !!chat.isThinkingEnabled;
    window.canvasEnabled = !!chat.canvasEnabled;

    window.currentChatId = id;
    window.updateChatTokens();
    window.chatHistory = chat.history;
    const tokenDisplay = document.getElementById('token-count-display');
    if (tokenDisplay) tokenDisplay.innerText = window.formatTokenCount(chat.tokensUsed || 0);
    window.render();
    window.updateUI();
    if (window.updateTitleFeedbackUI) window.updateTitleFeedbackUI(id);
    window.renderHistory();

    if (window.innerWidth < 1024 && window.els.sidebar) {
        window.els.sidebar.classList.add('-translate-x-full');
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) overlay.style.display = 'none';
    }
};

window.filterChats = (query) => {
    window.renderHistory(query.toLowerCase());
};

window.selectModel = (key) => {
    window.currentModel = window.MODELS[key] || window.MODELS.STUART;
    window.client = null;

    if (window.els.welcomeLogo) {
        window.els.welcomeLogo.innerHTML = window.currentModel.icon;
    }

    const nameEl = document.getElementById('current-model-name');
    if (nameEl) nameEl.innerText = window.currentModel.name;

    const iconEl = document.getElementById('current-model-icon');
    if (iconEl) iconEl.innerHTML = window.currentModel.icon;

    const btns = document.querySelectorAll('#model-menu-input button');
    btns.forEach(btn => {
        btn.style.color = '';
        btn.style.background = '';
    });
    const activeBtn = document.getElementById(`model-btn-${key}`);
    if (activeBtn) {
        activeBtn.style.color = 'var(--accent-contrast)';
        activeBtn.style.background = 'var(--accent-color)';
    }

    window.updateUI();
    window.closeAllMenus();
};

window.resetChat = () => {
    // Exit canvas when creating a new chat
    if (typeof window.closeCanvas === 'function') {
        window.closeCanvas();
    }

    // Reset toggles to 0 when starting a new chat
    window.isWebSearch = false;
    window.isDeepResearch = false;
    window.isThinkingEnabled = false;
    window.canvasEnabled = false;

    window.toggleSendIcon('send');
    if (window.isGenerating && window.currentJob) window.currentJob.cancel();
    window.currentChatId = crypto.randomUUID(); window.chatHistory = []; window.isGenerating = false;
    const tokenDisplay = document.getElementById('token-count-display');
    if (tokenDisplay) tokenDisplay.innerText = window.formatTokenCount(0);

    const history = document.getElementById("chat-messages");
    if (history) history.innerHTML = "";
    document.body.classList.add("chat-empty");
    if (window.initChatUI) window.initChatUI();

    if (window.innerWidth < 1024 && window.els.sidebar) {
        window.els.sidebar.classList.add('-translate-x-full');
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    window.render(); window.updateUI();
};

window.clearAll = async () => {
    window.allChats = {};
    await window.StorageController.clearAll();
    if (window.isGoogleSignedIn) window.deleteChatsFromGoogle();
    window.resetChat();
    window.renderHistory();
    window.updateStorageUsage();
};

window.updateStorageUsage = async () => {
    try {
        const bytes = await window.StorageController.estimateSize();
        const mbVal = bytes / (1024 * 1024);
        const label = mbVal < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mbVal.toFixed(2)} MB`;
        const d1 = document.getElementById('storage-display');
        const d2 = document.getElementById('storage-display-sidebar');
        if (d1) d1.innerText = label;
        if (d2) d2.innerText = label;
    } catch (e) {
        const d1 = document.getElementById('storage-display');
        const d2 = document.getElementById('storage-display-sidebar');
        if (d1) d1.innerText = '—';
        if (d2) d2.innerText = '—';
    }
};
