// ─── Changelog ─────────────────────────────────────────────────

window.BUILD_NUMBER = 1011;
window.CHANGELOG = {
    version: "1.6.7",
    build: window.BUILD_NUMBER,
    changes: [
        "Stuart has been updated (1B Parameters)",
        "Storage system upgraded to IndexedDB (async, non-blocking)",
        "New Stuart settings modal — mobile-first design",
        "Fun theme names: Sage Whisper, Midnight in Paris, Electric Lemonade, Vitamin C, Lush Green"
    ]
};

window.showChangelog = () => {
    const modal = document.getElementById('changelog-modal');
    if (!modal) return;
    const versionEl = document.getElementById('changelog-version');
    const contentEl = document.getElementById('changelog-content');
    if (versionEl) versionEl.innerText = `Build ${window.CHANGELOG.build} · v${window.CHANGELOG.version}`;
    if (contentEl) contentEl.innerHTML = window.CHANGELOG.changes.map(c => `<li class="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300"><span class="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>${c}</li>`).join('');
    modal.classList.add('active');
    localStorage.setItem('vail_last_seen_build', String(window.BUILD_NUMBER));
};

window.closeChangelog = () => {
    const modal = document.getElementById('changelog-modal');
    if (modal) modal.classList.remove('active');
};

window.checkChangelog = () => {
    const lastSeen = parseInt(localStorage.getItem('vail_last_seen_build') || '0');
    if (window.BUILD_NUMBER > lastSeen) {
        setTimeout(() => window.showChangelog(), 1200);
    }
};
