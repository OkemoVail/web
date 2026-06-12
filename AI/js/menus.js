// ─── Menus (chat menus, folder menus, popover close) ───────────

window.showChatMenu = (chatId, btn, e) => {
    e.stopPropagation();
    e.preventDefault();

    const chat = window.allChats[chatId];
    if (!chat) return;

    let menu = document.getElementById('chat-action-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'chat-action-menu';
        menu.className = 'chat-action-menu';
        document.body.appendChild(menu);
    }

    const alreadyOpenForThisChat = menu.classList.contains('is-active') && menu.dataset.chatId === chatId;

    document.querySelectorAll('.chat-action-menu.is-active, .mini-folder-popover.is-active').forEach(p => {
        p.classList.remove('is-active');
    });

    if (alreadyOpenForThisChat) {
        return;
    }

    menu.dataset.chatId = chatId;
    const isPinned = chat.pinned || false;
    menu.innerHTML = `
        <div class="chat-menu-item" onclick="window.showMoveMenu('${chatId}', this); window.closeAllMenus()">
            <i data-feather="folder-plus"></i>
            <span>Move to Folder</span>
        </div>
        <div class="chat-menu-item" onclick="window.togglePin('${chatId}'); window.closeAllMenus()">
            <i data-feather="pin" style="${isPinned ? 'fill: var(--accent-color); color: var(--accent-color);' : ''}"></i>
            <span>${isPinned ? 'Unpin' : 'Pin'}</span>
        </div>
        <div class="chat-menu-item danger" onclick="window.delChat('${chatId}'); window.closeAllMenus()">
            <i data-feather="trash-2"></i>
            <span>Delete</span>
        </div>
    `;

    if (window.feather) {
        feather.replace({ 'stroke-width': 2.5, 'width': 14, 'height': 14 }, menu);
    }

    const rect = btn.getBoundingClientRect();
    const menuWidth = 160;

    let left = rect.right - menuWidth;
    let top = rect.bottom + 8;

    const menuHeight = 130;
    if (top + menuHeight > window.innerHeight) top = rect.top - menuHeight - 8;
    if (left < 10) left = 10;
    if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    setTimeout(() => {
        menu.classList.add('is-active');
    }, 10);
};

window.showFolderMenu = (folderId, btn, e) => {
    e.stopPropagation();
    e.preventDefault();

    let menu = document.getElementById('chat-action-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'chat-action-menu';
        menu.className = 'chat-action-menu';
        document.body.appendChild(menu);
    }

    const alreadyOpenForThisFolder = menu.classList.contains('is-active') && menu.dataset.folderId === folderId;

    window.closeAllMenus();

    if (alreadyOpenForThisFolder) return;

    menu.dataset.folderId = folderId;
    delete menu.dataset.chatId;

    menu.innerHTML = `
        <div class="chat-menu-item" onclick="window.renameFolder('${folderId}'); window.closeAllMenus()">
            <i data-feather="edit-2"></i>
            <span>Rename Folder</span>
        </div>
        <div class="chat-menu-item danger" onclick="window.deleteFolder('${folderId}'); window.closeAllMenus()">
            <i data-feather="trash-2"></i>
            <span>Delete Folder</span>
        </div>
    `;

    if (window.feather) {
        feather.replace({ 'stroke-width': 2.5, 'width': 14, 'height': 14 }, menu);
    }

    const rect = btn.getBoundingClientRect();
    const menuWidth = 160;
    let left = rect.left - menuWidth + rect.width;
    let top = rect.bottom + 8;

    if (top + 150 > window.innerHeight) {
        top = rect.top - 100;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    setTimeout(() => {
        menu.classList.add('is-active');
    }, 10);
};

window.toggleMenu = (e, id) => {
    e.stopPropagation();
    const menu = document.getElementById(id);
    if (menu) {
        const isActive = menu.classList.contains('active') || menu.style.visibility === 'visible';
        window.closeAllMenus();
        if (!isActive) {
            menu.classList.add('active');
            menu.style.visibility = 'visible';
            menu.style.opacity = '1';
            menu.style.transform = 'translateY(0) scale(1)';
        }
    }
};

window.closeAllMenus = () => {
    if (window.els.modMenu) window.els.modMenu.classList.remove('active');
    if (window.els.noteMenu) window.els.noteMenu.classList.remove('active');

    const modelMenu = document.getElementById('model-menu-input');
    if (modelMenu) {
        modelMenu.classList.remove('active');
        modelMenu.style.visibility = 'hidden';
        modelMenu.style.opacity = '0';
    }

    const plusMenu = document.getElementById('plus-menu');
    if (plusMenu) {
        plusMenu.classList.remove('active');
        plusMenu.style.visibility = 'hidden';
        plusMenu.style.opacity = '0';
        plusMenu.style.transform = 'translateY(6px) scale(0.97)';
    }

    const modeMenu = document.getElementById('mode-menu-input');
    if (modeMenu) {
        modeMenu.classList.remove('active');
        modeMenu.style.visibility = 'hidden';
        modeMenu.style.opacity = '0';
        modeMenu.style.transform = 'translateY(6px) scale(0.97)';
    }

    document.querySelectorAll('.chat-action-menu.is-active, .mini-folder-popover.is-active').forEach(p => {
        p.classList.remove('is-active');
    });

    if (window.els.settingsPanel) {
        window.els.settingsPanel.classList.remove('active');
        const overlay = document.getElementById('settings-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    if (window.innerWidth < 1024 && window.els.sidebar) {
        window.els.sidebar.classList.add('-translate-x-full');
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) overlay.style.display = 'none';
    }
};

// Global click listener to close popovers
document.addEventListener('click', (e) => {
    const allPopovers = document.querySelectorAll('.mini-folder-popover, .chat-action-menu');
    allPopovers.forEach(p => {
        if (!p.contains(e.target)) p.classList.remove('is-active');
    });

    const plusContainer = document.getElementById('plus-menu-container');
    if (plusContainer && !plusContainer.contains(e.target)) {
        const plusMenu = document.getElementById('plus-menu');
        if (plusMenu && plusMenu.classList.contains('active')) {
            plusMenu.classList.remove('active');
            plusMenu.style.visibility = 'hidden';
            plusMenu.style.opacity = '0';
            plusMenu.style.transform = 'translateY(6px) scale(0.97)';
        }
    }

    const modeContainer = document.getElementById('mode-selector-container');
    if (modeContainer && !modeContainer.contains(e.target)) {
        const modeMenu = document.getElementById('mode-menu-input');
        if (modeMenu && modeMenu.classList.contains('active')) {
            modeMenu.classList.remove('active');
            modeMenu.style.visibility = 'hidden';
            modeMenu.style.opacity = '0';
            modeMenu.style.transform = 'translateY(6px) scale(0.97)';
        }
    }
});
