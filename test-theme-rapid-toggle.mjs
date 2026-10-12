import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (p.endsWith('/') ? p + 'index.html' : p));
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
try {
  for (const native of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1376, height: 900 }, deviceScaleFactor: 2 });
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); localStorage.setItem('vail_theme', 'light'); });
    await page.goto(`http://127.0.0.1:${server.address().port}/AI/index.html${native ? '?__glass_native=1' : ''}`);
    if (!native) await page.waitForFunction(() => GlassShell.ready);
    await page.waitForTimeout(800);
    const theme = page.locator(native ? '.ov-nav__theme' : '[data-glass-role="theme"]');
    const mismatch = await theme.evaluate(async button => {
      const win = window.GlassShell ? document.querySelector('[data-glass-page]:not([aria-hidden])').contentWindow : window;
      const problems = [];
      for (let i = 0; i < 9; i++) {
        button.click();
        await new Promise(r => setTimeout(r, 70));
        const body = win.getComputedStyle(win.document.body);
        const canvas = win.document.createElement('span'); canvas.style.backgroundColor = 'var(--bg)'; win.document.body.append(canvas);
        const expected = win.getComputedStyle(canvas).backgroundColor; canvas.remove();
        if (body.backgroundColor !== expected) problems.push({ click: i, body: body.backgroundColor, expected });
        if (window.GlassShell && document.documentElement.classList.contains('dark') !== win.document.documentElement.classList.contains('dark')) problems.push({ click: i, state: 'shell/child disagree' });
      }
      return problems;
    });
    assert.deepEqual(mismatch, [], `${native ? 'native' : 'shell'}: rapid theme switches paint a uniform page canvas`);
    console.log(`PASS: ${native ? 'native' : 'shell'} iPad rapid toggles keep canvas and latest theme synchronized`);
    await page.close();
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); }
