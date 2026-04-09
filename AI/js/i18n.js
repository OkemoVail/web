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
    if (window.els.input) {
        const key = (window.chatHistory && window.chatHistory.length > 0) ? 'reply_placeholder' : 'input_placeholder';
        window.els.input.placeholder = window.getT(key, { model: window.currentModel.name });
    }
    document.querySelectorAll('.lang-text').forEach(t => t.innerText = langCode === 'en' ? '中文' : 'EN');
};

window.setLang = (lang) => {
    window.settings.lang = lang;
    window.saveSettings();
    window.applyTranslations();
    window.updateProfileUI();
    window.renderHistory();
    window.render();
    window.updateLangButtons(lang);
};

window.updateLangButtons = (lang) => {
    const btnEn = document.getElementById('btn-lang-en');
    if (btnEn) {
        btnEn.classList.add('bg-white', 'dark:bg-zinc-600', 'shadow-sm', 'text-zinc-900', 'dark:text-white');
    }
};
