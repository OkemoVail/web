// ─── Modals (confirm, prompt, toast) ───────────────────────────

window.showToast = (message, duration = 4000) => {
    if (typeof window.showInputNotice === 'function') {
        window.showInputNotice(message);
        return;
    }
    // Fallback for when the input stack isn't available yet (e.g. early boot)
    const toast = document.createElement('div');
    toast.style.cssText = [
        'position:fixed', 'bottom:24px', 'right:24px', 'z-index:9999',
        'display:flex', 'align-items:center', 'gap:10px', 'padding:10px 14px',
        'border-radius:14px', 'background:var(--input-bg,#f4f4f5)',
        'border:1px solid color-mix(in srgb,var(--accent-color,#3b82f6) 30%,transparent)',
        'font-size:13px', 'font-weight:500', 'color:#71717a',
        'box-shadow:0 4px 24px rgba(0,0,0,0.10)', 'max-width:320px',
        'pointer-events:auto', 'opacity:0', 'transform:translateY(8px)',
        'transition:opacity 0.22s cubic-bezier(0.16,1,0.3,1),transform 0.22s cubic-bezier(0.16,1,0.3,1)',
    ].join(';');
    const dismiss = () => { toast.style.opacity = '0'; toast.style.transform = 'translateY(8px)'; setTimeout(() => toast.remove(), 250); };
    toast.innerHTML = `<span style="flex:1;min-width:0;">${message}</span><button style="flex-shrink:0;background:none;border:none;cursor:pointer;padding:2px 0 2px 4px;color:#a1a1aa;" title="Dismiss"><i data-feather="x" style="width:14px;height:14px;"></i></button>`;
    toast.querySelector('button').addEventListener('click', dismiss);
    document.body.appendChild(toast);
    if (window.feather) feather.replace({ 'stroke-width': 2.5 });
    requestAnimationFrame(() => requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }));
    let timer = setTimeout(dismiss, duration);
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1500); });
};

window.showCustomConfirm = (title, message, onConfirm, isDanger = false) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
        <div class="custom-modal-card">
            <div class="custom-modal-title">${title}</div>
            <div class="custom-modal-message">${message}</div>
            <div class="custom-modal-actions">
                <button class="modal-btn modal-btn-cancel skuo skuo-neutral">Cancel</button>
                <button class="modal-btn modal-btn-primary ${isDanger ? 'modal-btn-danger skuo' : 'modal-btn-confirm skuo skuo-accent'}">Confirm</button>
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
                <button class="modal-btn modal-btn-cancel skuo skuo-neutral">Cancel</button>
                <button class="modal-btn modal-btn-primary modal-btn-confirm skuo skuo-accent">Save</button>
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
