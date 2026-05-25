// ─── Shared State ──────────────────────────────────────────────
// All state that was previously closure-scoped inside the monolithic IIFE
// is now exposed on `window` so every split JS file can read/write it.

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const UNIQUE_SVG_NORTH = `<svg class="w-full h-full stroke-[2px] stroke-current fill-none" viewBox="0 0 24 24"><path d="M12 2V22M2 12H22M19.07 4.93L4.93 19.07M19.07 19.07L4.93 4.93" /><circle cx="12" cy="12" r="3" class="fill-current stroke-none" /></svg>`;
const UNIQUE_SVG_OCTAN = `<svg class="w-full h-full stroke-[1.8px] stroke-current fill-none" viewBox="0 0 24 24" stroke-linecap="round"><path d="M12 12 C9.5 9.5,8 4,12 3 C16 4,14.5 9.5,12 12 Z"/><path d="M12 12 C14.5 9.5,20 8,21 12 C20 16,14.5 14.5,12 12 Z"/><path d="M12 12 C14.5 14.5,16 20,12 21 C8 20,9.5 14.5,12 12 Z"/><path d="M12 12 C9.5 14.5,4 16,3 12 C4 8,9.5 9.5,12 12 Z"/><circle cx="12" cy="12" r="2" class="fill-current stroke-none"/></svg>`;

window.CF_BACKEND_URL = 'https://api.okemovail.com';
window.DEFAULT_BACKEND_URL = window.CF_BACKEND_URL;
window.CUSTOM_BACKEND_URL = localStorage.getItem('vail_custom_backend_url') || window.DEFAULT_BACKEND_URL;

window.MODELS = {
    STUART: { id: "Stuart-1.2B", name: "Stuart", icon: UNIQUE_SVG_NORTH },
    OCTAN: { id: "Octan-1.2B", name: "Octan", icon: UNIQUE_SVG_OCTAN }
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
        input_placeholder: "Message {{model}}...",
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
        thought_btn: "Think"
    },
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

if (typeof window.settings.gender !== 'string') window.settings.gender = '';

if (!Array.isArray(window.settings.folders)) window.settings.folders = [];
if (!Array.isArray(window.settings.customAccents)) window.settings.customAccents = [];

window.els = {};

window.client = null;
window.chatHistory = [];
window.isGenerating = false;
window.currentJob = null;
window.abortController = null;
window.currentModel = window.MODELS.OCTAN;
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
