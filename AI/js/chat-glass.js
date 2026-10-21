// Chat's functional glass layer: anchored menus and viewport-aware workspace.
(function () {
    'use strict';
    const title = document.getElementById('top-left-chat-title');
    const trigger = document.getElementById('chat-title-more');
    const thread = document.getElementById('chat-container');
    if (!title || !trigger || !thread) return;
    document.querySelectorAll('#top-left-chat-title button,#tra-bar button,#sidebar button').forEach(button => {
        if (!button.hasAttribute('aria-label') && button.title) button.setAttribute('aria-label', button.title);
    });
    document.getElementById('menu-toggle-btn')?.setAttribute('aria-label', 'Open sidebar');

    const menu = document.createElement('div');
    menu.id = 'chat-title-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Title actions');
    menu.hidden = true;
    menu.inert = true;
    const actions = [
        ['Rename chat', 'edit-2', () => window.renameCurrentChat()],
        ['Regenerate title', 'rotate-cw', () => window.regenerateCurrentTitle()],
        ['Good title', 'thumbs-up', () => window.setTitleFeedback(window.currentChatId, 'good', document.getElementById('header-feedback-good'))],
        ['Bad title', 'thumbs-down', () => window.setTitleFeedback(window.currentChatId, 'bad', document.getElementById('header-feedback-bad'))],
        ['Memories', 'book', () => window.openMemoriesPanel()],
        ['Personality', 'smile', () => window.openPersonality()],
        ['Settings', 'settings', () => window.toggleSettingsPanel()],
        ['Toggle theme', 'sun', () => window.toggleTheme()]
    ];
    actions.forEach(([label, icon, action]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.setAttribute('data-liquid-design', '');
        button.tabIndex = -1;
        button.innerHTML = `<i data-feather="${icon}" aria-hidden="true"></i><span>${label}</span>`;
        // Let Options close and restore its trigger before opening a dialog.
        button.addEventListener('click', () => setTimeout(action, 0));
        menu.appendChild(button);
        if (label === 'Bad title' || label === 'Settings') {
            const divider = document.createElement('div');
            divider.className = 'chat-menu-separator';
            divider.setAttribute('role', 'separator');
            menu.appendChild(divider);
        }
    });
    // Keep Options at the root so its sheet cannot be clipped by the header.
    const actionCluster = document.getElementById('chat-corner-actions');
    const newChat = document.getElementById('chat-new-button');
    const anchorSlot = document.createElement('span');
    anchorSlot.id = 'chat-corner-actions';
    anchorSlot.className = 'chat-corner-actions-anchor';
    anchorSlot.setAttribute('aria-hidden', 'true');
    actionCluster.replaceWith(anchorSlot);
    const menuCluster = document.createElement('div');
    menuCluster.id = 'chat-more-glass';
    menuCluster.setAttribute('data-liquid-design-component', 'options');
    newChat.setAttribute('data-liquid-button', '');
    newChat.setAttribute('data-liquid-menu-source', '');
    trigger.setAttribute('data-liquid-menu-source', '');
    trigger.setAttribute('data-liquid-design-toggle', menu.id);
    const sourceGroup = document.createElement('div');
    sourceGroup.className = 'chat-corner-actions-source';
    sourceGroup.setAttribute('data-liquid-menu-source-group', '');
    const sourceFace = document.createElement('div');
    sourceFace.className = 'chat-corner-actions-source-face';
    const sourceDivider = document.createElement('span');
    sourceDivider.className = 'chat-corner-actions-divider';
    sourceDivider.setAttribute('aria-hidden', 'true');
    sourceFace.append(newChat, sourceDivider, trigger);
    sourceGroup.append(sourceFace);
    menuCluster.append(sourceGroup, menu);
    document.body.appendChild(menuCluster);

    const modelTrigger = document.getElementById('chat-model-trigger');
    const modelTriggerName = document.getElementById('chat-model-trigger-name');
    const modelMenu = document.getElementById('chat-model-menu');
    const modelOptions = document.getElementById('chat-model-options');
    const thinkingEffort = document.getElementById('chat-thinking-effort');
    const thinkingEffortValue = document.getElementById('chat-thinking-effort-value');
    const thinkingEffortLabels = Array.from(document.querySelectorAll('.chat-thinking-effort-labels span'));
    const modelPicker = document.getElementById('chat-model-picker');
    const modelChevron = document.getElementById('chat-model-chevron');
    const thinkingEfforts = ['none', 'low', 'medium', 'high', 'ultra'];
    Object.entries(window.MODELS || {}).forEach(([key, model]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chat-model-option';
        button.setAttribute('data-liquid-design', '');
        button.dataset.modelKey = key;
        button.setAttribute('role', 'radio');
        button.innerHTML = `<span>${model.name}</span><i data-feather="check" aria-hidden="true"></i>`;
        button.addEventListener('click', () => {
            window.selectModel?.(key);
            setModelMenuOpen(false, true);
        });
        modelOptions.appendChild(button);
    });
    function setModelMenuOpen(open, restoreFocus = false) {
        const currentlyOpen = modelTrigger.getAttribute('aria-expanded') === 'true';
        if (open !== currentlyOpen) modelTrigger.click();
        if (!open && restoreFocus) modelTrigger.focus({ preventScroll: true });
    }
    function syncHeaderControls() {
        const selected = Object.entries(window.MODELS || {}).find(([, model]) => model.id === window.currentModel?.id);
        modelTriggerName.textContent = selected?.[1].name || window.currentModel?.name || 'Model';
        modelTrigger.setAttribute('aria-label', `Choose model, current model ${modelTriggerName.textContent}`);
        modelOptions.querySelectorAll('.chat-model-option').forEach(button => {
            const active = button.dataset.modelKey === selected?.[0];
            button.setAttribute('aria-checked', String(active));
            button.classList.toggle('is-active', active);
        });
        const effort = thinkingEfforts.includes(window.thinkingEffort) ? window.thinkingEffort : 'none';
        const effortIndex = thinkingEfforts.indexOf(effort);
        const effortLabel = effort[0].toUpperCase() + effort.slice(1);
        thinkingEffort.value = String(effortIndex);
        thinkingEffort.setAttribute('aria-valuetext', effortLabel);
        thinkingEffort.style.setProperty('--thinking-effort-progress', `${effortIndex * 25}%`);
        thinkingEffortValue.value = effortLabel;
        thinkingEffortValue.textContent = effortLabel;
        thinkingEffortLabels.forEach((label, index) => label.classList.toggle('is-active', index === effortIndex));
    }
    thinkingEffort.addEventListener('input', () => {
        window.setThinkingEffort?.(thinkingEfforts[Number(thinkingEffort.value)] || 'none');
    });
    window.addEventListener('chat-controls-update', syncHeaderControls);
    syncHeaderControls();
    window.LiquidDesign?.refresh(modelChevron);

    function place() {
        const anchor = anchorSlot.getBoundingClientRect();
        const viewport = window.visualViewport;
        const left = viewport ? viewport.offsetLeft : 0;
        const width = viewport ? viewport.width : innerWidth;
        menuCluster.style.left = anchor.left + 'px';
        menuCluster.style.top = anchor.top + 'px';
        const menuWidth = parseFloat(getComputedStyle(menu).width);
        menu.style.left = Math.max(left + 12, Math.min(left + width - menuWidth - 12, anchor.right - menuWidth)) - anchor.left + 'px';
        menuCluster.style.setProperty('--liquid-design-menu-offset-y', anchor.height + 8 + 'px');
    }
    // Placement must be ready before the engine measures click/hold opening.
    trigger.addEventListener('pointerdown', place, true);
    trigger.addEventListener('click', place, true);
    trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') place();
    }, true);
    addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    new ResizeObserver(place).observe(title);
    place();
    window.LiquidDesign?.refresh(menuCluster);
    let restoreMenuFocus = false;
    menuCluster.addEventListener('keydown', event => {
        if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') restoreMenuFocus = true;
    }, true);
    new MutationObserver(() => {
        if (restoreMenuFocus && menuCluster.dataset.morphPhase === 'settled' && trigger.getAttribute('aria-expanded') === 'false') {
            restoreMenuFocus = false;
            trigger.focus({ preventScroll: true });
        }
    }).observe(menuCluster, { attributes: true, attributeFilter: ['data-morph-phase'] });

    // Search leads the library, as in the supplied sidebar reference.
    const search = document.querySelector('.sb-search-wrap');
    const sidebar = document.getElementById('sidebar-full-content');
    if (search && sidebar) sidebar.insertBefore(search, sidebar.children[1]);
    // Keep the mobile menu button in the conversation header. The sidebar is
    // an off-canvas drawer on phones, not a permanently visible rail.
    const sidebarNavigation = document.getElementById('chat-mobile-navigation');
    const sidebarPanel = document.getElementById('sidebar');
    function syncSidebarControl() {
        const collapsed = innerWidth < 768
            ? sidebarPanel.classList.contains('-translate-x-full')
            : document.body.classList.contains('sidebar-collapsed');
        document.body.classList.toggle('sidebar-drawer-open', innerWidth < 768 && !collapsed);
        const button = document.getElementById('menu-toggle-btn');
        button.setAttribute('aria-label', collapsed ? 'Open sidebar' : 'Collapse sidebar');
        button.setAttribute('aria-expanded', String(!collapsed));
        button.setAttribute('aria-controls', 'sidebar-full-content');
        // The desktop rail keeps its toolbar, Settings and profile usable.
        sidebar.inert = collapsed && innerWidth < 768;
    }
    new MutationObserver(syncSidebarControl).observe(sidebarPanel, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(syncSidebarControl).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', syncSidebarControl);
    syncSidebarControl();

    // The settings shell has real navigation/content columns, not a floating
    // strip of unrelated pills. Retain every existing category and field ID.
    const settingsPanel = document.getElementById('settings-panel');
    const settingsBody = document.createElement('div');
    settingsBody.className = 'chat-settings-body';
    settingsBody.append(document.querySelector('.Cadance-tab-bar'), document.getElementById('settings-content-area'));
    settingsPanel.appendChild(settingsBody);
    const categoryHeading = document.createElement('h2');
    categoryHeading.className = 'chat-settings-category-heading';
    document.getElementById('settings-content-area').prepend(categoryHeading);
    const categories = document.querySelector('.Cadance-tab-bar');
    const settingsNavigation = document.createElement('div');
    settingsNavigation.className = 'chat-settings-navigation';
    const settingsHeading = document.getElementById('chat-settings-heading');
    categories.before(settingsNavigation);
    settingsNavigation.append(settingsHeading, categories);
    const chatsHeading = document.createElement('p');
    chatsHeading.className = 'chat-library-section-heading';
    chatsHeading.textContent = 'Chats';
    chatsHeading.dataset.historyLayoutKey = 'heading:chats';
    // Directly above ordinary chats. The optional Pinned section remains
    // above this heading inside the same scrolling library.
    document.getElementById('history-list').before(chatsHeading);
    const backToCategories = document.createElement('button');
    backToCategories.type = 'button';
    backToCategories.className = 'chat-settings-back';
    backToCategories.setAttribute('aria-label', 'Back to settings categories');
    backToCategories.setAttribute('data-liquid-design', '');
    backToCategories.setAttribute('data-liquid-design-independent', '');
    backToCategories.innerHTML = '<i data-feather="chevron-left" aria-hidden="true"></i>';
    document.querySelector('.chat-settings-header').prepend(backToCategories);
    let selectedCategory = 'general';
    window.showSettingsCategories = function () {
        settingsPanel.classList.remove('is-category-detail');
        categories.inert = false;
        document.getElementById('settings-content-area').inert = innerWidth < 768;
    };
    window.showSettingsCategory = function (name) {
        selectedCategory = name;
        const button = document.getElementById(`ptab-btn-${name}`);
        categoryHeading.textContent = button?.textContent.trim() || 'Settings';
        settingsPanel.classList.add('is-category-detail');
        categories.inert = innerWidth < 768;
        document.getElementById('settings-content-area').inert = false;
        if (innerWidth < 768 && settingsPanel.classList.contains('active')) {
            categoryHeading.tabIndex = -1;
            categoryHeading.focus({ preventScroll: true });
        }
    };
    backToCategories.addEventListener('click', () => {
        window.showSettingsCategories();
        document.getElementById(`ptab-btn-${selectedCategory}`)?.focus({ preventScroll: true });
    });
    addEventListener('resize', () => {
        categories.inert = innerWidth < 768 && settingsPanel.classList.contains('is-category-detail');
        document.getElementById('settings-content-area').inert = innerWidth < 768 && !settingsPanel.classList.contains('is-category-detail');
    });
    window.LiquidDesign?.refresh(backToCategories);
    document.querySelectorAll('.Cadance-tab-btn').forEach(button => button.addEventListener('keydown', event => {
        const buttons = Array.from(document.querySelectorAll('.Cadance-tab-btn'));
        const index = buttons.indexOf(button);
        if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
                (index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next].click(); buttons[next].focus();
        }
    }));

    [settingsPanel, document.getElementById('personality-modal'), document.getElementById('memories-modal')].forEach(dialog => {
        let previous = null, wasOpen = false;
        function syncDialog() {
            const open = dialog.id === 'settings-panel' ? dialog.classList.contains('active') : dialog.style.display === 'flex';
            if (open === wasOpen) return;
            wasOpen = open;
            if (open) { previous = document.activeElement; requestAnimationFrame(() => Array.from(dialog.querySelectorAll('button,input,textarea')).find(el => el.getClientRects().length && !el.closest('[inert]'))?.focus({ preventScroll: true })); }
            else if (previous?.isConnected) previous.focus({ preventScroll: true });
        }
        new MutationObserver(syncDialog).observe(dialog, { attributes: true, attributeFilter: ['class', 'style'] });
        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (dialog.id === 'settings-panel') window.toggleSettingsPanel();
                else if (dialog.id === 'personality-modal') window.closePersonality();
                else dialog.style.display = 'none';
            }
            if (event.key === 'Tab') {
                const controls = Array.from(dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(el => el.getClientRects().length);
                const first = controls[0], last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        });
    });

    // Each message uses the same live Options controller as the homepage.
    // Move its real trigger/actions into a root-level cluster to avoid clipping.
    const messageOptions = new Map();
    let messageSerial = 0;
    function pruneMessageOptions() {
        messageOptions.forEach((record, row) => {
            if (row.isConnected) return;
            record.observer.disconnect();
            record.cancelHold();
            record.restoreMessage();
            window.LiquidDesign?.destroy(record.cluster);
            record.cluster.remove();
            messageOptions.delete(row);
        });
    }
    function closeMessageOptions() {
        messageOptions.forEach(({ toggle }) => {
            if (toggle.getAttribute('aria-expanded') === 'true') toggle.click();
        });
    }
    window.refreshChatActionGlass = function (scope) {
        pruneMessageOptions();
        scope = scope || thread;
        const rows = Array.from(scope.querySelectorAll('.user-row,.ai-row'));
        if (scope.matches('.user-row,.ai-row')) rows.unshift(scope);
        rows.forEach(row => {
            const buttons = Array.from(row.querySelectorAll('.user-msg-actions button,.ai-msg-actions button'));
            if (!buttons.length || messageOptions.has(row)) return;
            const bubble = row.querySelector('.user-bubble-container,.ai-bubble-container');
            const slot = document.createElement('span');
            slot.className = 'message-options-anchor'; slot.setAttribute('aria-hidden', 'true');
            bubble.appendChild(slot);
             const cluster = document.createElement('div');
            cluster.className = 'chat-message-options';
            cluster.setAttribute('data-liquid-design-component', 'options');
            cluster.setAttribute('data-liquid-design-message-options', '');
             cluster.setAttribute('data-liquid-design-menu-direction', 'up');
             cluster.setAttribute('data-message-menu', '');
            const toggle = document.createElement('button');
            toggle.type = 'button'; toggle.className = 'message-actions-toggle';
            toggle.tabIndex = -1;
            toggle.setAttribute('aria-hidden', 'true');
            toggle.setAttribute('aria-label', 'Message actions');
            toggle.setAttribute('data-liquid-design', '');
            const panel = document.createElement('div');
            panel.id = `chat-message-options-${++messageSerial}`;
            panel.setAttribute('role', 'menu'); panel.setAttribute('aria-label', 'Message actions');
            panel.hidden = true; panel.inert = true;
            toggle.setAttribute('data-liquid-design-toggle', panel.id);
            buttons.forEach(button => {
                const label = button.getAttribute('aria-label') || button.title;
                button.setAttribute('aria-label', label); button.setAttribute('role', 'menuitem');
                button.setAttribute('data-liquid-design', ''); button.tabIndex = -1;
                const text = document.createElement('span'); text.textContent = label;
                button.appendChild(text); panel.appendChild(button);
            });
            const holdTarget = bubble.querySelector('.user-msg-bubble') || bubble.querySelector(':scope > .prose-target');
            let liftedMessage = null, savedVisibility = null;
            function liftMessage() {
                if (liftedMessage || !holdTarget.isConnected) return;
                const bounds = holdTarget.getBoundingClientRect();
                const copy = holdTarget.cloneNode(true);
                // Preserve the actual rendered message appearance outside its
                // thread ancestors, including markdown and attachment styling.
                const originals = [holdTarget, ...holdTarget.querySelectorAll('*')];
                const copies = [copy, ...copy.querySelectorAll('*')];
                originals.forEach((element, index) => {
                    const style = getComputedStyle(element);
                    for (let i = 0; i < style.length; i++) {
                        const property = style[i];
                        copies[index].style.setProperty(property, style.getPropertyValue(property));
                    }
                    copies[index].removeAttribute('id');
                    copies[index].removeAttribute('tabindex');
                });
                liftedMessage = document.createElement('div');
                liftedMessage.className = 'chat-lifted-message';
                liftedMessage.setAttribute('aria-hidden', 'true');
                liftedMessage.inert = true;
                Object.assign(liftedMessage.style, {
                    left: bounds.left + 'px', top: bounds.top + 'px',
                    width: bounds.width + 'px', height: bounds.height + 'px'
                });
                Object.assign(copy.style, {
                    width: '100%', height: '100%', maxWidth: 'none',
                    margin: '0', boxSizing: 'border-box', visibility: 'visible',
                    transform: 'none'
                });
                liftedMessage.appendChild(copy);
                document.body.appendChild(liftedMessage);
                savedVisibility = [holdTarget.style.getPropertyValue('visibility'), holdTarget.style.getPropertyPriority('visibility')];
                holdTarget.style.setProperty('visibility', 'hidden', 'important');
            }
            function restoreMessage() {
                liftedMessage?.remove(); liftedMessage = null;
                if (savedVisibility) {
                    if (savedVisibility[0]) holdTarget.style.setProperty('visibility', savedVisibility[0], savedVisibility[1]);
                    else holdTarget.style.removeProperty('visibility');
                    savedVisibility = null;
                }
            }
            holdTarget.tabIndex = 0;
            holdTarget.setAttribute('aria-haspopup', 'menu');
            holdTarget.setAttribute('aria-controls', panel.id);
            holdTarget.setAttribute('aria-expanded', 'false');
            holdTarget.setAttribute('aria-keyshortcuts', 'Shift+F10');
            let holdTimer = 0, holdPointer = null, startX = 0, startY = 0, held = false;
            const cancelHold = () => { clearTimeout(holdTimer); holdTimer = 0; holdPointer = null; };
            const openActions = () => {
                placeOptions();
                if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
            };
            holdTarget.addEventListener('pointerdown', event => {
                if (event.button !== 0 || event.isPrimary === false || event.target.closest('a,button,input,textarea,select,[contenteditable="true"]')) return;
                cancelHold(); held = false;
                holdPointer = event.pointerId; startX = event.clientX; startY = event.clientY;
                holdTimer = setTimeout(() => {
                    holdTimer = 0; held = true;
                    window.getSelection()?.removeAllRanges();
                    openActions();
                }, 550);
            });
            holdTarget.addEventListener('pointermove', event => {
                if (event.pointerId === holdPointer && Math.hypot(event.clientX - startX, event.clientY - startY) > 8) cancelHold();
            });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => holdTarget.addEventListener(type, cancelHold));
            holdTarget.addEventListener('click', event => {
                if (held) { held = false; event.preventDefault(); event.stopPropagation(); }
            }, true);
            holdTarget.addEventListener('contextmenu', event => {
                if (event.target.closest('a,button,input,textarea,select')) return;
                event.preventDefault(); cancelHold(); openActions();
            });
            holdTarget.addEventListener('keydown', event => {
                if (event.target === holdTarget && (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) {
                    event.preventDefault(); openActions();
                }
            });
            toggle.addEventListener('click', () => {
                holdTarget.setAttribute('aria-expanded', toggle.getAttribute('aria-expanded') || 'false');
                row.classList.toggle('message-menu-open', toggle.getAttribute('aria-expanded') === 'true');
            });
            cluster.append(toggle, panel); document.body.appendChild(cluster);
            function placeOptions() {
                const viewport = window.visualViewport, left = viewport?.offsetLeft || 0;
                const width = viewport?.width || innerWidth, menuWidth = 220;
                const bounds = holdTarget.getBoundingClientRect();
                const top = Math.max(viewport?.offsetTop || 0, title.getBoundingClientRect().bottom) + 12;
                const bottom = Math.min((viewport?.offsetTop || 0) + (viewport?.height || innerHeight), document.getElementById('chat-composer-dock').getBoundingClientRect().top) - 12;
                const menuHeight = buttons.length * 44 + 12, gap = 10;
                const above = bounds.top - top, below = bottom - bounds.bottom;
                const up = above >= menuHeight + gap || above > below;
                const x = Math.max(left + 12, Math.min(left + width - menuWidth - 12,
                    row.matches('.user-row') ? bounds.right - menuWidth : bounds.left));
                const originX = Math.max(bounds.left, Math.min(bounds.right - 44, x));
                const originY = up ? bounds.top : bounds.bottom - 44;
                cluster.style.left = originX + 'px'; cluster.style.top = originY + 'px';
                cluster.setAttribute('data-liquid-design-menu-direction', up ? 'up' : 'down');
                cluster.style.setProperty('--liquid-design-menu-gap', gap + 'px');
                cluster.style.setProperty('--liquid-design-menu-top-bound', top + 'px');
                cluster.style.setProperty('--liquid-design-menu-bottom-bound', bottom + 'px');
                panel.style.left = (x - originX) + 'px';
                panel.style.maxHeight = Math.max(44, (up ? above : below) - gap) + 'px';
                panel.style.overflowY = 'auto';
            }
            function syncVisibility() {
                const active = toggle.getAttribute('aria-expanded') === 'true' || cluster.dataset.morphPhase !== 'settled';
                if (active) liftMessage(); else restoreMessage();
                holdTarget.setAttribute('aria-expanded', toggle.getAttribute('aria-expanded') || 'false');
                row.classList.toggle('message-menu-open', active);
                cluster.classList.toggle('is-message-active', toggle.getAttribute('aria-expanded') === 'true' ||
                    cluster.dataset.morphPhase !== 'settled');
            }
            row.addEventListener('pointerenter', syncVisibility);
            row.addEventListener('pointerleave', syncVisibility);
            row.addEventListener('focusin', syncVisibility);
            row.addEventListener('focusout', () => setTimeout(syncVisibility, 0));
            cluster.addEventListener('pointerenter', syncVisibility);
            cluster.addEventListener('pointerleave', syncVisibility);
            cluster.addEventListener('focusin', syncVisibility);
            cluster.addEventListener('focusout', () => setTimeout(syncVisibility, 0));
            toggle.addEventListener('pointerdown', placeOptions, true);
            toggle.addEventListener('click', placeOptions, true);
            toggle.addEventListener('keydown', placeOptions, true);
            let restoreFocus = false;
            cluster.addEventListener('keydown', event => {
                if (event.key === 'Escape') restoreFocus = true;
            }, true);
            const observer = new MutationObserver(() => {
                syncVisibility();
                if (cluster.dataset.morphPhase === 'settled' && toggle.getAttribute('aria-expanded') === 'false') {
                    if (restoreFocus || cluster.contains(document.activeElement)) {
                        restoreFocus = false; holdTarget.focus({ preventScroll: true });
                    }
                }
            });
            observer.observe(cluster, { attributes: true, subtree: true, attributeFilter: ['aria-expanded', 'data-morph-phase'] });
            messageOptions.set(row, { cluster, toggle, panel, placeOptions, observer, cancelHold, restoreMessage });
            placeOptions(); window.LiquidDesign?.refresh(cluster); syncVisibility();
        });
    };
    window.refreshChatActionGlass();
    new MutationObserver(pruneMessageOptions).observe(thread, { childList: true, subtree: true });
    thread.addEventListener('scroll', () => {
        messageOptions.forEach(record => record.cancelHold());
        closeMessageOptions();
    }, { passive: true });
    function repositionMessageOptions() {
        closeMessageOptions(); messageOptions.forEach(record => record.placeOptions());
    }
    addEventListener('resize', repositionMessageOptions);
    window.visualViewport?.addEventListener('resize', repositionMessageOptions);

    // Floating glass overlaps the canvas. Reserve its actual height at the
    // end of the thread and center the greeting in the unobscured space.
    const dock = document.getElementById('chat-composer-dock');
    const composer = dock.querySelector('.input-box-wrap');
    function measureLayout() {
        const threadRect = thread.getBoundingClientRect();
        const dockRect = dock.getBoundingClientRect();
        thread.style.setProperty('--chat-dock-height', dockRect.height + 'px');
        thread.style.setProperty('--chat-heading-bottom', Math.max(0, title.getBoundingClientRect().bottom - threadRect.top) + 'px');
        thread.style.setProperty('--chat-dock-top-gap', Math.max(0, threadRect.bottom - dockRect.top) + 'px');
    }
    const layoutObserver = new ResizeObserver(measureLayout);
    [dock, thread, title].forEach(element => layoutObserver.observe(element));
    measureLayout();
    const edge = document.createElement('div');
    edge.className = 'chat-scroll-edge';
    edge.setAttribute('aria-hidden', 'true');
    document.querySelector('main').appendChild(edge);
    function updateViewport() {
        const viewport = window.visualViewport;
        const height = viewport ? Math.min(innerHeight, viewport.height + viewport.offsetTop) : innerHeight;
        document.body.style.setProperty('--chat-viewport-height', height + 'px');
        measureLayout();
        place();
    }
    addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    updateViewport();
    window.feather?.replace();
})();
