// js/file_upload.js — single-file attachment with drag-drop + inline preview
window.uploadedFile = null; // { name, type, size, isImage, dataUrl, textContent? }

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const TEXT_LIKE = /^(text\/|application\/(json|xml|javascript|x-yaml|x-toml))/;

function _readAsDataURL(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
    });
}
function _readAsText(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsText(file);
    });
}

async function processFile(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
        alert('File too large (max 10 MB)');
        return;
    }
    const isImage = file.type.startsWith('image/');
    const isText = TEXT_LIKE.test(file.type) || /\.(md|txt|log|csv|py|js|ts|html|css|json|yaml|yml)$/i.test(file.name);

    const dataUrl = await _readAsDataURL(file);
    const textContent = isText ? await _readAsText(file).catch(() => null) : null;

    window.uploadedFile = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        isImage,
        dataUrl,
        textContent,
    };
    renderUploadPreview();
}

function renderUploadPreview() {
    const c = document.getElementById('upload-preview-container');
    if (!c) return;
    c.innerHTML = '';
    if (!window.uploadedFile) {
        c.classList.add('hidden');
        return;
    }
    const f = window.uploadedFile;
    const chip = document.createElement('div');
    chip.className = 'attachment-chip flex items-center gap-2 px-2 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 relative group max-w-full';
    if (f.isImage) {
        chip.innerHTML = `
            <img src="${f.dataUrl}" class="w-10 h-10 object-cover rounded-md flex-shrink-0" alt="">
            <span class="max-w-[160px] truncate">${f.name}</span>
            <button onclick="window.clearUploadedFile()" class="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-zinc-300 dark:bg-zinc-700 hover:bg-red-500 hover:text-white transition-colors text-zinc-700 dark:text-zinc-200 cursor-pointer flex-shrink-0" aria-label="Remove">
                <i data-feather="x" class="w-3 h-3 pointer-events-none"></i>
            </button>`;
    } else {
        chip.innerHTML = `
            <span class="w-10 h-10 rounded-md bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                <i data-feather="file-text" class="w-5 h-5"></i>
            </span>
            <span class="flex flex-col leading-tight min-w-0">
                <span class="max-w-[180px] truncate">${f.name}</span>
                <span class="text-[10px] text-zinc-500 dark:text-zinc-400">${(f.size/1024).toFixed(1)} KB</span>
            </span>
            <button onclick="window.clearUploadedFile()" class="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-zinc-300 dark:bg-zinc-700 hover:bg-red-500 hover:text-white transition-colors text-zinc-700 dark:text-zinc-200 cursor-pointer flex-shrink-0" aria-label="Remove">
                <i data-feather="x" class="w-3 h-3 pointer-events-none"></i>
            </button>`;
    }
    c.appendChild(chip);
    c.classList.remove('hidden');
    if (window.feather) window.feather.replace();
}

function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || !files.length) return;
    processFile(files[0]); // single-file limit
    event.target.value = ''; // allow re-selecting same file
}

function clearUploadedFile() {
    window.uploadedFile = null;
    renderUploadPreview();
}

// Drag/drop overlay on the input box
function _initDragDrop() {
    const wrap = document.querySelector('.input-box-wrap');
    if (!wrap) return;

    let overlay = document.getElementById('drag-here-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'drag-here-overlay';
        overlay.className = 'absolute inset-0 z-30 hidden items-center justify-center rounded-2xl pointer-events-none';
        overlay.style.cssText = 'background: color-mix(in srgb, var(--accent-color) 18%, transparent); border: 2px dashed var(--accent-color); backdrop-filter: blur(2px);';
        overlay.innerHTML = `<div class="flex flex-col items-center gap-2 text-sm font-semibold" style="color: var(--accent-color)">
            <i data-feather="upload-cloud" class="w-7 h-7"></i>
            <span>Drag here</span>
        </div>`;
        wrap.appendChild(overlay);
        if (window.feather) window.feather.replace();
    }

    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    const show = () => overlay.classList.replace('hidden', 'flex');
    const hide = () => { overlay.classList.replace('flex', 'hidden'); depth = 0; };

    window.addEventListener('dragenter', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth++;
        show();
    });
    window.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        depth = Math.max(0, depth - 1);
        if (depth === 0) hide();
    });
    window.addEventListener('drop', (e) => {
        if (e.target.closest && (e.target.closest('#folders-section') || e.target.closest('.folder-header'))) return;
        e.preventDefault();
        hide();
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) processFile(files[0]);
    });
}

function _initPaste() {
    const input = document.getElementById('user-input');
    const target = input || window;
    target.addEventListener('paste', (e) => {
        const items = (e.clipboardData || window.clipboardData)?.items;
        if (!items) return;
        for (const it of items) {
            if (it.kind === 'file') {
                const file = it.getAsFile();
                if (!file) continue;
                if (file.type.startsWith('image/')) {
                    e.preventDefault();
                    processFile(file);
                    return;
                }
            }
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { _initDragDrop(); _initPaste(); });
} else {
    _initDragDrop();
    _initPaste();
}

window.handleFileUpload = handleFileUpload;
window.clearUploadedFile = clearUploadedFile;
window.processUploadFile = processFile;
window.renderUploadPreview = renderUploadPreview;
