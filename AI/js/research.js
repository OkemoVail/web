// ─── Research Page ─────────────────────────────────────────────

window.openResearchPage = () => {
    const overlay = document.getElementById('research-page-overlay');
    if (overlay) overlay.classList.add('active');
};

window.closeResearchPage = () => {
    const overlay = document.getElementById('research-page-overlay');
    if (overlay) overlay.classList.remove('active');
};

window.startResearch = () => {
    const rinp = document.getElementById('research-input');
    const query = rinp ? rinp.value.trim() : "";
    if (!query) return;
    window.closeResearchPage();
    if (rinp) rinp.value = "";
    window.sendMessage("/search " + query);
};

window.factoryReset = async () => {
    await window.StorageController.clearAll();
    localStorage.clear();
    window.location.reload();
};
