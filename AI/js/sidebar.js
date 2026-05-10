// ─── Sidebar Toggle ────────────────────────────────────────────

window.toggleSidebar = () => {
    if (!window.els.sidebar) return;

    if (window.innerWidth < 1024) {
        // Mobile: slide drawer in/out
        const overlay = document.getElementById('sidebar-overlay');
        const isHidden = window.els.sidebar.classList.contains('-translate-x-full');
        if (isHidden) {
            window.els.sidebar.classList.remove('-translate-x-full');
            if (overlay) {
                overlay.style.display = 'block';
                requestAnimationFrame(() => overlay.classList.add('sidebar-overlay-visible'));
            }
        } else {
            if (overlay) {
                overlay.classList.remove('sidebar-overlay-visible');
                const hide = () => {
                    overlay.style.display = 'none';
                    overlay.removeEventListener('transitionend', hide);
                };
                overlay.addEventListener('transitionend', hide);
            }
            window.els.sidebar.classList.add('-translate-x-full');
        }
        return;
    }

    // Desktop: CSS handles everything — width transition clips content,
    // .sb-row-text fades via CSS selectors, icons stay pinned at px-3.
    document.body.classList.toggle('sidebar-collapsed');
    if (typeof window.updateUI === 'function') window.updateUI();
};
