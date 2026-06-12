// ─── Shared State ──────────────────────────────────────────────
// All state that was previously closure-scoped inside the monolithic IIFE
// is now exposed on `window` so every split JS file can read/write it.

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const UNIQUE_SVG_NORTH = `<svg class="w-full h-full stroke-[2px] stroke-current fill-none" viewBox="0 0 24 24"><path d="M12 2V22M2 12H22M19.07 4.93L4.93 19.07M19.07 19.07L4.93 4.93" /><circle cx="12" cy="12" r="3" class="fill-current stroke-none" /></svg>`;
const UNIQUE_SVG_PISCES = `<svg class="w-full h-full stroke-[1.8px] stroke-current fill-none" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12 C8 6,20 6,20 12 C20 18,8 18,8 12 Z"/><path d="M8 12 L3 8 M8 12 L3 16"/></svg>`;

window.CF_BACKEND_URL = 'https://api.okemovail.com';
window.DEFAULT_BACKEND_URL = window.CF_BACKEND_URL;
window.CUSTOM_BACKEND_URL = localStorage.getItem('vail_custom_backend_url') || window.DEFAULT_BACKEND_URL;

window.MODELS = {
    PISCES: { id: "Pisces", name: "Pisces", icon: UNIQUE_SVG_PISCES }
};

