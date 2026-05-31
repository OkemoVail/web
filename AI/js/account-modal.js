// ─── AccountModal ────────────────────────────────────────────────────────────

window.AccountModal = (() => {
    const base = () => {
        const url = localStorage.getItem('vail_custom_backend_url');
        return (url ? url : 'https://api.okemovail.com').replace(/\/$/, '');
    };

    let _mode = 'login';
    let _pendingEmail = null;

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
        const clearCloudRow = $('clear-cloud-data-row');
        if (token) {
            btnText.textContent = 'Sign Out';
            if (clearCloudRow) clearCloudRow.classList.remove('hidden');
            fetch(`${base()}/api/accounts/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.ok ? r.json() : null).then(d => {
                if (d && info) {
                    const mb = (d.storage_used_bytes / 1048576).toFixed(1);
                    const cloudSvg = window.feather?.icons?.cloud?.toSvg({ class: 'inline w-3 h-3 -mt-0.5' }) || '☁';
                    info.innerHTML = `${d.email} · ${mb} MB / 1 GB used - O${cloudSvg}`;
                    
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
            if (clearCloudRow) clearCloudRow.classList.add('hidden');
        }
    };

    // ── Settings modal verify panel ───────────────────────────────────────────
    const _showVerifyPanel = (email) => {
        _pendingEmail = email;
        const lbl = $('verify-email-label');
        if (lbl) lbl.textContent = `We sent a 6-digit code to ${email}`;
        $('panel-email')?.classList.add('hidden');
        const vp = $('panel-verify');
        if (vp) vp.classList.remove('hidden');
        setTimeout(() => { const inp = $('verify-code-input'); if (inp) { inp.value = ''; inp.focus(); } }, 50);
    };

    const _cancelVerify = () => {
        _pendingEmail = null;
        $('panel-verify')?.classList.add('hidden');
        $('panel-email')?.classList.remove('hidden');
        const errEl = $('verify-error');
        if (errEl) errEl.textContent = '';
    };

    const _submitVerification = async () => {
        const code = ($('verify-code-input')?.value || '').replace(/\s/g, '');
        const errEl = $('verify-error');
        const btn = $('verify-submit-btn');
        if (errEl) errEl.textContent = '';
        if (!code || code.length !== 6) {
            if (errEl) errEl.textContent = 'Enter the 6-digit code from your email.';
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
        try {
            const resp = await fetch(`${base()}/api/accounts/verify-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: _pendingEmail, code })
            });
            const data = await resp.json();
            if (!resp.ok) { if (errEl) errEl.textContent = data.detail || 'Invalid or expired code.'; return; }
            const email = _pendingEmail;
            _pendingEmail = null;
            _cancelVerify();
            await onLogin(data.token);
        } catch (e) {
            if (errEl) errEl.textContent = 'Network error. Please try again.';
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Verify Email'; }
        }
    };

    // ── Onboarding verify panel ───────────────────────────────────────────────
    const _showObVerifyPanel = (email) => {
        _pendingEmail = email;
        const lbl = $('ob-verify-email-label');
        if (lbl) lbl.textContent = email;
        const submitBtn = $('ob-auth-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.35'; submitBtn.style.pointerEvents = 'none'; }
        const sec = $('ob-verify-section');
        if (sec) sec.classList.remove('hidden');
        setTimeout(() => { const inp = $('ob-verify-code-input'); if (inp) { inp.value = ''; inp.focus(); } }, 50);
    };

    const _cancelObVerify = () => {
        _pendingEmail = null;
        $('ob-verify-section')?.classList.add('hidden');
        const errEl = $('ob-verify-error');
        if (errEl) errEl.textContent = '';
        const submitBtn = $('ob-auth-submit');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ''; submitBtn.style.pointerEvents = ''; }
    };

    const _submitObVerification = async () => {
        const code = ($('ob-verify-code-input')?.value || '').replace(/\s/g, '');
        const errEl = $('ob-verify-error');
        const btn = $('ob-verify-submit-btn');
        if (errEl) errEl.textContent = '';
        if (!code || code.length !== 6) {
            if (errEl) errEl.textContent = 'Enter the 6-digit code from your email.';
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
        try {
            const resp = await fetch(`${base()}/api/accounts/verify-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: _pendingEmail, code })
            });
            const data = await resp.json();
            if (!resp.ok) { if (errEl) errEl.textContent = data.detail || 'Invalid or expired code.'; return; }
            _pendingEmail = null;
            $('ob-verify-section')?.classList.add('hidden');
            await onLogin(data.token);
            const nameInput = $('onboarding-name');
            const name = nameInput?.value.trim();
            if (name) window.settings.userName = name;
            if (typeof window.finalizeOnboarding === 'function') window.finalizeOnboarding();
        } catch (e) {
            if (errEl) errEl.textContent = 'Network error. Please try again.';
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Verify Email'; }
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

        // Restore profile (including picture) from cloud storage
        const savedProfile = await window.CloudStorageController.loadProfile();
        if (savedProfile) {
            let changed = false;
            if (savedProfile.userName && savedProfile.userName !== window.settings.userName) {
                window.settings.userName = savedProfile.userName; changed = true;
            }
            if (savedProfile.userPic && savedProfile.userPic !== window.settings.userPic) {
                window.settings.userPic = savedProfile.userPic; changed = true;
            }
            if (savedProfile.pfpX != null) { window.settings.pfpX = savedProfile.pfpX; changed = true; }
            if (savedProfile.pfpY != null) { window.settings.pfpY = savedProfile.pfpY; changed = true; }
            if (savedProfile.pfpScale != null) { window.settings.pfpScale = savedProfile.pfpScale; changed = true; }
            if (savedProfile.lang) { window.settings.lang = savedProfile.lang; changed = true; }
            if (savedProfile.theme) { localStorage.setItem('vail_theme', savedProfile.theme); if (typeof window.setTheme === 'function') window.setTheme(savedProfile.theme); }
            if (savedProfile.systemPrompt != null) { window.settings.systemPrompt = savedProfile.systemPrompt; changed = true; }
            if (Array.isArray(savedProfile.memories) && savedProfile.memories.length) { window.settings.memories = savedProfile.memories; changed = true; }
            if (changed) {
                if (typeof window.saveSettings === 'function') window.saveSettings();
                if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
            }
        }

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
            if (_mode === 'register') {
                _showVerifyPanel(email);
            } else {
                await onLogin(data.token);
            }
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
                const chevron = $('sign-in-chevron');
                if (chevron) chevron.style.transform = '';
                $('settings-inline-auth')?.classList.add('hidden');
                $('settings-inline-auth')?.classList.remove('flex');
            });
        } else {
            const authDiv = $('settings-inline-auth');
            const chevron = $('sign-in-chevron');
            if (authDiv) {
                authDiv.classList.toggle('hidden');
                authDiv.classList.toggle('flex');
                if (!authDiv.classList.contains('hidden')) {
                    if (chevron) chevron.style.transform = 'rotate(90deg)';
                    $('st-email-input')?.focus();
                } else {
                    if (chevron) chevron.style.transform = '';
                }
            } else {
                showModal();
            }
        }
    };



    /* ── Onboarding inline auth ──────────────────────────────────── */
    let _obMode = 'login';

    const setObMode = (mode) => {
        _obMode = mode;
        const loginBtn = $('ob-mode-login');
        const regBtn = $('ob-mode-register');
        const submitBtn = $('ob-auth-submit');
        const perkEl = $('ob-register-perk');
        const headingEl = $('ob-auth-heading');
        const confirmPwSection = $('ob-confirm-password-section');
        if (!loginBtn || !regBtn) return;

        if (mode === 'login') {
            loginBtn.className = 'flex-1 flex items-center justify-center min-h-[36px] rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm';
            regBtn.className = 'flex-1 flex items-center justify-center min-h-[36px] rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300';
            if (submitBtn) submitBtn.querySelector('span').textContent = window.getT('ob_sign_in');
            if (perkEl) perkEl.classList.add('hidden');
            if (headingEl) headingEl.textContent = window.getT('ob_welcome_back');
            if (confirmPwSection) confirmPwSection.classList.add('hidden');
        } else {
            regBtn.className = 'flex-1 flex items-center justify-center min-h-[36px] rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm';
            loginBtn.className = 'flex-1 flex items-center justify-center min-h-[36px] rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300';
            if (submitBtn) submitBtn.querySelector('span').textContent = window.getT('ob_create_account');
            if (perkEl) {
                perkEl.classList.remove('hidden');
                if (window.feather) window.feather.replace();
            }
            if (headingEl) headingEl.textContent = window.getT('ob_create_account');
            if (confirmPwSection) confirmPwSection.classList.remove('hidden');
        }
    };

    const submitObAuth = async () => {
        const email = $('ob-email-input')?.value.trim();
        const password = $('ob-password-input')?.value;
        const confirmPw = $('ob-confirm-password-input')?.value;
        const errEl = $('ob-auth-error');
        const submitBtn = $('ob-auth-submit');
        if (errEl) errEl.textContent = '';

        if (!email || !password) {
            if (errEl) errEl.textContent = window.getT('ob_err_req');
            return;
        }

        if (_obMode === 'register' && password !== confirmPw) {
            if (errEl) errEl.textContent = window.getT('ob_err_match');
            return;
        }

        let originalBtnContent = '';
        // Loading state
        if (submitBtn) {
            originalBtnContent = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
            submitBtn.style.pointerEvents = 'none';
            const loadingText = _obMode === 'login' ? 'Signing in' : 'Creating account';
            submitBtn.innerHTML = `<span>${loadingText}</span> <i data-feather="loader" class="w-4 h-4 animate-spin"></i>`;
            if (window.feather) window.feather.replace();
        }

        const endpoint = _obMode === 'login' ? 'login' : 'register';
        try {
            const resp = await fetch(`${base()}/api/accounts/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await resp.json();
            if (!resp.ok) {
                if (errEl) errEl.textContent = data.detail || 'Error';
                return;
            }
            if (_obMode === 'register') {
                // Registration — backend sends verification email; show code input
                _showObVerifyPanel(email);
            } else {
                // Login — log in and finalize onboarding
                await onLogin(data.token);
                const nameInput = document.getElementById('onboarding-name');
                const name = nameInput?.value.trim();
                if (name) window.settings.userName = name;
                if (typeof window.finalizeOnboarding === 'function') window.finalizeOnboarding();
            }
        } catch (e) {
            if (errEl) errEl.textContent = 'Network error';
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '';
                submitBtn.style.pointerEvents = '';
                if (originalBtnContent) submitBtn.innerHTML = originalBtnContent;
                if (window.feather) window.feather.replace();
            }
        }
    };

    const toggleObPwVisibility = () => {
        const input = $('ob-password-input');
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        // Swap icon
        const iconEl = $('ob-pw-eye-icon');
        if (iconEl) {
            iconEl.setAttribute('data-feather', isHidden ? 'eye-off' : 'eye');
            if (window.feather) window.feather.replace();
        }
    };

    const toggleObConfirmPwVisibility = () => {
        const input = $('ob-confirm-password-input');
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        // Swap icon
        const iconEl = $('ob-confirm-pw-eye-icon');
        if (iconEl) {
            iconEl.setAttribute('data-feather', isHidden ? 'eye-off' : 'eye');
            if (window.feather) window.feather.replace();
        }
    };

    // Expose to window for inline onclick handlers
    window.setOnboardingAuthMode = setObMode;
    window.submitOnboardingAuth = submitObAuth;
    window.toggleObPasswordVisibility = toggleObPwVisibility;
    window.toggleObConfirmPasswordVisibility = toggleObConfirmPwVisibility;

    /* ── Settings inline auth ──────────────────────────────────── */
    let _stMode = 'login';

    const setStMode = (mode) => {
        _stMode = mode;
        const loginBtn = $('st-mode-login');
        const regBtn = $('st-mode-register');
        const submitBtn = $('st-auth-submit');
        const confirmPwSection = $('st-confirm-password-section');
        if (!loginBtn || !regBtn) return;

        if (mode === 'login') {
            loginBtn.className = 'flex-1 flex items-center justify-center min-h-[36px] rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm';
            regBtn.className = 'flex-1 flex items-center justify-center min-h-[36px] rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300';
            if (submitBtn) submitBtn.querySelector('span').textContent = window.getT('ob_sign_in') || 'Sign In';
            if (confirmPwSection) confirmPwSection.classList.add('hidden');
        } else {
            regBtn.className = 'flex-1 flex items-center justify-center min-h-[36px] rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm';
            loginBtn.className = 'flex-1 flex items-center justify-center min-h-[36px] rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300';
            if (submitBtn) submitBtn.querySelector('span').textContent = window.getT('ob_create_account') || 'Create Account';
            if (confirmPwSection) confirmPwSection.classList.remove('hidden');
        }
    };

    const _showStVerifyPanel = (email) => {
        _pendingEmail = email;
        const lbl = $('st-verify-email-label');
        if (lbl) lbl.textContent = email;
        const submitBtn = $('st-auth-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.35'; submitBtn.style.pointerEvents = 'none'; }
        
        $('st-auth-form')?.classList.add('hidden');
        const sec = $('st-verify-section');
        if (sec) sec.classList.remove('hidden');
        setTimeout(() => { const inp = $('st-verify-code-input'); if (inp) { inp.value = ''; inp.focus(); } }, 50);
    };

    const _cancelStVerify = () => {
        _pendingEmail = null;
        $('st-verify-section')?.classList.add('hidden');
        $('st-auth-form')?.classList.remove('hidden');
        const errEl = $('st-verify-error');
        if (errEl) errEl.textContent = '';
        const submitBtn = $('st-auth-submit');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ''; submitBtn.style.pointerEvents = ''; }
    };

    const submitStVerification = async () => {
        const code = ($('st-verify-code-input')?.value || '').replace(/\s/g, '');
        const errEl = $('st-verify-error');
        const btn = $('st-verify-submit-btn');
        if (errEl) errEl.textContent = '';
        if (!code || code.length !== 6) {
            if (errEl) errEl.textContent = 'Enter the 6-digit code from your email.';
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
        try {
            const resp = await fetch(`${base()}/api/accounts/verify-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: _pendingEmail, code })
            });
            const data = await resp.json();
            if (!resp.ok) { if (errEl) errEl.textContent = data.detail || 'Invalid or expired code.'; return; }
            _pendingEmail = null;
            $('st-verify-section')?.classList.add('hidden');
            $('st-auth-form')?.classList.remove('hidden');
            
            // hide auth section completely
            $('settings-inline-auth')?.classList.add('hidden');
            $('settings-inline-auth')?.classList.remove('flex');
            const chevron = $('sign-in-chevron');
            if (chevron) chevron.style.transform = '';
            
            await onLogin(data.token);
        } catch (e) {
            if (errEl) errEl.textContent = 'Network error. Please try again.';
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Verify Email'; }
        }
    };

    const submitStAuth = async () => {
        const email = $('st-email-input')?.value.trim();
        const password = $('st-password-input')?.value;
        const confirmPw = $('st-confirm-password-input')?.value;
        const errEl = $('st-auth-error');
        const submitBtn = $('st-auth-submit');
        if (errEl) errEl.textContent = '';

        if (!email || !password) {
            if (errEl) errEl.textContent = window.getT('ob_err_req') || 'Email and password required';
            return;
        }

        if (_stMode === 'register' && password !== confirmPw) {
            if (errEl) errEl.textContent = window.getT('ob_err_match') || 'Passwords do not match';
            return;
        }

        let originalBtnContent = '';
        if (submitBtn) {
            originalBtnContent = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
            submitBtn.style.pointerEvents = 'none';
            const loadingText = _stMode === 'login' ? 'Signing in' : 'Creating account';
            submitBtn.innerHTML = `<span>${loadingText}</span> <i data-feather="loader" class="w-4 h-4 animate-spin"></i>`;
            if (window.feather) window.feather.replace();
        }

        const endpoint = _stMode === 'login' ? 'login' : 'register';
        try {
            const resp = await fetch(`${base()}/api/accounts/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await resp.json();
            if (!resp.ok) {
                if (errEl) errEl.textContent = data.detail || 'Error';
                return;
            }
            if (_stMode === 'register') {
                _showStVerifyPanel(email);
            } else {
                $('settings-inline-auth')?.classList.add('hidden');
                $('settings-inline-auth')?.classList.remove('flex');
                const chevron = $('sign-in-chevron');
                if (chevron) chevron.style.transform = '';

                await onLogin(data.token);
            }
        } catch (e) {
            if (errEl) errEl.textContent = 'Network error';
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '';
                submitBtn.style.pointerEvents = '';
                if (originalBtnContent) submitBtn.innerHTML = originalBtnContent;
                if (window.feather) window.feather.replace();
            }
        }
    };

    const toggleStPwVisibility = () => {
        const input = $('st-password-input');
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        const iconEl = $('st-pw-eye-icon');
        if (iconEl) {
            iconEl.setAttribute('data-feather', isHidden ? 'eye-off' : 'eye');
            if (window.feather) window.feather.replace();
        }
    };

    const toggleStConfirmPwVisibility = () => {
        const input = $('st-confirm-password-input');
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        const iconEl = $('st-confirm-pw-eye-icon');
        if (iconEl) {
            iconEl.setAttribute('data-feather', isHidden ? 'eye-off' : 'eye');
            if (window.feather) window.feather.replace();
        }
    };

    window.setSettingsAuthMode = setStMode;
    window.submitSettingsAuth = submitStAuth;
    window.toggleStPasswordVisibility = toggleStPwVisibility;
    window.toggleStConfirmPasswordVisibility = toggleStConfirmPwVisibility;
    window.submitStVerification = submitStVerification;
    window.cancelStVerify = _cancelStVerify;

    const init = () => {
        $('sign-in-btn')?.addEventListener('click', handleSignInOut);
        $('modal-close')?.addEventListener('click', hideModal);
        $('mode-login')?.addEventListener('click', () => setMode('login'));
        $('mode-register')?.addEventListener('click', () => setMode('register'));
        $('email-submit')?.addEventListener('click', submitEmail);
        updateSidebar();
    };

    return { init, showModal, hideModal, updateSidebar, onLogin, _submitVerification, _cancelVerify, _submitObVerification, _cancelObVerify };
})();

