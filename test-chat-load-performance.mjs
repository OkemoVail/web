import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) throw Error('outside root');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
const origin = `http://127.0.0.1:${server.address().port}`;

async function sample(name, setup = () => {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    localStorage.setItem('vail_last_seen_build', '999999');
    localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Perf', sidebarMode: 'manual', hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: [] }));
    performance.mark('chat-nav-start');
  });
  await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await setup(page);
  const start = performance.now();
  await page.goto(`${origin}/AI/chat.html?__glass_native=1`, { waitUntil: 'domcontentloaded' });
  const domContentLoaded = performance.now() - start;
  await page.waitForFunction(() => window.els?.input && !document.getElementById('app-preloader'), { timeout: 30000 });
  const interactive = performance.now() - start;
  const report = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource').filter(r => /(?:marked|katex|tailwind|anime|monaco|googleapis|cdnjs)/.test(r.name)).map(r => ({ name: r.name, duration: Math.round(r.duration), transfer: r.transferSize })).sort((a, b) => b.duration - a.duration);
    return { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), resources };
  });
  await context.close();
  return { name, domContentLoaded: Math.round(domContentLoaded), interactive: Math.round(interactive), report, errors };
}

async function sampleCloud(stage) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('vail_auth_token', 'hanging-test-token');
    localStorage.setItem('vail_last_seen_build', '999999');
    localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Perf', sidebarMode: 'manual', hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: [] }));
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://api.okemovail.com/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    const target = stage === 'account' || stage === 'failure' ? '/api/accounts/me' : stage === 'list' ? '/api/accounts/chats' : stage === 'detail' ? '/api/accounts/chats/example' : '/api/accounts/chats/__vail_profile__';
    if (stage !== 'success' && pathname === target) {
      if (stage === 'failure') return route.fulfill({ status: 503, json: { error: 'unavailable' } });
      return; // An actual outstanding fetch, until the production abort fires.
    }
    if (pathname === '/api/accounts/chats') return route.fulfill({ json: [{ id: 'example' }] });
    if (pathname === '/api/accounts/chats/example') return route.fulfill({ json: { id: 'example', title: 'Saved cloud chat', history: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${origin}/AI/chat.html?__glass_native=1`, { waitUntil: 'domcontentloaded' });
  const parsed = performance.now();
  await page.waitForFunction(() => window.els?.input && !document.getElementById('app-preloader'), null, { timeout: 3500 });
  const elapsed = Math.round(performance.now() - parsed);
  assert.deepEqual(errors, [], `${stage}: no uncaught startup errors`);
  if (stage === 'account' || stage === 'failure') {
    assert.equal(await page.evaluate(() => StorageController === _OriginalStorageController), true, 'unavailable cloud falls back to local storage');
    assert.equal(await page.evaluate(() => localStorage.getItem('vail_auth_token')), 'hanging-test-token', 'an outage does not log the user out');
  }
  if (stage === 'success') assert.equal(await page.evaluate(() => allChats.example.title), 'Saved cloud chat');
  await context.close();
  return elapsed;
}

try {
  const remote = await sample('guest startup');
  console.log(JSON.stringify(remote, null, 2));
  assert.deepEqual(remote.errors, [], 'chat has no runtime errors during load');
  assert.ok(remote.interactive - remote.domContentLoaded < 500, `chat becomes interactive promptly after DOM parsing (${remote.interactive - remote.domContentLoaded}ms)`);
  for (const stage of ['account', 'list', 'detail', 'profile', 'failure', 'success']) {
    const elapsed = await sampleCloud(stage);
    console.log(`PASS cloud ${stage}: interactive ${elapsed}ms after document parsing`);
    assert.ok(elapsed < 2500, `cloud ${stage} must not block chat startup (${elapsed}ms)`);
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
