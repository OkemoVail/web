// ─── AccountModal ────────────────────────────────────────────────────────────

window.AccountModal = (() => {
    const base = () => {
        const url = localStorage.getItem('vail_custom_backend_url');
        return (url ? url : 'https://api.okemovail.com').replace(/\/$/, '');
    };

    let _mode = 'login';

    const $ = (id) => document.getElementById(id);

    const showModal = () => $('account-modal').classList.remove('hidden');
    const hideModal = () => $('account-modal').classList.add('hidden');



    const setMode = (mode) => {
        _mode = mode;
        $('email-submit').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
        $('mode-login').className = `flex-1 py-1 text-xs rounded ${
            mode === 'login'
            ? 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200 font-medium'
            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`;
        $('mode-register').className = `flex-1 py-1 text-xs rounded ${
            mode === 'register'
            ? 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200 font-medium'
            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`;
    };

    const updateSidebar = () => {
        const token = localStorage.getItem('vail_auth_token');
        const btnText = $('sign-in-text');
        const info = $('account-info');
        if (!btnText) return;
        if (token) {
            btnText.textContent = 'Sign Out';
            fetch(`${base()}/api/accounts/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.ok ? r.json() : null).then(d => {
                if (d && info) {
                    const mb = (d.storage_used_bytes / 1048576).toFixed(1);
                    info.textContent = `${d.email} · ${mb} MB / 1 GB used - Cloud`;
                    
                    let changed = false;
                    if (d.username && d.username !== window.settings.userName) {
                        window.settings.userName = d.username;
                        changed = true;
                    }
                    if (d.profile_pic && d.profile_pic !== window.settings.userPic) {
                        window.settings.userPic = d.profile_pic;
                        changed = true;
                    }
                    if (changed) {
                        if (typeof window.saveSettings === 'function') window.saveSettings();
                        if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
                    }
                }
            }).catch(() => {});
        } else {
            btnText.textContent = 'Sign In';
            if (info) info.textContent = '';
        }
    };

    const onLogin = async (token) => {
        localStorage.setItem('vail_auth_token', token);
        hideModal();
        updateSidebar();
        if (window._OriginalStorageController === undefined) {
            window._OriginalStorageController = window.StorageController;
        }
        window.StorageController = window.CloudStorageController;
        await window.StorageController.init();
        if (typeof window.loadAllChats === 'function') await window.loadAllChats();
        if (typeof window.render === 'function') window.render();
    };

    const submitEmail = async () => {
        const email = $('email-input').value.trim();
        const password = $('password-input').value;
        const errEl = $('email-error');
        errEl.textContent = '';
        if (!email || !password) { errEl.textContent = 'Email and password required'; return; }
        const endpoint = _mode === 'login' ? 'login' : 'register';
        try {
            const resp = await fetch(`${base()}/api/accounts/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await resp.json();
            if (!resp.ok) { errEl.textContent = data.detail || 'Error'; return; }
            await onLogin(data.token);
        } catch (e) {
            errEl.textContent = 'Network error';
        }
    };

    const handleSignInOut = () => {
        const token = localStorage.getItem('vail_auth_token');
        if (token) {
            fetch(`${base()}/api/accounts/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            }).finally(() => {
                localStorage.removeItem('vail_auth_token');
                if (window._OriginalStorageController) {
                    window.StorageController = window._OriginalStorageController;
                }
                updateSidebar();
            });
        } else {
            showModal();
        }
    };



    const init = () => {
        $('sign-in-btn')?.addEventListener('click', handleSignInOut);
        $('modal-close')?.addEventListener('click', hideModal);
        $('mode-login')?.addEventListener('click', () => setMode('login'));
        $('mode-register')?.addEventListener('click', () => setMode('register'));
        $('email-submit')?.addEventListener('click', submitEmail);
        updateSidebar();
    };

    return { init, showModal, hideModal, updateSidebar, onLogin };
})();

window.syncProfileToCloud = async () => {
    const token = localStorage.getItem('vail_auth_token');
    if (!token) return;
    const url = localStorage.getItem('vail_custom_backend_url');
    const base = (url ? url : 'https://api.okemovail.com').replace(/\/$/, '');
    
    const indicator = document.getElementById('cloud-sync-indicator');
    if (indicator) {
        indicator.classList.remove('hidden');
        indicator.classList.add('flex');
        indicator.innerHTML = '<i data-feather="refresh-cw" class="w-4 h-4 animate-spin"></i>';
        if (window.feather) window.feather.replace();
    }
    
    try {
        const resp = await fetch(`${base}/api/accounts/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                username: window.settings.userName || null,
                profile_pic: window.settings.userPic || null
            })
        });
        
        if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
        if (indicator) {
            indicator.innerHTML = '<i data-feather="check" class="w-4 h-4 text-green-500"></i>';
            if (window.feather) window.feather.replace();
            setTimeout(() => {
                indicator.classList.add('hidden');
                indicator.classList.remove('flex');
            }, 2000);
        }
    } catch (e) {
        console.error('Failed to sync profile to cloud', e);
        if (indicator) {
            indicator.innerHTML = '<i data-feather="x" class="w-4 h-4 text-red-500"></i>';
            if (window.feather) window.feather.replace();
            setTimeout(() => {
                indicator.classList.add('hidden');
                indicator.classList.remove('flex');
            }, 2000);
        }
    }
};
