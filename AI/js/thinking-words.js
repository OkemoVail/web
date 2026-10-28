// ─── Thinking Words (model-generated pending label) ────────────
// While a reply is pending, the shimmer label reads short status words that
// Saga writes for this message (Claude-style "Pondering…"). A small parallel
// request asks for three of them; each shimmer pass swaps to the next word at
// the pass boundary, where the highlight is off the text, so the change is
// seamless. After three passes the last word stays and keeps shimmering.

const THINKING_FALLBACK = 'Saga is thinking';
const THINKING_PASSES = 3;
const THINKING_MAX_WORDS = 3;

const THINKING_SYSTEM_PROMPT = `You are Saga writing tiny status labels shown while you work on a reply.
Give exactly 3 different labels for working on the user's message. Each label is 1 word (at most 3), playful but clear, an -ing verb, like: Pondering, Untangling, Brewing ideas.
Match the user's language (Traditional Chinese if they write Chinese). Output the 3 labels separated by commas, nothing else.`;

window.thinkingWords = { words: [], index: 0, passes: 0, jobId: null };

// Letters, marks, spaces, apostrophes and hyphens only: the label is injected
// into render()'s HTML, so nothing markup-shaped may survive.
const cleanThinkingLabel = (raw) => {
    const words = (raw || '')
        .replace(/[^\p{L}\p{M}\s'-]/gu, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, THINKING_MAX_WORDS);
    if (!words.length) return '';
    // Scripts without spaces (Chinese) arrive as one "word"; cap the length.
    const label = words.join(' ').slice(0, 24).trim();
    return label.charAt(0).toUpperCase() + label.slice(1) + '…';
};

window.parseThinkingWords = (raw) => (raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<[^>]*>/g, '')
    .split(/[,\n、，]+/)
    .map(cleanThinkingLabel)
    .filter(Boolean)
    .slice(0, THINKING_PASSES);

window.thinkingLabel = () => {
    const s = window.thinkingWords;
    return s.words[Math.min(s.index, s.words.length - 1)] || THINKING_FALLBACK;
};

const setThinkingText = (el, text) => {
    if (!el || el.textContent === text) return;
    el.textContent = text;
    // A short rise + fade so the swap reads as a change, not a jump.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.webdriver) {
        el.animate(
            [{ opacity: 0, transform: 'translateY(3px)', filter: 'blur(2px)' },
             { opacity: 1, transform: 'none', filter: 'none' }],
            { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
        );
    }
};

window.startThinkingWords = async (userMsg) => {
    const jobId = window.currentJobId;
    window.thinkingWords = { words: [], index: 0, passes: 0, jobId };
    if (!userMsg) return;
    try {
        const baseUrl = await window.getOpenAIClient();
        const response = await fetch(baseUrl + '/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true',
                'bypass-tunnel-reminder': 'true',
                ...(window.settings.apiKey ? { 'Authorization': `Bearer ${window.settings.apiKey.trim()}` } : {})
            },
            body: JSON.stringify({
                model: window.currentModel.id,
                messages: [
                    { role: 'system', content: THINKING_SYSTEM_PROMPT },
                    { role: 'user', content: userMsg.slice(0, 300) }
                ],
                temperature: 0.9,
                seed: window.randomSeed(),
                max_tokens: 24,
                stream: false,
                use_thought: false,
                think: false,
                thinking: false
            })
        });
        if (!response.ok) return;
        const data = await response.json();
        const words = window.parseThinkingWords(data.choices?.[0]?.message?.content);
        // Drop late answers for a job that already moved on.
        if (!words.length || window.thinkingWords.jobId !== jobId) return;
        window.thinkingWords.words = words;
        // Count the three passes from when the words land, not from send.
        window.thinkingWords.passes = 0;
        const el = document.querySelector('.thinking-container .thinking-text-gradient');
        setThinkingText(el, window.thinkingLabel());
    } catch (e) {
        // The fallback label stays; the indicator is cosmetic.
    }
};

// One listener for every render(): render rebuilds the span, so state lives
// on window and each pass boundary advances it.
document.addEventListener('animationiteration', (e) => {
    if (e.animationName !== 'chat-thinking-shimmer') return;
    const el = e.target;
    if (!el.closest?.('.thinking-container')) return;
    const s = window.thinkingWords;
    s.passes++;
    if (s.passes >= THINKING_PASSES || s.index >= s.words.length - 1) return;
    s.index++;
    setThinkingText(el, window.thinkingLabel());
});
