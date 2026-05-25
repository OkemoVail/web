// ─── Content Features (KaTeX, canvas-pill code blocks) ────────

window.applyContentFeatures = (el) => {
    if (!el) return;
    el.innerHTML = el.innerHTML.replace(/\$\$([\s\S]+?)\$\$/g, (_, f) => `<div class="katex-display">${katex.renderToString(f, { displayMode: true, throwOnError: false })}</div>`);

    // Pre-scan: if any code block looks like HTML (or any code while generating),
    // force-enable canvas so the toggle, plus indicator, and menu stay in sync.
    let hasHtmlCode = false;
    el.querySelectorAll('pre code').forEach(c => {
        const langClass = Array.from(c.classList).find(cn => cn.startsWith('language-'));
        const lng = langClass ? langClass.replace('language-', '').toLowerCase() : '';
        if (lng === 'html' || lng === 'xhtml' || /<\s*(html|!doctype|body|div|head)/i.test(c.innerText || '')) {
            hasHtmlCode = true;
        }
    });
    if (hasHtmlCode && window.canvasEnabled === false) {
        window.canvasEnabled = true;
        try { localStorage.setItem('oaky_canvas_enabled', 'true'); } catch (e) {}
        if (window.updateUI) window.updateUI();
        if (window.showToast) window.showToast('Canvas auto-enabled for HTML');
    }

    const canvasOn = window.canvasEnabled !== false;
    let firstCodeForCanvas = null;

    el.querySelectorAll('pre').forEach(pre => {
        if (pre.parentElement && pre.parentElement.classList.contains('code-window')) return;

        const codeEl = pre.querySelector('code');
        let lang = 'code';
        if (codeEl) {
            const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
            if (langClass) lang = langClass.replace('language-', '');
        }
        const codeText = codeEl ? codeEl.innerText : pre.innerText;
        const trimmed = (codeText || '').trim();
        if (!trimmed) return;

        if (canvasOn) {
            if (firstCodeForCanvas === null) firstCodeForCanvas = trimmed;

            const isGenerating = !!window.isGenerating;
            const title = lang === 'html' ? 'Simple Website'
                : lang === 'code' ? 'Code Artifact'
                : (lang.charAt(0).toUpperCase() + lang.slice(1)) + ' Snippet';

            const iconSvg = (feather.icons.code)
                ? feather.icons.code.toSvg({ class: 'w-5 h-5' })
                : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'canvas-pill' + (isGenerating ? ' generating' : '');
            pill.dataset.lang = lang;
            
            const formattedTime = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

            pill.innerHTML = `
                <div class="canvas-pill-left-content">
                    <span class="canvas-pill-icon">${iconSvg}</span>
                    <span class="canvas-pill-text">
                        <span class="canvas-pill-title">${title}</span>
                        <span class="canvas-pill-sub">${isGenerating ? 'Generating…' : formattedTime}</span>
                    </span>
                </div>
                ${isGenerating ? '' : '<span class="canvas-pill-open-btn">Open</span>'}
            `;
            const captured = trimmed;
            pill.addEventListener('click', () => {
                if (window.openCanvas) window.openCanvas(captured);
            });
            pre.replaceWith(pill);
            return;
        }

        // Fallback: classic code-window rendering when canvas is disabled
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
            navigator.clipboard.writeText(codeText);
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

    // Auto-open canvas with the first detected code block while generating
    if (canvasOn && firstCodeForCanvas && window.isGenerating && window.openCanvas) {
        window.openCanvas(firstCodeForCanvas);
    }
};
