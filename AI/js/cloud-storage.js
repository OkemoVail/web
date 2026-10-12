// ─── CloudStorageController ─────────────────────────────────────────────────
// Drop-in replacement for StorageController when vail_auth_token is present.
// Exposes identical interface: init, getAllChats, saveChat, deleteChat.
// Profile (including profile picture) is stored as a reserved chat document.

window.CloudStorageController = (() => {
    const PROFILE_DOC_ID = '__vail_profile__';

    const base = () => {
        const url = localStorage.getItem('vail_custom_backend_url');
        return (url ? url : 'https://api.okemovail.com').replace(/\/$/, '');
    };

    const authHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('vail_auth_token')}`
    });

    // Cloud storage must never be allowed to hold the whole chat app hostage.
    // A stalled account request is recoverable: the local controller can still
    // render the UI and preserve new work for this session.
    const request = (url, options = {}) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1200);
        return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
    };

    const _handle401 = () => {
        localStorage.removeItem('vail_auth_token');
        if (window._OriginalStorageController) {
            window.StorageController = window._OriginalStorageController;
        }
    };

    const init = async () => {
        try {
            const resp = await request(`${base()}/api/accounts/me`, { headers: authHeaders() });
            if (resp.status === 401) { _handle401(); return false; }
            if (!resp.ok && window._OriginalStorageController) window.StorageController = window._OriginalStorageController;
            return resp.ok;
        } catch (error) {
            console.warn('[CloudStorage] Startup request timed out; using local storage.', error);
            if (window._OriginalStorageController) window.StorageController = window._OriginalStorageController;
            return false;
        }
    };

    const getAllChats = async () => {
        let listResp;
        try { listResp = await request(`${base()}/api/accounts/chats`, { headers: authHeaders() }); }
        catch { return {}; }
        if (listResp.status === 401) { _handle401(); return {}; }
        if (!listResp.ok) return {};
        const list = await listResp.json();
        const map = {};
        await Promise.all(list
            .filter(item => item.id !== PROFILE_DOC_ID)
            .map(async (item) => {
                try {
                    const r = await request(`${base()}/api/accounts/chats/${item.id}`, { headers: authHeaders() });
                    if (r.ok) map[item.id] = await r.json();
                } catch (error) {
                    console.warn('[CloudStorage] Could not load chat:', item.id, error);
                }
            }));
        return map;
    };

    const saveProfile = async (profileData) => {
        const resp = await fetch(`${base()}/api/accounts/chats/${PROFILE_DOC_ID}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ title: PROFILE_DOC_ID, payload: profileData })
        });
        if (resp.status === 401) { _handle401(); return false; }
        return resp.ok;
    };

    const loadProfile = async () => {
        const resp = await request(`${base()}/api/accounts/chats/${PROFILE_DOC_ID}`, { headers: authHeaders() });
        if (resp.status === 401) { _handle401(); return null; }
        if (!resp.ok) return null;
        const data = await resp.json();
        return data || null;
    };

    const saveChat = async (chat) => {
        const resp = await fetch(`${base()}/api/accounts/chats/${chat.id}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ title: chat.title || 'Untitled', payload: chat })
        });
        if (resp.status === 401) { _handle401(); return; }
        if (resp.status === 507) {
            if (typeof window.showToast === 'function') window.showToast('OCloud storage full (1 GB limit reached)');
            else console.warn('[CloudStorage] Storage full');
        }
    };

    const deleteChat = async (id) => {
        const resp = await fetch(`${base()}/api/accounts/chats/${id}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        if (resp.status === 401) _handle401();
    };

    const estimateSize = async () => {
        const resp = await fetch(`${base()}/api/accounts/me`, { headers: authHeaders() });
        if (resp.status === 401) { _handle401(); return 0; }
        if (resp.ok) {
            const data = await resp.json();
            return data.storage_used_bytes || 0;
        }
        return 0;
    };

    return { init, getAllChats, saveChat, deleteChat, estimateSize, saveProfile, loadProfile };
})();
