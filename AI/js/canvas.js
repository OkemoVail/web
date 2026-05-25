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
    
    // Initialize Monaco if needed
    initMonacoEditor();
    
    if (window.monacoEditorInstance) {
        window.monacoEditorInstance.setValue(code);
    }
    
    updateCanvasPreview();
    switchCanvasTab('preview');
}

function closeCanvas() {
    const container = document.getElementById('canvas-container');
    container.classList.add('hidden');
    container.classList.remove('flex');
}

function updateCanvasPreview() {
    const iframe = document.getElementById('canvas-preview');
    iframe.srcdoc = window.currentCanvasCode;
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

// Watch for dark mode changes to update Monaco theme
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class' && window.monacoEditorInstance && window.monaco) {
            const isDark = document.documentElement.classList.contains('dark');
            monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
        }
    });
});
observer.observe(document.documentElement, { attributes: true });

// Expose globally
window.openCanvas = openCanvas;
window.closeCanvas = closeCanvas;
window.switchCanvasTab = switchCanvasTab;
window.downloadCanvasCode = downloadCanvasCode;
window.toggleCanvasSetting = toggleCanvasSetting;
