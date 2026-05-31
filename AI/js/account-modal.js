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

    const setTab = (tab) => {
        const emailActive = tab === 'email';
        $('tab-email').className = `flex-1 py-1.5 text-sm rounded-lg font-medium ${
            emailActive
            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200'
            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300'
        }`;
        $('tab-google').className = `flex-1 py-1.5 text-sm rounded-lg font-medium ${
            !emailActive
            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200'
            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300'
        }`;
        $('panel-email').classList.toggle('hidden', !emailActive);
        $('panel-google').classList.toggle('hidden', emailActive);
    };

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
        const btn = $('sign-in-btn');
        const info = $('account-info');
        if (!btn) return;
        if (token) {
            btn.textContent = 'Sign Out';
            fetch(`${base()}/api/accounts/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.ok ? r.json() : null).then(d => {
                if (d && info) {
                    const mb = (d.storage_used_bytes / 1048576).toFixed(1);
                    info.textContent = `${d.email} · ${mb} MB used`;
                }
            }).catch(() => {});
        } else {
            btn.textContent = 'Sign In';
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

    const initGoogleCloudSignIn = () => {
        const btn = $('google-cloud-signin');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const _prev = window.onGoogleSignIn;
            window.onGoogleSignIn = async (googleUser) => {
                window.onGoogleSignIn = _prev;
                const id_token = googleUser.credential
                    || googleUser?.getAuthResponse?.()?.id_token;
                if (!id_token) { $('google-error').textContent = 'Could not get Google token'; return; }
                try {
                    const resp = await fetch(`${base()}/api/accounts/google-auth`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id_token })
                    });
                    const data = await resp.json();
                    if (!resp.ok) { $('google-error').textContent = data.detail || 'Error'; return; }
                    await onLogin(data.token);
                } catch (e) {
                    $('google-error').textContent = 'Network error';
                }
            };
            if (typeof google !== 'undefined' && google.accounts) {
                google.accounts.id.prompt();
            } else {
                $('google-error').textContent = 'Google sign-in not available';
            }
        });
    };

    const init = () => {
        $('sign-in-btn')?.addEventListener('click', handleSignInOut);
        $('modal-close')?.addEventListener('click', hideModal);
        $('tab-email')?.addEventListener('click', () => setTab('email'));
        $('tab-google')?.addEventListener('click', () => setTab('google'));
        $('mode-login')?.addEventListener('click', () => setMode('login'));
        $('mode-register')?.addEventListener('click', () => setMode('register'));
        $('email-submit')?.addEventListener('click', submitEmail);
        initGoogleCloudSignIn();
        updateSidebar();
    };

    return { init, showModal, hideModal, updateSidebar, onLogin };
})();
