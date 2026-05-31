// ─── Send Icon Toggle ──────────────────────────────────────────

window.toggleSendIcon = (state) => {
    const btn = document.getElementById('send-btn');
    const iconWrapper = document.getElementById('send-icon-wrapper');
    if (!btn || !iconWrapper) return;

    btn.onclick = () => window.handleAction();

    if (state === 'stop') {
        iconWrapper.innerHTML = '<i class="fa-solid fa-square text-sm"></i>';
    } else {
        iconWrapper.innerHTML = '<i class="fa-solid fa-paper-plane text-sm"></i>';
    }
};
