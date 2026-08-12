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
        // generateChatTitle shimmers the title capsule via document.getElementById
        document: overrides.document || { getElementById: () => null },
    });
    vm.runInContext(code, ctx);
    // utils.js isn't loaded in the harness — stub the seed helper deterministically
    window.randomSeed = () => 42;
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
    const added = [], removed = [];
    const fakeTitleEl = { classList: { add: c => added.push(c), remove: c => removed.push(c) } };
    const w = loadModule({
        fetch: async (url, opts) => {
            calls.push(JSON.parse(opts.body));
            const content = calls.length === 1 ? 'The user is asking about css' : 'css grief, then docker (classic)';
            return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
        },
        document: { getElementById: () => fakeTitleEl },
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
    assert.deepStrictEqual(added, ['shimmer-active'], 'capsule shimmer added at start');
    assert.deepStrictEqual(removed, ['shimmer-active'], 'capsule shimmer removed at end');
    assert.strictEqual(w.__titleShimmerChatId, 'c1', 'sidebar row shimmer flagged for next render');
    assert.strictEqual(calls[0].seed, 42, 'request carries a seed');
    assert.strictEqual(calls[0].temperature, 0.6, 'title temperature is 0.6');
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

// ── generateChatTitle guards (review follow-up) ──
{
    // (a) in-flight suppression + force bypass
    const calls = [];
    let release;
    const gate = new Promise(r => { release = r; });
    const w = loadModule({
        fetch: async (url, opts) => {
            calls.push(JSON.parse(opts.body));
            await gate;
            return { ok: true, json: async () => ({ choices: [{ message: { content: 'a title' } }] }) };
        }
    });
    w.settings = {};
    w.currentModel = { id: 'saga-0.7b' };   // stand-in for MODELS.SAGA from state.js
    w.getOpenAIClient = async () => 'http://fake';
    w.StorageController = { saveChat: async () => {} };
    w.renderHistory = () => {};
    w.updateChatTitleDisplay = () => {};
    w.updateTitleFeedbackUI = () => {};
    w.currentChatId = 'c1';
    const hist = [['q1', 'a1', null]];
    w.chatHistory = hist;
    w.allChats = { c1: { id: 'c1', title: 'q1', history: hist } };

    const p1 = w.generateChatTitle('c1');
    await w.generateChatTitle('c1');                // suppressed by in-flight flag
    await new Promise(r => setTimeout(r, 0));       // let p1 reach fetch
    assert.strictEqual(calls.length, 1, 'concurrent non-force call suppressed');
    const p2 = w.generateChatTitle('c1', true);     // force bypasses the guard
    await new Promise(r => setTimeout(r, 0));
    release();
    await Promise.all([p1, p2]);
    assert.strictEqual(calls.length, 2, 'force call bypasses in-flight guard');

    // (b) request failure keeps title + titleGenAt, releases the flag
    const w2 = loadModule({
        fetch: async () => ({ ok: false, status: 500 })
    });
    w2.settings = {};
    w2.currentModel = { id: 'saga-0.7b' };   // stand-in for MODELS.SAGA from state.js
    w2.getOpenAIClient = async () => 'http://fake';
    w2.StorageController = { saveChat: async () => {} };
    w2.renderHistory = () => {};
    w2.updateChatTitleDisplay = () => {};
    w2.updateTitleFeedbackUI = () => {};
    w2.currentChatId = 'c1';
    const hist2 = [['q1', 'a1', null]];
    w2.chatHistory = hist2;
    w2.allChats = { c1: { id: 'c1', title: 'existing title', titleGenAt: 1, history: hist2 } };
    await w2.generateChatTitle('c1');
    assert.strictEqual(w2.allChats.c1.title, 'existing title', 'failure keeps title');
    assert.strictEqual(w2.allChats.c1.titleGenAt, 1, 'failure keeps titleGenAt');
    assert.strictEqual(w2._generatingTitle_c1, undefined, 'flag released after failure');
    console.log('✓ generateChatTitle guards');
}

// ── --live [baseUrl]: fire real title requests and print the titles ──
if (process.argv[2] === '--live') {
    const base = process.argv[3] || 'http://127.0.0.1:8001';
    const system = code.match(/const TITLE_SYSTEM_PROMPT = `([\s\S]*?)`;/)[1];
    const w = loadModule();
    const metaRe = /^(the user|user is|this (chat|conversation|is)|in this (chat|conversation))/i;
    const samples = [
        ['greeting', 'User: "hi"'],
        ['flask 404', 'User: "my flask route keeps 404ing"\nAssistant: "your route decorator is missing the leading slash"'],
        ['mars story', 'User: "write a sci-fi story about mars"'],
        ['drifted chat', 'First message: "how do I center a div"\nUser: "that worked, now my docker container wont start"\nAssistant: "check the docker logs first"'],
    ];
    let failed = false;
    for (const [label, digest] of samples) {
        const res = await fetch(base + '/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'saga-0.7b',
                messages: [{ role: 'system', content: system }, { role: 'user', content: digest }],
                temperature: 0.6, seed: Math.floor(Math.random() * 2 ** 31),
                max_tokens: 60, stream: false
            }),
        });
        if (!res.ok) { console.error(`✗ ${label}: HTTP ${res.status}`); failed = true; continue; }
        const data = await res.json();
        const title = w.cleanChatTitle(data.choices[0].message.content);
        const meta = metaRe.test(title);
        if (meta) failed = true;
        console.log(`${meta ? '✗ META' : '✓'} ${label}: "${title}"`);
    }
    process.exit(failed ? 1 : 0);
}
