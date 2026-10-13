// ─── Folder Management ─────────────────────────────────────────

window.createFolder = () => {
    window.showNamingDialog({
        kind: 'folder',
        title: 'New Folder',
        placeholder: 'Enter folder name',
        value: 'New Folder',
        confirmLabel: 'Create',
        onConfirm: (name) => {
            const id = window.createId();
            window.settings.folders.push({ id, name, isOpen: true });
            window.saveSettings();
            window.renderHistory();
        }
    });
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
        if (folderId) window.allChats[chatId].pinned = false;
        await window.StorageController.saveChat(window.allChats[chatId]);
        window.renderHistory();
    }
};

window.renameFolder = (id) => {
    const f = window.settings.folders.find(f => String(f.id) === String(id));
    if (f) {
        window.showNamingDialog({
            kind: 'folder',
            title: 'Rename Folder',
            placeholder: 'Enter new folder name',
            value: f.name,
            confirmLabel: 'Rename',
            onConfirm: (newName) => {
                f.name = newName;
                window.saveSettings();
                window.renderHistory();
            }
        });
    }
};

window.onChatDragStart = (e, chatId) => {
    e.dataTransfer.setData('text/plain', chatId);
    e.dataTransfer.effectAllowed = 'move';
    window.__draggingChatId = chatId;
    const pinZone = document.getElementById('chat-pin-drop-zone');
    const pinSection = document.getElementById('chat-pin-section');
    if (pinSection && !window.__lastHistoryQuery) pinSection.hidden = false;
    if (pinZone) {
        pinZone.classList.add('is-visible');
        pinZone.setAttribute('aria-hidden', 'false');
    }
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
    const pinZone = document.getElementById('chat-pin-drop-zone');
    if (pinZone) {
        pinZone.classList.remove('is-visible', 'is-active');
        pinZone.setAttribute('aria-hidden', 'true');
        pinZone._dragCounter = 0;
    }
    const pinSection = document.getElementById('chat-pin-section');
    if (pinSection && !Object.values(window.allChats).some(chat => chat.pinned)) pinSection.hidden = true;
    window.__draggingChatId = null;
};

// ─── Pointer drag (mouse, pen, and touch) ───────────────────────
// Native HTML drag is inconsistent when a draggable row contains buttons and
// is not supported for normal touch gestures. Own the row gesture instead.
let chatPointerDrag = null;

window.__showPinDestination = () => {
    const pinSection = document.getElementById('chat-pin-section');
    const pinZone = document.getElementById('chat-pin-drop-zone');
    if (!pinSection || !pinZone || window.__lastHistoryQuery) return;

    clearTimeout(window.__pinDestinationHideTimer);
    cancelAnimationFrame(window.__pinDestinationOpenFrame);
    const hasPinnedChats = Object.values(window.allChats).some(chat => chat.pinned);
    pinSection.hidden = false;
    pinSection.classList.toggle('is-drop-only', !hasPinnedChats);
    pinSection.classList.remove('is-drag-open');
    pinZone.classList.remove('is-visible', 'is-active');
    pinZone.setAttribute('aria-hidden', 'false');

    // Commit the collapsed geometry before opening on the next frame. Without
    // this separation, unhiding an empty section and adding is-visible in one
    // task lets the browser skip the start state and the target simply pops in.
    void pinSection.offsetHeight;
    window.__pinDestinationOpenFrame = requestAnimationFrame(() => {
        pinSection.classList.add('is-drag-open');
        pinZone.classList.add('is-visible');
    });
};

window.__hidePinDestination = () => {
    cancelAnimationFrame(window.__pinDestinationOpenFrame);
    const pinZone = document.getElementById('chat-pin-drop-zone');
    if (pinZone) {
        pinZone.classList.remove('is-visible', 'is-active');
        pinZone.setAttribute('aria-hidden', 'true');
        pinZone._dragCounter = 0;
    }
    const pinSection = document.getElementById('chat-pin-section');
    if (!pinSection) return;
    pinSection.classList.remove('is-drag-open');
    clearTimeout(window.__pinDestinationHideTimer);
    if (!Object.values(window.allChats).some(chat => chat.pinned)) {
        // Keep the empty section mounted until its height has collapsed so the
        // Chats section glides back up instead of snapping into place.
        window.__pinDestinationHideTimer = setTimeout(() => {
            if (Object.values(window.allChats).some(chat => chat.pinned)) return;
            pinSection.hidden = true;
            pinSection.classList.remove('is-drop-only');
        }, 340);
    } else {
        pinSection.classList.remove('is-drop-only');
    }
};

window.__pointInside = (element, x, y) => {
    if (!element || element.hidden) return false;
    const box = element.getBoundingClientRect();
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
};

window.__moveChatDragGhost = (drag, x, y) => {
    if (!drag.ghost) return;
    drag.ghost.style.translate = `${Math.round(x + 12)}px ${Math.round(y + 12)}px`;
};

