import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

// Catches fixed-destination Back links, lost forward entries, reset history on
// refresh, and page slides that still visibly trail after 300ms.
const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
try {
  for (const native of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(native => {
      Object.defineProperty(navigator, 'webdriver', { get: () => native });
      localStorage.setItem('vail_theme', 'light');
    }, native);
    await page.route('https://cdn.tailwindcss.com/**', route => route.fulfill({ contentType: 'text/javascript', body:
      "window.tailwind={};var css=document.createElement('link');css.rel='stylesheet';css.href='/src/output.css';document.head.append(css);" }));
    const back = page.locator(native ? '.ov-nav__back' : '[data-glass-role="leading"]');
    const waitForRoute = async slug => {
      if (native) await page.waitForURL(`${origin}/AI/${slug}.html`);
      else await page.waitForFunction(slug => GlassShell.currentURL.pathname === `/AI/${slug}.html`, slug);
      await page.waitForTimeout(500);
    };
    await page.goto(`${origin}/AI/goals.html${native ? '?__glass_native=1' : ''}`);
    if (!native) await page.waitForFunction(() => GlassShell.ready);
    await page.waitForTimeout(500);
    // Use the actual menu, so the native browser creates real document history.
    await page.locator(native ? '.ov-nav__tools-toggle' : '[data-glass-role="menu"]').click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Privacy', exact: true }).click();
    await waitForRoute('privacy');
    await back.click();
    if (native) await page.waitForURL(/\/AI\/goals\.html/);
    else await page.waitForFunction(() => GlassShell.currentURL.pathname === '/AI/goals.html');
    assert.match(page.url(), /\/AI\/goals\.html/, 'Back returns to Goals, the actual previous page');
    await page.goForward();
    await waitForRoute('privacy');
    console.log(`PASS: ${native ? 'native' : 'shell'} Back uses previous page and preserves Forward`);
    if (!native) {
      await page.reload();
      await page.waitForFunction(() => window.GlassShell?.ready);
      await page.waitForTimeout(500);
      await back.click();
      await page.waitForFunction(() => window.GlassShell?.ready && GlassShell.currentURL.pathname === '/AI/goals.html');
      console.log('PASS: shell refresh preserves previous-page history');
      const motions = await page.evaluate(async () => {
        const samples = [];
        for (const url of ['/AI/privacy.html', '/AI/goals.html']) {
          await GlassShell.navigate(url);
          const incoming = document.querySelector('[data-glass-page]:not([aria-hidden])');
          const start = performance.now();
          await new Promise(resolve => {
            function tick(now) { if (now - start >= 300) resolve(); else requestAnimationFrame(tick); }
            requestAnimationFrame(tick);
          });
          samples.push(Math.abs(new DOMMatrix(getComputedStyle(incoming).transform).e));
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        return samples;
      });
      assert.ok(motions.every(offset => offset < 2), `page slides arrive within 2px after 300ms: ${motions}`);
      console.log('PASS: forward and return slides have a firm, quick arrival');
    }
    assert.deepEqual(errors, [], 'navigation has no runtime errors');
    await page.close();
    const direct = await browser.newPage();
    await direct.addInitScript(native => { Object.defineProperty(navigator, 'webdriver', { get: () => native }); }, native);
    await direct.goto(`${origin}/AI/goals.html${native ? '?__glass_native=1' : ''}`);
    if (!native) await direct.waitForFunction(() => GlassShell.ready);
    await direct.waitForTimeout(500);
    await direct.locator(native ? '.ov-nav__back' : '[data-glass-role="leading"]').click();
    await direct.waitForURL(`${origin}/index.html`);
    console.log(`PASS: ${native ? 'native' : 'shell'} direct entry falls back to Home`);
    await direct.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