window.clearAllCloudData = async () => {
    const token = localStorage.getItem('vail_auth_token');
    if (!token) return;
    if (!confirm('Delete ALL cloud data? This includes all synced chats and your cloud profile. This cannot be undone.')) return;

    const _base = () => {
        const url = localStorage.getItem('vail_custom_backend_url');
        return (url ? url : 'https://api.okemovail.com').replace(/\/$/, '');
    };
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

    try {
        const listResp = await fetch(`${_base()}/api/accounts/chats`, { headers });
        if (!listResp.ok) throw new Error('Failed to list chats');
        const list = await listResp.json();
        await Promise.all(list.map(item =>
            fetch(`${_base()}/api/accounts/chats/${item.id}`, { method: 'DELETE', headers })
        ));
        if (typeof window.showToast === 'function') window.showToast('Cloud data cleared');
        if (typeof window.AccountModal !== 'undefined') window.AccountModal.updateSidebar();
    } catch (e) {
        console.error('Failed to clear cloud data:', e);
        if (typeof window.showToast === 'function') window.showToast('Failed to clear cloud data');
    }
};

window.syncProfileToCloud = async () => {
    const token = localStorage.getItem('vail_auth_token');
    if (!token) return;

    const indicator = document.getElementById('cloud-sync-indicator');
    if (indicator) {
        indicator.classList.remove('hidden');
        indicator.classList.add('flex');
        indicator.innerHTML = '<i data-feather="refresh-cw" class="w-4 h-4 animate-spin"></i>';
        if (window.feather) window.feather.replace();
    }

    try {
        const profileData = {
            userName: window.settings.userName || null,
            userPic: window.settings.userPic || null,
            pfpX: window.settings.pfpX || 0,
            pfpY: window.settings.pfpY || 0,
            pfpScale: window.settings.pfpScale || 1.0,
            lang: window.settings.lang || 'en',
            theme: localStorage.getItem('vail_theme') || 'system',
            systemPrompt: window.settings.systemPrompt || null,
            memories: window.settings.memories || []
        };
        const ok = await window.CloudStorageController.saveProfile(profileData);
        if (!ok) throw new Error('saveProfile returned false');

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
