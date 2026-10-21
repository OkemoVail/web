// ─── History Rendering ─────────────────────────────────────────

// Keep window.settings.chatOrder authoritative: every live chat appears
// exactly once, new chats are prepended (newest first → land on top and
// join the manual order), deleted chats are dropped. Persists only on change.
window.normalizeChatOrder = () => {
    if (!Array.isArray(window.settings.chatOrder)) window.settings.chatOrder = [];
    const order = window.settings.chatOrder;
    const chats = Object.values(window.allChats);
    const liveIds = new Set(chats.map(c => c.id));
    const known = new Set(order);

    const missing = chats
        .filter(c => !known.has(c.id))
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(c => c.id);

    const kept = order.filter(id => liveIds.has(id));
    const next = missing.length ? [...missing, ...kept] : kept;

    const changed = next.length !== order.length || next.some((id, i) => id !== order[i]);
    if (changed) {
        window.settings.chatOrder = next;
        window.saveSettings();
    }
};

// Capture/replay sidebar geometry across renderHistory's innerHTML replacement.
// A chat moving between Pinned and Chats otherwise disappears in one tree and
// pops into the other. Stable data-layout-key values let the replacement nodes
// animate from the exact screen positions occupied by the previous tree.
window.captureHistoryLayout = () => {
    const root = document.getElementById('recents-scroll-area');
    const layout = new Map();
    if (!root) return layout;
    root.querySelectorAll('[data-chat-id], [data-history-layout-key]').forEach(element => {
        const key = element.dataset.chatId ? `chat:${element.dataset.chatId}` : element.dataset.historyLayoutKey;
        const box = element.getBoundingClientRect();
        if (box.width || box.height) layout.set(key, box);
    });
    return layout;
};

