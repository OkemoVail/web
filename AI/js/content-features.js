// ─── Content Features (KaTeX, code blocks) ────────────────────

window.applyContentFeatures = (el) => {
    if (!el) return;
    el.innerHTML = el.innerHTML.replace(/\$\$([\s\S]+?)\$\$/g, (_, f) => `<div class="katex-display">${katex.renderToString(f, { displayMode: true, throwOnError: false })}</div>`);

    el.querySelectorAll('pre').forEach(pre => {
        if (pre.parentElement.classList.contains('code-window')) return;

        const codeEl = pre.querySelector('code');
        let lang = 'code';
        if (codeEl) {
            const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
            if (langClass) lang = langClass.replace('language-', '');
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'code-window';

        const header = document.createElement('div');
        header.className = 'code-header';
        header.innerHTML = `
            <div class="code-header-left">
                <div class="language-label">${lang}</div>
            </div>
            <div class="code-header-right"></div>
        `;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.innerHTML = feather.icons.copy.toSvg({ class: 'w-4 h-4' });
        copyBtn.title = 'Copy code';
        copyBtn.onclick = () => {
            const textToCopy = codeEl ? codeEl.innerText : pre.innerText;
            navigator.clipboard.writeText(textToCopy);
            copyBtn.innerHTML = feather.icons.check.toSvg({ class: 'w-4 h-4' });
            copyBtn.classList.add('text-green-500');
            setTimeout(() => {
                copyBtn.innerHTML = feather.icons.copy.toSvg({ class: 'w-4 h-4' });
                copyBtn.classList.remove('text-green-500');
            }, 2000);
        };

        header.querySelector('.code-header-right').appendChild(copyBtn);

        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);
    });
};
