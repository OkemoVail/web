// js/kv-context.js — cross-turn KV cache state + cloud persist helpers

(function () {
    // chatId → { loaded: bool, seqLen: int }
    const KV_STATE = new Map();

    function _baseUrl() {
        return (window.APP_STATE && window.APP_STATE.settings.apiUrl) || '';
    }

    function _authHeaders() {
        const key = window.APP_STATE && window.APP_STATE.settings.apiKey;
        return key ? { 'Authorization': `Bearer ${key}` } : {};
    }

    async function saveKVToCloud(chatId) {
        if (!chatId) return;
        try {
            await fetch(`${_baseUrl()}/api/kv_cache/${encodeURIComponent(chatId)}/save`, {
                method: 'POST',
                headers: _authHeaders(),
            });
        } catch (e) {
            console.warn('[kv-context] save failed:', e);
        }
    }

    async function loadKVFromCloud(chatId) {
        if (!chatId) return;
        try {
            const resp = await fetch(
                `${_baseUrl()}/api/kv_cache/${encodeURIComponent(chatId)}/load`,
                { method: 'POST', headers: _authHeaders() }
            );
            if (resp.ok) {
                const data = await resp.json();
                KV_STATE.set(chatId, { loaded: true, seqLen: data.seq_len || 0 });
                _updateBadge(chatId);
            }
        } catch (e) {
            console.warn('[kv-context] load failed:', e);
        }
    }

    async function evictKV(chatId) {
        if (!chatId) return;
        KV_STATE.delete(chatId);
        _updateBadge(null);
        try {
            await fetch(`${_baseUrl()}/api/kv_cache/${encodeURIComponent(chatId)}`, {
                method: 'DELETE',
                headers: _authHeaders(),
            });
        } catch (e) {
            console.warn('[kv-context] evict failed:', e);
        }
    }

    function markCacheHot(chatId, seqLen) {
        KV_STATE.set(chatId, { loaded: true, seqLen });
        _updateBadge(chatId);
    }

    function _updateBadge(chatId) {
        const badge = document.getElementById('kv-cache-badge');
        if (!badge) return;
        const entry = chatId ? KV_STATE.get(chatId) : null;
        if (entry && entry.loaded) {
            badge.style.display = 'inline-flex';
            badge.title = 'Conversation history is pre-loaded — responses skip re-processing prior turns';
            badge.querySelector('.kv-seq').textContent =
                entry.seqLen ? `${entry.seqLen.toLocaleString()} tokens` : '';
        } else {
            badge.style.display = 'none';
        }
    }

    window.KVContext = { saveKVToCloud, loadKVFromCloud, evictKV, markCacheHot, KV_STATE };
})();
