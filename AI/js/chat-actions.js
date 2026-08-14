// ─── Chat Actions (send, regen, copy, feedback, etc.) ──────────

// Per-chat tracking of last sent system prompt — only re-send on first turn or change.
const _sentSysPromptPerChat = {};

window.handleAction = async () => {
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
                const baseUrl = await window.getOpenAIClient();
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

// Called by the typewriter (streaming.js) when the queue has fully drained
// after generation ends. Finalizes the last AI bubble in place — no
// whole-chat render(), so nothing re-animates or slams.
window.finalizeLastAIMessage = () => {
    const chatMsgs = window.els.chatMsgs;
    if (!chatMsgs) return;
    const aiRow = chatMsgs.querySelector('.ai-row:last-child');
    if (!aiRow) return;

    // 1. Fade out the book-flip generation indicator, then remove it.
    const lane = aiRow.querySelector('.book-flip-lane');
    if (lane) {
        lane.classList.add('done');
        setTimeout(() => lane.remove(), 340);
    }

    // 2. Append the actions row (copy / regen / sources / feedback / timestamp).
    // Appears without an entrance animation — the book-flip lane fading out
    // beside it is the only settle cue (a fade here read as a "flash" on done).
    const prose = aiRow.querySelector('.prose-target');
    if (prose && !aiRow.querySelector('.ai-msg-actions')) {
        const pairIdx = window.chatHistory.length - 1;
        const sources = (window.chatHistory[pairIdx] && window.chatHistory[pairIdx][5]) || [];
        const actionRow = document.createElement('div');
        actionRow.className = 'ai-msg-actions';
        actionRow.innerHTML = `
            <div class="ai-actions-left">
                <button onclick="window.copyMsg(${pairIdx}, this)" class="ai-action-btn" title="Copy"><i data-feather="copy" class="w-4 h-4"></i></button>
                <button onclick="window.regenMsg(${pairIdx})" class="ai-action-btn" title="Regenerate"><i data-feather="rotate-cw" class="w-4 h-4"></i></button>
                ${sources.length ? `<button onclick="window.showSources(${pairIdx})" class="ai-action-btn sources-btn" title="View ${sources.length} sources"><i data-feather="link" class="w-4 h-4"></i><span class="sources-count">${sources.length}</span></button>` : ''}
            </div>
            <div class="ai-actions-right">
                <button onclick="window.sendFeedback(${pairIdx}, 'good', this)" class="ai-action-btn feedback-btn" title="Good response"><i data-feather="thumbs-up" class="w-4 h-4"></i></button>
                <button onclick="window.sendFeedback(${pairIdx}, 'bad', this)" class="ai-action-btn feedback-btn" title="Bad response"><i data-feather="thumbs-down" class="w-4 h-4"></i></button>
                <span class="msg-timestamp ai-timestamp">${window.formatDate(window.chatHistory[pairIdx][3])}</span>
            </div>
        `;
        prose.parentNode.appendChild(actionRow);
        feather.replace({ 'stroke-width': 2, 'width': 16, 'height': 16 }, actionRow);
    }

    // 3. Settle scroll at the bottom.
    if (window.els.chatCont) window.els.chatCont.scrollTop = window.els.chatCont.scrollHeight;
};

window.sendMessage = async (txt = null, forceSearch = false) => {
    console.log("sendMessage called, isGenerating:", window.isGenerating);
    if (window.isGenerating) {
        console.log("Blocked: still generating");
        return;
    }
    let msg = txt || window.els.input.value.trim();
    const attachment = window.uploadedFile || null;
    if (!msg && !attachment) return;
    if (!msg && attachment) msg = attachment.isImage ? `[Image: ${attachment.name}]` : `[File: ${attachment.name}]`;

    let displayMsg = msg;
    if (displayMsg.startsWith('/search ')) {
        displayMsg = displayMsg.substring(8).trim();
    }

    // iMessage morph: capture the input geometry BEFORE clearing it.
    // Only typed sends morph (txt === null, no attachment) — programmatic
    // resends (regenMsg) and attachment messages take the plain path.
    const _morphFrom = (!txt && !attachment && window.els.input)
        ? window.els.input.getBoundingClientRect() : null;

    window.streamQueue = "";
    window.typedResponseText = "";
    window.charAccu = 0;
    window._canvasStreamOpened = false;
    window.els.input.value = ""; window.els.input.style.height = "auto";
    if (window.refreshInputLayout) window.refreshInputLayout();
    // Detach the file from the UI but keep a local copy for this request
    if (typeof window.clearUploadedFile === 'function') window.clearUploadedFile();

    console.log("Attempting to connect to:", window.currentModel.id);

    let lastProse = null;

    window.chatHistory.push([displayMsg, null, null, Date.now(), attachment]);
    window.currentGenerationIsSearch = window.isWebSearch || forceSearch;
    window.isGenerating = true;
    window.currentJobId = Math.random().toString(36).substring(7);
    window.render();
    const _morphed = _morphFrom && window.motionMorphLastUserBubble
        && window.motionMorphLastUserBubble(_morphFrom);
    if (!_morphed) window.els.chatCont.scrollTo({ top: window.els.chatCont.scrollHeight, behavior: 'smooth' });
    window.updateUI();
    window.toggleSendIcon('stop');
    try {
        const baseUrl = await window.getOpenAIClient();
        console.log("Connecting to OpenAI Stream at:", baseUrl + "/v1/chat/completions");

        const messages = [];

        const sysPrompt = (window.settings && window.settings.systemPrompt)
            || (window.PERSONALITY_PRESETS && window.PERSONALITY_PRESETS.length > 0
                ? window.PERSONALITY_PRESETS[0].prompt : '');
        // Use the full identity_lock from system_prompts.json (fetched from /api/system_prompts).
        // This ensures the system message at inference exactly matches what the model trained on.
        // Falls back to a short string when the server isn't reachable (offline mode).
        const sagaIdentity = (window.__systemPrompts && window.__systemPrompts.identity_lock) ||
            "You are Saga, made by OkemoVail. If anyone asks who you are, what model you are, or who made you, the answer is always Saga by OkemoVail — never Gemma, never Google, never any other model or company.";
        // Prefer the backend-served global rules (single source of truth in
        // system_prompts.json on the server). Fall back to the hardcoded copy
        // when the API isn't reachable so the UI keeps working offline.
        const globalRules = (window.__systemPrompts && window.__systemPrompts.global_rules) || [
            "Language rule:",
            "- If the user writes in Chinese, always reply in Traditional Chinese. Never use Simplified Chinese.",
            "",
            "Code generation rules (HTML / web UI):",
            "- Use Tailwind CSS utility classes ONLY. No custom <style> blocks, no separate CSS files, no inline style=\"...\" unless the user explicitly asks. Tailwind keeps output compact and saves tokens.",
            "- For standalone HTML, load Tailwind via <script src=\"https://cdn.tailwindcss.com\"></script> in the <head>.",
            "- Configure Tailwind to follow the OS theme automatically. Before the CDN script, include:",
            "    <script>tailwind.config = { darkMode: 'media' }</script>",
            "  Then every component MUST ship paired classes: a light variant AND a `dark:` variant for every color-affecting utility (bg, text, border, ring, divide, placeholder, from/to, etc.). Examples:",
            "    bg-white dark:bg-zinc-900   text-zinc-900 dark:text-zinc-100",
            "    border-zinc-200 dark:border-zinc-800   hover:bg-zinc-100 dark:hover:bg-zinc-800",
            "- The page must look polished and readable in BOTH light and dark mode with no extra user action. Always set a base on <body> like `class=\"bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100\"` so the canvas preview adapts whether the host UI is light or dark.",
            "- Prefer concise, idiomatic Tailwind. No redundant utility chains.",
            "",
            "Clarification rule:",
            "- If the user's task is ambiguous, underspecified, or complex enough that you cannot confidently produce a correct answer, ask 1–3 short, specific follow-up questions BEFORE writing code or a long answer. Do not guess silently. Simple, clear tasks: just answer."
        ].join("\n");
        // Gender directive — controlled by the toggle inside the personality
        // modal. Empty = no gender preference (the model picks/stays neutral).
        const g = (window.settings && window.settings.gender) || '';
        let genderLine = '';
        if (g === 'female') {
            genderLine = "You identify as female. Use she/her pronouns when referring to yourself.";
        } else if (g === 'male') {
            genderLine = "You identify as male. Use he/him pronouns when referring to yourself.";
        }
        let runtimeRules = '';
        if (window.canvasEnabled) {
            runtimeRules = "Canvas Mode is ENABLED. You can generate websites (using ```html) AND text documents (using ```document or ```markdown). Text documents will be automatically exported and opened in Okemo Word (word/index.html).";
        }

        const userMemories = Array.isArray(window.settings.memories) && window.settings.memories.length > 0
            ? window.settings.memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n')
            : '';
        const memoriesBlock = userMemories
            ? `<user_memories>\nThings you know about the user — use this context naturally:\n${userMemories}\n</user_memories>`
            : `<user_memories>\nYou have no saved memories about this user. If they ask what you know about them, tell them honestly that you don't know anything about them yet.\n</user_memories>`;
        const memoryInstruction = `<memory_system>\nWhen the user shares something genuinely worth remembering across future conversations, place ONE <remember> tag in your response:\n<remember>fact</remember>\n\nAfter writing the <remember> tag, write a simple message afterwards.\n\nWrite the fact as a complete, self-contained sentence that preserves all important context — who, what, why, and any relevant detail. Do not compress to the point of losing meaning.\n\nGood examples:\n- "The user has a cat named Maxine and a dog named Nebby."\n- "The user is learning guitar and wants to focus on fingerpicking, not strumming."\n- "The user prefers dark mode and finds bright UIs uncomfortable."\n\nOnly use <remember> when the user explicitly states a lasting personal fact (name, preference, goal, relationship, habit). Never use it for general chat, rhetorical questions, or anything already in <user_memories>.\n</memory_system>`;

        const mergedSys = [
            `<identity>\n${sagaIdentity}\n</identity>`,
            sysPrompt ? `<personality>\n${sysPrompt}\n</personality>` : '',
            genderLine ? `<gender>\n${genderLine}\n</gender>` : '',
            memoriesBlock,
            memoryInstruction,
            `<rules>\n${globalRules}\n</rules>`,
            runtimeRules ? `<canvas_mode>\n${runtimeRules}\n</canvas_mode>` : ''
        ].filter(Boolean).join('\n\n');
        const chatId = window.currentChatId;
        const isFirstTurn = window.chatHistory.length === 1;
        const sysChanged = _sentSysPromptPerChat[chatId] !== mergedSys;
        if (isFirstTurn || sysChanged) {
            messages.push({ role: "system", content: mergedSys });
            _sentSysPromptPerChat[chatId] = mergedSys;
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
                use_thought: true,  // thinking is the only mode (fast mode removed)
                use_canvas: window.canvasEnabled,
                deep_research: window.isDeepResearch,
                temperature: window.settings.temp,
                seed: window.randomSeed(),
                top_p: window.settings.top_p || 0.9,
                repetition_penalty: window.settings.rep_pen || 1.3,
                chat_id: window.currentChatId,
                job_id: window.currentJobId,
                user_name: (window.settings && window.settings.userName) || "",
                user_token: null, // web/AI has no account auth; backend silently skips web_search for unauthenticated requests
                attachment: attachment ? {
                    name: attachment.name,
                    type: attachment.type,
                    is_image: !!attachment.isImage,
                    data_url: attachment.dataUrl,
                    text_content: attachment.textContent || null
                } : null
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let responseText = "";
        let buffer = "";
        let collectedSources = [];

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
                    // Side-channel: web search sources arrive as their own SSE event.
                    if (Array.isArray(data.sources) && data.sources.length) {
                        collectedSources = data.sources;
                        continue;
                    }
                    if (!data.choices || !data.choices[0]) continue;
                    const delta = data.choices[0].delta?.content || "";
                    const finishReason = data.choices[0].finish_reason;
                    if (delta !== "__DONE__") {
                        responseText += delta;
                        window.streamQueue += delta;
                        window.startTypewriter();

                        // Live canvas: as soon as the model opens a code fence, surface it.
                        if (window.canvasEnabled && typeof window.streamingCanvasCode === 'function') {
                            const partial = window.streamingCanvasCode(responseText);
                            if (partial) {
                                if (!window._canvasStreamOpened) {
                                    window.openCanvas(partial);
                                    window._canvasStreamOpened = true;
                                } else {
                                    window.currentCanvasCode = partial;
                                    if (window.monacoEditorInstance) window.monacoEditorInstance.setValue(partial);
                                    if (window.updateCanvasPreview) window.updateCanvasPreview();
                                }
                            }
                        }
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
        // Strip common Saga-noise artifacts: lone ".word" lines, "I'm here for 123."-style
        // numeric placeholders, and trailing whitespace. Narrow patterns to avoid false positives.
        responseText = responseText
            .replace(/^\s*\.[a-z0-9_]+\s*$/gim, '')
            .replace(/^\s*I['\u2018\u2019]m here for \d+\.?\s*$/gim, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        // Extract <remember> tags, show consent card, strip before storing/rendering
        const _remRe = /<remember>([\s\S]*?)<\/remember>/g;
        let _remMatch;
        const _rawMems = [];
        while ((_remMatch = _remRe.exec(responseText)) !== null) {
            const t = _remMatch[1].trim();
            if (t) _rawMems.push(t);
        }
        if (_rawMems.length > 0) {
            responseText = responseText.replace(/<remember>[\s\S]*?<\/remember>/g, '').replace(/\n{3,}/g, '\n\n').trim();
            window.typedResponseText = responseText;
            _rawMems.forEach(raw => {
                if (typeof window.summarizeAndSaveMemory === 'function') window.summarizeAndSaveMemory(raw);
            });
        }
        window.chatHistory[window.chatHistory.length - 1][1] = responseText;
        // Stash web search sources on the chat entry (index 5) so the Sources
        // button can render after generation finishes and across reloads.
        if (collectedSources.length) {
            window.chatHistory[window.chatHistory.length - 1][5] = collectedSources;
        }
        // Canvas mode: pipe the model's code block straight into the live canvas
        if (window.canvasEnabled && typeof window.extractCanvasCode === 'function') {
            const code = window.extractCanvasCode(responseText);
            if (code) window.openCanvas(code);
        }
        window.isGenerating = false;
        if (typeof stopTokenPolling === 'function') stopTokenPolling();
        window.updateUI();
        window.toggleSendIcon('send');

        // Hand the SANITIZED remainder to the typewriter so it converges to
        // exactly responseText (no slam). If sanitization removed chars that
        // were already typed (e.g. a completed <remember> tag), prefix
        // alignment is impossible — hard-sync instead (rare path). The
        // hard-sync branch also covers typedResponseText === "" (the whole
        // reply arrived before the first tick).
        if (window.typedResponseText && responseText.startsWith(window.typedResponseText)) {
            window.streamQueue = responseText.slice(window.typedResponseText.length);
        } else {
            window.typedResponseText = responseText;
            window.streamQueue = "";
        }
        // Finalize immediately when there is nothing left to drain — regardless
        // of whether the interval is still alive (it would be killed by the
        // finally guard microseconds later, before its finalizing tick).
        // Mutual exclusion with the typewriter's own finalize is preserved:
        // non-empty queue → interval owns finalize; empty queue → we do it now
        // and clear the interval ourselves so it can't double-fire.
        if (window.streamQueue.length === 0) {
            if (window.typeInterval) { clearInterval(window.typeInterval); window.typeInterval = null; }
            window.updateAssistantDisplay(window.typedResponseText, true);
            window.finalizeLastAIMessage();
        }
        window.currentJob = null;
        console.log("Streaming complete");

        if (window.chatHistory.length > 0 && window.chatHistory[0][1] && !window[`_generatingTitle_${window.currentChatId}`]
            && window.chatTitleDue(window.allChats[window.currentChatId], window.chatHistory.length)) {
            window.generateChatTitle(window.currentChatId);
        }

        window.updateUI();
    } catch (e) {
        window.streamQueue = "";
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
        // Don't kill the typewriter mid-backlog on the success path — it
        // drains the remainder in a few hundred ms and finalizes itself.
        // (Error/abort paths cleared the queue first, so it stops instantly.)
        if (window.typeInterval && window.streamQueue.length === 0) {
            clearInterval(window.typeInterval);
            window.typeInterval = null;
        }
        window.save();
    }
};

window.showSources = (idx) => {
    const entry = window.chatHistory[idx];
    const sources = entry && entry[5];
    if (!sources || !sources.length) return;

    let overlay = document.getElementById('sources-modal-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'sources-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,0.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:1rem;animation:chat-fadeIn 0.18s ease;';

    const card = document.createElement('div');
    card.className = 'sources-modal-card';
    card.style.cssText = 'width:100%;max-width:560px;max-height:80vh;overflow:hidden;border-radius:18px;background:var(--bg-elevated);border:1px solid var(--border);box-shadow:0 20px 60px -10px rgba(0,0,0,0.45);display:flex;flex-direction:column;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;border-bottom:1px solid var(--border);';
    header.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.6rem;">
            <i data-feather="link" style="width:18px;height:18px;color:var(--accent-color);"></i>
            <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary);">Sources <span style="color:var(--text-secondary);font-weight:500;font-size:0.85rem;">(${sources.length})</span></div>
        </div>
        <button class="sources-close-btn" style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);padding:0.35rem;border-radius:8px;display:flex;">
            <i data-feather="x" style="width:18px;height:18px;"></i>
        </button>
    `;

    const list = document.createElement('div');
    list.style.cssText = 'overflow-y:auto;padding:0.75rem 1rem 1rem;display:flex;flex-direction:column;gap:0.6rem;';

    sources.forEach(s => {
        const item = document.createElement('a');
        item.href = s.url || '#';
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
        item.style.cssText = 'display:flex;gap:0.75rem;padding:0.85rem;border-radius:12px;border:1px solid var(--border);background:transparent;text-decoration:none;color:inherit;transition:background 0.15s ease, transform 0.15s ease;';
        item.onmouseenter = () => { item.style.background = 'var(--bg-hover, rgba(127,127,127,0.08))'; };
        item.onmouseleave = () => { item.style.background = 'transparent'; };
        const host = (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } })();
        const safeTitle = (s.title || s.url || 'Untitled').replace(/[<>]/g, '');
        const safeSnippet = (s.snippet || '').replace(/[<>]/g, '');
        item.innerHTML = `
            <div style="flex:0 0 28px;height:28px;border-radius:8px;background:var(--accent-glow,rgba(127,127,127,0.12));color:var(--accent-color);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;">${s.idx || ''}</div>
            <div style="min-width:0;flex:1;">
                <div style="font-weight:600;font-size:0.88rem;color:var(--text-primary);line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${safeTitle}</div>
                ${host ? `<div style="font-size:0.72rem;color:var(--text-secondary);margin-top:2px;">${host}</div>` : ''}
                ${safeSnippet ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:5px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${safeSnippet}</div>` : ''}
            </div>
        `;
        list.appendChild(item);
    });

    card.appendChild(header);
    card.appendChild(list);
    overlay.appendChild(card);

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    header.querySelector('.sources-close-btn').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    document.body.appendChild(overlay);
    if (window.feather) feather.replace({ 'stroke-width': 2 }, overlay);
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
    if (window.refreshInputLayout) window.refreshInputLayout();
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

// ─── Attachment actions (copy / download / open full) ─────────
function _dataUrlToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(',');
    const mime = (meta.match(/data:([^;]+)/) || [, 'application/octet-stream'])[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
}

window.downloadAttachment = (idx) => {
    const att = window.chatHistory[idx] && window.chatHistory[idx][4];
    if (!att || !att.dataUrl) return;
    const a = document.createElement('a');
    a.href = att.dataUrl;
    a.download = att.name || 'attachment';
    document.body.appendChild(a); a.click(); a.remove();
};

window.copyAttachment = async (idx) => {
    const att = window.chatHistory[idx] && window.chatHistory[idx][4];
    if (!att || !att.dataUrl) return;
    try {
        if (att.isImage && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
            const blob = _dataUrlToBlob(att.dataUrl);
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        } else if (att.textContent) {
            await navigator.clipboard.writeText(att.textContent);
        } else {
            await navigator.clipboard.writeText(att.dataUrl);
        }
    } catch (e) {
        console.warn('copy attachment failed:', e);
    }
};

window.openAttachmentFull = (idx) => {
    const att = window.chatHistory[idx] && window.chatHistory[idx][4];
    if (!att || !att.dataUrl) return;
    const w = window.open();
    if (w) {
        w.document.title = att.name || 'image';
        w.document.body.style.cssText = 'margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;';
        const img = w.document.createElement('img');
        img.src = att.dataUrl;
        img.style.cssText = 'max-width:100vw;max-height:100vh;object-fit:contain;';
        w.document.body.appendChild(img);
    }
};

// ─── Sync personalities + global rules from backend (single source of truth) ──
// Fetches system_prompts.json via /api/system_prompts. Falls back to the
// hardcoded PERSONALITY_PRESETS in chat.html if the call fails.
(async function _bootstrapSystemPrompts() {
    try {
        const baseUrl = (typeof window.getOpenAIClient === 'function')
            ? await window.getOpenAIClient()
            : (localStorage.getItem('vail_custom_backend_url') || '');
        if (!baseUrl) return;
        const r = await fetch(baseUrl.replace(/\/$/, '') + '/api/system_prompts', {
            headers: { 'ngrok-skip-browser-warning': 'true', 'bypass-tunnel-reminder': 'true' }
        });
        if (!r.ok) return;
        const data = await r.json();
        if (!data || !Array.isArray(data.personalities)) return;
        window.__systemPrompts = data;
        // Replace UI's personality list with the server's, preserving the
        // same shape chat.html expects: { id, label, icon, prompt }.
        const iconMap = { default: 'circle', concise: 'minimize-2', creative: 'feather', coder: 'code', tutor: 'book-open', sarcastic: 'smile', analyst: 'bar-chart-2', friend: 'heart', 'discord-friend': 'message-circle' };
        // Snapshot old presets before replacing — needed to detect stale saved prompts.
        const oldPresets = (window.PERSONALITY_PRESETS || []).slice();
        window.PERSONALITY_PRESETS = data.personalities.map(p => ({
            id: p.id,
            label: p.label || p.id,
            icon: iconMap[p.id] || 'circle',
            prompt: p.prompt || ''
        }));

        // If the user's saved systemPrompt matches a stale hardcoded preset,
        // migrate it to the server's version of that same preset so their chosen
        // personality actually takes effect (fixes double-identity override bug).
        const currentSys = (window.settings && window.settings.systemPrompt) || '';
        const matchedOld = oldPresets.find(p => p.prompt && p.prompt.trim() === currentSys.trim());
        if (matchedOld) {
            const serverVersion = window.PERSONALITY_PRESETS.find(p => p.id === matchedOld.id);
            if (serverVersion && serverVersion.prompt && serverVersion.prompt.trim() !== currentSys.trim()) {
                window.settings.systemPrompt = serverVersion.prompt;
                if (typeof window.saveSettings === 'function') window.saveSettings();
                console.log('[system_prompts] migrated systemPrompt to server preset:', matchedOld.id);
            }
        }

        // If the personality modal is open, rerender its preset chips.
        if (typeof window._renderPersonalityPresets === 'function'
            && document.getElementById('personality-modal')
            && document.getElementById('personality-modal').style.display === 'flex') {
            window._renderPersonalityPresets();
        }
    } catch (e) {
        console.warn('[system_prompts] fetch failed, using hardcoded fallback:', e);
    }
})();
