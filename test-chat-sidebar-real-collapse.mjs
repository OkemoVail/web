import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('vail_theme', 'light');
    localStorage.setItem('vail_last_seen_build', '999999');
    localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Debug', hasCompletedTutorial: true, sidebarMode: 'manual', folders: [], chatOrder: [], customAccents: [] }));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html?__glass_native=1`);
  await page.waitForFunction(() => window.els?.sidebar && document.querySelector('#sidebar .chat-sidebar-actions [data-sidebar-collapse]'));
  await page.evaluate(() => { document.getElementById('onboarding-overlay').style.display = 'none'; document.getElementById('app-preloader').style.display = 'none'; });
  const button = page.locator('#sidebar .chat-sidebar-actions [data-sidebar-collapse]');
  const before = await page.locator('#sidebar').boundingBox();
  const box = await button.boundingBox();
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return { tag: el?.tagName, id: el?.id, classes: el?.className, collapse: !!el?.closest('[data-sidebar-collapse]') };
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const after = await page.locator('#sidebar').boundingBox();
  console.log(JSON.stringify({ hit, before, after, body: await page.locator('body').getAttribute('class') }, null, 2));
  assert.ok(hit.collapse, `physical hit target is not collapse button: ${JSON.stringify(hit)}`);
  assert.ok(after.width < before.width, `physical click did not collapse sidebar: ${before.width} -> ${after.width}`);
  console.log('PASS real sidebar collapse click');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
