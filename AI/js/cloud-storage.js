// ─── CloudStorageController ─────────────────────────────────────────────────
// Drop-in replacement for StorageController when vail_auth_token is present.
// Exposes identical interface: init, getAllChats, saveChat, deleteChat.

window.CloudStorageController = (() => {
    const base = () => {
        const url = localStorage.getItem('vail_custom_backend_url');
        return (url ? url : 'https://api.okemovail.com').replace(/\/$/, '');
    };

    const authHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('vail_auth_token')}`
    });

    const _handle401 = () => {
        localStorage.removeItem('vail_auth_token');
        if (window._OriginalStorageController) {
            window.StorageController = window._OriginalStorageController;
        }
    };

    const init = async () => {
        const resp = await fetch(`${base()}/api/accounts/me`, { headers: authHeaders() });
        if (resp.status === 401) { _handle401(); return false; }
        return resp.ok;
    };

    const getAllChats = async () => {
        const listResp = await fetch(`${base()}/api/accounts/chats`, { headers: authHeaders() });
        if (listResp.status === 401) { _handle401(); return {}; }
        if (!listResp.ok) return {};
        const list = await listResp.json();
        const map = {};
        await Promise.all(list.map(async (item) => {
            const r = await fetch(`${base()}/api/accounts/chats/${item.id}`, { headers: authHeaders() });
            if (r.ok) map[item.id] = await r.json();
        }));
        return map;
    };

    const saveChat = async (chat) => {
        const resp = await fetch(`${base()}/api/accounts/chats/${chat.id}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ title: chat.title || 'Untitled', payload: chat })
        });
        if (resp.status === 401) { _handle401(); return; }
        if (resp.status === 507) {
            if (typeof window.showToast === 'function') window.showToast('Cloud storage full (1 GB limit reached)');
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

    return { init, getAllChats, saveChat, deleteChat };
})();
