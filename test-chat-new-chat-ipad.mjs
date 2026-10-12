import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { webkit } from 'playwright';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('outside workspace');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await webkit.launch();

try {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 1366 },
    hasTouch: true,
  });
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    localStorage.setItem('vail_theme', 'light');
    localStorage.setItem('vail_last_seen_build', '999999');
    localStorage.setItem('vail_settings_v4', JSON.stringify({
      userName: 'iPad regression test', hasCompletedTutorial: true,
      sidebarMode: 'manual', folders: [], chatOrder: [], customAccents: [],
    }));
  });

  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html`);
  await page.waitForFunction(() => window.GlassShell?.ready);
  const frame = page.frames().find(candidate => candidate.parentFrame() && candidate.url().includes('/AI/chat.html'));
  assert.ok(frame, 'chat is available inside the glass shell');
  await frame.waitForFunction(() => window.els?.sidebar && typeof window.resetChat === 'function');
  await frame.evaluate(() => {
    document.getElementById('onboarding-overlay').style.display = 'none';
    document.getElementById('app-preloader').style.display = 'none';
    window.chatHistory = [['Existing chat', 'Existing response', null, Date.now()]];
    document.body.classList.remove('chat-empty');
    window.render();
    // iPadOS versions before 15.4 expose crypto but not crypto.randomUUID().
    // Remove it only after startup so this isolates New Chat's activation path.
    Object.defineProperty(Crypto.prototype, 'randomUUID', { configurable: true, value: undefined });
  });
  await page.waitForTimeout(300);

  const oldId = await frame.evaluate(() => window.currentChatId);
  const button = await frame.$('#sidebar .sb-new-chat-btn');
  const box = await button.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await frame.waitForFunction(previousId => window.currentChatId !== previousId && window.chatHistory.length === 0 && document.body.classList.contains('chat-empty'), oldId);
  assert.match(await frame.evaluate(() => window.currentChatId), /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
    'fallback creates a UUID v4-shaped chat ID');

  console.log('PASS iPad New Chat works without crypto.randomUUID');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
