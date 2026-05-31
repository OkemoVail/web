// ─── Profile & Onboarding ──────────────────────────────────────

window.applyMovableStyles = () => {
    if (window.els.pfpMovableImg) window.els.pfpMovableImg.style.transform = `translate(-50%, -50%) translate(${window.settings.pfpX}px, ${window.settings.pfpY}px) scale(${window.settings.pfpScale})`;
};

window.pfpDragStart = (e) => {
    let startX = e.clientX - (window.settings.pfpX || 0), startY = e.clientY - (window.settings.pfpY || 0);
    window.els.pfpWorkspace.setPointerCapture(e.pointerId);
    const onPointerMove = (ev) => {
        window.settings.pfpX = ev.clientX - startX; window.settings.pfpY = ev.clientY - startY;
        window.applyMovableStyles(); window.updateProfileUI();
    };
    const onPointerUp = () => {
        window.els.pfpWorkspace.removeEventListener('pointermove', onPointerMove);
        window.els.pfpWorkspace.removeEventListener('pointerup', onPointerUp);
        window.saveSettings();
    };
    window.els.pfpWorkspace.addEventListener('pointermove', onPointerMove);
    window.els.pfpWorkspace.addEventListener('pointerup', onPointerUp);
};

window.updatePfpScale = (val) => {
    window.settings.pfpScale = parseFloat(val);
    const label = document.getElementById('scale-val');
    if (label) label.innerText = window.settings.pfpScale.toFixed(1) + 'x';
    window.applyMovableStyles(); window.saveSettings(); window.updateProfileUI();
};

window.resetPfpPosition = () => {
    window.settings.pfpX = 0;
    window.settings.pfpY = 0;
    window.settings.pfpScale = 1.0;

    const slider = document.getElementById('pfp-zoom-slider');
    if (slider) slider.value = "1.0";
    const label = document.getElementById('scale-val');
    if (label) label.innerText = "1.0x";

    window.applyMovableStyles();
    window.saveSettings();
    window.updateProfileUI();
};

window.handleProfilePicUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        window.settings.userPic = event.target.result;
        window.settings.pfpX = 0; window.settings.pfpY = 0; window.settings.pfpScale = 1.0;
        window.saveSettings(); window.els.pfpMovableImg.src = window.settings.userPic;
        window.applyMovableStyles(); window.updateProfileUI();
        if (typeof window.syncProfileToCloud === 'function') window.syncProfileToCloud();
    };
    reader.readAsDataURL(file);
};

window.handleOnboardingPfp = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        window.settings.userPic = ev.target.result;
        document.getElementById('onboarding-pfp-preview').innerHTML = `<img src="${window.settings.userPic}" class="w-full h-full object-cover">`;
        window.updateProfileUI();
    };
    reader.readAsDataURL(file);
};

window.continueAsGuest = () => {
    window.settings.userName = "Guest";
    window.settings.userPic = "";
    window.updateProfileUI();
    window.finalizeOnboarding();
};

window.completeOnboarding = () => {
    const nameInput = document.getElementById('onboarding-name');
    const name = nameInput.value.trim();
    if (!name) {
        nameInput.classList.add('border-red-500');
        return;
    }
    window.settings.userName = name;
    window.updateProfileUI();
    if (typeof window.syncProfileToCloud === 'function') window.syncProfileToCloud();
    window.finalizeOnboarding();
};

window.goToSettingsLogin = () => {
    if (window.els.onboarding) {
        window.els.onboarding.classList.add('hidden');
        document.body.classList.remove('onboarding-active');
    }
    window.toggleSettingsPanel();
    window.openSettingsTab('profile');
};

window.finalizeOnboarding = () => {
    window.settings.hasCompletedTutorial = true;
    window.saveSettings();
    window.els.onboarding.style.opacity = '0';
    setTimeout(() => {
        window.els.onboarding.classList.add('hidden');
        document.body.classList.remove('onboarding-active');
        window.updateProfileUI();
        window.render();
    }, 400);
};

window.updateProfileUI = () => {
    const currentName = window.settings.userName || "Guest";
    const dict = window.translations[window.settings.lang || 'en'];
    if (window.els.sidebarName) window.els.sidebarName.innerText = currentName === "Guest" ? (dict.onboarding_guest) : currentName;

    const renderAvatar = (targetEl, size, isHighRes) => {
        if (!targetEl) return;
        if (window.settings.userPic) {
            const ratio = size / 280, scale = window.settings.pfpScale || 1.0;
            const tx = (window.settings.pfpX || 0) * ratio, ty = (window.settings.pfpY || 0) * ratio;

            targetEl.innerHTML = `<div class="relative overflow-hidden rounded-full bg-black" style="width:100%;height:100%;"><img src="${window.settings.userPic}" class="absolute left-1/2 top-1/2" style="max-width:none; height:${size}px; transform: translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale});"></div>`;
        } else {
            targetEl.className = `w-full h-full rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center relative overflow-hidden`;
            if (!isHighRes) {
                targetEl.style.width = size + 'px';
                targetEl.style.height = size + 'px';
            }
            targetEl.style.padding = '5px';
            targetEl.innerHTML = typeof UNIQUE_SVG_PISCES !== 'undefined'
                ? UNIQUE_SVG_PISCES
                : currentName[0].toUpperCase();
        }
    };

    renderAvatar(window.els.avatarDisplay, 32);
    renderAvatar(window.els.miniAvatarDisplay, 32);

    const settingsNameInput = document.getElementById('settings-name-input-new');
    if (settingsNameInput) {
        settingsNameInput.value = window.settings.userName || '';
    }

    const sidebarCardName = document.getElementById('settings-sidebar-name-card');
    if (sidebarCardName) sidebarCardName.innerText = currentName;

    const sidebarCardPfp = document.getElementById('settings-sidebar-pfp-card');
    if (sidebarCardPfp) renderAvatar(sidebarCardPfp, 48, true);



    if (window.renderThemes) window.renderThemes();
};
