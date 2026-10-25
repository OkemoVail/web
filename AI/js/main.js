// ─── Main Entrance & App Boot ──────────────────────────────

window.initChatUI = () => {
    // First-boot seed: if no systemPrompt has ever been saved, copy the
    // Default personality preset in. Without this a fresh browser sends no
    // system block and the model reverts to its base "I'm Qwen" identity.
    if (window.settings &&
        (!window.settings.systemPrompt || !String(window.settings.systemPrompt).trim())) {
        const presets = window.PERSONALITY_PRESETS || [];
        const def = presets.find(p => p.id === 'default') || presets[0];
        if (def && def.prompt) {
            window.settings.systemPrompt = def.prompt;
            if (typeof window.saveSettings === 'function') window.saveSettings();
        }
    }

    // Ensure all chatting toggles are off on first load
    window.isWebSearch = false;
    window.isDeepResearch = false;
    window.isThinkingEnabled = false;
    window.thinkingEffort = 'none';
    window.canvasEnabled = false;

    // 1. Generate random greeting
    const welcomeName = (window.settings.userName && window.settings.userName !== 'Guest') ? window.settings.userName : null;
    const isGuest = !welcomeName;
    const name = welcomeName || 'Guest';
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    let options = isGuest ? ['Hi Guest.'] : [
        'Back at it!', 'Cookie and Oaky time?', 'Greetings, whoever you are',
        'Hey there', 'Hi, how are you?', 'How was your day?', 'How’s it going?',
        `Let’s chat, ${name}`, 'Welcome', 'What’s new?', 'What’s on your mind?'
    ];

    if (!isGuest) {
        options.push(`${name} returns!`, `Back at it, ${name}`, `Hey there, ${name}`,
            `Hi ${name}, how are you?`, `How was your day, ${name}?`, `How’s it going, ${name}?`,
            `Welcome, ${name}`, `What’s new, ${name}?`, `What’s on your mind, ${name}?`);

        if (hour >= 5 && hour < 12) {
            options.push('Good morning', `Good morning, ${name}`);
        } else if (hour >= 12 && hour < 17) {
            options.push('Good afternoon', `Good afternoon, ${name}`);
        } else if (hour >= 17 && hour < 22) {
            options.push('Evening', 'Good evening', `Evening, ${name}`, `Good evening, ${name}`);
        }
        if (hour >= 18 || hour < 4) {
            options.push('What’s on your mind tonight?', 'Watchu doing tonight?', 'Late night thoughts?');
        }
        if (hour >= 22 || hour < 5) {
            options.push('Hello, night owl', 'Go to sleep you stinky');
        }
        if (day === 1) options.push('Happy Monday', `Happy Monday, ${name}`);
        else if (day === 2) options.push('Happy Tuesday', `Happy Tuesday, ${name}`);
        else if (day === 3) options.push('Happy Wednesday', `Happy Wednesday, ${name}`);
        else if (day === 4) options.push('Happy Thursday', `Happy Thursday, ${name}`);
        else if (day === 5) options.push('Happy Friday', 'That Friday feeling', 'Welcome to the weekend', `Happy Friday, ${name}`, `That Friday feeling, ${name}`, `Welcome to the weekend, ${name}`);
        else if (day === 6) options.push('Happy Saturday!', 'Welcome to the weekend', `Happy Saturday, ${name}`, `Welcome to the weekend, ${name}`);
        else if (day === 0) options.push('Happy Sunday', 'Sunday session?', 'Welcome to the weekend', `Happy Sunday, ${name}`, `Sunday session, ${name}?`, `Welcome to the weekend, ${name}`);
    }

    const randomGreeting = options[Math.floor(Math.random() * options.length)];
    window.__currentRandomGreeting = randomGreeting;
    if (window.els.greeting) window.els.greeting.innerText = randomGreeting;

    if (isGuest) {
        setTimeout(() => {
            if (window.showInputNotice) window.showInputNotice(
                'Create an account to unlock personalization and full features.'
            );
        }, 1000);
    }

    // 2. Cache DOM Elements into window.els
    window.els.chatCont = document.getElementById("chat-container");
    window.els.chatMsgs = document.getElementById("chat-messages");
    window.els.input = document.getElementById("user-input");
    window.els.send = document.getElementById("send-btn");
    window.els.icon = document.getElementById("send-icon-wrapper");
    window.els.welcome = document.getElementById("welcome-state");
    window.els.welcomeLogo = document.getElementById("welcome-logo-container");
    window.els.hist = document.getElementById("history-list");
    window.els.pinnedHist = document.getElementById("pinned-history-list");
    window.els.pinnedSection = document.getElementById("chat-pin-section");
    window.els.foldersList = document.getElementById("folders-list");
    window.els.modMenu = document.getElementById("model-menu-input");
    window.els.noteMenu = document.getElementById("notes-menu");
    window.els.searchBtn = document.getElementById("web-search-btn");
    window.els.modelSelector = document.getElementById("model-selector-input");
    window.els.sidebar = document.getElementById('sidebar');
    window.els.sidebarOverlay = document.getElementById('sidebar-overlay');
    window.els.logoAi = document.getElementById('logo-ai-core');
    window.els.greeting = document.getElementById('welcome-greeting');
    window.els.onboarding = document.getElementById('onboarding-overlay');
    window.els.settingsPanel = document.getElementById('settings-panel');
    window.els.sidebarName = document.getElementById('sidebar-user-name');
    window.els.avatarDisplay = document.getElementById('user-avatar-display');
    window.els.miniAvatarDisplay = document.getElementById('mini-avatar-display');
    window.els.pfpMovableImg = document.getElementById('pfp-movable-img');
    window.els.pfpWorkspace = document.getElementById('pfp-workspace');
    window.els.storageDisplay = document.getElementById('storage-display');

    // 3. Onboarding & Sidebar Initial States
    if (!window.settings.hasCompletedTutorial) {
        if (window.els.onboarding) window.els.onboarding.classList.remove('hidden');
        if (window.els.sidebar) window.els.sidebar.classList.add('-translate-x-full');
        document.body.classList.add('onboarding-active');
    } else {
        if (window.innerWidth >= 1024 && window.els.sidebar) {
            window.els.sidebar.classList.remove('-translate-x-full');
        }
        document.body.classList.remove('onboarding-active');
    }

    // 4. Initial Theme & Accent Apply
    const theme = localStorage.getItem('vail_theme') || 'system';
    window.setTheme(theme);
    window.updateProfileUI();
    window.renderThemes();

    // 5. Input Listeners
    function measureComposerCopy(ta, width, value = ta.value) {
        let mirror = ta._composerMirror;
        if (!mirror) {
            mirror = document.createElement('div');
            mirror.setAttribute('aria-hidden', 'true');
            Object.assign(mirror.style, {
                position: 'fixed',
                left: '-10000px',
                top: '0',
                visibility: 'hidden',
                pointerEvents: 'none',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word',
                boxSizing: 'border-box'
            });
            document.body.appendChild(mirror);
            ta._composerMirror = mirror;
        }
        const style = getComputedStyle(ta);
        Object.assign(mirror.style, {
            width: width + 'px',
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            fontStyle: style.fontStyle,
            letterSpacing: style.letterSpacing,
            lineHeight: style.lineHeight,
            padding: style.padding,
            tabSize: style.tabSize
        });
        // The extra zero-width character makes a trailing newline count as a
        // real empty line, just as it does in the textarea.
        mirror.textContent = (value || ' ') + '\u200b';
        return Math.ceil(mirror.getBoundingClientRect().height);
    }

    window.refreshInputLayout = () => {
        const ta = window.els.input;
        const inner = document.getElementById('input-inner');
        if (!ta || !inner) return;
        const composer = ta.closest('.input-box-wrap');
        const textareaWrap = ta.closest('.input-textarea-wrap');
        const innerStyle = getComputedStyle(inner);
        const compactFieldHeight = parseFloat(innerStyle.getPropertyValue('--composer-field-height')) || 40;
        const compactInnerHeight = parseFloat(innerStyle.getPropertyValue('--composer-compact-height')) || 56;
        const controlReserve = parseFloat(innerStyle.getPropertyValue('--composer-control-reserve')) || 56;
        const inlineChrome = parseFloat(innerStyle.getPropertyValue('--composer-inline-chrome')) || 121;
        const compactFieldWidth = Math.max(80, inner.clientWidth - inlineChrome);
        const empty = ta.value.length === 0;
        const oneLineHeight = measureComposerCopy(ta, compactFieldWidth, 'M');
        const measuredHeight = empty ? oneLineHeight : measureComposerCopy(ta, compactFieldWidth);
        // One rendered line is the canonical compact state. Measuring its real
        // line box also absorbs inherited padding/min-height, instead of
        // mistaking that chrome for a second line.
        const multiline = !empty && measuredHeight > oneLineHeight + 1;
        const fieldHeight = multiline
            ? Math.min(Math.max(oneLineHeight, measuredHeight), 200)
            : oneLineHeight;
        const targetInnerHeight = multiline ? fieldHeight + controlReserve : compactInnerHeight;
        const currentInnerHeight = inner.getBoundingClientRect().height || compactInnerHeight;
        const currentFieldHeight = ta.getBoundingClientRect().height || compactFieldHeight;
        const before = textareaWrap?.getBoundingClientRect();
        const stateChanged = inner.classList.contains('is-multiline') !== multiline;

        // Freeze the currently painted geometry before changing layout state.
        // The following frame then interpolates the whole shell to its target,
        // so Return and Backspace are exact reverses rather than two snaps.
        inner.style.height = currentInnerHeight + 'px';
        ta.style.height = currentFieldHeight + 'px';
        inner.classList.toggle('is-multiline', multiline);
        composer?.classList.toggle('is-multiline', multiline);

        if (stateChanged && before && textareaWrap && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const after = textareaWrap.getBoundingClientRect();
            textareaWrap.getAnimations().forEach(animation => animation.cancel());
            textareaWrap.animate([
                { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` },
                { transform: 'translate(0, 0)' }
            ], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }

        cancelAnimationFrame(ta._layoutFrame);
        ta._layoutFrame = requestAnimationFrame(() => {
            inner.style.height = targetInnerHeight + 'px';
            ta.style.height = fieldHeight + 'px';
        });
        // Overflowing text needs native touch scrolling; otherwise the glass owns the drag.
        ta.classList.toggle('is-scrollable', measuredHeight > 200);
    };
    if (window.els.input) {
        window.els.input.oninput = () => {
            window.refreshInputLayout();
            window.updateUI();
        };
        window.els.input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.handleAction();
            }
        };
    }

    // New chat shortcut: Command+I on macOS, Control+I elsewhere. Keep the
    // browser's native editing shortcuts intact while the user is typing.
    const newChatShortcut = document.querySelector('.sb-new-chat-shortcut');
    if (newChatShortcut) {
        const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
        newChatShortcut.textContent = newChatShortcut.dataset[isMac ? 'shortcutMac' : 'shortcutWindows'];
    }
    document.addEventListener('keydown', function newChatShortcutHandler(e) {
        const target = e.target;
        const isEditable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLElement && target.isContentEditable;
        const usesSinglePlatformModifier = (e.ctrlKey && !e.metaKey) || (e.metaKey && !e.ctrlKey);
        if (!isEditable && usesSinglePlatformModifier && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            window.resetChat();
        }
    });

    // 6. Global Click Menu Hijack
    window.onclick = (e) => {
        if (window.els.modMenu?.classList.contains('active') && !document.getElementById('model-dropdown-btn').contains(e.target)) window.els.modMenu.classList.remove('active');
        if (window.els.noteMenu?.classList.contains('active') && !e.target.closest('#notes-menu') && !e.target.closest('button[onclick*="notes-menu"]')) window.els.noteMenu.classList.remove('active');

        const onboardingCard = document.querySelector('.onboarding-card');
        const isSidebarClick = window.els.sidebar && window.els.sidebar.contains(e.target);
        const isSettingsClick = window.els.settingsPanel && window.els.settingsPanel.contains(e.target);
        const isModelBtnClick = document.getElementById('model-selector-input')?.contains(e.target);
        const isModelMenuClick = document.getElementById('model-menu-input')?.contains(e.target);
        const isToggleBtnClick = document.getElementById('menu-toggle-btn')?.contains(e.target);
        const isOnboardingClick = onboardingCard?.contains(e.target);

        if (!isSidebarClick && !isSettingsClick && !isModelBtnClick && !isModelMenuClick && !isToggleBtnClick && !isOnboardingClick) {
            window.closeAllMenus();
        }
    };

    // 7. Hover sidebar trigger for "Smart" mode
    const trigger = document.getElementById('sidebar-hover-trigger');
    let hideTimeout;
    if (trigger) {
        trigger.addEventListener('mouseenter', () => {
            if (window.settings.sidebarMode === 'smart' && window.innerWidth >= 1024) {
                if (document.body.classList.contains('sidebar-collapsed')) {
                    clearTimeout(hideTimeout);
                    window.toggleSidebar();
                }
            }
        });
    }

    if (window.els.sidebar) {
        window.els.sidebar.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
        window.els.sidebar.addEventListener('mouseleave', () => {
            if (window.settings.sidebarMode === 'smart' && window.innerWidth >= 1024) {
                if (!document.body.classList.contains('sidebar-collapsed')) {
                    clearTimeout(hideTimeout);
                    hideTimeout = setTimeout(() => {
                        if (!window.els.settingsPanel.classList.contains('active')) {
                            window.toggleSidebar();
                        }
                    }, 600);
                }
            }
        });
    }

    window.applyTranslations();
    window.updateStorageUsage();

    window.selectModel('SAGA');
    window.render();
    window.updateUI();
    window.checkChangelog();
};

// --- INITIALIZATION ---
(async function boot() {
    const savedBackendUrl = localStorage.getItem('vail_custom_backend_url') || '';
    if (/cloudflare\.vc|trycloudflare\.com/i.test(savedBackendUrl)) {
        localStorage.removeItem('vail_custom_backend_url');
    }

    // Swap to cloud storage if the user is already signed in
    if (localStorage.getItem('vail_auth_token') && window.CloudStorageController) {
        window._OriginalStorageController = window.StorageController;
        window.StorageController = window.CloudStorageController;
    }
    await window.StorageController.init();
    // Cloud initialization may restore the local controller after an outage or
    // expired token. Initialize that controller before reading its history.
    if (window._OriginalStorageController && window.StorageController === window._OriginalStorageController) {
        await window.StorageController.init();
    }
    const loadedChats = await window.StorageController.getAllChats();
    window.allChats = loadedChats || {};

    // On refresh with existing token, restore cloud profile (pic, name, etc.)
    if (localStorage.getItem('vail_auth_token') && window.StorageController === window.CloudStorageController) {
        try {
            const savedProfile = await window.CloudStorageController.loadProfile();
            if (savedProfile) {
                let changed = false;
                if (savedProfile.userName && savedProfile.userName !== window.settings.userName) { window.settings.userName = savedProfile.userName; changed = true; }
                if (savedProfile.userPic && savedProfile.userPic !== window.settings.userPic) { window.settings.userPic = savedProfile.userPic; changed = true; }
                if (savedProfile.pfpX != null) { window.settings.pfpX = savedProfile.pfpX; changed = true; }
                if (savedProfile.pfpY != null) { window.settings.pfpY = savedProfile.pfpY; changed = true; }
                if (savedProfile.pfpScale != null) { window.settings.pfpScale = savedProfile.pfpScale; changed = true; }
                if (savedProfile.lang) { window.settings.lang = savedProfile.lang; changed = true; }
                if (savedProfile.theme) localStorage.setItem('vail_theme', savedProfile.theme);
                if (savedProfile.systemPrompt != null) { window.settings.systemPrompt = savedProfile.systemPrompt; changed = true; }
                if (Array.isArray(savedProfile.memories) && savedProfile.memories.length) { window.settings.memories = savedProfile.memories; changed = true; }
                if (changed && typeof window.saveSettings === 'function') window.saveSettings();
            }
        } catch (e) {
            console.warn('Failed to load cloud profile on boot:', e);
        }
    }

    try {
        window.initChatUI();
        if (typeof window.AccountModal !== 'undefined') window.AccountModal.init();
        // Landing composer hands off as ?q=; send it once, then drop it so a refresh can't resend.
        const params = new URLSearchParams(window.location.search);
        const handoff = (params.get('q') || '').trim().slice(0, 4000);
        if (handoff) {
            params.delete('q');
            const rest = params.toString();
            history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash);
            window.sendMessage(handoff);
        }
    } catch (e) {
        console.error('Initialization error:', e);
    } finally {
        if (window.hidePreloader) window.hidePreloader();
    }
})();
