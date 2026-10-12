import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/AI/chat' && url.searchParams.get('__glass_page') === '1') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><title>Chat fixture</title><script>window.LiquidDesign = {}; window.GlassPageBridge = {}; document.addEventListener('DOMContentLoaded', () => parent.GlassShell.childReady(window, new URL(location.href), null));</script><body><main>Chat fixture</main></body>`);
      return;
    }
    // Production normalizes this page to its extensionless URL. Mirror that
    // behavior locally so the shell's initial-load route is exercised. The
    // shell receives the extensionless URL; its child is deliberately tiny.
    const pathname = url.pathname;
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('outside root');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch {
    res.writeHead(404).end('Missing page');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { configurable: true, get: () => false });
    localStorage.setItem('vail_last_seen_build', '999999');
    localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Route test', sidebarMode: 'manual', hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: [] }));
  });
  await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }));

  const extensionlessChat = `${origin}/AI/chat`;
  await page.goto(`${origin}/glass-shell.html?url=${encodeURIComponent(extensionlessChat)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.GlassShell?.ready && document.querySelector('[data-glass-page]:not([aria-hidden])'), null, { timeout: 10000 });

  assert.equal(await page.evaluate(() => GlassShell.currentURL.pathname), '/AI/chat', 'the extensionless public chat route stays inside the shell');
  assert.equal(await page.locator('[data-glass-page]:not([aria-hidden])').count(), 1, 'the shell commits one active chat frame');
  assert.deepEqual(errors, [], 'the extensionless route has no shell errors');
  console.log('PASS extensionless public chat route loads in the glass shell');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
