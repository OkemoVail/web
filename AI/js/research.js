// ─── Research Page ─────────────────────────────────────────────

window.openResearchPage = () => {
    const overlay = document.getElementById('research-page-overlay');
    if (overlay) overlay.classList.add('active');
};

window.closeResearchPage = () => {
    const overlay = document.getElementById('research-page-overlay');
    if (overlay) overlay.classList.remove('active');
};

window.startResearch = () => {
    const rinp = document.getElementById('research-input');
    const query = rinp ? rinp.value.trim() : "";
    if (!query) return;
    window.closeResearchPage();
    if (rinp) rinp.value = "";
    window.sendMessage("/search " + query);
};

window.factoryReset = async () => {
    await window.StorageController.clearAll();
    localStorage.clear();
    window.location.reload();
};

/**
 * Called by render.js when user clicks the Sources button on an AI message.
 * pairIdx is the index into window.chatHistory where sources are stored at [5].
 */
window.showSources = (pairIdx) => {
    const pair = window.chatHistory[pairIdx];
    if (!pair) return;
    const sources = pair[5];
    if (!sources || !sources.length) return;

    const existing = document.getElementById('sources-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'sources-modal';
    modal.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50';
    modal.innerHTML = `
        <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col">
            <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
                <span class="font-semibold text-sm text-zinc-900 dark:text-white">Web Sources</span>
                <button onclick="document.getElementById('sources-modal').remove()"
                        class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer">
                    <i data-feather="x" class="w-4 h-4"></i>
                </button>
            </div>
            <div class="overflow-y-auto p-4 flex flex-col gap-3">
                ${sources.map(s => `
                    <a href="${s.url}" target="_blank" rel="noopener noreferrer"
                       class="flex flex-col gap-0.5 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800
                              hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-indigo-500">[${s.idx}]</span>
                            <span class="text-sm font-medium text-zinc-900 dark:text-white line-clamp-1">${s.title || 'Source'}</span>
                        </div>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">${s.snippet || ''}</p>
                        <span class="text-[10px] text-zinc-400 truncate">${s.url}</span>
                    </a>`).join('')}
            </div>
        </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    if (window.feather) feather.replace({ 'stroke-width': 2, 'width': 16, 'height': 16 }, modal);
};