window.translations = {
    en: {
        welcome_header: "How can I help you today?",
        new_conversation: "New Chat",
        appearance: "Appearance",
        clear_chats: "Clear chats",
        profile: "Profile",
        settings: "Settings",
        photo: "Upload Photo",
        update: "Update & Save",
        zoom: "Zoom",
        display_name: "Display Name",
        creativity: "Creativity",
        accent: "Accent",
        erase_data: "Erase data",
        search: "Search",
        protocol_stats: "Protocol Stats",
        ui_opt: "UI Optimization",
        opt_1: "Neutral natural borders",
        opt_2: "Intelligence flare shoot-up",
        opt_3: "Equation support strictly via $$ delimiters",
        model_north: "Stuart Reasoning Engine",
        model_stargaze: "Stuart 3B",
        model_fast: "Fast synthesis",
        model_deep: "Deep reasoning",
        onboarding_welcome: "Welcome",
        onboarding_setup: "Profile Setup",
        theme_light: "Light",
        theme_dark: "Dark",
        theme_system: "System",
        onboarding_disclaimer: "Ontologic is a local-first application...",
        onboarding_continue: "Continue",
        onboarding_guest: "Continue as Guest",
        tutorial: "Tutorial",
        onboarding_using: "Using Ontologic",
        onboarding_quickstart: "Quick Start Guide",
        onboarding_prompting: "Prompting",
        onboarding_prompting_desc: "Model is currently in early Alpha stage...",
        onboarding_settings_desc: "You can edit your PFP, name and theme in settings.",
        onboarding_complete: "Complete Setup",
        onboarding_back: "Go Back",
        cat_creative: "Creative",
        cat_visual: "Visual",
        ex_writing: "Sci-Fi Story",
        ex_summary: "Mars Colony",
        ex_code: "Python Scraper",
        ex_inspiration: "Stoic Wisdom",
        input_placeholder: "What do you want to know?",
        reply_placeholder: "Reply to {{model}}...",
        thinking: "Hmmmm...",
        terminated: "Stopped",
        no_history: "No recent history.",
        prompt_error: "⚠️ Service error, tell okemo: ",
        welcome_back: "How can I help you today, ",
        storage_used: "Storage Used:",
        pinned_header: "Pinned",
        today_header: "Today",
        yesterday_header: "Yesterday",
        last_week_header: "Previous 7 Days",
        dust_collecting_header: "Dust Collecting",
        language: "Language",
        thought_btn: "Think",
        ob_sign_in: "Sign In",
        ob_register: "Register",
        ob_email: "Email",
        ph_email: "you@example.com",
        ob_password: "Password",
        ob_confirm_password: "Confirm Password",
        ob_perk_storage: "Free 1GB storage will be provided",
        ob_welcome_back: "Welcome back",
        ob_create_account: "Create account",
        ob_err_req: "Email and password required",
        ob_err_match: "Passwords do not match"
    ,

        auth_settings: "Log in via Settings",
        research_btn: "Research",
        try_voidai: "Try VoidAI",
        btn_profile: "Profile",
        storage_empty: "Storage: —",
        btn_personality: "Personality",
        btn_updates: "Updates",
        btn_files: "Files",
        btn_search: "Search",
        btn_think: "Think",
        btn_canvas: "Canvas",
        model_stuart: "Stuart",
        model_stuart_1_2b: "Stuart",
        model_local_pretraining: "Local Pretraining",
        model_octan_1_2b: "Pisces",
        model_exp_moe: "Okemi model",
        octan_hallucination_warn: "Pisces models are prone to hallucinations.",
        live_preview: "Live Preview",
        code_editor: "Code Editor",
        settings_user: "User",
        settings_appearance: "Appearance",
        settings_mode: "Mode",
        settings_accent_theme: "Accent Theme",
        settings_custom: "+ Custom",
        settings_storage: "Storage",
        storage_chat_history: "Chat History",
        storage_indexeddb: "IndexedDB",
        btn_clear_all_chats: "Clear All Chats",
        btn_clear: "Clear",
        settings_avatar: "Avatar",
        zoom_1x: "1.0x",
        zoom_0_5x: "0.5x",
        zoom_3x: "3.0x",
        settings_account: "Account",
        google_account: "Google Account",
        not_connected: "Not connected",
        settings_model_params: "Model Parameters",
        param_temp: "Temperature",
        param_top_p: "Top-P",
        param_max_tokens: "Max Tokens",
        settings_system_prompt: "System Prompt",
        settings_connection: "Connection",
        backend_url: "Backend URL",
        backend_url_desc: "Leave empty to use default. Reloads on change.",
        api_key: "API Key",
        api_key_desc: "Your secret API key for Polaris access.",
        danger_zone: "Danger Zone",
        deep_research_title: "Deep Research",
        deep_research_desc: "Synthesize information from across the web with unparalleled depth and reasoning.",
        system_prompt_desc: "Pick a preset or write your own. Leave empty for the default Pisces persona.",
        settings_gender: "Gender",
        gender_female: "Female",
        gender_male: "Male",
        gender_none: "None",
        btn_cancel: "Cancel",
        btn_save: "Save",
        whats_new: "What's New",
        build_version: "Build 1003",
        btn_dismiss: "Dismiss",
        ph_name_alias: "Name or Alias",
        title_collapse_sidebar: "Collapse sidebar",
        ph_search_chats: "Search chats...",
        title_clear_chats: "Clear all chats",
        title_rename_chat: "Rename Chat",
        title_regenerate_title: "Regenerate Title",
        title_good_format: "Good title format",
        title_bad_format: "Bad title format",
        ph_type_something: "Type something...",
        title_download_code: "Download Code",
        title_close_canvas: "Close Canvas",
        ph_your_name: "Your Name",
        ph_default_prompt: "Default: You are Pisces, a helper. Use $$ for math notation...",
        ph_url_default: "https://... (leave empty for default)",
        ph_api_key: "OKMO-...",
        ph_research: "What do you want to research...",
        ph_octan_helper: "You are Pisces, a helpful AI assistant made by OkemoVail...",
},
    zh: {
        welcome_header: "今天我能幫你什麼？",
        new_conversation: "新對話",
        appearance: "外觀",
        clear_chats: "清除對話",
        profile: "個人資料",
        settings: "設定",
        photo: "上傳照片",
        update: "更新與儲存",
        zoom: "縮放",
        display_name: "顯示名稱",
        creativity: "創造力",
        accent: "強調色",
        erase_data: "清除資料",
        search: "搜尋",
        protocol_stats: "協定統計",
        ui_opt: "介面最佳化",
        opt_1: "自然中性邊框",
        opt_2: "智慧光暈效果",
        opt_3: "僅透過 $$ 支援數學公式",
        model_north: "Stuart 推理引擎",
        model_stargaze: "Stuart 3B",
        model_fast: "快速合成",
        model_deep: "深度推理",
        onboarding_welcome: "歡迎",
        onboarding_setup: "個人資料設定",
        theme_light: "亮色",
        theme_dark: "暗色",
        theme_system: "系統",
        onboarding_disclaimer: "Ontologic 是一個本地優先的應用程式...",
        onboarding_continue: "繼續",
        onboarding_guest: "以訪客身分繼續",
        tutorial: "教學",
        onboarding_using: "使用 Ontologic",
        onboarding_quickstart: "快速入門指南",
        onboarding_prompting: "提示技巧",
        onboarding_prompting_desc: "模型目前處於早期 Alpha 階段...",
        onboarding_settings_desc: "您可以在設定中編輯頭像、名稱和主題。",
        onboarding_complete: "完成設定",
        onboarding_back: "返回",
        cat_creative: "創意",
        cat_visual: "視覺",
        ex_writing: "科幻故事",
        ex_summary: "火星殖民地",
        ex_code: "Python 爬蟲",
        ex_inspiration: "斯多葛智慧",
        input_placeholder: "你想知道什麼？",
        reply_placeholder: "回覆 {{model}}...",
        thinking: "思考中...",
        terminated: "已停止",
        no_history: "沒有最近的歷史紀錄。",
        prompt_error: "⚠️ 服務錯誤，請通知 okemo：",
        welcome_back: "今天我能幫你什麼，",
        storage_used: "已用儲存空間：",
        pinned_header: "已釘選",
        today_header: "今天",
        yesterday_header: "昨天",
        last_week_header: "過去 7 天",
        dust_collecting_header: "積灰塵",
        language: "語言",
        thought_btn: "思考",
        ob_sign_in: "登入",
        ob_register: "註冊",
        ob_email: "電子郵件",
        ph_email: "you@example.com",
        ob_password: "密碼",
        ob_confirm_password: "確認密碼",
        ob_perk_storage: "將提供免費 1GB 儲存空間",
        ob_welcome_back: "歡迎回來",
        ob_create_account: "建立帳號",
        ob_err_req: "需要電子郵件和密碼",
        ob_err_match: "密碼不一致"
    ,

        auth_settings: "透過設定登入",
        research_btn: "研究",
        try_voidai: "嘗試 VoidAI",
        btn_profile: "個人資料",
        storage_empty: "儲存空間：—",
        btn_personality: "個性",
        btn_updates: "更新",
        btn_files: "檔案",
        btn_search: "搜尋",
        btn_think: "思考",
        btn_canvas: "畫布",
        model_stuart: "Stuart",
        model_stuart_1_2b: "Stuart 1.2B",
        model_local_pretraining: "本機預先訓練 · 1.2B",
        model_octan_1_2b: "Pisces",
        model_exp_moe: "Okemi 模型",
        octan_hallucination_warn: "Pisces 模型容易產生幻覺。",
        live_preview: "即時預覽",
        code_editor: "程式碼編輯器",
        settings_user: "使用者",
        settings_appearance: "外觀",
        settings_mode: "模式",
        settings_accent_theme: "強調色主題",
        settings_custom: "+ 自訂",
        settings_storage: "儲存空間",
        storage_chat_history: "對話紀錄",
        storage_indexeddb: "IndexedDB",
        btn_clear_all_chats: "清除所有對話",
        btn_clear: "清除",
        settings_avatar: "頭像",
        zoom_1x: "1.0x",
        zoom_0_5x: "0.5x",
        zoom_3x: "3.0x",
        settings_account: "帳號",
        google_account: "Google 帳號",
        not_connected: "未連結",
        settings_model_params: "模型參數",
        param_temp: "Temperature",
        param_top_p: "Top-P",
        param_max_tokens: "Max Tokens",
        settings_system_prompt: "系統提示",
        settings_connection: "連線",
        backend_url: "後端網址",
        backend_url_desc: "留空以使用預設值。變更後將重新載入。",
        api_key: "API 密鑰",
        api_key_desc: "用於存取 Polaris 的秘密 API 密鑰。",
        danger_zone: "危險區域",
        deep_research_title: "深入研究",
        deep_research_desc: "以無與倫比的深度與推理能力，綜合網路上的資訊。",
        system_prompt_desc: "選擇預設值或自行編寫。留空則使用預設的 Pisces 角色。",
        settings_gender: "性別",
        gender_female: "女性",
        gender_male: "男性",
        gender_none: "無",
        btn_cancel: "取消",
        btn_save: "儲存",
        whats_new: "最新消息",
        build_version: "Build 1003",
        btn_dismiss: "關閉",
        ph_name_alias: "名稱或別名",
        title_collapse_sidebar: "收合側邊欄",
        ph_search_chats: "搜尋對話...",
        title_clear_chats: "清除所有對話",
        title_rename_chat: "重新命名對話",
        title_regenerate_title: "重新生成標題",
        title_good_format: "標題格式良好",
        title_bad_format: "標題格式不佳",
        ph_type_something: "輸入訊息...",
        title_download_code: "下載程式碼",
        title_close_canvas: "關閉畫布",
        ph_your_name: "你的名字",
        ph_default_prompt: "預設：你是 Pisces，一個助手。使用 $$ 標示數學符號...",
        ph_url_default: "https://... (留空以使用預設值)",
        ph_api_key: "OKMO-...",
        ph_research: "你想研究什麼...",
        ph_octan_helper: "你是 Pisces，由 OkemoVail 製作的實用 AI 助手...",
}
};

