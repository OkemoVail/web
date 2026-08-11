// ─── Chat Management (title, save, load, delete, history) ──────

const TITLE_META_RE = /^(the user|user is|this (chat|conversation|is)|in this (chat|conversation))/i;

const TITLE_SYSTEM_PROMPT = `You are Saga naming this conversation for a sidebar list. Write ONE line (4-12 words) that makes the topic instantly obvious — someone scanning the list should know what this chat is at a glance.

Voice: you at your most chaotic — puns, CAPS for emphasis, dry jokes, punctuation play (! ... —), lowercase by default. The joke decorates the topic; it never replaces it. If the digest shows the chat drifted between topics, name the arc or the dominant topic.

Hard rules: no emoji, no quotes, no trailing period, no explanation, title only. NEVER describe the user or the conversation itself: no "the user", no "this conversation", no "someone asked".

Examples:
"hi" → oh, just saying hi
"hey what's up" → small talk, big potential
"my flask route keeps 404ing" → FLASK 404: a tragedy in one route
"write a sci-fi story about mars" → mars sci-fi, because earth was boring
"what causes iron deficiency anemia" → iron deficiency, or: why you're tired
"how do I center a div" → centering a div, hour three
a chat that starts with css centering and drifts to docker → css grief, then docker (classic)`;

window.cleanChatTitle = (raw) => {
    let t = (raw || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
        .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g, '')
        .replace(/<\|im_start\|>|<\|im_end\|>/g, '')
        .replace(/<\/?[a-zA-Z][^>]*>/g, '')   // any remaining HTML/XML-ish tags
        .replace(/[\r\n]+/g, ' ')
        .trim();
    // If multiple lines/sentences slipped through, keep the first clause
    t = t.split(/(?<=[.!?])\s+/)[0] || t;
    t = t.replace(/^["'`*\s]+|["'`*\s.]+$/g, '').trim();
    return t;
};

const TITLE_DIGEST_BUDGET = 900;

// Builds the user-message payload for title generation from the WHOLE chat:
// the first user message (anchored) + the last 5 exchanges, think-tags
// stripped, capped at TITLE_DIGEST_BUDGET chars (oldest middle lines dropped
// first — the anchor and the newest turns are never removed).
window.buildTitleDigest = (history) => {
    const clean = (s) => (typeof s === 'string' ? s : '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
        .replace(/[\r\n]+/g, ' ')
        .trim();
    const clip = (s, n) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);
    const pairs = (history || []).filter(p => p && (clean(p[0]) || clean(p[1])));
    if (!pairs.length) return '';

    const recent = pairs.slice(-5);
    const lines = [];
    if (pairs.length > recent.length) lines.push(`First message: "${clip(clean(pairs[0][0]), 200)}"`);
    for (const [u, a] of recent) {
        lines.push(`User: "${clip(clean(u), 120)}"`);
        const ac = clean(a);
        if (ac) lines.push(`Assistant: "${clip(ac, 120)}"`);
    }
    while (lines.join('\n').length > TITLE_DIGEST_BUDGET && lines.length > 3) lines.splice(1, 1);
    return lines.join('\n');
};

const TITLE_REFRESH_EVERY = 4;

// Auto-title gate. Due when: the chat is brand new (not yet persisted), the
// title is still the first-30-chars fallback, or TITLE_REFRESH_EVERY replies
// have landed since the last successful title. Locked by: manual rename
// (titleManual) or a thumbs-up on the title (titleFeedback === 'good').
// Manual Regenerate bypasses this gate entirely (it calls generateChatTitle
// with force=true without consulting chatTitleDue).
window.chatTitleDue = (chat, historyLength) => {
    if (!chat) return true;
    if (chat.titleManual) return false;
    if (chat.titleFeedback === 'good') return false;
    const fallback = (chat.history?.[0]?.[0] || '').substring(0, 30);
    if (!chat.title || chat.title === fallback) return true;
    return historyLength - (chat.titleGenAt || 0) >= TITLE_REFRESH_EVERY;
};

window._requestChatTitle = async (baseUrl, messages) => {
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
            messages: messages,
            temperature: 0.3,
            max_tokens: 60,
            stream: false,
            use_thought: false,
            think: false,
            thinking: false
        })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return window.cleanChatTitle(data.choices[0].message.content);
};

