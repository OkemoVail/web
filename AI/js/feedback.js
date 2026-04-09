// ─── Feedback & Tokens ─────────────────────────────────────────

window.sendFeedback = async (idx, type, btnEl) => {
    if (!window.chatHistory[idx]) return;
    const content = window.chatHistory[idx][1] || '';
    if (!content) return;

    try {
        const baseUrl = await window.getOpenAIClient();
        const response = await fetch(baseUrl + "/feedback", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
                "bypass-tunnel-reminder": "true"
            },
            body: JSON.stringify({
                chat_id: window.currentChatId,
                message_index: idx,
                content: content,
                feedback_type: type
            })
        });

        if (response.ok) {
            window.chatHistory[idx][2] = type;
            window.save();

            const container = btnEl.closest('.flex.items-center.gap-4');
            if (container) {
                const btns = container.querySelectorAll('.feedback-btn');
                btns.forEach(b => {
                    b.style.opacity = '0.3';
                    b.style.pointerEvents = 'none';
                    b.classList.remove('hover:scale-110');
                });
                btnEl.style.opacity = '1';
                btnEl.style.color = type === 'good' ? '#22c55e' : '#ef4444';
            }

            const toast = document.createElement('div');
            toast.className = 'fixed bottom-6 right-6 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black px-4 py-2.5 rounded-xl shadow-2xl text-sm font-semibold z-[9999] transition-all duration-300 opacity-0 transform translate-y-4 flex items-center gap-2';
            toast.innerHTML = feather.icons['check-circle'].toSvg({ class: 'w-4 h-4 text-green-500' }) + `<span>Feedback sent for training (${type === 'good' ? 'Reinforcement' : 'Unlearning'})</span>`;
            document.body.appendChild(toast);

            requestAnimationFrame(() => {
                toast.classList.remove('opacity-0', 'translate-y-4');
                toast.classList.add('opacity-100', 'translate-y-0');
            });

            setTimeout(() => {
                toast.classList.remove('opacity-100', 'translate-y-0');
                toast.classList.add('opacity-0', 'translate-y-4');
                setTimeout(() => toast.remove(), 300);
            }, 3000);

        } else {
            throw new Error("Feedback submission failed");
        }
    } catch (e) {
        console.error("Error sending feedback:", e);
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-6 right-6 bg-red-500 text-white px-4 py-2.5 rounded-xl shadow-2xl text-sm font-semibold z-[9999] transition-all duration-300 opacity-0 transform translate-y-4 flex items-center gap-2';
        toast.innerHTML = feather.icons['alert-circle'].toSvg({ class: 'w-4 h-4' }) + '<span>Failed to send feedback</span>';
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('opacity-0', 'translate-y-4');
            toast.classList.add('opacity-100', 'translate-y-0');
        });

        setTimeout(() => {
            toast.classList.remove('opacity-100', 'translate-y-0');
            toast.classList.add('opacity-0', 'translate-y-4');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

window.updateTitleFeedbackUI = (chatId) => {
    const goodBtn = document.getElementById('header-feedback-good');
    const badBtn = document.getElementById('header-feedback-bad');
    if (!goodBtn || !badBtn) return;

    goodBtn.classList.remove('text-green-500', 'opacity-100');
    badBtn.classList.remove('text-red-500', 'opacity-100');

    if (window.allChats[chatId] && window.allChats[chatId].titleFeedback) {
        const feedback = window.allChats[chatId].titleFeedback;
        if (feedback === 'good') {
            goodBtn.classList.add('text-green-500', 'opacity-100');
        } else if (feedback === 'bad') {
            badBtn.classList.add('text-red-500', 'opacity-100');
        }
    }
};

window.setTitleFeedback = async (chatId, type, btnEl) => {
    if (!window.allChats[chatId]) return;

    const currentFeedback = window.allChats[chatId].titleFeedback;
    const newFeedback = currentFeedback === type ? null : type;

    window.allChats[chatId].titleFeedback = newFeedback;
    await window.StorageController.saveChat(window.allChats[chatId]);

    window.updateTitleFeedbackUI(chatId);

    const container = btnEl.closest('.history-btn-container');
    if (container) {
        container.querySelectorAll('.title-feedback-btn').forEach(b =>
            b.classList.remove('text-green-500', 'text-red-500', 'opacity-100')
        );
    }
    if (newFeedback) {
        const originalHTML = btnEl.innerHTML;
        const originalWidth = btnEl.offsetWidth;
        btnEl.style.width = originalWidth + 'px';
        btnEl.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-[12px]"></i>`;
        btnEl.disabled = true;

        try {
            const baseUrl = await window.getOpenAIClient();
            const chat = window.allChats[chatId];
            const res = await fetch(baseUrl + "/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    title: chat.title,
                    feedback_type: type,
                    category: 'title_format'
                })
            });

            if (!res.ok) throw new Error("Feedback failed");

            btnEl.innerHTML = `<i class="fa-solid fa-check text-[12px] text-white"></i>`;
            await new Promise(r => setTimeout(r, 600));

            const toast = document.createElement('div');
            toast.className = 'fixed bottom-6 right-6 skuomorphic-toast px-5 py-3 shadow-2xl text-sm font-semibold z-[9999] transition-all duration-300 opacity-0 transform translate-y-4 flex items-center gap-2';
            toast.innerHTML = feather.icons['check-circle'].toSvg({ class: 'w-4 h-4' }) + `<span class="relative z-10">Title feedback recorded</span>`;
            document.body.appendChild(toast);
            requestAnimationFrame(() => {
                toast.classList.remove('opacity-0', 'translate-y-4');
                toast.classList.add('opacity-100', 'translate-y-0');
            });
            setTimeout(() => {
                toast.classList.remove('opacity-100', 'translate-y-0');
                toast.classList.add('opacity-0', 'translate-y-4');
                setTimeout(() => toast.remove(), 300);
            }, 3000);

        } catch (e) {
            console.error("Error sending title feedback:", e);
        } finally {
            btnEl.innerHTML = originalHTML;
            btnEl.style.width = '';
            btnEl.disabled = false;
            feather.replace();
        }
    }
};

window.updateTokenCount = (tokens) => {
    if (typeof tokens !== 'number') return;
    if (window.allChats[window.currentChatId]) {
        window.allChats[window.currentChatId].tokensUsed = (window.allChats[window.currentChatId].tokensUsed || 0) + tokens;
    }
    const display = document.getElementById('token-count-display');
    if (display) {
        const chatTokens = window.allChats[window.currentChatId]?.tokensUsed || 0;
        display.innerText = window.formatTokenCount(chatTokens);
    }
    window.save();
};

window.updateChatTokens = async () => {
    if (!window.currentChatId) return;
    try {
        const baseUrl = await window.getOpenAIClient();
        const response = await fetch(`${baseUrl}/api/tokens?chat_id=${window.currentChatId}`);
        if (response.ok) {
            const data = await response.json();
            const tokens = data.total_tokens || 0;
            if (window.allChats[window.currentChatId]) {
                window.allChats[window.currentChatId].tokensUsed = tokens;
            }
            const display = document.getElementById('token-count-display');
            if (display) {
                display.innerText = window.formatTokenCount(tokens);
            }
        }
    } catch (e) {
        console.warn("Failed to update chat tokens:", e);
    }
};
