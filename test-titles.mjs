// test-titles.mjs — node harness for chat title generation (no browser needed).
// Usage:
//   node test-titles.mjs              → unit checks (digest, cadence, generation flow)
//   node test-titles.mjs --live [url] → fire real title requests (default http://127.0.0.1:8001)
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert';

const code = fs.readFileSync(new URL('./AI/js/chat-management.js', import.meta.url), 'utf8');

function loadModule(overrides = {}) {
    const window = {};
    const ctx = vm.createContext({
        window,
        console,
        fetch: overrides.fetch || (async () => { throw new Error('fetch not stubbed'); }),
    });
    vm.runInContext(code, ctx);
    return window;
}

// ── buildTitleDigest ──
{
    const w = loadModule();
    const hist = [];
    for (let i = 1; i <= 12; i++) {
        hist.push([`question ${i} about ${i === 1 ? 'css centering' : 'docker'}`, `<think>secret ${i}</think> answer ${i}`, null]);
    }
    const d = w.buildTitleDigest(hist);
    assert(d.includes('question 1 about css centering'), 'keeps first message');
    assert(d.includes('question 12'), 'keeps latest turn');
    assert(!d.includes('secret'), 'strips think tags');
    assert(!/<think>/.test(d), 'no think tags in output');
    assert(d.length <= 900, `under budget (${d.length})`);
    assert.strictEqual(w.buildTitleDigest([]), '', 'empty history → empty digest');
    assert.strictEqual(w.buildTitleDigest([[null, null, null]]), '', 'non-string pair skipped');

    const long = [];
    for (let i = 1; i <= 8; i++) long.push([`q${i} ` + 'x'.repeat(300), 'y'.repeat(300), null]);
    const dl = w.buildTitleDigest(long);
    assert(dl.length <= 900, `long digest trimmed (${dl.length})`);
    assert(dl.includes('q1'), 'anchor survives trim');
    assert(dl.includes('q8'), 'latest turn survives trim');
    console.log('✓ buildTitleDigest');
}

// ── buildTitleDigest pins (review follow-up) ──
{
    const w = loadModule();
    const t = w.buildTitleDigest([['q', '<thought>hidden</thought> visible answer', null]]);
    assert(t.includes('visible answer') && !t.includes('hidden'), 'strips thought tags');
    const five = w.buildTitleDigest(Array.from({ length: 5 }, (_, i) => [`u${i}`, `a${i}`, null]));
    assert(!five.includes('First message:'), 'no anchor for ≤5 pairs');
    const six = w.buildTitleDigest(Array.from({ length: 6 }, (_, i) => [`uniq-user-${i}`, `a${i}`, null]));
    assert(six.includes('First message: "uniq-user-0"'), 'anchor for 6 pairs');
    assert.strictEqual(six.split('uniq-user-0').length - 1, 1, 'turn 1 appears exactly once');
    console.log('✓ buildTitleDigest pins');
}

// ── chatTitleDue ──
{
    const w = loadModule();
    const hist = [['my flask route keeps 404ing', 'add the leading slash', null]];
    const fallback = 'my flask route keeps 404ing'.substring(0, 30);
    assert.strictEqual(w.chatTitleDue(undefined, 1), true, 'brand-new unpersisted chat → due');
    assert.strictEqual(w.chatTitleDue({ titleManual: true, title: 'x', history: hist }, 9), false, 'renamed → locked');
    assert.strictEqual(w.chatTitleDue({ titleFeedback: 'good', title: 'x', titleGenAt: 1, history: hist }, 9), false, 'thumbs-up → locked');
    assert.strictEqual(w.chatTitleDue({ title: fallback, history: hist }, 1), true, 'fallback title → due');
    assert.strictEqual(w.chatTitleDue({ title: 'real title', titleGenAt: 1, history: hist }, 4), false, 'inside cadence window');
    assert.strictEqual(w.chatTitleDue({ title: 'real title', titleGenAt: 1, history: hist }, 5), true, 'cadence boundary');
    assert.strictEqual(w.chatTitleDue({ title: 'real title', history: hist }, 5), true, 'legacy chat (no titleGenAt)');
    console.log('✓ chatTitleDue');
}

// ── generateChatTitle (digest payload + meta retry + apply) ──
{
    const calls = [];
    const w = loadModule({
        fetch: async (url, opts) => {
            calls.push(JSON.parse(opts.body));
            const content = calls.length === 1 ? 'The user is asking about css' : 'css grief, then docker (classic)';
            return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
        }
    });
    w.settings = {};
    w.currentModel = { id: 'saga-0.7b' };
    w.getOpenAIClient = async () => 'http://fake';
    w.StorageController = { saveChat: async () => {} };
    w.renderHistory = () => {};
    w.updateChatTitleDisplay = () => {};
    w.updateTitleFeedbackUI = () => {};
    w.currentChatId = 'c1';
    const hist = [
        ['how do I center a div', '<think>t</think> use flexbox, justify-center', null],
        ['that worked, now my docker container wont start', 'check the logs first', null],
    ];
    w.chatHistory = hist;
    w.allChats = { c1: { id: 'c1', title: hist[0][0].substring(0, 30), history: hist } };

    await w.generateChatTitle('c1');
    assert.strictEqual(calls.length, 2, 'meta title triggers exactly one retry');
    const sent = calls[0].messages.map(m => m.content).join('\n');
    assert(sent.includes('how do I center a div'), 'payload has first turn');
    assert(sent.includes('docker container'), 'payload has latest turn');
    assert(sent.includes('flexbox'), 'payload has assistant content');
    assert(!/<think>/.test(sent), 'think tags stripped from payload');
    assert.strictEqual(w.allChats.c1.title, 'css grief, then docker (classic)', 'retry title applied');
    assert.strictEqual(w.allChats.c1.titleGenAt, 2, 'titleGenAt recorded');
    console.log('✓ generateChatTitle');
}

// ── chatTitleDue extra pins (review follow-up) ──
{
    const w = loadModule();
    const hist = [['my flask route keeps 404ing', 'add the leading slash', null]];
    assert.strictEqual(w.chatTitleDue({ titleFeedback: 'bad', title: 'real title', titleGenAt: 1, history: hist }, 5), true, 'thumbs-down keeps evolving');
    assert.strictEqual(w.chatTitleDue({ title: '', history: hist }, 1), true, 'empty title → due');
    assert.strictEqual(w.chatTitleDue({ title: 'real title', titleGenAt: 9, history: hist }, 5), false, 'negative diff (regen truncated) → not due');
    console.log('✓ chatTitleDue extra pins');
}
