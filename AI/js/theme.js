// ─── Theme & Accent ────────────────────────────────────────────

window.updateAccent = (color) => {
    let isAuto = color === 'auto', isDark = document.documentElement.classList.contains('dark');
    let finalColor = isAuto ? (isDark ? '#EBE9DD' : '#524738') : color;
    window.settings.accent = color;

    if (color.startsWith('#') && document.getElementById('custom-accent-picker')) {
        document.getElementById('custom-accent-picker').value = color;
    }

    const bgBase = isDark ? [12, 13, 11] : [249, 249, 247];
    const accRgb = [parseInt(finalColor.slice(1, 3), 16), parseInt(finalColor.slice(3, 5), 16), parseInt(finalColor.slice(5, 7), 16)];
    const alphaVal = isAuto ? 0.02 : 0.10;
    const blended = accRgb.map((c, i) => Math.round(c * alphaVal + bgBase[i] * (1 - alphaVal)));

    const root = document.documentElement;
    root.style.setProperty('--accent-color', finalColor);
    root.style.setProperty('--accent-glow', window.hexToRgba(finalColor, 0.4));
    root.style.setProperty('--accent-tint', window.hexToRgba(finalColor, isAuto ? 0.02 : 0.10));
    root.style.setProperty('--sidebar-tint', window.hexToRgba(finalColor, isAuto ? 0.01 : 0.07));
    // Compute contrast color based on accent luminance so buttons are always readable
    const lum = (0.299 * accRgb[0] + 0.587 * accRgb[1] + 0.114 * accRgb[2]) / 255;
    root.style.setProperty('--accent-contrast', lum > 0.55 ? '#1a1a1a' : '#f5f5f5');
    root.style.setProperty('--fade-color', isDark ? '#0C0D0B' : '#F9F9F7');
    root.style.setProperty('--fade-gradient-stop', isDark ? '#0C0D0B' : '#F9F9F7');
    root.style.setProperty('--bg-color', isDark ? '#0C0D0B' : '#F9F9F7');
    root.style.setProperty('--sidebar-bg', isDark ? '#111210' : '#F2F2F0');
    root.style.setProperty('--input-bg', isDark ? 'rgba(22, 23, 21, 0.5)' : 'rgba(249, 249, 247, 0.6)');
    root.style.setProperty('--action-btn-color', isDark ? '#e4e4e7' : '#52525b');
    root.style.setProperty('--thinking-accent', isDark ? `color-mix(in srgb, ${finalColor}, white 35%)` : `color-mix(in srgb, ${finalColor}, black 20%)`);
    root.style.setProperty('--thinking-side', isDark ? '#4b5563' : '#94a3b8');
    if (window.els.logoAi) window.els.logoAi.classList.toggle('gradient-mode', isAuto);

    window.saveSettings();

    if (window.isGoogleSignedIn) window.syncChatsToGoogle();

    window.updateUI();
    window.renderHistory();
    if (window.renderThemes) window.renderThemes();
};

window.setTheme = (mode) => {
    localStorage.setItem('vail_theme', mode);
    const isDark = (mode === 'dark') || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);

    window.updateAccent(window.settings.accent || 'auto');
    window.updateThemeButtons(mode);
};

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (localStorage.getItem('vail_theme') === 'system') {
        document.documentElement.classList.toggle('dark', e.matches);
        window.updateAccent(window.settings.accent);
    }
});

window.updateThemeButtons = (mode) => {
    const lightBtn = document.getElementById('btn-theme-light');
    const darkBtn = document.getElementById('btn-theme-dark');
    const systemBtn = document.getElementById('btn-theme-system');

    const resetClass = "min-h-[36px] px-3 rounded-lg text-xs font-bold transition-all text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800";
    const activeClass = "min-h-[36px] px-3 rounded-lg text-xs font-bold transition-all skuomorphic-btn bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white";

    if (lightBtn) lightBtn.className = mode === 'light' ? activeClass : resetClass;
    if (darkBtn) darkBtn.className = mode === 'dark' ? activeClass : resetClass;
    if (systemBtn) systemBtn.className = mode === 'system' ? activeClass : resetClass;
};

window.toggleTheme = () => {
    const current = localStorage.getItem('vail_theme') === 'dark' ? 'light' : 'dark';
    window.setTheme(current);
};

