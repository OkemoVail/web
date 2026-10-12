import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
try {
  for (const native of [false, true]) for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390 });
    await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html${native ? '?__glass_native=1' : ''}`);
    if (!native) await page.waitForFunction(() => window.GlassShell?.ready);
    const owner = native ? page : page.frameLocator('[data-glass-page]:not([aria-hidden])');
    const button = owner.locator('.hero-profile[data-lgp-control]');
    await button.waitFor({ state: 'visible' });
    await page.waitForTimeout(800);
    const box = await button.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const scale = () => button.locator(':scope > .lgp-content').evaluate(el => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return Math.max(Math.abs(m.a - 1), Math.abs(m.d - 1));
    });
    const label = `${native ? 'native' : 'shell'} ${width}`;
    let session;
    if (width === 390 && process.env.LIQUID_BROWSER !== 'webkit') {
      session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(200);
      for (let d = 5; d <= 65; d += 5) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + d, y }] });
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 65, y, { steps: 6 });
    }
    await page.waitForTimeout(250);
    assert.ok(await scale() > .002, `${label}: profile picture stretches while pulled`);
    const heldBox = await button.boundingBox();
    assert.ok(Math.abs(heldBox.x - box.x) < 1 && Math.abs(heldBox.width - box.width) < 1, `${label}: layout hitbox remains fixed`);
    if (session) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    } else await page.mouse.up();
    await page.waitForTimeout(1300);
    assert.ok(await scale() < .002, `${label}: profile picture springs back after release`);
    assert.equal(await button.locator('.lgp-glow').evaluate(el => parseFloat(getComputedStyle(el).opacity) < .005), true, `${label}: press highlight clears`);
    console.log(`PASS ${label}: profile stretch, fixed hitbox and rebound${session ? ' with real touch' : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
