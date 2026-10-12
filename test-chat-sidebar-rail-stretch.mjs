// Rotated rail toolbar pill must stretch along its own long (vertical) axis.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

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
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    // Live physics is disabled under webdriver; this test needs it running.
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    localStorage.setItem('vail_theme', 'light');
    localStorage.setItem('vail_last_seen_build', '999999');
    localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Debug', hasCompletedTutorial: true, sidebarMode: 'manual', folders: [], chatOrder: [], customAccents: [] }));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html?__glass_native=1`);
  await page.waitForFunction(() => window.els?.sidebar && document.querySelector('#sidebar .chat-sidebar-actions .lgp-material, #sidebar .chat-sidebar-actions [data-sidebar-collapse]'));
  await page.evaluate(() => { document.getElementById('onboarding-overlay').style.display = 'none'; document.getElementById('app-preloader').style.display = 'none'; });
  const material = () => page.evaluate(() => {
    const pill = document.querySelector('#sidebar .chat-sidebar-actions');
    const layer = pill.firstElementChild.getBoundingClientRect();
    const r = pill.getBoundingClientRect();
    return { layer: { w: layer.width, h: layer.height, top: layer.top, bottom: layer.bottom, right: layer.right }, pill: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });
  // Baseline: the same pull on the upright expanded pill, rightward.
  const flat = await material();
  {
    const x = flat.pill.x + flat.pill.w / 2, y = flat.pill.y + flat.pill.h / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(x + flat.pill.w / 2 + i * 10, y); await page.waitForTimeout(16); }
    await page.waitForTimeout(250);
  }
  const flatPulled = await material();
  await page.mouse.up();
  const baseline = flatPulled.layer.w - flat.layer.w;
  await page.waitForTimeout(900);
  await page.evaluate(() => window.toggleSidebar());
  await page.waitForTimeout(900);
  const rest = await material();
  assert.ok(rest.pill.h > rest.pill.w, `rail pill should be vertical: ${JSON.stringify(rest.pill)}`);
  // Press the separator gap (blank glass), then pull downward past the bottom edge.
  const x = rest.pill.x + rest.pill.w / 2, y = rest.pill.y + rest.pill.h / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(x, y + rest.pill.h / 2 + i * 10); await page.waitForTimeout(16); }
  await page.waitForTimeout(250);
  const pulled = await material();
  await page.mouse.up();
  const dh = pulled.layer.h - rest.layer.h, dw = pulled.layer.w - rest.layer.w;
  console.log(JSON.stringify({ baseline, dh, dw }));
  assert.ok(baseline > 1, `expanded baseline stretch missing (${baseline})`);
  assert.ok(Math.abs(dh - baseline) < 1.5, `rotated stretch ${dh} should match upright stretch ${baseline}`);
  assert.ok(pulled.layer.bottom > rest.layer.bottom + 3, 'bottom (facing) edge extends');
  assert.ok(Math.abs(dw) < dh, `cross-axis change ${dw} must stay below stretch ${dh}`);
  console.log('PASS rotated rail pill stretches along its long axis');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
