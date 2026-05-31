// ─── StorageController ─────────────────────────────────────────
// IndexedDB-backed storage with session-only fallback.

window.StorageController = (() => {
    const DB_NAME = 'Stuart_db';
    const DB_VERSION = 1;
    const STORE_CHATS = 'chats';
    let db = null;
    let _sessionOnly = false;
    let _sessionCache = {};

    const openDB = () => new Promise((resolve, reject) => {
        if (db) { resolve(db); return; }
        try {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const idb = e.target.result;
                if (!idb.objectStoreNames.contains(STORE_CHATS)) {
                    idb.createObjectStore(STORE_CHATS, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => { db = e.target.result; resolve(db); };
            req.onerror = (e) => reject(e.target.error);
        } catch (err) {
            reject(err);
        }
    });

    const init = async () => {
        try {
            await openDB();
            _sessionOnly = false;
            const badge = document.getElementById('storage-mode-badge');
            if (badge) badge.textContent = 'IndexedDB (persistent)';
        } catch (err) {
            console.warn('[StorageController] IndexedDB unavailable, using session-only mode:', err);
            _sessionOnly = true;
            const badge = document.getElementById('storage-mode-badge');
            if (badge) badge.textContent = 'Session-Only (private mode)';
        }
    };

    const getAllChats = async () => {
        if (_sessionOnly) return { ..._sessionCache };
        try {
            const idb = await openDB();
            return new Promise((resolve, reject) => {
                const map = {};
                const tx = idb.transaction(STORE_CHATS, 'readonly');
                const store = tx.objectStore(STORE_CHATS);
                const req = store.openCursor();
                let count = 0;

                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        map[cursor.value.id] = cursor.value;
                        count++;

                        cursor.continue();
                    } else {
                        resolve(map);
                    }
                };
                req.onerror = () => reject(req.error);
            });
        } catch (err) {
            console.error('[StorageController] getAllChats error:', err);
            return {};
        }
    };

    const saveChat = async (chat) => {
        if (_sessionOnly) { _sessionCache[chat.id] = chat; return; }
        try {
            const idb = await openDB();
            return new Promise((resolve, reject) => {
                const tx = idb.transaction(STORE_CHATS, 'readwrite');
                tx.objectStore(STORE_CHATS).put(chat);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        } catch (err) {
            console.error('[StorageController] saveChat error:', err);
        }
    };

    const deleteChat = async (id) => {
        if (_sessionOnly) { delete _sessionCache[id]; return; }
        try {
            const idb = await openDB();
            return new Promise((resolve, reject) => {
                const tx = idb.transaction(STORE_CHATS, 'readwrite');
                tx.objectStore(STORE_CHATS).delete(id);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        } catch (err) {
            console.error('[StorageController] deleteChat error:', err);
        }
    };

    const clearAll = async () => {
        if (_sessionOnly) { _sessionCache = {}; return; }
        try {
            const idb = await openDB();
            return new Promise((resolve, reject) => {
                const tx = idb.transaction(STORE_CHATS, 'readwrite');
                tx.objectStore(STORE_CHATS).clear();
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        } catch (err) {
            console.error('[StorageController] clearAll error:', err);
        }
    };

    const estimateSize = async () => {
        try {
            // Measure only this app's localStorage keys (UTF-16: 2 bytes per char)
            const lsKeys = ['vail_settings_v4', 'vail_custom_backend_url', 'vail_theme',
                'vail_last_seen_build', 'vail_remote_build', 'vail_remote_changelog'];
            let bytes = lsKeys.reduce((acc, k) => {
                const v = localStorage.getItem(k);
                return acc + (v ? (k.length + v.length) * 2 : 0);
            }, 0);

            if (_sessionOnly) {
                bytes += new Blob([JSON.stringify(_sessionCache)]).size;
            } else {
                const chats = await getAllChats();
                bytes += new Blob([JSON.stringify(chats)]).size;
            }
            return bytes;
        } catch { return 0; }
    };

    return { init, getAllChats, saveChat, deleteChat, clearAll, estimateSize, isSessionOnly: () => _sessionOnly };
})();
