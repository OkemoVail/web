// js/canvas.js
window.canvasEnabled = localStorage.getItem('oaky_canvas_enabled') !== 'false';
window.currentCanvasCode = '';
window.monacoEditorInstance = null;

function toggleCanvasSetting() {
    window.canvasEnabled = !window.canvasEnabled;
    localStorage.setItem('oaky_canvas_enabled', window.canvasEnabled);
    if(window.showToast) {
        window.showToast(`Canvas mode ${window.canvasEnabled ? 'enabled' : 'disabled'}`);
    } else {
        console.log("Canvas enabled:", window.canvasEnabled);
    }
    if (window.updateUI) {
        window.updateUI();
    }
    if (window.chatHistory && window.chatHistory.length > 0 && typeof window.save === 'function') {
        window.save();
    }
}

function initMonacoEditor() {
    if (window.monacoEditorInstance) return;
    
    // Load Monaco Editor
    if (window.require) {
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
        require(['vs/editor/editor.main'], function () {
            window.monacoEditorInstance = monaco.editor.create(document.getElementById('monaco-editor'), {
                value: window.currentCanvasCode,
                language: 'html',
                theme: document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs',
                automaticLayout: true,
                minimap: { enabled: false },
                wordWrap: 'on'
            });

            // Update iframe when code changes
            window.monacoEditorInstance.onDidChangeModelContent(() => {
                window.currentCanvasCode = window.monacoEditorInstance.getValue();
                updateCanvasPreview();
            });
        });
    }
}

function openCanvas(code, passedLang) {
    if (!window.canvasEnabled) return;

    window.currentCanvasCode = code;
    const lang = passedLang || window.currentCanvasLang || 'html';

    const container = document.getElementById('canvas-container');
    container.classList.remove('hidden');
    container.classList.add('flex');
    document.body.classList.add('canvas-open');  // triggers 70/30 split
    document.body.classList.add('sidebar-collapsed'); // collapse sidebar to mini mode

    const isDoc = lang === 'document' || lang === 'markdown' || lang === 'text' || lang === 'word';

    const wordBtn = document.getElementById('canvas-tab-word');
    if (wordBtn) {
        if (isDoc) wordBtn.classList.remove('hidden');
        else wordBtn.classList.add('hidden');
    }

    const codeTab = document.getElementById('canvas-tab-code');
    if (codeTab) codeTab.style.display = '';

    initMonacoEditor();
    if (window.monacoEditorInstance) {
        window.monacoEditorInstance.setValue(code);
        // Re-sync Monaco theme with current light/dark mode on every open.
        if (window.monaco && window.monaco.editor) {
            const isDark = document.documentElement.classList.contains('dark');
            window.monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
        }
    }
    updateCanvasPreview();
    switchCanvasTab('preview');
}

function closeCanvas() {
    const container = document.getElementById('canvas-container');
    container.classList.add('hidden');
    container.classList.remove('flex');

    // Automatically expand the sidebar back when exiting canvas mode
    if (document.body.classList.contains('canvas-open')) {
        document.body.classList.remove('sidebar-collapsed');
    }

    document.body.classList.remove('canvas-open');
}


// Extract first ```html ... ``` fenced block (or any fenced block as fallback)
function extractCanvasCode(text) {
    if (!text) return null;
    const html = text.match(/```html\s*([\s\S]*?)```/i);
    if (html) { window.currentCanvasLang = 'html'; return html[1].trim(); }
    const any = text.match(/```([a-zA-Z]*)\s*([\s\S]*?)```/);
    if (any) { window.currentCanvasLang = any[1].toLowerCase(); return any[2].trim(); }
    return null;
}
window.extractCanvasCode = extractCanvasCode;

