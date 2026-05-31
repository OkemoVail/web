// ─── Utility Helpers ───────────────────────────────────────────
// Small, pure helper functions used across many modules.

window.sanitizeText = (t) => (t || '').replace(/<\|im_(?:start|end)(?:[|>\s]*)/g, '')
    .replace(/<\|endoftext\|?>/g, '')
    .replace(/\ufffd/g, '')
    .replace(/^hi\s+/i, '')
    .trim();

window.ensureClosedCodeBlocks = (t) => {
    const count = (t.match(/```/g) || []).length;
    if (count % 2 !== 0) return t + '\n```';
    return t;
};

window.hexToRgba = (hex, alpha) => {
    if (hex.startsWith('rgba')) return hex;
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

let _storageUpdateDebounceTimer = null;
window.saveSettings = () => {
    // userPic is a base64 data URL that can be several MB — store it separately
    // so the main settings blob never exceeds the localStorage quota.
    const { userPic, ...slim } = window.settings;
    try {
        localStorage.setItem('vail_settings_v4', JSON.stringify(slim));
        if (userPic) localStorage.setItem('vail_user_pic', userPic);
        else localStorage.removeItem('vail_user_pic');
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.warn('saveSettings: quota exceeded, attempting minimal save', e);
            try {
                localStorage.setItem('vail_settings_v4', JSON.stringify({ ...slim, memories: [], customAccents: [] }));
            } catch (e2) {
                console.error('saveSettings: quota exceeded on minimal save', e2);
            }
        } else {
            throw e;
        }
    }
    // Debounce storage display updates — cloud mode makes an API call, local mode
    // re-reads IndexedDB; neither needs to run on every keystroke or pfp drag tick.
    clearTimeout(_storageUpdateDebounceTimer);
    _storageUpdateDebounceTimer = setTimeout(() => window.updateStorageUsage(), 2000);
};

window.truncateTitle = (title) => {
    if (!title) return "";
    if (window.innerWidth >= 1024) {
        const words = title.split(/\s+/);
        if (words.length > 5) {
            return words.slice(0, 5).join(' ') + '...';
        }
    }
    return title;
};

window.formatDate = (ts) => {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