window.generateChatTitle = async (chatId, force = false) => {
    if (!force && window[`_generatingTitle_${chatId}`]) return;
    window[`_generatingTitle_${chatId}`] = true;
    try {
        const history = chatId === window.currentChatId
            ? window.chatHistory
            : window.allChats[chatId]?.history;
        const digest = window.buildTitleDigest(history);
        if (!digest) return;
        const baseUrl = await window.getOpenAIClient();
        const messages = [
            { "role": "system", "content": TITLE_SYSTEM_PROMPT },
            { "role": "user", "content": digest }
        ];

        let newTitle = await window._requestChatTitle(baseUrl, messages);

        // Meta guard: "The user is..."-style titles describe the chatter, not
        // the chat. Retry once with a corrective nudge; if still meta (or the
        // retry failed), keep the existing fallback title — never ship meta.
        if (newTitle && TITLE_META_RE.test(newTitle)) {
            const retry = await window._requestChatTitle(baseUrl, [...messages,
                { "role": "assistant", "content": newTitle },
                { "role": "user", "content": "no — name the topic, not the user. one short line, your voice, title only." }
            ]);
            if (retry && !TITLE_META_RE.test(retry)) newTitle = retry;
            else newTitle = null;
        }

        if (newTitle && window.allChats[chatId]) {
            window.allChats[chatId].title = newTitle;
            window.allChats[chatId].titleGenAt = (history || []).length;
            await window.StorageController.saveChat(window.allChats[chatId]);
            if (window.currentChatId === chatId) {
                window.updateChatTitleDisplay(newTitle);
                window.allChats[chatId].titleFeedback = null;
                window.updateTitleFeedbackUI(chatId);
            }
            window.renderHistory();
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

    const titleEl = document.getElementById('top-left-chat-title');
    if (titleEl) titleEl.classList.add('shimmer-active');

    const btn = document.querySelector('#top-left-chat-title button[onclick*="regenerateCurrentTitle"] i');
    window.generateChatTitle(window.currentChatId, true).finally(() => {
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
        window.allChats[id].titleManual = true;
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
    window.currentModel = window.MODELS[key] || window.MODELS.SAGA;
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

    // Evict KV cache for outgoing chat
    const oldChatId = window.currentChatId;
    if (window.KVContext && oldChatId) {
        window.KVContext.evictKV(oldChatId);
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

window.switchToChat = async function (newChatId) {
    if (window.KVContext) {
        const outgoing = window.currentChatId;
        if (outgoing && outgoing !== newChatId) {
            await window.KVContext.saveKVToCloud(outgoing);
        }
        window.currentChatId = newChatId;
        await window.KVContext.loadKVFromCloud(newChatId);
    } else {
        window.currentChatId = newChatId;
    }
};

window.updateStorageUsage = async () => {
    try {
        const bytes = await window.StorageController.estimateSize();
        const kb = bytes / 1024;
        const mb = bytes / (1024 * 1024);
        const sizeStr = mb >= 1 ? `${mb.toFixed(2)} MB` : kb >= 1 ? `${kb.toFixed(1)} KB` : `${bytes} B`;

        const isCloud = window.StorageController === window.CloudStorageController;
        const cloudSvg = window.feather?.icons?.cloud?.toSvg({ class: 'inline w-3 h-3 -mt-0.5' }) || '☁';
        const label = isCloud ? `${sizeStr} / 1 GB - O${cloudSvg}` : `${sizeStr} - Local`;

        const d1 = document.getElementById('storage-display');
        const d2 = document.getElementById('storage-display-sidebar');
        if (d1) d1.innerHTML = label;
        if (d2) d2.innerHTML = label;
    } catch (e) {
        const d1 = document.getElementById('storage-display');
        const d2 = document.getElementById('storage-display-sidebar');
        if (d1) d1.innerText = '—';
        if (d2) d2.innerText = '—';
    }
};