window.__settleChatDragGhost = (ghost, chatId) => {
    if (!ghost) return Promise.resolve();
    const destination = document.querySelector(`[data-chat-id="${CSS.escape(chatId)}"]`);
    if (!destination || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        ghost.remove();
        return Promise.resolve();
    }
    const from = ghost.getBoundingClientRect();
    const to = destination.getBoundingClientRect();
    const animation = ghost.animate([
        {
            translate: `${from.left}px ${from.top}px`,
            width: `${from.width}px`,
            height: `${from.height}px`,
            opacity: 1,
            borderRadius: '12px'
        },
        {
            translate: `${to.left}px ${to.top}px`,
            width: `${to.width}px`,
            height: `${to.height}px`,
            opacity: .12,
            borderRadius: '10px'
        }
    ], {
        duration: 300,
        easing: 'cubic-bezier(.16, 1, .3, 1)',
        fill: 'forwards'
    });
    return animation.finished.catch(() => {}).then(() => ghost.remove());
};

window.__startChatPointerDrag = (drag, event) => {
    drag.dragging = true;
    window.__draggingChatId = drag.chatId;
    drag.row.classList.add('chat-dragging');
    drag.row.setPointerCapture?.(drag.pointerId);
    document.body.classList.add('chat-pointer-drag-active');
    window.__showPinDestination();
    window.__clearDropIndicator();

    const ghost = document.createElement('div');
    ghost.className = 'chat-drag-ghost';
    ghost.textContent = window.truncateTitle(window.allChats[drag.chatId]?.title || 'Chat');
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    window.__moveChatDragGhost(drag, event.clientX, event.clientY);
};

window.__updateChatPointerTarget = (drag, event) => {
    const pinZone = document.getElementById('chat-pin-drop-zone');
    const overPin = window.__pointInside(pinZone, event.clientX, event.clientY);
    pinZone?.classList.toggle('is-active', overPin);
    window.__clearDropIndicator();
    if (overPin) return;

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const list = target?.closest?.('#history-list, .folder-content');
    if (list) {
        window.__showDropIndicator(list, window.__getReorderTarget(list, event.clientY));
    }
};

window.__finishChatPointerDrag = async (event, cancelled = false) => {
    const drag = chatPointerDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    chatPointerDrag = null;
    removeEventListener('pointermove', window.__onChatPointerMove, true);
    removeEventListener('pointerup', window.__onChatPointerUp, true);
    removeEventListener('pointercancel', window.__onChatPointerCancel, true);

    if (!drag.dragging) return;
    event.preventDefault();
    drag.row.classList.remove('chat-dragging');
    document.body.classList.remove('chat-pointer-drag-active');
    window.__clearDropIndicator();

    const pinZone = document.getElementById('chat-pin-drop-zone');
    const pinSection = document.getElementById('chat-pin-section');
    const overPin = !cancelled && window.__pointInside(pinZone, event.clientX, event.clientY);
    const target = cancelled ? null : document.elementFromPoint(event.clientX, event.clientY);
    window.__draggingChatId = null;

    // A completed drag must not also activate the row's nested load button.
    const suppressClick = clickEvent => {
        clickEvent.preventDefault();
        clickEvent.stopImmediatePropagation();
    };
    document.addEventListener('click', suppressClick, true);
    setTimeout(() => document.removeEventListener('click', suppressClick, true), 0);

    if (cancelled) {
        window.__hidePinDestination();
        window.__settleChatDragGhost(drag.ghost, drag.chatId);
        return;
    }
    if (overPin) {
        const chat = window.allChats[drag.chatId];
        if (!chat) {
            window.__hidePinDestination();
            drag.ghost?.remove();
            return;
        }
        const layoutBefore = window.captureHistoryLayout();
        chat.pinned = true;
        chat.folderId = null;
        if (!Array.isArray(window.settings.chatOrder)) window.settings.chatOrder = [];
        window.settings.chatOrder = [drag.chatId, ...window.settings.chatOrder.filter(id => id !== drag.chatId)];
        window.saveSettings();
        window.renderHistory();
        const layoutMotion = window.animateHistoryLayout(layoutBefore, { chatId: drag.chatId });
        const ghostMotion = window.__settleChatDragGhost(drag.ghost, drag.chatId);
        window.__hidePinDestination();
        await Promise.all([layoutMotion, ghostMotion]);
        await window.StorageController.saveChat(chat);
        return;
    }

    window.__hidePinDestination();
    const folderContent = target?.closest?.('.folder-content');
    const folderContainer = target?.closest?.('.folder-container');
    const list = target?.closest?.('#history-list, .folder-content');
    if (list) {
        const before = window.__getReorderTarget(list, event.clientY);
        const folderId = list.matches('.folder-content') ? list.dataset.folderId : null;
        const beforeId = before?.dataset.chatId || null;
        const chat = window.allChats[drag.chatId];
        const unchanged = beforeId === drag.chatId
            || (!beforeId && list.lastElementChild?.dataset.chatId === drag.chatId
                && (chat?.folderId || null) === (folderId || null) && !chat?.pinned);
        if (unchanged) {
            window.__settleChatDragGhost(drag.ghost, drag.chatId);
            return;
        }
        const layoutBefore = window.captureHistoryLayout();
        await window.reorderChat(drag.chatId, beforeId, folderId || null);
        await Promise.all([
            window.animateHistoryLayout(layoutBefore, { chatId: drag.chatId }),
            window.__settleChatDragGhost(drag.ghost, drag.chatId)
        ]);
        return;
    }
    if (folderContainer) {
        const folderId = folderContainer.querySelector('.folder-content')?.dataset.folderId;
        if (folderId) {
            const layoutBefore = window.captureHistoryLayout();
            await window.moveChatToFolder(drag.chatId, folderId);
            await Promise.all([
                window.animateHistoryLayout(layoutBefore, { chatId: drag.chatId }),
                window.__settleChatDragGhost(drag.ghost, drag.chatId)
            ]);
        } else drag.ghost?.remove();
        return;
    }

    // Releasing a pinned row anywhere outside its own section is an unpin.
    const chat = window.allChats[drag.chatId];
    if (chat?.pinned && !window.__pointInside(pinSection, event.clientX, event.clientY)) {
        const layoutBefore = window.captureHistoryLayout();
        chat.pinned = false;
        await window.StorageController.saveChat(chat);
        window.renderHistory();
        await Promise.all([
            window.animateHistoryLayout(layoutBefore, { chatId: drag.chatId }),
            window.__settleChatDragGhost(drag.ghost, drag.chatId)
        ]);
    } else {
        window.__settleChatDragGhost(drag.ghost, drag.chatId);
    }
};