// Like extractCanvasCode but also returns the partial code from an OPEN fence
// that hasn't closed yet — used mid-stream so canvas pops the moment code starts.
function streamingCanvasCode(text) {
    if (!text) return null;
    const closed = extractCanvasCode(text);
    if (closed) return closed;
    const open = text.match(/```(?:html|([a-zA-Z]*))\s*\n?([\s\S]*)$/i);
    if (!open) return null;
    window.currentCanvasLang = (open[1] || 'html').toLowerCase();
    const body = open[2];
    if (body.length < 16) return null; // wait for a little content before opening
    return body;
}
window.streamingCanvasCode = streamingCanvasCode;

// Inject a theme-sync script into the iframe HTML so its dark/light mode
// follows the parent chat theme (overrides any `darkMode: 'media'` config
// the model emitted, and forces matching color-scheme for raw CSS too).
function _withCanvasThemeSync(html) {
    const isDark = document.documentElement.classList.contains('dark');
    const sync = `
<script>
(function () {
  // Force Tailwind to use class-based dark mode regardless of what the page set.
  window.tailwind = window.tailwind || {};
  const prevCfg = window.tailwind.config || {};
  window.tailwind.config = Object.assign({}, prevCfg, { darkMode: 'class' });
  // If Tailwind's already loaded, re-apply by toggling class on root.
  function apply(isDark) {
    document.documentElement.classList.toggle('dark', !!isDark);
    try { document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'; } catch (e) {}
  }
  apply(${isDark ? 'true' : 'false'});
  // Listen for parent theme changes pushed via postMessage.
  window.addEventListener('message', function (ev) {
    if (ev && ev.data && ev.data.__canvasTheme) apply(!!ev.data.dark);
  });
})();
<\/script>`;
    const code = String(html || '');
    if (/<head[^>]*>/i.test(code)) {
        return code.replace(/<head[^>]*>/i, m => m + sync);
    }
    if (/<html[^>]*>/i.test(code)) {
        return code.replace(/<html[^>]*>/i, m => m + '<head>' + sync + '</head>');
    }
    return sync + code;
}

function updateCanvasPreview() {
    const iframe = document.getElementById('canvas-preview');
    const lang = window.currentCanvasLang || 'html';
    const isDoc = lang === 'document' || lang === 'markdown' || lang === 'text' || lang === 'word';

    if (isDoc) {
        const htmlContent = window.marked ? window.marked.parse(window.currentCanvasCode) : `<pre style="white-space:pre-wrap;font-family:sans-serif;">${window.currentCanvasCode}</pre>`;
        const styledDoc = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; color: #18181b; }
        h1 { font-size: 2.25rem; font-weight: 800; margin-bottom: 1rem; }
        h2 { font-size: 1.5rem; font-weight: 700; margin-top: 1.5rem; margin-bottom: 0.75rem; }
        h3 { font-size: 1.25rem; font-weight: 700; margin-top: 1.25rem; margin-bottom: 0.5rem; }
        p { margin-bottom: 1rem; line-height: 1.6; }
        ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
        ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
        pre { background: #1e1e1e; color: #fff; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin-bottom: 1rem; }
        code { font-family: monospace; }
        .dark body { background: #1e1e1e; color: #e4e4e7; }
        .dark pre { background: #000; }
    </style>
</head>
<body class="${document.documentElement.classList.contains('dark') ? 'dark' : ''}">
    ${htmlContent}
</body>
</html>`;
        iframe.removeAttribute('src'); // clear any lingering word iframe
        iframe.srcdoc = _withCanvasThemeSync(styledDoc);
    } else {
        iframe.removeAttribute('src'); // Ensure we clear the word iframe
        iframe.srcdoc = _withCanvasThemeSync(window.currentCanvasCode);
    }
}

window.exportToWord = function() {
    const code = window.currentCanvasCode || '';
    const htmlContent = window.marked ? window.marked.parse(code) : code;
    
    // Save to temp local datastorage for transfer
    sessionStorage.setItem('okemo_word_temp_transfer', htmlContent);
    
    // Also save to permanent storage as fallback
    const documentTitle = 'AI Generated Document';
    const store = JSON.parse(localStorage.getItem('okemo_word_docs_v1') || '{}');
    store[documentTitle] = { title: documentTitle, content: htmlContent, savedAt: Date.now() };
    localStorage.setItem('okemo_word_docs_v1', JSON.stringify(store));
    localStorage.setItem('okemo_word_last', documentTitle);
    
    window.open('../word/index.html', '_blank');
};

// Push theme changes into a live iframe without reloading it.
function _pushCanvasTheme() {
    const iframe = document.getElementById('canvas-preview');
    if (!iframe || !iframe.contentWindow) return;
    const isDark = document.documentElement.classList.contains('dark');
    try { iframe.contentWindow.postMessage({ __canvasTheme: true, dark: isDark }, '*'); } catch (e) {}
}

function switchCanvasTab(tab) {
    const previewTab = document.getElementById('canvas-tab-preview');
    const codeTab = document.getElementById('canvas-tab-code');
    const previewContainer = document.getElementById('canvas-preview');
    const editorContainer = document.getElementById('canvas-editor-container');
    
    const activeClass = ['bg-white', 'dark:bg-[#1e1e1e]', 'shadow-sm', 'text-zinc-800', 'dark:text-zinc-200', 'border', 'border-zinc-200', 'dark:border-zinc-700'];
    const inactiveClass = ['text-zinc-500', 'dark:text-zinc-400', 'hover:text-zinc-800', 'dark:hover:text-zinc-200', 'border', 'border-transparent'];
    
    if (tab === 'preview') {
        previewContainer.classList.remove('hidden');
        editorContainer.classList.add('hidden');
        
        previewTab.classList.add(...activeClass);
        previewTab.classList.remove(...inactiveClass);
        
        codeTab.classList.remove(...activeClass);
        codeTab.classList.add(...inactiveClass);
    } else {
        previewContainer.classList.add('hidden');
        editorContainer.classList.remove('hidden');
        
        codeTab.classList.add(...activeClass);
        codeTab.classList.remove(...inactiveClass);
        
        previewTab.classList.remove(...activeClass);
        previewTab.classList.add(...inactiveClass);
    }
}

function downloadCanvasCode() {
    const blob = new Blob([window.currentCanvasCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'website.html';
    a.click();
    URL.revokeObjectURL(url);
}

// Watch for dark mode changes — sync Monaco AND the canvas iframe preview.
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.attributeName !== 'class') return;
        const isDark = document.documentElement.classList.contains('dark');
        if (window.monacoEditorInstance && window.monaco) {
            monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
        }
        // Live-push theme into the iframe; no reload needed.
        _pushCanvasTheme();
    });
});
observer.observe(document.documentElement, { attributes: true });

// Expose globally
window.openCanvas = openCanvas;
window.closeCanvas = closeCanvas;
window.switchCanvasTab = switchCanvasTab;
window.downloadCanvasCode = downloadCanvasCode;
window.toggleCanvasSetting = toggleCanvasSetting;
