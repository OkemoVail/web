// ─── Google Auth & Drive Sync ──────────────────────────────────

window.initGoogleAuth = async () => {
    if (window.isGoogleSignedIn) {
        window.googleAccessToken = null;
        window.googleDriveFolderId = null;
        window.isGoogleSignedIn = false;
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_drive_folder_id');
        window.updateGoogleAuthButton();
        console.log('Signed out from Google');

        if (window.googleAccessToken) {
            google.accounts.oauth2.revoke(window.googleAccessToken, () => { console.log('Token revoked') });
        }
    } else {
        const btn = document.getElementById('google-auth-btn');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('opacity-70', 'cursor-not-allowed');
        }

        if (!window.tokenClient) {
            window.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: window.GOOGLE_CLIENT_ID,
                scope: 'https://www.googleapis.com/auth/drive.file profile email',
                callback: window.handleGoogleSignIn
            });
        }
        window.tokenClient.requestAccessToken();
    }
};

window.initGoogleAuthOnboarding = async () => {
    const btn = document.getElementById('google-auth-btn-onboarding');
    const spinner = document.getElementById('google-spinner-onboarding');
    const content = document.getElementById('google-btn-content-onboarding');

    if (btn) btn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    if (content) content.classList.add('opacity-0');

    if (!window.tokenClient) {
        window.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: window.GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file profile email',
            callback: (resp) => {
                if (btn) btn.disabled = false;
                if (spinner) spinner.classList.add('hidden');
                if (content) content.classList.remove('opacity-0');
                window.handleGoogleSignIn(resp);
            }
        });
    }
    window.tokenClient.requestAccessToken();

    setTimeout(() => {
        if (btn && btn.disabled) {
            btn.disabled = false;
            if (spinner) spinner.classList.add('hidden');
            if (content) content.classList.remove('opacity-0');
        }
    }, 10000);
};