window.__onChatPointerMove = event => {
    const drag = chatPointerDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    if (!drag.dragging) window.__startChatPointerDrag(drag, event);
    event.preventDefault();
    window.__moveChatDragGhost(drag, event.clientX, event.clientY);
    window.__updateChatPointerTarget(drag, event);
};

window.__onChatPointerUp = event => window.__finishChatPointerDrag(event, false);
window.__onChatPointerCancel = event => window.__finishChatPointerDrag(event, true);

window.onChatPointerDown = (event, chatId) => {
    if (window.__lastHistoryQuery || event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('.history-action-btn')) return;
    chatPointerDrag = {
        pointerId: event.pointerId,
        chatId,
        row: event.currentTarget,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        ghost: null
    };
    addEventListener('pointermove', window.__onChatPointerMove, { capture: true, passive: false });
    addEventListener('pointerup', window.__onChatPointerUp, true);
    addEventListener('pointercancel', window.__onChatPointerCancel, true);
};

// ─── Pin drop target ────────────────────────────────────────────

window.onPinDropEnter = (e) => {
    if (!window.__draggingChatId) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget._dragCounter = (e.currentTarget._dragCounter || 0) + 1;
    e.currentTarget.classList.add('is-active');
};

window.onPinDropOver = (e) => {
    if (!window.__draggingChatId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
};

window.onPinDropLeave = (e) => {
    if (!window.__draggingChatId) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget._dragCounter = Math.max(0, (e.currentTarget._dragCounter || 1) - 1);
    if (!e.currentTarget._dragCounter) e.currentTarget.classList.remove('is-active');
};

window.onPinDrop = async (e) => {
    if (!window.__draggingChatId || window.__lastHistoryQuery) return;
    e.preventDefault();
    e.stopPropagation();
    const chatId = e.dataTransfer.getData('text/plain') || window.__draggingChatId;
    const chat = window.allChats[chatId];
    if (!chat) return;

    chat.pinned = true;
    chat.folderId = null;
    if (!Array.isArray(window.settings.chatOrder)) window.settings.chatOrder = [];
    window.settings.chatOrder = [chatId, ...window.settings.chatOrder.filter(id => id !== chatId)];
    window.saveSettings();
    window.__clearDropIndicator();
    e.currentTarget.classList.remove('is-visible', 'is-active');
    e.currentTarget.setAttribute('aria-hidden', 'true');
    e.currentTarget._dragCounter = 0;
    window.__draggingChatId = null;
    window.renderHistory();
    await window.StorageController.saveChat(chat);
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
    const stateChanged = (chat.folderId || null) !== newFolder || chat.pinned;
    // Every list handled here is outside the Pinned section. Dropping a
    // pinned row here therefore unpins it as part of the same move.
    chat.pinned = false;
    if (stateChanged) {
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
        const chat = window.allChats[chatId];
        if (chat?.pinned) {
            chat.pinned = false;
            await window.StorageController.saveChat(chat);
        }
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
