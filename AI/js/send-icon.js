// ─── Send Icon Toggle ──────────────────────────────────────────

window.toggleSendIcon = (state) => {
    const btn = document.getElementById('send-btn');
    const iconWrapper = document.getElementById('send-icon-wrapper');
    if (!btn || !iconWrapper) return;

    btn.onclick = () => window.handleAction();

    if (state === 'stop') {
        iconWrapper.dataset.iconState = 'stop';
        iconWrapper.innerHTML = '<span class="send-spinner" aria-hidden="true"></span><i class="fa-solid fa-square send-stop-icon text-sm" aria-hidden="true"></i>';
    } else {
        iconWrapper.dataset.iconState = 'send';
        iconWrapper.innerHTML = '<i class="fa-solid fa-arrow-up text-sm"></i>';
    }
};
