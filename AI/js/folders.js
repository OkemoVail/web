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
};

window.onChatDragEnd = (e) => {
    // cleanup if needed
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
