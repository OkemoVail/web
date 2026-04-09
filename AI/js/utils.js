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

window.saveSettings = () => {
    localStorage.setItem('vail_settings_v4', JSON.stringify(window.settings));
    window.updateStorageUsage();
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
