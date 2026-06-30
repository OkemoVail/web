const BUILD_NUMBER = 1011;
const CHANGELOG = {
    version: "1.7.0",
    build: BUILD_NUMBER,
    changes: [
        { type: "sunset", text: "Stuart has been sunset. Pisces is now the only model." },
        "Polaris has been updated to 1.6 (1B Parameters)",
        "OLM North Star has been updated to 1.1"
    ]
};

window.checkChangelog = () => {
    const lastSeen = parseInt(localStorage.getItem('vail_last_seen_build') || '0');
    const remoteBuild = parseInt(localStorage.getItem('vail_remote_build') || BUILD_NUMBER.toString());

    if (remoteBuild > lastSeen) {
        window.showChangelog();
    }
};

window.showChangelog = (manual = false) => {
    const modal = document.getElementById('changelog-modal');
    if (!modal) {
        createChangelogModal();
        return window.showChangelog(manual);
    }

    const content = document.getElementById('changelog-content');
    const buildNum = localStorage.getItem('vail_remote_build') || BUILD_NUMBER;
    const changes = JSON.parse(localStorage.getItem('vail_remote_changelog') || JSON.stringify(CHANGELOG.changes));

    const verEl = document.getElementById('changelog-version');
    if (verEl) verEl.innerText = `Build ${buildNum}`;
    if (content) content.innerHTML = changes.map(change => {
        if (typeof change === 'object' && change.type === 'sunset') {
            return `<li class="flex flex-col items-center gap-2 py-3 text-zinc-600 dark:text-zinc-400">
                <i class="fa-solid fa-sun text-orange-400" style="font-size:2rem;"></i>
                <span class="text-sm font-semibold text-center">${change.text}</span>
            </li>`;
        }
        return `<li class="flex items-start gap-3 text-sm text-zinc-600 dark:text-zinc-400">
            <i class="fa-solid fa-circle-check text-[var(--accent-color, #3b82f6)] mt-1 shrink-0"></i>
            <span>${change}</span>
        </li>`;
    }).join('');

    modal.classList.add('active');
    if (!manual) {
        localStorage.setItem('vail_last_seen_build', buildNum);
    }
};

window.closeChangelog = () => {
    const modal = document.getElementById('changelog-modal');
    if (modal) modal.classList.remove('active');
};

function createChangelogModal() {
    const html = `
    <div id="changelog-modal" style="position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,0.4); backdrop-filter:blur(8px); display:none; align-items:center; justify-content:center; padding:1rem;">
        <div class="changelog-card card" style="width:100%; max-width:480px; overflow:hidden;">
            <div style="padding:2rem; position:relative; z-index:10;">
                <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.5rem;">
                    <div style="width:2.5rem; height:2.5rem; border-radius:9999px; background:rgba(59,130,246,0.1); display:flex; align-items:center; justify-content:center; color:#3b82f6;">
                        <i class="fa-solid fa-rocket" style="font-size:1.125rem;"></i>
                    </div>
                    <div>
                        <h2 style="font-size:1.25rem; font-weight:700; color:#18181b;">What's New</h2>
                        <p id="changelog-version" style="font-size:0.75rem; font-weight:700; color:#a1a1aa; text-transform:uppercase; letter-spacing:0.1em;">Build 1010</p>
                    </div>
                </div>
                
                <ul id="changelog-content" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:1rem; margin-bottom:2rem;">
                    <!-- Changes injected via JS -->
                </ul>

                <button onclick="window.closeChangelog()" class="skuomorphic-btn"
                    style="width:100%; padding:1rem 0; border-radius:0.75rem; background:var(--bg-color, white); color:var(--action-btn-color, #18181b); border:none; font-weight:900; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.2em; cursor:pointer; transition:all 0.2s;">
                    Dismiss
                </button>
            </div>
        </div>
    </div>
    <style>
        #changelog-modal.active { display: flex; }
        .dark .changelog-card { background: #18181b !important; border: 1px solid rgba(255,255,255,0.1); }
        .dark .changelog-card h2 { color: white !important; }
    </style>`;
    document.body.insertAdjacentHTML('beforeend', html);
}