window.handleGoogleSignIn = async (tokenResponse) => {
    const btn = document.getElementById('google-auth-btn');
    if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
    }

    if (tokenResponse && tokenResponse.access_token) {
        window.googleAccessToken = tokenResponse.access_token;
        try {
            window.googleAccessToken = tokenResponse.access_token;
            window.isGoogleSignedIn = true;

            const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${window.googleAccessToken}` }
            }).then(res => res.json());

            if (userInfo) {
                window.settings.userName = userInfo.name || window.settings.userName;

                if (userInfo.picture) {
                    try {
                        const picResp = await fetch(userInfo.picture);
                        const blob = await picResp.blob();
                        window.settings.userPic = await new Promise(res => {
                            const r = new FileReader();
                            r.onload = () => res(r.result);
                            r.readAsDataURL(blob);
                        });
                    } catch {
                        window.settings.userPic = userInfo.picture;
                    }
                }
            }

            window.saveSettings();
            window.updateProfileUI();
            window.updateGoogleAuthButton();

            const onboardingEl = document.getElementById('onboarding-overlay');
            const isOnboarding = onboardingEl && !onboardingEl.classList.contains('hidden');
            if (isOnboarding) {
                const preview = document.getElementById('onboarding-pfp-preview');
                if (preview && window.settings.userPic) preview.innerHTML = `<img src="${window.settings.userPic}" class="w-full h-full object-cover">`;
                const nameInput = document.getElementById('onboarding-name');
                if (nameInput) nameInput.value = window.settings.userName;

                const googlePfp = document.getElementById('google-pfp-onboarding');
                if (googlePfp && window.settings.userPic) {
                    googlePfp.src = window.settings.userPic;
                    googlePfp.classList.remove('hidden');
                }
                const btnText = document.getElementById('google-btn-text-onboarding');
                if (btnText) btnText.innerHTML = `Signed in as ${window.settings.userName}`;

                setTimeout(() => window.finalizeOnboarding(), 800);
            }

            const loadGapi = () => new Promise((resolve) => {
                if (typeof gapi === 'undefined') { resolve(); return; }
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            apiKey: 'AIzaSyDWRLN1WkR2YQc0U2OMUSUSF1RMYGDq5-A',
                            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                        });
                        gapi.client.setToken({ access_token: window.googleAccessToken });
                        await window.ensureGoogleDriveFolder();
                        await window.loadChatsFromGoogle();
                        await window.syncChatsToGoogle();
                        console.log('Drive sync complete for:', window.settings.userName);
                    } catch (driveErr) {
                        console.error('Drive Sync Error:', driveErr);
                    }
                    resolve();
                });
            });
            loadGapi();

        } catch (error) {
            console.error('Error handling Google Sign-In:', error);
        }
    }
};

window.ensureGoogleDriveFolder = async () => {
    try {
        if (window.googleDriveFolderId) return;

        const response = await gapi.client.drive.files.list({
            q: "name='Ontologic-Chats' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            spaces: 'drive',
            fields: 'files(id, name)'
        });

        if (response.result.files && response.result.files.length > 0) {
            window.googleDriveFolderId = response.result.files[0].id;
            localStorage.setItem('google_drive_folder_id', window.googleDriveFolderId);
        } else {
            const createResponse = await gapi.client.drive.files.create({
                resource: { name: 'Ontologic-Chats', mimeType: 'application/vnd.google-apps.folder' },
                fields: 'id'
            });
            window.googleDriveFolderId = createResponse.result.id;
            localStorage.setItem('google_drive_folder_id', window.googleDriveFolderId);
        }
    } catch (error) {
        console.error('Error ensuring Google Drive folder:', error);
    }
};

window.loadChatsFromGoogle = async () => {
    if (!window.isGoogleSignedIn || !window.googleDriveFolderId) return;
    try {
        const listResponse = await gapi.client.drive.files.list({
            q: `name='ontologic_backup.json' and '${window.googleDriveFolderId}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id)'
        });

        if (listResponse.result.files && listResponse.result.files.length > 0) {
            const fileId = listResponse.result.files[0].id;
            const response = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media' });

            const remoteData = response.result;
            if (remoteData && remoteData.chats) {
                let merged = false;
                const remoteChatKeys = Object.keys(remoteData.chats);

                for (let i = 0; i < remoteChatKeys.length; i += 50) {
                    const chunkKeys = remoteChatKeys.slice(i, i + 50);
                    for (const chatId of chunkKeys) {
                        if (!window.allChats[chatId] || remoteData.chats[chatId].timestamp > (window.allChats[chatId].timestamp || 0)) {
                            window.allChats[chatId] = remoteData.chats[chatId];
                            merged = true;
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 0));
                }

                if (merged) {
                    const localChatKeys = Object.keys(window.allChats);
                    for (let i = 0; i < localChatKeys.length; i += 50) {
                        const chunkKeys = localChatKeys.slice(i, i + 50);
                        for (const chatId of chunkKeys) {
                            await window.StorageController.saveChat(window.allChats[chatId]);
                        }
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }

                    if (typeof requestAnimationFrame === 'function') {
                        requestAnimationFrame(() => { window.renderHistory(); window.render(); });
                    } else {
                        window.renderHistory(); window.render();
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error loading chats from Google Drive:', error);
    }
};

window.syncChatsToGoogle = async () => {
    if (!window.isGoogleSignedIn || !window.googleDriveFolderId) return;

    try {
        const timestamp = new Date().toISOString();
        await new Promise(resolve => setTimeout(resolve, 10));

        const fileContent = JSON.stringify({
            chats: window.allChats,
            settings: window.settings,
            syncTime: timestamp
        });

        const blob = new Blob([fileContent], { type: 'application/json' });

        const listResponse = await gapi.client.drive.files.list({
            q: `name='ontologic_backup.json' and '${window.googleDriveFolderId}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id)'
        });

        if (listResponse.result.files && listResponse.result.files.length > 0) {
            const fileId = listResponse.result.files[0].id;
            await gapi.client.drive.files.update({ fileId: fileId, media: blob });
        } else {
            await gapi.client.drive.files.create({
                resource: { name: 'ontologic_backup.json', parents: [window.googleDriveFolderId], mimeType: 'application/json' },
                media: blob
            });
        }
        console.log('Synced chats to Google Drive');
    } catch (error) {
        console.error('Error syncing chats to Google Drive:', error);
    }
};

window.deleteChatsFromGoogle = async () => {
    if (!window.isGoogleSignedIn || !window.googleDriveFolderId) return;
    try {
        const listResponse = await gapi.client.drive.files.list({
            q: `'${window.googleDriveFolderId}' in parents and trashed=false`,
            spaces: 'drive',
            fields: 'files(id)'
        });

        if (listResponse.result.files) {
            for (const file of listResponse.result.files) {
                await gapi.client.drive.files.delete({ fileId: file.id });
            }
        }
        console.log('Deleted all chats from Google Drive');
    } catch (error) {
        console.error('Error deleting chats from Google Drive:', error);
    }
};

window.updateGoogleAuthButton = () => {
    const statusText = document.getElementById('google-status-text');
    if (statusText) {
        statusText.innerText = window.isGoogleSignedIn ? 'Connected' : 'Not connected';
        statusText.className = window.isGoogleSignedIn ? 'text-xs text-green-500' : 'text-xs text-zinc-400';
    }

    const inputAccountStatus = document.getElementById('input-account-status');
    const inputGooglePfp = document.getElementById('input-google-pfp');
    const inputGoogleName = document.getElementById('input-google-name');
    const inputSyncStatus = document.getElementById('input-sync-status');

    if (inputAccountStatus) {
        if (window.isGoogleSignedIn) {
            inputAccountStatus.classList.remove('hidden');
            inputAccountStatus.classList.add('flex');
            if (inputGooglePfp && window.settings.userPic) {
                inputGooglePfp.src = window.settings.userPic;
                inputGooglePfp.classList.remove('hidden');
            }
            if (inputGoogleName) inputGoogleName.innerText = (window.settings.userName || 'User').split(' ')[0];
            if (inputSyncStatus) inputSyncStatus.className = 'w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
        } else {
            inputAccountStatus.classList.add('hidden');
            inputAccountStatus.classList.remove('flex');
        }
    }

    const onboardingBtnText = document.getElementById('google-btn-text-onboarding');
    const googlePfp = document.getElementById('google-pfp-onboarding');
    if (onboardingBtnText) {
        if (window.isGoogleSignedIn) {
            onboardingBtnText.innerHTML = `Signed in as ${window.settings.userName || 'User'}`;
            if (googlePfp && window.settings.userPic) {
                googlePfp.src = window.settings.userPic;
                googlePfp.classList.remove('hidden');
            }
        } else {
            onboardingBtnText.innerHTML = '<i class="fa-brands fa-google mr-2"></i>Continue with Google';
            if (googlePfp) googlePfp.classList.add('hidden');
        }
    }
};
