// ─── Translation / i18n ────────────────────────────────────────

window.getT = (key, params = {}) => {
    const lang = window.settings.lang || 'en';
    let text = window.translations[lang]?.[key] || window.translations['en']?.[key] || key;
    for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{{${k}}}`, v);
    }
    return text;
};

window.applyTranslations = () => {
    const langCode = window.settings.lang || 'en';
    const dict = window.translations[langCode];
    document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.getAttribute('data-t');
        if (dict && dict[key]) el.innerText = dict[key];
    });
    
    document.querySelectorAll('[data-t-placeholder]').forEach(el => {
        const key = el.getAttribute('data-t-placeholder');
        if (dict && dict[key]) el.placeholder = dict[key];
    });
    document.querySelectorAll('[data-t-title]').forEach(el => {
        const key = el.getAttribute('data-t-title');
        if (dict && dict[key]) el.title = dict[key];
    });
    if (window.els.input) {
        const key = (window.chatHistory && window.chatHistory.length > 0) ? 'reply_placeholder' : 'input_placeholder';
        window.els.input.placeholder = window.getT(key, { model: window.currentModel.name });
    }
    document.querySelectorAll('.lang-text').forEach(t => t.innerText = langCode === 'en' ? '中文' : 'EN');
    if (typeof window.updateLangButtons === 'function') window.updateLangButtons(langCode);
};

window.setLang = (lang) => {
    window.settings.lang = lang;
    window.saveSettings();
    window.applyTranslations();
    window.updateProfileUI();
    window.renderHistory();
    window.render();
    window.updateLangButtons(lang);
    if (typeof window.syncProfileToCloud === 'function') window.syncProfileToCloud();
};

window.updateLangButtons = (lang) => {
    const active = ['bg-white', 'dark:bg-zinc-600', 'shadow-sm', 'text-zinc-900', 'dark:text-white'];
    const inactive = ['text-zinc-500'];
    [['btn-lang-en', 'en'], ['btn-lang-zh', 'zh']].forEach(([id, code]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (lang === code) {
            btn.classList.add(...active);
            btn.classList.remove(...inactive);
        } else {
            btn.classList.remove(...active);
            btn.classList.add(...inactive);
        }
    });
};
