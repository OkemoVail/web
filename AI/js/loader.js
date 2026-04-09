// ─── Loader Exit Sequence ───────────────────────────────────────

window.hidePreloader = () => {
    const preloader = document.getElementById('app-preloader');
    if (!preloader) return;

    preloader.classList.add('fade-out');
    
    // Removed interaction cleanup as listeners were removed
    setTimeout(() => {
        preloader.remove();
        document.body.classList.remove('overflow-hidden');
    }, 800);
};
