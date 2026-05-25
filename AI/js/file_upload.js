// js/file_upload.js
window.uploadedFiles = [];

function handleFileUpload(event) {
    const files = event.target.files;
    processFiles(files);
}

function processFiles(files) {
    const previewContainer = document.getElementById('upload-preview-container');
    if (!previewContainer) return;
    
    Array.from(files).forEach(file => {
        window.uploadedFiles.push(file);
        
        // Add visual indicator
        const fileDiv = document.createElement('div');
        fileDiv.className = 'flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 flex-shrink-0 relative group';
        
        const isImage = file.type.startsWith('image/');
        const iconClass = isImage ? 'fa-image' : 'fa-file';
        
        fileDiv.innerHTML = `
            <i class="fa-solid ${iconClass} text-zinc-500"></i>
            <span class="max-w-[100px] truncate">${file.name}</span>
            <button onclick="window.removeUploadedFile(this, '${file.name}')" class="opacity-0 group-hover:opacity-100 absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center transition-opacity shadow-sm cursor-pointer hover:bg-red-600 z-10">
                <i data-feather="x" class="w-2.5 h-2.5 pointer-events-none"></i>
            </button>
        `;
        previewContainer.appendChild(fileDiv);
        if (window.feather) window.feather.replace();
    });
    
    if (window.uploadedFiles.length > 0) {
        previewContainer.classList.remove('hidden');
    }
}

function removeUploadedFile(buttonElem, fileName) {
    window.uploadedFiles = window.uploadedFiles.filter(f => f.name !== fileName);
    const fileDiv = buttonElem.parentElement;
    fileDiv.remove();
    
    const previewContainer = document.getElementById('upload-preview-container');
    if (window.uploadedFiles.length === 0 && previewContainer) {
        previewContainer.classList.add('hidden');
    }
}

// Drag and Drop handling on the chat container
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.body;
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    dropZone.addEventListener('drop', (e) => {
        // If not dropped in a specific folder drag zone (handled by folders.js), add to chat
        if (!e.target.closest('#folders-section') && !e.target.closest('.folder-header')) {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                processFiles(e.dataTransfer.files);
            }
        }
    });
});

window.handleFileUpload = handleFileUpload;
window.removeUploadedFile = removeUploadedFile;
