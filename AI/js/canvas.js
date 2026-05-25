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

function openCanvas(code) {
    if (!window.canvasEnabled) return;

    window.currentCanvasCode = code;

    const container = document.getElementById('canvas-container');
    container.classList.remove('hidden');
    container.classList.add('flex');
    document.body.classList.add('canvas-open');  // triggers 70/30 split
    document.body.classList.add('sidebar-collapsed'); // collapse sidebar to mini mode

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

// Inject 70/30 layout rules (no chat.html edit needed)
(function _injectCanvasLayoutCSS() {
    if (document.getElementById('canvas-layout-css')) return;
    const s = document.createElement('style');
    s.id = 'canvas-layout-css';
    s.textContent = `
        @media (min-width: 1024px) {
            body.canvas-open #canvas-container { 
                display: flex !important;
                flex: 7 1 0% !important; 
                max-width: 70% !important; 
                width: auto !important; 
            }
            body.canvas-open main { 
                flex: 3 1 0% !important; 
                max-width: 30% !important; 
                width: auto !important;
            }
        }

        /* Hide personality and updates button when canvas is enabled */
        body.canvas-open #top-right-actions {
            display: none !important;
        }

        /* Ensure proper left/right padding for chat elements in canvas mode */
        body.canvas-open main #chat-messages,
        body.canvas-open main div.max-w-2xl {
            padding-left: 1.5rem !important;
            padding-right: 1.5rem !important;
        }

        /* Ensure top left chat title fits perfectly inside main in canvas mode */
        body.canvas-open #top-left-chat-title {
            max-width: calc(100% - 3rem) !important;
            left: 1.5rem !important;
        }

        /* Premium Gemini-style canvas card */
        .canvas-pill {
            display: inline-flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            margin: 0.8rem 0;
            padding: 0.85rem 1.15rem;
            border-radius: 16px;
            border: 1px solid rgba(0, 0, 0, 0.08);
            background: rgba(0, 0, 0, 0.03);
            color: var(--text-primary);
            cursor: pointer;
            text-align: left;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            max-width: 520px;
            width: 100%;
            font-family: inherit;
        }

        .dark .canvas-pill {
            background: rgba(255, 255, 255, 0.04);
            border-color: rgba(255, 255, 255, 0.08);
        }

        .canvas-pill:hover {
            background: rgba(0, 0, 0, 0.05);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        }

        .dark .canvas-pill:hover {
            background: rgba(255, 255, 255, 0.06);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .canvas-pill:active {
            transform: translateY(0);
        }

        .canvas-pill-left-content {
            display: flex;
            align-items: center;
            gap: 0.85rem;
            min-width: 0;
        }

        .canvas-pill .canvas-pill-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            border-radius: 10px;
            background: rgba(0, 0, 0, 0.05);
            color: var(--text-primary);
            flex: 0 0 38px;
            transition: background 0.2s ease;
        }

        .dark .canvas-pill .canvas-pill-icon {
            background: rgba(255, 255, 255, 0.08);
            color: var(--text-primary);
        }

        .canvas-pill .canvas-pill-icon svg {
            stroke: currentColor;
            width: 18px;
            height: 18px;
        }

        .canvas-pill .canvas-pill-text {
            display: flex;
            flex-direction: column;
            line-height: 1.3;
            min-width: 0;
        }

        .canvas-pill .canvas-pill-title {
            font-size: 0.95rem;
            font-weight: 600;
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .canvas-pill .canvas-pill-sub {
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin-top: 2px;
        }

        .canvas-pill .canvas-pill-open-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0.45rem 1.25rem;
            border-radius: 9999px;
            background: var(--accent-color);
            color: var(--accent-contrast);
            font-size: 0.85rem;
            font-weight: 700;
            transition: all 0.2s ease;
            box-shadow: 0 2px 6px -1px var(--accent-glow);
            flex-shrink: 0;
        }

        .canvas-pill:hover .canvas-pill-open-btn {
            filter: brightness(1.06);
            transform: scale(1.02);
        }

        .canvas-pill:active .canvas-pill-open-btn {
            filter: brightness(0.96);
            transform: scale(0.98);
        }

        .canvas-pill.generating .canvas-pill-sub::after {
            content: '';
            display: inline-block;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: currentColor;
            margin-left: 6px;
            animation: canvasPillPulse 1.1s ease-in-out infinite;
            vertical-align: middle;
        }

        @keyframes canvasPillPulse {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50%      { opacity: 1;   transform: scale(1.2); }
        }
    `;
    document.head.appendChild(s);
})();

// Extract first ```html ... ``` fenced block (or any fenced block as fallback)
function extractCanvasCode(text) {
    if (!text) return null;
    const html = text.match(/```html\s*([\s\S]*?)```/i);
    if (html) return html[1].trim();
    const any = text.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
    return any ? any[1].trim() : null;
}
window.extractCanvasCode = extractCanvasCode;

// Like extractCanvasCode but also returns the partial code from an OPEN fence
// that hasn't closed yet — used mid-stream so canvas pops the moment code starts.
function streamingCanvasCode(text) {
    if (!text) return null;
    const closed = extractCanvasCode(text);
    if (closed) return closed;
    const open = text.match(/```(?:html|[a-zA-Z]*)\s*\n?([\s\S]*)$/i);
    if (!open) return null;
    const body = open[1];
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
    iframe.srcdoc = _withCanvasThemeSync(window.currentCanvasCode);
}

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
