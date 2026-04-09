// ─── Sidebar Toggle ────────────────────────────────────────────

window.toggleSidebar = () => {
    if (!window.els.sidebar) return;
    const body = document.body;
    const fullContent = document.getElementById('sidebar-full-content');
    const miniContent = document.getElementById('sidebar-mini-content');

    if (window.innerWidth < 1024) {
        const overlay = document.getElementById('sidebar-overlay');
        if (window.els.sidebar.classList.contains('-translate-x-full')) {
            window.els.sidebar.classList.remove('-translate-x-full');
            if (overlay) overlay.style.display = 'block';
        } else {
            window.els.sidebar.classList.add('-translate-x-full');
            if (overlay) overlay.style.display = 'none';
        }
        return;
    }

    const isCollapsed = body.classList.contains('sidebar-collapsed');

    if (isCollapsed) {
        body.classList.remove('sidebar-collapsed');
        fullContent.style.display = 'flex';
        miniContent.style.display = 'none';

        anime({
            targets: fullContent,
            opacity: [0, 1],
            translateX: [-20, 0],
            duration: 300,
            easing: 'easeOutQuint'
        });
    } else {
        anime({
            targets: fullContent,
            opacity: [1, 0],
            translateX: [0, -20],
            duration: 200,
            easing: 'easeInQuint',
            complete: () => {
                body.classList.add('sidebar-collapsed');
                fullContent.style.display = 'none';
                miniContent.style.display = 'flex';
                miniContent.style.opacity = 1;
            }
        });
    }
    if (typeof window.updateUI === 'function') window.updateUI();
};
