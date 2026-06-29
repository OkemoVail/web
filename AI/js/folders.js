// ─── Folder Management ─────────────────────────────────────────

window.createFolder = () => {
    window.showCustomPrompt(
        'New Folder',
        'Enter folder name',
        'New Folder',
        (name) => {
            const id = crypto.randomUUID();
            window.settings.folders.push({ id, name, isOpen: true });
            window.saveSettings();
            window.renderHistory();
        }
    );
};

window.toggleFolder = (id) => {
    const f = window.settings.folders.find(f => String(f.id) === String(id));
    if (f) {
        f.isOpen = !f.isOpen;
        window.saveSettings();
        window.renderHistory();
    }
};

window.deleteFolder = (id) => {
    console.log('[FolderAction] Deleting folder:', id);
    window.showCustomConfirm(
        'Delete Folder',
        'Are you sure you want to delete this folder? Your chats will be preserved in the main history.',
        async () => {
            try {
                const sid = String(id);
                console.log('[FolderAction] Confirm deletion for ID:', sid);
                const folderToDelete = window.settings.folders.find(f => String(f.id) === sid);
                if (!folderToDelete) {
                    console.warn('[FolderAction] Folder not found in settings:', sid);
                    return;
                }

                window.settings.folders = window.settings.folders.filter(f => String(f.id) !== sid);
                window.saveSettings();
                console.log('[FolderAction] Folder removed from settings');

                const chatsToUpdate = Object.values(window.allChats).filter(c => String(c.folderId) === sid);
                console.log('[FolderAction] Orphaning chats:', chatsToUpdate.length);

                const updatePromises = chatsToUpdate.map(async (chat) => {
                    delete chat.folderId;
                    return window.StorageController.saveChat(chat);
                });

                await Promise.all(updatePromises);
                console.log('[FolderAction] All chats updated in storage');

                window.renderHistory();
            } catch (err) {
                console.error('[FolderAction] Deletion failed:', err);
            }
        },
        true
    );
};

window.moveChatToFolder = async (chatId, folderId) => {
    if (window.allChats[chatId]) {
        window.allChats[chatId].folderId = folderId;
        await window.StorageController.saveChat(window.allChats[chatId]);
        window.renderHistory();
    }
};

window.renameFolder = (id) => {
    const f = window.settings.folders.find(f => String(f.id) === String(id));
    if (f) {
        window.showCustomPrompt(
            'Rename Folder',
            'Enter new folder name',
            f.name,
            (newName) => {
                f.name = newName;
                window.saveSettings();
                window.renderHistory();
            }
        );
    }
};

window.onChatDragStart = (e, chatId) => {
    e.dataTransfer.setData('text/plain', chatId);
    e.dataTransfer.effectAllowed = 'move';
    window.__draggingChatId = chatId;
    const el = e.currentTarget;
    // Defer so the drag image is captured before the row dims.
    requestAnimationFrame(() => el.classList.add('chat-dragging'));
};

window.onChatDragEnd = (e) => {
    if (e.currentTarget) e.currentTarget.classList.remove('chat-dragging');
    window.__clearDropIndicator();
    // Clear any folder-drop highlight left armed when a reorder drop swallowed
    // the event (stopPropagation skips onFolderDrop's own cleanup).
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
        el._dragCounter = 0;
    });
    window.__draggingChatId = null;
};

// ─── Reorder (drag chats up/down within recents or a folder) ───────

// The slot the cursor is over: the first row whose vertical midpoint sits
// below the cursor → insert before it; null → append at the end.
window.__getReorderTarget = (container, y) => {
    const rows = [...container.querySelectorAll(':scope > .history-btn-container')];
    for (const row of rows) {
        const box = row.getBoundingClientRect();
        if (y < box.top + box.height / 2) return row;
    }
    return null;
};

window.__clearDropIndicator = () => {
    document.querySelectorAll('.chat-drop-indicator').forEach(el => el.remove());
};

window.__showDropIndicator = (container, beforeEl) => {
    let ind = document.querySelector('.chat-drop-indicator');
    if (!ind) {
        ind = document.createElement('div');
        ind.className = 'chat-drop-indicator';
    }
    if (beforeEl) container.insertBefore(ind, beforeEl);
    else container.appendChild(ind);
};

window.onChatListDragOver = (e) => {
    if (!window.__draggingChatId) return;        // only react to chat drags
    if (window.__lastHistoryQuery) return;       // no reordering in a filtered view
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const container = e.currentTarget;
    const before = window.__getReorderTarget(container, e.clientY);
    window.__showDropIndicator(container, before);
};

window.onChatListDrop = async (e, folderId) => {
    if (!window.__draggingChatId) return;
    if (window.__lastHistoryQuery) { window.__clearDropIndicator(); return; }
    e.preventDefault();
    e.stopPropagation();
    const chatId = e.dataTransfer.getData('text/plain') || window.__draggingChatId;
    const container = e.currentTarget;
    const before = window.__getReorderTarget(container, e.clientY);
    const beforeId = before ? before.getAttribute('data-chat-id') : null;
    window.__clearDropIndicator();
    await window.reorderChat(chatId, beforeId, folderId || null);
};

// Place chatId immediately before beforeId (or at the end) in the global
// manual order, moving it into/out of a folder if the drop target differs.
window.reorderChat = async (chatId, beforeId, folderId) => {
    if (!chatId || !window.allChats[chatId] || chatId === beforeId) return;

    const chat = window.allChats[chatId];
    const newFolder = folderId || null;
    if ((chat.folderId || null) !== newFolder) {
        chat.folderId = newFolder;
        await window.StorageController.saveChat(chat);
    }

    if (!Array.isArray(window.settings.chatOrder)) window.settings.chatOrder = [];
    const order = window.settings.chatOrder.filter(id => id !== chatId);
    let idx = beforeId ? order.indexOf(beforeId) : -1;
    if (idx === -1) idx = order.length;
    order.splice(idx, 0, chatId);
    window.settings.chatOrder = order;
    window.saveSettings();

    window.renderHistory(window.__lastHistoryQuery || "");
};

window.onFolderDrop = async (e, folderId) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget._dragCounter = 0;
    e.currentTarget.classList.remove('drag-over');
    const chatId = e.dataTransfer.getData('text/plain');
    if (chatId) {
        await window.moveChatToFolder(chatId, folderId);
    }
};

window.onFolderDragEnter = (e) => {
    e.preventDefault();
    e.currentTarget._dragCounter = (e.currentTarget._dragCounter || 0) + 1;
    e.currentTarget.classList.add('drag-over');
};

window.onFolderDragOver = (e) => {
    e.preventDefault();
};

window.onFolderDragLeave = (e) => {
    e.currentTarget._dragCounter = (e.currentTarget._dragCounter || 1) - 1;
    if (e.currentTarget._dragCounter <= 0) {
        e.currentTarget.classList.remove('drag-over');
    }
};

window.showMoveMenu = (chatId, btn) => {
    let options = "0: [Move to root]\n";
    window.settings.folders.forEach((f, i) => options += `${i + 1}: ${f.name}\n`);
    const choice = prompt(`Move to folder:\n${options}`, "");
    if (choice !== null) {
        const idx = parseInt(choice);
        if (idx === 0) {
            window.moveChatToFolder(chatId, null);
        } else if (idx > 0 && idx <= window.settings.folders.length) {
            window.moveChatToFolder(chatId, window.settings.folders[idx - 1].id);
        }
    }
};
