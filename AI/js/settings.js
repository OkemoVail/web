// ─── Settings Panel ────────────────────────────────────────────

window.toggleSettingsPanel = () => {
    if (!window.els.settingsPanel) return;

    const isActive = window.els.settingsPanel.classList.toggle('active');

    const overlay = document.getElementById('settings-overlay');
    if (overlay) {
        if (isActive) overlay.classList.add('active');
        else overlay.classList.remove('active');
    }

    if (isActive) {
        window.openSettingsTab('general');

        const nameInput = document.getElementById('settings-name-input-new');
        if (nameInput) nameInput.value = window.settings.userName;

        if (document.getElementById('settings-param-temp')) {
            document.getElementById('settings-param-temp').value = window.settings.temp;
            document.getElementById('settings-temp-val').innerText = window.settings.temp.toFixed(2);
        }
        if (document.getElementById('settings-param-top-p')) {
            document.getElementById('settings-param-top-p').value = window.settings.top_p || 0.9;
            document.getElementById('settings-top-p-val').innerText = (window.settings.top_p || 0.9).toFixed(2);
        }
        if (document.getElementById('settings-param-max-tokens')) {
            document.getElementById('settings-param-max-tokens').value = window.settings.max_tokens || 256;
            document.getElementById('settings-max-tokens-val').innerText = window.settings.max_tokens || 256;
        }

        const toggleBtn = document.getElementById('toggle-smart-sidebar');
        if (toggleBtn) {
            const thumb = toggleBtn.querySelector('div');
            if (window.settings.sidebarMode === 'smart') {
                toggleBtn.classList.remove('bg-zinc-200', 'dark:bg-zinc-700');
                toggleBtn.classList.add('bg-green-500');
                if (thumb) thumb.style.transform = 'translateX(22px)';
            } else {
                toggleBtn.classList.remove('bg-green-500');
                toggleBtn.classList.add('bg-zinc-200', 'dark:bg-zinc-700');
                if (thumb) thumb.style.transform = 'translateX(0)';
            }
        }

        if (window.els.pfpMovableImg) { window.els.pfpMovableImg.src = window.settings.userPic || ''; window.applyMovableStyles(); }

        const newPreviewBtn = document.getElementById('pending-custom-color');
        if (newPreviewBtn) newPreviewBtn.style.display = 'none';

        window.updateAccent(window.settings.accent || 'auto');
        if (window.renderThemes) window.renderThemes();
    }
};

window.openSettingsTab = (tabName) => {
    document.querySelectorAll('.Cadance-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`ptab-btn-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.settings-tab-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('block');
    });
    const target = document.getElementById(`tab-${tabName}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('block');
    }
};

window.toggleSmartSidebar = () => {
    window.settings.sidebarMode = window.settings.sidebarMode === 'smart' ? 'manual' : 'smart';
    window.saveSettings();

    const toggleBtn = document.getElementById('toggle-smart-sidebar');
    const thumb = toggleBtn.querySelector('div');
    if (window.settings.sidebarMode === 'smart') {
        toggleBtn.classList.remove('bg-zinc-200', 'dark:bg-zinc-700');
        toggleBtn.classList.add('bg-green-500');
        thumb.style.transform = 'translateX(22px)';
    } else {
        toggleBtn.classList.remove('bg-green-500');
        toggleBtn.classList.add('bg-zinc-200', 'dark:bg-zinc-700');
        thumb.style.transform = 'translateX(0)';
    }

    window.applySidebarMode();
};

window.applySidebarMode = () => {
    const isSmart = window.settings.sidebarMode === 'smart';
    const trigger = document.getElementById('sidebar-hover-trigger');

    if (isSmart) {
        if (window.innerWidth >= 1024) document.body.classList.add('sidebar-collapsed');
        if (trigger) trigger.style.display = 'block';
    } else {
        if (trigger) trigger.style.display = 'none';
    }
    window.updateUI();
};

window.updateBackendUrlFromPanel = (val) => {
    const cleanVal = val.trim().replace(/\/$/, "");
    if (cleanVal) {
        localStorage.setItem('vail_custom_backend_url', cleanVal);
        if (confirm("Backend URL updated. Reload to apply?")) {
            window.location.reload();
        }
    } else {
        localStorage.removeItem('vail_custom_backend_url');
        window.location.reload();
    }
};

window.updateSystemPromptFromPanel = (val) => {
    window.settings.systemPrompt = val;
    window.saveSettings();
};

window.updateApiKeyFromPanel = (val) => {
    window.settings.apiKey = val.trim();
    window.saveSettings();
    window.updateApiKeyPreview(window.settings.apiKey);
};

window.updateApiKeyPreview = (val) => {
    const overlay = document.getElementById('apiKey-mask-overlay');
    if (!overlay) return;
    if (!val) {
        overlay.innerText = "";
        overlay.classList.add('hidden');
        return;
    }

    const clean = val.trim();
    if (clean.length < 15) {
        overlay.innerText = "Invalid key";
        overlay.classList.remove('hidden');
        return;
    }

    const first = clean.substring(0, 9);
    const last = clean.substring(clean.length - 4);
    overlay.innerText = first + "..." + last;
    if (document.activeElement !== document.getElementById('settings-api-key')) {
        overlay.classList.remove('hidden');
    }
};

window.updateSettingsFromPanel = () => {
    const nameInput = document.getElementById('settings-name-input-new') || document.getElementById('settings-name-input');
    if (nameInput) window.settings.userName = nameInput.value.trim();
    window.saveSettings(); window.updateProfileUI();
    if (typeof window.syncProfileToCloud === 'function') window.syncProfileToCloud();
    if (window.chatHistory.length === 0) window.render();
};

window.updateTempFromPanel = (val) => {
    window.settings.temp = parseFloat(val);
    const el = document.getElementById('settings-temp-val');
    if (el) el.innerText = window.settings.temp.toFixed(2);
    window.saveSettings();
};

window.updateTopPFromPanel = (val) => {
    window.settings.top_p = parseFloat(val);
    const el = document.getElementById('settings-top-p-val');
    if (el) el.innerText = window.settings.top_p.toFixed(2);
    window.saveSettings();
};

window.updateRepPenFromPanel = (val) => {
    window.settings.rep_pen = parseFloat(val);
    const el = document.getElementById('settings-rep-pen-val');
    if (el) el.innerText = window.settings.rep_pen.toFixed(2);
    window.saveSettings();
};

window.updateMaxTokensFromPanel = (val) => {
    window.settings.max_tokens = parseInt(val);
    const el = document.getElementById('settings-max-tokens-val');
    if (el) el.innerText = window.settings.max_tokens;
    window.saveSettings();
};