window.animateHistoryLayout = (before, options = {}) => {
    if (!before?.size || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    const root = document.getElementById('recents-scroll-area');
    if (!root) return Promise.resolve();
    const animations = [];
    const movingChatKey = options.chatId ? `chat:${options.chatId}` : null;

    root.querySelectorAll('[data-chat-id], [data-history-layout-key]').forEach(element => {
        const key = element.dataset.chatId ? `chat:${element.dataset.chatId}` : element.dataset.historyLayoutKey;
        const oldBox = before.get(key);
        if (!oldBox) return;
        const newBox = element.getBoundingClientRect();
        const dx = oldBox.left - newBox.left;
        const dy = oldBox.top - newBox.top;
        if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
        const isMovedChat = key === movingChatKey;
        const animation = element.animate([
            { transform: `translate(${dx}px, ${dy}px)`, opacity: isMovedChat ? .72 : 1 },
            { transform: 'translate(0, 0)', opacity: 1 }
        ], {
            duration: isMovedChat ? 360 : 300,
            easing: 'cubic-bezier(.16, 1, .3, 1)'
        });
        animations.push(animation.finished.catch(() => {}));
    });
    return Promise.all(animations);
};

window.renderHistory = (query = "") => {
    if (window.__lastHistoryQuery !== query) {
        window.__historyRenderLimit = 20;
        window.__lastHistoryQuery = query;
    }
    window.__historyRenderLimit = window.__historyRenderLimit || 20;

    window.normalizeChatOrder();

    // Manual order: position in chatOrder wins; unlisted fall back to recency.
    const orderPos = {};
    window.settings.chatOrder.forEach((id, i) => { orderPos[id] = i; });
    const byManual = (a, b) => {
        const ia = orderPos[a.id] ?? Infinity;
        const ib = orderPos[b.id] ?? Infinity;
        if (ia !== ib) return ia - ib;
        return b.timestamp - a.timestamp;
    };

    const allChatArray = Object.values(window.allChats).sort(byManual);

    // The seen-set still tracks which ids have rendered (it feeds the
    // just-selected check below), but no pop-in class is emitted for new
    // chats — new rows simply appear (the bounce read as a flash).
    if (!window.__seenChatIds) {
        window.__seenChatIds = new Set(allChatArray.map(c => c.id));
        window.__lastActiveChatId = window.currentChatId;
    }
    const currentLang = window.settings.lang || 'en';
    const dict = window.translations[currentLang];

    const filteredChats = query ? allChatArray.filter(c => c.title.toLowerCase().includes(query)) : allChatArray;
    // Pinned chats live in their own section and never consume the ordinary
    // chat limit. Search remains one flat result list.
    const filteredPinned = query ? [] : filteredChats.filter(c => c.pinned);
    const filteredUnpinned = query ? filteredChats : filteredChats.filter(c => !c.pinned);
    const visibleUnpinned = filteredUnpinned.slice(0, window.__historyRenderLimit);
    const hasMore = filteredUnpinned.length > visibleUnpinned.length;

    // --- 1. Generate Folders HTML ---
    let foldersHtml = '';
    if (!query) {
        foldersHtml += `
        <div class="section-header-row">
            <span class="section-header-text">Your Folders</span>
            <button type="button" onclick="window.createFolder()" class="sb-icon-btn folder-create-btn"
                    title="New folder" aria-label="New folder">
                <i data-feather="folder-plus" class="w-[1.3rem] h-[1.3rem]"></i>
            </button>
        </div>`;

        if (!window.settings.folders.length) {
            // Empty state: an open, empty folder with a dry "404".
            foldersHtml += `
            <div class="folders-empty" role="status">
                <svg class="folders-empty-icon" viewBox="0 0 48 40" aria-hidden="true">
                    <path d="M4 10a4 4 0 0 1 4-4h10l4 5h18a4 4 0 0 1 4 4v3H4z" />
                    <path d="M3 18h42l-3.5 16.5A3 3 0 0 1 38.6 37H9.4a3 3 0 0 1-2.9-2.5z" />
                </svg>
                <span class="folders-empty-code">404</span>
                <span class="folders-empty-text">No folders found</span>
            </div>`;
        }

        window.settings.folders.forEach(folder => {
            const folderChats = visibleUnpinned.filter(c => c.folderId === folder.id);
            foldersHtml += `
            <div class="folder-container mb-2">
                <div class="folder-header ${folder.isOpen ? 'is-open' : ''} group"
                     onclick="window.toggleFolder('${folder.id}')"
                     ondragenter="window.onFolderDragEnter(event)"
                     ondragover="window.onFolderDragOver(event)"
                     ondragleave="window.onFolderDragLeave(event)"
                     ondrop="window.onFolderDrop(event, '${folder.id}')">
                    <div class="flex items-center gap-2 overflow-hidden">
                        <i data-feather="chevron-right" class="folder-icon w-[1.1rem] h-[1.1rem] flex-shrink-0"></i>
                        <i data-feather="folder" class="w-[1.1rem] h-[1.1rem] flex-shrink-0 fill-current opacity-60"></i>
                        <span class="text-xs font-bold truncate">${folder.name}</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <button onclick="event.stopPropagation(); window.showFolderMenu('${folder.id}', this, event)" class="folder-action-btn" title="More actions">
                            <i data-feather="more-vertical" class="w-[1.1rem] h-[1.1rem]"></i>
                        </button>
                    </div>
                </div>
                <div class="folder-content"
                     data-folder-id="${folder.id}"
                     ondragover="window.onChatListDragOver(event)"
                     ondrop="window.onChatListDrop(event, '${folder.id}')">
                    ${folderChats.map(c => window.renderChatItem(c, dict)).join('')}
                </div>
            </div>`;
        });
    }

    // --- 2. Generate Recent Chats HTML ---
    let recentsHtml = '';
    const orphanedChats = visibleUnpinned.filter(c => !c.folderId);

    if (query) {
        // Search is a flat view — manual order, no time buckets.
        recentsHtml = orphanedChats.map(c => window.renderChatItem(c, dict)).join('');
    } else {
        recentsHtml = orphanedChats.map(c => window.renderChatItem(c, dict)).join('');
    }

    if (hasMore) {
        recentsHtml += `<div class="p-4 text-center"><button onclick="window.__historyRenderLimit += 20; window.renderHistory(window.__lastHistoryQuery)" class="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 transition-colors">Load More</button></div>`;
    }

    // --- 3. Update DOM ---
    if (window.els.foldersList) {
        window.els.foldersList.innerHTML = foldersHtml;
        feather.replace({ 'stroke-width': 2, 'width': 18, 'height': 18 }, window.els.foldersList);
    }

    if (window.els.hist) {
        window.els.hist.innerHTML = recentsHtml || (query ? `<div class="p-8 text-center text-[10px] font-bold opacity-20 uppercase tracking-widest mt-10">No results found</div>` : `<div class="p-8 text-center text-[10px] font-bold opacity-20 uppercase tracking-widest mt-10">${dict.no_history}</div>`);
        feather.replace({ 'stroke-width': 2, 'width': 18, 'height': 18 }, window.els.hist);
    }

    const pinnedSection = window.els.pinnedSection || document.getElementById('chat-pin-section');
    const pinnedList = window.els.pinnedHist || document.getElementById('pinned-history-list');
    if (pinnedSection && pinnedList) {
        pinnedSection.hidden = !!query || filteredPinned.length === 0;
        pinnedList.innerHTML = query ? '' : filteredPinned.map(c => window.renderChatItem(c, dict)).join('');
        feather.replace({ 'stroke-width': 2, 'width': 18, 'height': 18 }, pinnedList);
    }

    allChatArray.forEach(c => window.__seenChatIds.add(c.id));
    window.__lastActiveChatId = window.currentChatId;
};

window.renderChatItem = (c, dict) => {
    const isNew = window.__seenChatIds && !window.__seenChatIds.has(c.id);
    // Pop the row that just became active (chat switch). New chats are
    // excluded — they appear plainly, no pop-in.
    const justSelected = !isNew && c.id === window.currentChatId && window.__lastActiveChatId !== c.id;
    return `
    <div class="history-btn-container ${justSelected ? 'chat-item-selected ' : ''}${c.id === window.currentChatId ? 'history-item-active' : ''} rounded-xl group relative"
         data-chat-id="${c.id}"
         data-chat-pinned="${c.pinned ? 'true' : 'false'}"
         onpointerdown="window.onChatPointerDown(event, '${c.id}')">
        <button onclick="window.loadChat('${c.id}')" class="history-chat-label flex-1 text-left px-3 py-2.5 rounded-lg text-xs font-medium ${c.id === window.currentChatId ? '' : 'text-zinc-500'}">
            <span class="truncate">${window.truncateTitle(c.title)}</span>
        </button>
        <div class="flex items-center gap-1 pr-1">
            <button onclick="window.showChatMenu('${c.id}', this, event)" class="history-action-btn" title="More actions" aria-label="Chat actions" aria-haspopup="menu" aria-expanded="false">
                <i data-feather="more-vertical" class="w-[1.1rem] h-[1.1rem]"></i>
            </button>
        </div>
    </div>`;
};
