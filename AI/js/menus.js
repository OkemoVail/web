// ─── Menus (chat menus, folder menus, popover close) ───────────

let chatMenuRecord = null;

function destroyChatMenu(restoreFocus = false) {
    if (!chatMenuRecord) return;
    const { cluster, source, sourceOverlay, observer, closeTimer, pendingAction } = chatMenuRecord;
    chatMenuRecord = null;
    clearTimeout(closeTimer);
    observer.disconnect();
    window.LiquidDesign?.destroy(cluster);
    cluster.remove();
    sourceOverlay.remove();
    if (source?.isConnected) {
        source.setAttribute('aria-expanded', 'false');
        if (restoreFocus) source.focus({ preventScroll: true });
    }
    pendingAction?.();
}

function closeChatMenu(restoreFocus = false, afterClose = null) {
    if (!chatMenuRecord) {
        afterClose?.();
        return;
    }
    chatMenuRecord.restoreFocus ||= restoreFocus;
    chatMenuRecord.pendingAction ||= afterClose;
    if (chatMenuRecord.closing) return;

    chatMenuRecord.closing = true;
    chatMenuRecord.menu.inert = true;
    // Return through the Liquid Design controller instead of fading/removing
    // the open sheet. This reverses the opening morph back into the ellipsis.
    if (chatMenuRecord.toggle.getAttribute('aria-expanded') === 'true') {
        chatMenuRecord.toggle.click();
    }
    // Safety only: the morph observer below normally owns teardown once the
    // spring has fully settled at its source shape.
    chatMenuRecord.closeTimer = setTimeout(() => {
        if (chatMenuRecord) destroyChatMenu(chatMenuRecord.restoreFocus);
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1800);
}

window.closeChatMenu = closeChatMenu;

window.showChatMenu = (chatId, btn, e) => {
    e.stopPropagation();
    e.preventDefault();

    const chat = window.allChats[chatId];
    if (!chat) return;

    if (chatMenuRecord?.chatId === chatId) {
        closeChatMenu(true);
        return;
    }

    destroyChatMenu(false);
    document.querySelectorAll('.chat-action-menu.is-active, .mini-folder-popover.is-active').forEach(popover => {
        popover.classList.remove('is-active');
    });

    const rect = btn.getBoundingClientRect();
    const cluster = document.createElement('div');
    cluster.id = 'chat-library-action-menu-motion';
    cluster.dataset.chatId = chatId;
    cluster.setAttribute('data-liquid-design-component', 'options');
    // This source is a plain sidebar icon rather than a resting glass pill.
    // Let the controller dissolve its last return frames into that icon.
    cluster.setAttribute('data-liquid-design-plain-source', '');
    cluster.style.left = `${rect.left}px`;
    cluster.style.top = `${rect.top}px`;
    cluster.style.width = `${rect.width}px`;
    cluster.style.height = `${rect.height}px`;

    // Keep a root-level copy of the ordinary ellipsis above the opening
    // material. The actual sidebar button remains the accessible control.
    const sourceOverlay = document.createElement('span');
    sourceOverlay.className = 'chat-library-action-trigger-overlay';
    sourceOverlay.setAttribute('aria-hidden', 'true');
    sourceOverlay.style.left = `${rect.left}px`;
    sourceOverlay.style.top = `${rect.top}px`;
    sourceOverlay.style.width = `${rect.width}px`;
    sourceOverlay.style.height = `${rect.height}px`;
    sourceOverlay.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="5" r="1"></circle>
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="12" cy="19" r="1"></circle>
        </svg>`;

    // LiquidDesign needs a real Options trigger to establish the morph path.
    // This proxy is transparent; the original sidebar ellipsis remains the
    // only visible trigger and forwards its click here programmatically.
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'chat-library-liquid-proxy';
    toggle.setAttribute('aria-label', 'Chat actions animation proxy');
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('data-liquid-design', '');
    toggle.addEventListener('click', event => event.stopPropagation());
    const menu = document.createElement('div');
    menu.id = 'chat-library-action-menu';
    menu.className = 'chat-library-action-menu';
    menu.dataset.chatId = chatId;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Chat actions');
    toggle.setAttribute('data-liquid-design-toggle', menu.id);
    menu.hidden = true;
    menu.inert = true;

    const actions = [
        ['Rename chat', 'edit-2', '', () => window.renameChat(chatId), false],
        ['Move to Folder', 'folder-plus', '', () => window.showMoveMenu(chatId), false],
        [chat.pinned ? 'Unpin' : 'Pin', 'pin', chat.pinned ? 'is-pinned' : '', () => window.togglePin(chatId), true],
        ['Delete', 'trash-2', 'danger', () => window.delChat(chatId), false]
    ];
    actions.forEach(([label, icon, className, action, immediate]) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `chat-menu-item ${className}`.trim();
        item.setAttribute('role', 'menuitem');
        item.setAttribute('data-liquid-design', '');
        item.tabIndex = -1;
        item.innerHTML = `<i data-feather="${icon}" aria-hidden="true"></i><span>${label}</span>`;
        item.addEventListener('click', () => {
            // Pinning is an optimistic state change: update the row/icon now
            // while the independent liquid sheet completes its return.
            if (immediate) {
                closeChatMenu(false);
                action();
            } else {
                closeChatMenu(false, action);
            }
        });
        menu.appendChild(item);
    });

    cluster.append(toggle, menu);
    document.body.append(cluster, sourceOverlay);
    btn.setAttribute('aria-expanded', 'true');
    window.feather?.replace({ 'stroke-width': 2, 'width': 18, 'height': 18 }, cluster);
    window.LiquidDesign?.refresh(cluster);

    const observer = new MutationObserver(() => {
        if (!chatMenuRecord || chatMenuRecord.cluster !== cluster) return;
        const open = toggle.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(open));
        if (!open && cluster.dataset.morphPhase === 'settled') {
            destroyChatMenu(chatMenuRecord.restoreFocus);
        }
    });
    chatMenuRecord = {
        chatId, menu, cluster, toggle, source: btn, sourceOverlay, observer,
        closing: false, closeTimer: 0, restoreFocus: false, pendingAction: null
    };
    observer.observe(cluster, { attributes: true, attributeFilter: ['data-morph-phase'] });
    observer.observe(toggle, { attributes: true, attributeFilter: ['aria-expanded'] });
    toggle.click();

    menu.addEventListener('keydown', event => {
        const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
        const index = items.indexOf(document.activeElement);
        const next = {
            ArrowDown: (index + 1) % items.length,
            ArrowUp: (index + items.length - 1) % items.length,
            Home: 0,
            End: items.length - 1
        }[event.key];
        if (next !== undefined) {
            event.preventDefault();
            items[next].focus();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeChatMenu(true);
        }
    });
    menu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
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
        <button type="button" class="chat-menu-item" data-folder-action="rename">
            <i data-feather="edit-2"></i>
            <span>Rename Folder</span>
        </button>
        <button type="button" class="chat-menu-item danger" data-folder-action="delete">
            <i data-feather="trash-2"></i>
            <span>Delete Folder</span>
        </button>
    `;
    menu.querySelector('[data-folder-action="rename"]').addEventListener('click', () => {
        window.closeAllMenus();
        setTimeout(() => window.renameFolder(folderId), 0);
    });
    menu.querySelector('[data-folder-action="delete"]').addEventListener('click', () => {
        window.closeAllMenus();
        setTimeout(() => window.deleteFolder(folderId), 0);
    });

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
        }
    }
};

window.closeAllMenus = () => {
    closeChatMenu(false);
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
        const plusTrigger = document.getElementById('plus-menu-btn');
        if (plusTrigger?.getAttribute('aria-expanded') === 'true') plusTrigger.click();
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
    if (chatMenuRecord && !chatMenuRecord.cluster.contains(e.target) && e.target !== chatMenuRecord.source) {
        closeChatMenu(false);
    }
    const allPopovers = document.querySelectorAll('.mini-folder-popover, .chat-action-menu');
    allPopovers.forEach(p => {
        if (!p.contains(e.target)) p.classList.remove('is-active');
    });

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