window.addCustomAccent = (color, name) => {
    if (!color || typeof color !== 'string') return;
    const hex = color.toLowerCase();
    if (!/^#([0-9a-f]{6})$/.test(hex)) return;
    if (!Array.isArray(window.settings.customAccents)) window.settings.customAccents = [];

    const exists = window.settings.customAccents.some(item => {
        const c = typeof item === 'string' ? item : item.color;
        return c === hex;
    });
    if (!exists) {
        window.settings.customAccents.push({ color: hex, name: name || 'Custom Color' });
    }
    window.saveSettings();
    window.renderThemes();
};

window.handleCustomAccentChange = (value) => {
    if (value && /^#([0-9a-f]{6})$/i.test(value)) {
        const previewEl = document.getElementById('custom-color-preview');
        const addBtn = document.getElementById('add-custom-color-btn');
        if (previewEl) {
            previewEl.style.background = value;
            previewEl.style.display = 'flex';
        }
        if (addBtn) {
            addBtn.style.display = 'flex';
            addBtn.setAttribute('data-color', value.toLowerCase());
        }
        window.updateAccent(value);
    }
};

window.addSelectedCustomColor = () => {
    const addBtn = document.getElementById('add-custom-color-btn');
    const color = addBtn?.getAttribute('data-color');
    if (color) {
        window.addCustomAccent(color);
        const previewEl = document.getElementById('custom-color-preview');
        if (previewEl) previewEl.style.display = 'none';
        if (addBtn) addBtn.style.display = 'none';
    }
};

window.resetCustomColors = () => {
    if (confirm('Remove all custom colors?')) {
        window.settings.customAccents = [];
        window.saveSettings();
        window.renderThemes();
        window.updateAccent(window.settings.accent || 'auto');
    }
};

window.handleCustomAccentChangeNew = (val) => {
    window.updateAccent(val);
    const btn = document.getElementById('pending-custom-color');
    if (btn) {
        btn.style.display = 'flex';
        btn.setAttribute('data-color', val);
        btn.style.borderColor = val;
        btn.style.background = `color-mix(in srgb, ${val} 10%, transparent)`;
    }
};

window.addSelectedCustomColorNew = () => {
    const btn = document.getElementById('pending-custom-color');
    const color = btn?.getAttribute('data-color');
    if (color) {
        const name = prompt("Name your color:", "My New Theme");
        if (name) {
            window.addCustomAccent(color, name);
            btn.style.display = 'none';
        }
    }
};

window.removeCustomAccent = (index) => {
    if (confirm('Delete this theme?')) {
        if (window.settings.customAccents && window.settings.customAccents[index]) {
            const accToDelete = typeof window.settings.customAccents[index] === 'string' ? window.settings.customAccents[index] : window.settings.customAccents[index].color;
            if (window.settings.accent === accToDelete) {
                window.updateAccent('auto');
            }
            window.settings.customAccents.splice(index, 1);
            window.saveSettings();
            window.renderThemes();
        }
    }
};

window.renderThemes = () => {
    const container = document.getElementById('theme-list-container');
    if (!container) return;

    const currentAccent = window.settings.accent || 'auto';

    const PRESETS = [
        { color: 'auto', name: 'Sage Whisper', desc: 'Earthy & calm', isAuto: true, iconBg: 'linear-gradient(135deg, #EBE9DD, #524738)', glowColor: '#524738' },
        { color: '#3b82f6', name: 'Midnight in Paris', desc: 'Deep & electric', iconBg: 'linear-gradient(135deg, #1d4ed8, #60a5fa)', glowColor: '#3b82f6' },
        { color: '#a855f7', name: 'Electric Lemonade', desc: 'Vivid & playful', iconBg: 'linear-gradient(135deg, #7c3aed, #c084fc)', glowColor: '#a855f7' },
        { color: '#f97316', name: 'Vitamin C', desc: 'Warm & energetic', iconBg: 'linear-gradient(135deg, #ea580c, #fdba74)', glowColor: '#f97316' },
        { color: '#22c55e', name: 'Lush Green', desc: 'Fresh & alive', iconBg: 'linear-gradient(135deg, #16a34a, #86efac)', glowColor: '#22c55e' },
        { color: '#DE7356', name: 'Claudius', desc: 'Earthy & Warm', iconBg: 'linear-gradient(135deg, #DE7356, #f29f8a)', glowColor: '#DE7356' }
    ];

    let html = '';

    const renderThemeItem = ({ color, name, desc, isAuto, iconBg, glowColor }, index, isCustom = false) => {
        const isActive = currentAccent === color;
        const glowStyle = isActive ? `box-shadow: 0 0 0 3px ${glowColor}, 0 0 22px ${glowColor}55;` : '';
        const checkHtml = isActive ? `<div class="Cadance-theme-check ml-auto shrink-0">${feather.icons.check.toSvg({ class: 'w-3 h-3', style: 'color: var(--accent-contrast)' })}</div>` : '';
        const deleteBtn = isCustom ? `<div onclick="event.stopPropagation(); window.removeCustomAccent(${index})" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 ml-2 opacity-0 group-hover:opacity-100 transition-all text-zinc-400 hover:text-red-500 shrink-0"><i data-feather="trash-2" class="w-3.5 h-3.5"></i></div>` : '';

        return `
            <button onclick="window.updateAccent('${color}')"
                class="Cadance-theme-item group ${isActive ? 'active-theme' : ''}">
                <div class="Cadance-theme-icon shrink-0" style="background: ${iconBg}; ${glowStyle}">
                    ${isAuto ? `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>` : ''}
                </div>
                <div class="flex flex-col min-w-0">
                    <span class="text-sm font-bold text-zinc-900 dark:text-white leading-tight">${name}</span>
                    <span class="text-[11px] text-zinc-400 leading-tight mt-0.5">${desc || ''}</span>
                </div>
                ${checkHtml}
                ${deleteBtn}
            </button>`;
    };

    PRESETS.forEach((theme) => { html += renderThemeItem(theme, -1, false); });

    if (window.settings.customAccents && Array.isArray(window.settings.customAccents)) {
        window.settings.customAccents.forEach((item, index) => {
            const color = typeof item === 'string' ? item : item.color;
            const name = typeof item === 'string' ? 'Custom Color' : item.name;
            html += renderThemeItem({ color, name, desc: 'Your custom color', iconBg: color, glowColor: color }, index, true);
        });
    }

    container.innerHTML = html;
    feather.replace({ 'stroke-width': 2, 'width': 16, 'height': 16 }, container);
};
