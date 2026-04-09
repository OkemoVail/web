// ─── Translation / i18n ────────────────────────────────────────

window.applyTranslations = () => {
    const langCode = window.settings.lang || 'en';
    const dict = window.translations[langCode];
    document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.getAttribute('data-t');
        if (dict[key]) el.innerText = dict[key];
    });
    if (window.els.input) {
        const rawPlaceholder = (window.chatHistory && window.chatHistory.length > 0) ? dict.reply_placeholder : dict.input_placeholder;
        window.els.input.placeholder = rawPlaceholder.replace('{{model}}', window.currentModel.name);
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
