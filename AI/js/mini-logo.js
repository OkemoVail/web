// ─── Mini Logo Behavior ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('mini-logo-btn');
    if (!btn) return;
    const svgEl = btn.querySelector('.mini-logo-svg');
    const iconEl = btn.querySelector('.mini-logo-icon');

    const showChevron = () => {
        if (svgEl) svgEl.style.display = 'none';
        if (iconEl) iconEl.style.display = '';
    };
    const showLogo = () => {
        if (svgEl) svgEl.style.display = '';
        if (iconEl) iconEl.style.display = 'none';
    };

    btn.addEventListener('mouseenter', showChevron);
    btn.addEventListener('mouseleave', showLogo);

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        showChevron();
        if (typeof window.toggleSidebar === 'function') window.toggleSidebar();
    });
});