window.GOOGLE_CLIENT_ID = '937870221827-2l21bkkuhn0uo7nsco258484duv29rag.apps.googleusercontent.com';
window.googleAccessToken = localStorage.getItem('google_access_token') || null;
window.googleDriveFolderId = localStorage.getItem('google_drive_folder_id') || null;
window.isGoogleSignedIn = !!window.googleAccessToken;

window.settings = JSON.parse(localStorage.getItem('vail_settings_v4') || JSON.stringify({
    temp: 0.5,
    top_p: 0.9,
    rep_pen: 1.3,
    max_tokens: 512,
    apiKey: '',
    accent: '#c96478', userName: '', userPic: '',
    pfpX: 0, pfpY: 0, pfpScale: 1.0, hasCompletedTutorial: false,
    lang: 'en',
    sidebarMode: 'manual',
    customAccents: [],
    folders: [],
    systemPrompt: '',
    gender: ''
}));
// userPic is stored separately to avoid exceeding the localStorage quota
if (!window.settings.userPic) {
    const savedPic = localStorage.getItem('vail_user_pic');
    if (savedPic) window.settings.userPic = savedPic;
}

if (typeof window.settings.gender !== 'string') window.settings.gender = '';

if (!Array.isArray(window.settings.folders)) window.settings.folders = [];
if (!Array.isArray(window.settings.customAccents)) window.settings.customAccents = [];
if (!Array.isArray(window.settings.memories)) window.settings.memories = [];

window.els = {};

window.client = null;
window.chatHistory = [];
window.isGenerating = false;
window.currentJob = null;
window.abortController = null;
window.currentModel = window.MODELS.PISCES;
window.allChats = {};
window.currentChatId = crypto.randomUUID();

window.streamQueue = "";
window.typedResponseText = "";
window.typeInterval = null;
window.charAccu = 0;
window.TYPE_SPEED_MAIN = 80;
window.TYPE_SPEED_THOUGHT = 200;

window.currentGenerationIsSearch = false;
window.currentJobId = null;

window.isWebSearch = false;
window.isThinkingEnabled = false;
window.isDeepResearch = false;

window.tokenClient = null;

// Early stubs
window.resetChat = () => console.warn("Chat not ready");
window.sendMessage = () => console.warn("Chat not ready");
window.handleAction = () => console.warn("Action not ready");
window.toggleSettingsPanel = () => console.warn("Settings not ready");
