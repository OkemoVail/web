import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

// Catches info-page navigation dropping the shared controls, clipping mobile
// menu actions, or replacing live glass when following an AI menu link.
const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
const destinations = [['Goals', 'goals'], ['Research', 'research'], ['Privacy', 'privacy'], ['Terms', 'tos']];
try {
  for (const native of [true, false]) {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        localStorage.setItem('vail_theme', 'light');
      });
      await page.route('https://cdn.tailwindcss.com/**', route => route.fulfill({ contentType: 'text/javascript', body:
        "window.tailwind={};var css=document.createElement('link');css.rel='stylesheet';css.href='/src/output.css';document.head.append(css);" }));
      for (const [label, slug] of destinations) {
        if (native || slug === 'goals') {
          await page.goto(`${origin}/AI/${slug}.html${native ? '?__glass_native=1' : ''}`);
          if (!native) await page.waitForFunction(() => GlassShell.ready);
        }
        const menu = page.locator(native ? '.ov-nav__page-menu .ov-nav__tools-toggle' : '[data-glass-role="menu"]');
        const primary = page.locator(native ? '.ov-nav__labs' : '[data-glass-role="primary"]');
        const back = page.locator(native ? '.ov-nav__back' : '[data-glass-role="leading"]');
        const theme = page.getByRole('button', { name: 'Toggle theme', exact: true });
        await page.waitForTimeout(700);
        assert.equal(await menu.count(), 1, `${slug}: circular hamburger exists`);
        assert.match(await primary.textContent(), /Chat/, `${slug}: direct Chat action stays available`);
        for (const control of [menu, primary, back, theme]) {
          const box = await control.boundingBox();
          assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width, `${slug}: visible touch-sized control`);
        }
        assert.ok(await menu.evaluate(el => {
          const b = el.getBoundingClientRect();
          return Math.abs(b.width - b.height) < 1 && parseFloat(getComputedStyle(el).borderTopLeftRadius) >= b.width / 2;
        }), `${slug}: hamburger remains circular`);
        await theme.click();
        await page.waitForTimeout(600);
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true, `${slug}: separate theme toggle works`);
        await theme.click();
        await page.waitForTimeout(600);
        await menu.click();
        await page.waitForTimeout(800);
        for (const [itemLabel] of destinations) {
          const item = page.getByRole('button', { name: itemLabel, exact: true });
          const box = await item.boundingBox();
          assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width, `${slug}: ${itemLabel} is reachable in menu`);
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
        assert.equal(await menu.getAttribute('aria-expanded'), 'false', `${slug}: Escape closes menu`);
        if (process.env.GLASS_SCREENSHOTS && slug === 'tos') await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/ai-info-${native ? 'native' : 'shell'}-${width}.png` });
        if (!native) {
          if (slug === 'goals') await primary.evaluate(el => { window.infoPrimary = el; window.infoMaterial = el.querySelector('.lgp-material'); });
          assert.equal(await primary.evaluate(el => el === window.infoPrimary && el.querySelector('.lgp-material') === window.infoMaterial), true, `${slug}: route retains live Chat material`);
          const next = destinations[destinations.findIndex(item => item[1] === slug) + 1];
          if (next) {
            await menu.click();
            await page.waitForTimeout(800);
            await page.getByRole('button', { name: next[0], exact: true }).click();
            await page.waitForFunction(slug => GlassShell.currentURL.pathname === `/AI/${slug}.html`, next[1]);
          } else {
            await page.frameLocator('[data-glass-page]:not([aria-hidden])').getByRole('link', { name: 'Back to Home' }).click();
            await page.waitForFunction(() => GlassShell.currentURL.pathname === '/AI/index.html');
            assert.equal(await primary.evaluate(el => el === window.infoPrimary), true, 'Terms footer returns to AI landing with persistent glass');
          }
        }
        console.log(`PASS: ${native ? 'native' : 'shell'} ${width} ${label} controls, themes and menu navigation`);
      }
      assert.deepEqual(errors, [], 'AI info pages have no runtime errors');
      await page.close();
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
