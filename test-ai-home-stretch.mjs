import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import sharp from 'sharp';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390 });
    await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    await page.goto(`http://127.0.0.1:${server.address().port}/AI/index.html`);
    await page.waitForFunction(() => window.GlassShell?.ready);
    const child = page.frameLocator('[data-glass-page]:not([aria-hidden])');
    await child.locator('#lumen-playback').waitFor({ state: 'visible' });
    await child.locator('#lumen-hero').evaluate(() => window.LumenHero.skip());
    await page.waitForTimeout(600);

    const cta = child.locator('.lumen-start');
    await cta.evaluate(() => history.replaceState(history.state, '', location.pathname + location.search + '#main-content'));
    // The HTML material must keep its contour even if an SVG fragment cannot
    // resolve in a composited page. The visible rim still owns its own path.
    await cta.evaluate(el => el.querySelector('.lgp-outline clipPath').remove());
    await cta.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const painted = await cta.screenshot();
    await cta.evaluate(el => { el.querySelector('.lgp-material').style.visibility = 'hidden'; });
    const backdrop = await cta.screenshot();
    await cta.evaluate(el => { el.querySelector('.lgp-material').style.removeProperty('visibility'); });
    const decode = image => sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const a = await decode(painted), b = await decode(backdrop);
    let cornerChange = 0;
    for (const x of [2, a.info.width - 3]) for (const y of [2, a.info.height - 3]) {
      const i = (y * a.info.width + x) * 3;
      for (let c = 0; c < 3; c++) cornerChange = Math.max(cornerChange, Math.abs(a.data[i + c] - b.data[i + c]));
    }
    assert.ok(cornerChange < 8, `${width}: rounded CTA material leaves corners transparent (difference ${cornerChange})`);

    async function pull(selector) {
      const button = child.locator(selector);
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 65, { steps: 6 });
      await page.waitForTimeout(250);
      assert.equal(await button.locator(':scope > .lgp-content').evaluate(el => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return Math.abs(m.a - 1) > .002 || Math.abs(m.d - 1) > .002;
      }), true, `${width}: ${selector} stretches while held`);
      await page.mouse.up();
      await page.waitForTimeout(1300);
      assert.equal(await button.locator(':scope > .lgp-content').evaluate(el => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return Math.abs(m.a - 1) < .002 && Math.abs(m.d - 1) < .002;
      }), true, `${width}: ${selector} rebounds after release`);
      assert.equal(await button.locator(':scope > .lgp-highlights .lgp-glow').evaluate(el => parseFloat(getComputedStyle(el).opacity) < .005), true);
      assert.equal(await page.evaluate(() => GlassShell.currentURL.pathname), '/AI/index.html', 'pull does not activate navigation');
    }

    for (const selector of ['.lumen-start', '#lumen-playback']) await pull(selector);
    if (width === 390 && process.env.LIQUID_BROWSER !== 'webkit') {
      const button = child.locator('.lumen-start');
      const box = await button.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let d = 5; d <= 65; d += 5) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - d }] });
      await page.waitForTimeout(250);
      assert.equal(await button.locator(':scope > .lgp-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).d - 1) > .002), true, 'real mobile touch stretches card CTA');
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(1300);
      assert.equal(await button.locator(':scope > .lgp-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).d - 1) < .002), true, 'real mobile touch rebounds');
      await session.detach();
    }
    if (width >= 768) await pull('#hero-next');
    await child.locator('.hero-dot[data-index="1"]').click();
    await page.waitForTimeout(900);
    for (const selector of ['#hero-start', '[data-card="1"] .hero-replay']) await pull(selector);
    await child.locator('.hero-dot[data-index="2"]').click();
    await page.waitForTimeout(900);
    for (const selector of ['#hp-play', '#hp-mute', '#hp-replay']) await pull(selector);
    await child.locator('.hero-dot[data-index="0"]').click();
    await page.waitForTimeout(900);
    await child.locator('.lumen-start').click();
    await page.waitForFunction(() => GlassShell.currentURL.pathname === '/AI/chat.html');
    console.log(`PASS ${width}: AI card, carousel and playback controls stretch/rebound; ordinary CTA click navigates`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
