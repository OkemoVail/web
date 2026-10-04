import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await fs.readFile(path.join(root, 'AI/tos.html'), 'utf8');
assert.ok(html.indexOf('../src/site.css') < html.indexOf('../liquid-design/liquid-design.css'));
assert.match(html, /<script defer src="\.\.\/liquid-design\/liquid-design\.js"><\/script>\s*<script defer src="\.\.\/src\/liquid-design-site\.js"><\/script>/);
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const engineName = process.env.LIQUID_BROWSER || 'chromium';
const browser = await (engineName === 'webkit' ? webkit : chromium).launch();
const base = `http://127.0.0.1:${server.address().port}`;
const errors = [];
try {
  for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/AI/tos.html');
    await page.waitForFunction(() => window.LiquidDesignSite && document.querySelectorAll('.ov-nav [data-lg-site]').length === 7);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('main')).paddingTop !== '0px');
    const controls = page.locator('.ov-nav button,.ov-nav a');
    assert.equal(await controls.count(), 7);
    for (const control of await controls.all()) {
      assert.equal(await control.locator(':scope > .lgp-material').count(), 1);
      assert.equal(await control.locator(':scope > .lgp-outline').count(), 1);
      assert.ok(await control.evaluate(el => el.hasAttribute('data-liquid-design-independent')));
    }
    assert.equal(await page.locator('[data-liquid-design-group],[data-lgp-component],.lg-color-object,.ov-nav__bar > .lgp-material,.ov-nav__links > .lgp-material').count(), 0);
    for (const material of await page.locator('.ov-nav .lgp-material').all()) {
      assert.equal(await material.getAttribute('data-surfaces'), '1');
      assert.equal(await material.getAttribute('data-connections'), '0');
    }
    assert.equal(await page.locator('footer [data-lg-site]').count(), 0, 'editorial footer links stay native');
    assert.equal(await page.locator('footer a').first().getAttribute('href'), 'privacy.html');
    const toggle = page.getByRole('button', { name: 'Toggle navigation links' });
    const theme = page.getByRole('button', { name: 'Toggle theme' });
    assert.equal(await toggle.getAttribute('aria-expanded'), String(width >= 768));
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), String(width < 768));
    await toggle.focus();
    await page.keyboard.press('Enter');
    assert.equal(await toggle.getAttribute('aria-expanded'), String(width >= 768), 'native keyboard toggle survives wrapping');
    if (width < 768) await toggle.click();
    await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no document overflow');
    const bar = await page.locator('.ov-nav__bar').boundingBox();
    assert.ok(bar.x >= 0 && bar.x + bar.width <= width + 1, 'expanded navigation fits mobile');
    const tint = () => page.locator('.ov-nav__primary > .lgp-material').evaluate(el => getComputedStyle(el, '::after').backgroundColor);
    assert.notEqual(await tint(), 'rgba(0, 0, 0, 0)', 'Home retains accent tint');
    await theme.click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark') && document.querySelector('.ov-nav__theme').dataset.lgpTheme === 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('vail_theme')), 'dark');
    await theme.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
    assert.equal(await page.evaluate(() => localStorage.getItem('vail_theme')), 'light');
    await page.keyboard.press('Tab');
    await toggle.focus();
    assert.ok(await toggle.evaluate(el => el.matches(':focus-visible') && (getComputedStyle(el).boxShadow !== 'none' || getComputedStyle(el).outlineStyle !== 'none')), 'visible keyboard focus');
    if (width < 768) {
      await page.locator('h1').click();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'mobile outside click collapses');
      await toggle.click();
    }
    const research = page.getByRole('link', { name: 'Research', exact: true });
    await research.click();
    await page.waitForURL(base + '/AI/research.html');
    await page.goto(base + '/AI/tos.html');
    await page.waitForFunction(() => document.querySelector('.ov-nav__primary > .lgp-material'));
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.waitForURL(base + '/AI/index.html');
    await page.goto(base + '/AI/tos.html');
    await page.waitForFunction(() => document.querySelector('.ov-nav__theme > .lgp-material'));
    // Teardown/reinitialize must retain native nav nodes and their handlers.
    await page.evaluate(() => { window.tosThemeNode = document.querySelector('.ov-nav__theme'); LiquidDesignSite.destroy(); });
    assert.equal(await page.locator('[data-lg-site],.lgp-content,.lgp-material,.lgp-outline').count(), 0);
    await theme.click();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
    await page.evaluate(() => LiquidDesignSite.refresh());
    await page.waitForFunction(() => document.querySelector('.ov-nav__theme > .lgp-material'));
    assert.ok(await page.evaluate(() => tosThemeNode === document.querySelector('.ov-nav__theme')));
    await theme.click();
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
    if (process.env.TOS_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.TOS_SCREENSHOT_DIR, `tos-glass-${engineName}-${width}.png`), fullPage: true });
    }
    console.log(`${engineName} ${width}px: 7 independent glass controls, accent, native navigation/keyboard/theme, focus, mobile bounds, teardown PASS`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'no browser JavaScript errors');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
