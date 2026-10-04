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
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); localStorage.setItem('vail_theme', 'dark'); });
    await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"results":[]}' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => window.GlassShell?.ready);
    const child = page.frameLocator('[data-glass-page]:not([aria-hidden])');
    const form = child.locator('.hero-search');
    assert.equal(await form.evaluate(el => getComputedStyle(el).visibility), 'visible', 'search is visible inside its scrolling document');
    assert.equal(await page.locator('.glass-shell-search').count(), 0, 'no fixed-layer duplicate can trail compositor scrolling');
    const independent = await form.evaluate(el => {
      const win = el.ownerDocument.defaultView;
      const bridge = win.parent.GlassShell.childLayout;
      win.parent.GlassShell.childLayout = function () {};
      const before = el.getBoundingClientRect().top;
      win.scrollTo({ top: 100, behavior: 'instant' });
      const delta = before - el.getBoundingClientRect().top;
      win.scrollTo({ top: 0, behavior: 'instant' });
      win.parent.GlassShell.childLayout = bridge;
      return delta;
    });
    assert.equal(independent, 100, 'search follows scroll without any parent synchronization');
    await page.waitForTimeout(500);
    const input = form.locator('input');
    const b = await input.boundingBox();
    await page.mouse.move(b.x + 24, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 100, b.y + b.height / 2, { steps: 5 });
    await page.waitForTimeout(200);
    assert.equal(await form.locator(':scope > .lgp-content').evaluate(el => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return Math.abs(m.a - 1) > .001 || Math.abs(m.d - 1) > .001;
    }), true, 'in-page search retains stretching');
    await page.mouse.up();
    await page.waitForTimeout(1300);
    assert.equal(await form.locator(':scope > .lgp-highlights .lgp-glow').evaluate(el => parseFloat(getComputedStyle(el).opacity) < .005), true, 'release clears highlight');
    await page.mouse.move(b.x + 24, b.y + b.height / 2);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(250);
    assert.equal(await form.evaluate(el => el.ownerDocument.defaultView.scrollY > 50), true, 'wheel over native field scrolls page');
    const button = form.locator('button');
    assert.equal(await button.evaluate(el => { const a = el.getBoundingClientRect(), b = el.querySelector('.search-submit-label').getBoundingClientRect(); return Math.abs(a.y + a.height / 2 - b.y - b.height / 2) < 1; }), true, 'Search stays centered');
    await input.fill('stars');
    await input.press('Enter');
    await page.waitForFunction(() => GlassShell.currentURL.pathname === '/search/' && GlassShell.currentURL.searchParams.get('q') === 'stars');
    await page.waitForTimeout(1200);
    assert.equal(await child.locator('#results-bar').evaluate(el => getComputedStyle(el).visibility), 'visible', 'Astra search also lives in page');
    assert.equal(await page.locator('.glass-shell-search').count(), 0);
    console.log(`PASS ${width}: native page ownership, stretch/release, wheel, label centering, Home→Astra search`);
    await page.close();
  }
  if (process.env.LIQUID_BROWSER !== 'webkit') {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
    await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => window.GlassShell?.ready);
    await page.waitForTimeout(500);
    const form = page.frameLocator('[data-glass-page]:not([aria-hidden])').locator('.hero-search');
    const input = await form.locator('input').boundingBox();
    const x = input.x + 24, y = input.y + input.height / 2;
    const session = await page.context().newCDPSession(page);
    for (const vertical of [false, true]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      if (vertical) await page.waitForTimeout(250);
      for (let d = 5; d <= 75; d += 5) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (vertical ? 0 : d), y: y - (vertical ? d : 0) }] });
      await page.waitForTimeout(200);
      assert.equal(await form.locator(':scope > .lgp-content').evaluate(el => { const m = new DOMMatrix(getComputedStyle(el).transform); return Math.abs(m.a - 1) > .001 || Math.abs(m.d - 1) > .001; }), true, 'native mobile search retains horizontal and held vertical stretching');
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(1300);
      assert.equal(await form.locator(':scope > .lgp-highlights .lgp-glow').evaluate(el => parseFloat(getComputedStyle(el).opacity) < .005), true);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 70 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await form.evaluate(el => el.ownerDocument.defaultView.scrollY > 40), true, 'quick vertical swipe scrolls native page');
    console.log('PASS real mobile touch: stretch, rebound, vertical swipe');
    await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
