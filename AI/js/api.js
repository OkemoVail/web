// ─── API Clients ───────────────────────────────────────────────

window.getOpenAIClient = async () => {
    const origin = window.location.origin;
    const isLocal = origin.includes('localhost:8001') || origin.includes('127.0.0.1:8001');
    const isTunnel = origin.includes('api.okemovail.com');
    const baseUrl = (isLocal || isTunnel) ? origin : 'https://api.okemovail.com';
    console.log('Using backend URL:', baseUrl);
    return baseUrl;
};

window.getGradioClient = async () => {
    if (window.client) return window.client;
    const { Client } = await import("https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js");
    window.client = await Client.connect(window.currentModel.id, {
        headers: {
            "ngrok-skip-browser-warning": "true",
            "bypass-tunnel-reminder": "true",
            "Bypass-Tunnel-Reminder": "true"
        }
    });
    return window.client;
};

window.debugConnection = async () => {
    const url = window.currentModel.id + "/config";
    console.log("Testing connection to config:", url);
    try {
        const res = await fetch(url);
        console.log("Config fetch Status:", res.status);
        const text = await res.text();
        console.log("Config response preview:", text.substring(0, 100));
        if (res.ok) alert("Connection Successful! Check console for details.");
        else alert("Connection Failed with status: " + res.status);
    } catch (e) {
        console.error("Connection Debug Error:", e);
        alert("Connection Failed: " + e.message);
    }
};
