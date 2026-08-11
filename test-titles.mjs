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
