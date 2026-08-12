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

    // New-chat bounce: ids never rendered before get the pop-in animation.
    // The first render seeds silently so the whole list doesn't bounce at boot.
    if (!window.__seenChatIds) {
        window.__seenChatIds = new Set(allChatArray.map(c => c.id));
        window.__lastActiveChatId = window.currentChatId;
    }
    const currentLang = window.settings.lang || 'en';
    const dict = window.translations[currentLang];

    const filteredChats = query ? allChatArray.filter(c => c.title.toLowerCase().includes(query)) : allChatArray;
    const visibleChats = filteredChats.slice(0, window.__historyRenderLimit);
    const hasMore = filteredChats.length > visibleChats.length;

    const sectionHeader = (title) =>
        `<div class="history-section-header mb-0.5 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-400/80">${title}</div>`;

    // --- 1. Generate Folders HTML ---
    let foldersHtml = '';
    if (!query) {
        foldersHtml += `
        <div class="section-header-row">
            <span class="section-header-text">Your Folders</span>
            <button onclick="window.createFolder()" class="sb-icon-btn" title="New Folder">
                <i data-feather="folder-plus" class="w-[1.3rem] h-[1.3rem]"></i>
            </button>
        </div>`;

        window.settings.folders.forEach(folder => {
            const folderChats = visibleChats.filter(c => c.folderId === folder.id);
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
    const orphanedChats = visibleChats.filter(c => !c.folderId);

    if (query) {
        // Search is a flat view — manual order, no time buckets.
        recentsHtml = orphanedChats.map(c => window.renderChatItem(c, dict)).join('');
    } else {
        const now = new Date();
        const dayStartTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const weekStartTs = dayStartTs - (86400000 * 7);

        const bucketOf = (c) =>
            c.timestamp >= dayStartTs ? 'today'
                : c.timestamp >= weekStartTs ? 'last_7_days'
                    : 'dust_collecting';
        const bucketTitle = {
            today: dict.today_header,
            last_7_days: "Last 7 days",
            dust_collecting: dict.dust_collecting_header
        };

        // Pinned float to the top in their own block (manual order within).
        const pinned = orphanedChats.filter(c => c.pinned);
        const unpinned = orphanedChats.filter(c => !c.pinned);

        if (pinned.length) {
            recentsHtml += sectionHeader(dict.pinned_header);
            recentsHtml += pinned.map(c => window.renderChatItem(c, dict)).join('');
        }

        // Walk in manual order; emit each bucket header at most once, where it
        // first appears. Headers act as dividers — position is king.
        const seen = new Set();
        unpinned.forEach(c => {
            const b = bucketOf(c);
            if (!seen.has(b)) { recentsHtml += sectionHeader(bucketTitle[b]); seen.add(b); }
            recentsHtml += window.renderChatItem(c, dict);
        });
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

    allChatArray.forEach(c => window.__seenChatIds.add(c.id));
    window.__lastActiveChatId = window.currentChatId;
    window.__titleShimmerChatId = null;   // one-shot: consumed by this render
};

window.renderChatItem = (c, dict) => {
    const isNew = window.__seenChatIds && !window.__seenChatIds.has(c.id);
    // Pop the row that just became active (chat switch), unless it's already
    // playing the new-chat bounce.
    const justSelected = !isNew && c.id === window.currentChatId && window.__lastActiveChatId !== c.id;
    // One-shot text shimmer on the row whose title was just (re)generated.
    const shimmer = c.id === window.__titleShimmerChatId;
    return `
    <div class="history-btn-container ${isNew ? 'chat-item-in ' : ''}${justSelected ? 'chat-item-selected ' : ''}${c.id === window.currentChatId ? 'history-item-active' : ''} rounded-xl group relative"
         data-chat-id="${c.id}"
         draggable="true"
         ondragstart="window.onChatDragStart(event, '${c.id}')"
         ondragend="window.onChatDragEnd(event)">
        <button onclick="window.loadChat('${c.id}')"${shimmer ? ` onanimationend="this.classList.remove('title-shimmer')"` : ''} class="flex-1 text-left px-3 py-2.5 rounded-lg text-xs font-medium truncate ${shimmer ? 'title-shimmer ' : ''}${c.id === window.currentChatId ? '' : 'text-zinc-500'}">${window.truncateTitle(c.title)}</button>
        <div class="flex items-center gap-1 pr-1">
            <button onclick="window.showChatMenu('${c.id}', this, event)" class="history-action-btn" title="More actions">
                <i data-feather="more-vertical" class="w-[1.1rem] h-[1.1rem]"></i>
            </button>
        </div>
    </div>`;
};
