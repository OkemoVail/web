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

        const vEn = document.getElementById('settings-voice-enabled');
        // Voice mode not ready — keep the toggle off and disabled (see VOICE_READY in voice.js).
        if (vEn) { vEn.checked = false; vEn.disabled = true; }
        const vName = document.getElementById('settings-voice-name');
        if (vName) vName.value = window.settings.voiceName || 'af_sarah';

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
        btn.classList.remove('skuo-accent');
    });
    const activeBtn = document.getElementById(`ptab-btn-${tabName}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.classList.add('skuo-accent');
    }

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
    if (typeof window.syncProfileToCloud === 'function') window.syncProfileToCloud();
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

window.toggleVoiceEnabled = (on) => {
    window.settings.voiceEnabled = !!on;
    window.saveSettings();
    if (window.updateUI) window.updateUI();
};

window.updateVoiceName = (val) => {
    window.settings.voiceName = val;
    window.saveSettings();
};

window.renderStorageTab = async () => {
    const bar = document.getElementById('storage-bar');
    const summary = document.getElementById('storage-summary');
    const breakdown = document.getElementById('storage-breakdown');
    if (!bar || !summary || !breakdown) return;

    const fmt = (b) => {
        if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
        if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
        if (b >= 1024) return Math.round(b / 1024) + ' KB';
        return b + ' B';
    };

    const token = localStorage.getItem('vail_auth_token');
    if (!token) {
        bar.innerHTML = '<div class="flex-1 bg-zinc-200 dark:bg-zinc-700 rounded-xl h-full"></div>';
        summary.innerHTML = '<p class="text-xs text-zinc-400 text-center mt-2">Sign in to view cloud storage</p>';
        breakdown.innerHTML = '<div class="p-6 text-center text-sm text-zinc-400">No account connected</div>';
        return;
    }

    bar.innerHTML = '<div class="flex-1 bg-zinc-200 dark:bg-zinc-700 animate-pulse rounded-xl h-full"></div>';
    breakdown.innerHTML = '<div class="p-5 text-center text-sm text-zinc-400">Loading…</div>';
    summary.innerHTML = '';

    try {
        const base = (localStorage.getItem('vail_custom_backend_url') || 'https://api.okemovail.com').replace(/\/$/, '');
        const headers = { 'Authorization': `Bearer ${token}` };

        const me = await fetch(`${base}/api/accounts/me`, { headers }).then(r => r.json());
        const totalBytes = me.storage_limit_bytes || 1073741824;
        const usedBytes  = me.storage_used_bytes  || 0;
        const freeBytes  = Math.max(0, totalBytes - usedBytes);

        // Estimate breakdown from local data (profile pic dominates the profile doc)
        const userPic     = window.settings?.userPic || '';
        const picBytes    = userPic ? Math.round(userPic.length * 0.75) : 0;
        const memJson     = JSON.stringify(window.settings?.memories || []);
        const systemBytes = Math.min(Math.round(memJson.length * 1.2) + 2048, Math.max(0, usedBytes - picBytes));
        const chatBytes   = Math.max(0, usedBytes - picBytes - systemBytes);

        const pct = (b) => Math.max(0, Math.min(100, (b / totalBytes) * 100)).toFixed(2);

        const COLORS = {
            chat:   'var(--accent-color)',
            pic:    '#a855f7',
            system: '#f97316',
            free:   '',
        };

        // Segmented bar
        const barSegs = [
            { bytes: chatBytes,   color: COLORS.chat,   cls: '' },
            { bytes: picBytes,    color: COLORS.pic,    cls: '' },
            { bytes: systemBytes, color: COLORS.system, cls: '' },
            { bytes: freeBytes,   color: '',            cls: 'bg-zinc-200 dark:bg-zinc-700' },
        ];
        bar.innerHTML = barSegs.map(s => {
            const p = pct(s.bytes);
            if (parseFloat(p) < 0.05) return '';
            const style = s.color ? `style="flex:${p};background:${s.color};"` : `style="flex:${p};"`;
            return `<div ${style} class="h-full ${s.cls}"></div>`;
        }).join('');

        // Legend dots
        const legendItems = [
            { label: 'Chats',   color: COLORS.chat },
            { label: 'Picture', color: COLORS.pic },
            { label: 'System',  color: COLORS.system },
            { label: 'Free',    cls: 'bg-zinc-300 dark:bg-zinc-600' },
        ];
        const legendHtml = legendItems.map(l =>
            `<div class="flex items-center gap-1.5">
                <div class="w-2 h-2 rounded-full ${l.cls || ''}" style="${l.color ? `background:${l.color}` : ''}"></div>
                <span class="text-[11px] text-zinc-500 dark:text-zinc-400">${l.label}</span>
            </div>`
        ).join('');

        summary.innerHTML = `
            <div class="flex items-end justify-between mb-1">
                <div>
                    <span class="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">${fmt(usedBytes)}</span>
                    <span class="text-xs text-zinc-400 ml-1.5">of ${fmt(totalBytes)}</span>
                </div>
                <span class="text-xs font-semibold text-zinc-400">${fmt(freeBytes)} free</span>
            </div>
            <div class="flex gap-4 mt-2">${legendHtml}</div>`;

        // Breakdown rows
        const rows = [
            { label: 'Chat History',      sub: 'Your conversations',          bytes: chatBytes,   color: COLORS.chat,   icon: 'message-square' },
            { label: 'Profile Picture',   sub: 'Avatar image data',            bytes: picBytes,    color: COLORS.pic,    icon: 'image' },
            { label: 'System & Profile',  sub: 'Settings, memories, metadata', bytes: systemBytes, color: COLORS.system, icon: 'settings' },
            { label: 'Free',              sub: 'Available space',              bytes: freeBytes,   color: '#a1a1aa',     icon: 'cloud', isFree: true },
        ];

        breakdown.innerHTML = rows.map((r, i) => {
            const barW = r.isFree ? (100 - parseFloat(pct(usedBytes))).toFixed(2) : pct(r.bytes);
            const border = i < rows.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800/60' : '';
            return `<div class="flex items-center gap-3 px-4 py-3.5 ${border}">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style="background:${r.color}20;">
                    <i data-feather="${r.icon}" style="width:15px;height:15px;color:${r.color};"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold text-zinc-900 dark:text-white leading-tight">${r.label}</div>
                    <div class="text-[11px] text-zinc-400 mt-0.5">${r.sub}</div>
                    <div class="mt-1.5 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden max-w-[140px]">
                        <div style="width:${barW}%;background:${r.color};transition:width 0.6s cubic-bezier(0.16,1,0.3,1);" class="h-full rounded-full"></div>
                    </div>
                </div>
                <span class="text-sm font-mono font-semibold ${r.isFree ? 'text-zinc-400' : 'text-zinc-700 dark:text-zinc-200'} shrink-0">${fmt(r.bytes)}</span>
            </div>`;
        }).join('');

        if (window.feather) window.feather.replace();

    } catch (e) {
        console.error('Storage tab error:', e);
        breakdown.innerHTML = '<div class="p-5 text-center text-sm text-red-400">Failed to load storage data</div>';
    }
};
