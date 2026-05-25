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
    window.canvasEnabled = false;

    // 1. Generate random greeting
    const welcomeName = (window.settings.userName && window.settings.userName !== 'Guest') ? window.settings.userName : null;
    const isGuest = !welcomeName;
    const name = welcomeName || 'Guest';
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    let options = isGuest ? ['Hi Guest.'] : [
        'Back at it!', 'Cookie and Oaky time', 'Greetings, whoever you are',
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
            if (window.showToast) window.showToast("Create an account to unlock personalization and full features.");
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
    if (window.els.input) {
        window.els.input.oninput = () => {
            window.els.input.style.height = 'auto';
            const newHeight = Math.min(window.els.input.scrollHeight, 600);
            window.els.input.style.height = newHeight + 'px';
            window.updateUI();
        };
        window.els.input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.handleAction();
            }
        };
    }

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
    window.updateGoogleAuthButton();
    window.selectModel('OCTAN');
    window.render();
    window.updateUI();
    window.checkChangelog();
};

// --- INITIALIZATION ---
(async function boot() {
    await window.StorageController.init();
    const loadedChats = await window.StorageController.getAllChats();
    window.allChats = loadedChats || {};

    // Auto-detect tunnel URL
    try {
        const baseUrl = await window.getOpenAIClient();
        const res = await fetch(baseUrl + '/tunnel_url', {
            headers: window.settings.apiKey ? { "Authorization": `Bearer ${window.settings.apiKey.trim()}` } : {}
        });
        if (res.ok) {
            const data = await res.json();
            if (data.tunnel_url && data.tunnel_url !== baseUrl) {
                localStorage.setItem('vail_custom_backend_url', data.tunnel_url);
            }
        }
    } catch (e) {
        console.warn('Failed to detect tunnel URL:', e);
    }

    try {
        window.initChatUI();
    } catch (e) {
        console.error('Initialization error:', e);
    } finally {
        if (window.hidePreloader) window.hidePreloader();
    }
})();
