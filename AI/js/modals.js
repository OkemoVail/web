// ─── Modals (confirm, prompt, toast) ───────────────────────────

window.showToast = (message, duration = 4000) => {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-zinc-900 border border-zinc-700/50 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-3 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center gap-3 transform -translate-y-[150%] opacity-0 transition-all duration-500 z-[9999] text-[13px] font-medium max-w-[300px] pointer-events-none select-none';
    toast.innerHTML = `<i data-feather="info" class="w-4 h-4 shrink-0" style="color: var(--accent-color, #3b82f6)"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    if (window.feather) feather.replace({ 'stroke-width': 2.5, 'width': 16, 'height': 16 }, toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        });
    });

    setTimeout(() => {
        toast.style.transform = 'translateY(-150%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, duration);
};

window.showCustomConfirm = (title, message, onConfirm, isDanger = false) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
        <div class="custom-modal-card">
            <div class="custom-modal-title">${title}</div>
            <div class="custom-modal-message">${message}</div>
            <div class="custom-modal-actions">
                <button class="modal-btn modal-btn-cancel">Cancel</button>
                <button class="modal-btn modal-btn-primary ${isDanger ? 'modal-btn-danger' : 'modal-btn-confirm'}">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => overlay.classList.add('is-active'), 10);

    const close = () => {
        overlay.classList.remove('is-active');
        setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('.modal-btn-cancel').onclick = close;
    overlay.querySelector('.modal-btn-primary').onclick = async () => {
        await onConfirm();
        close();
    };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
};

window.showCustomPrompt = (title, placeholder, defaultValue, onConfirm) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
        <div class="custom-modal-card">
            <div class="custom-modal-title">${title}</div>
            <input type="text" class="custom-modal-input" placeholder="${placeholder}" value="${defaultValue}">
            <div class="custom-modal-actions">
                <button class="modal-btn modal-btn-cancel">Cancel</button>
                <button class="modal-btn modal-btn-primary modal-btn-confirm">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.custom-modal-input');
    setTimeout(() => {
        overlay.classList.add('is-active');
        input.focus();
        input.select();
    }, 10);

    const close = () => {
        overlay.classList.remove('is-active');
        setTimeout(() => overlay.remove(), 300);
    };

    const handleConfirm = () => {
        const rawVal = input.value.trim();
        if (rawVal) {
            const val = rawVal.replace(/[\r\n]+/g, ' ').trim();
            onConfirm(val);
        }
        close();
    };

    overlay.querySelector('.modal-btn-cancel').onclick = close;
    overlay.querySelector('.modal-btn-primary').onclick = handleConfirm;
    input.onkeydown = (e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') close(); };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
};
