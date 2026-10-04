import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await fs.readFile(path.join(root, 'AI/privacy.html'), 'utf8');
assert.ok(html.indexOf('../liquid-design/liquid-design.css') > html.indexOf('../src/site.css'));
assert.match(html, /<script defer src="\.\.\/liquid-design\/liquid-design\.js"><\/script>\s*<script defer src="\.\.\/src\/liquid-design-site\.js"><\/script>/);
assert.doesNotMatch(html, /data-liquid-design-group|data-liquid-color-scene|playground/);
const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await fs.readFile(file);
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const engine = process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const errors = [];
try {
  for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', hasTouch: width < 768 });
    await context.addInitScript(() => localStorage.setItem('vail_theme', 'light'));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/AI/privacy.html`);
    await page.waitForFunction(() => window.LiquidDesignSite && document.querySelectorAll('.ov-nav [data-lg-site]').length === 7);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('main')).paddingTop === '96px' || getComputedStyle(document.querySelector('main')).paddingTop === '112px');
    const chevron = page.getByRole('button', { name: 'Toggle navigation links' });
    const theme = page.getByRole('button', { name: 'Toggle theme' });
    const controls = page.locator('.ov-nav button,.ov-nav a');
    assert.equal(await controls.count(), 7);
    for (const control of await controls.all()) {
      assert.equal(await control.locator(':scope > .lgp-material').count(), 1);
      assert.equal(await control.locator(':scope > .lgp-outline').count(), 1);
      assert.equal(await control.getAttribute('data-liquid-design-independent'), '');
    }
    assert.equal(await page.locator('[data-lgp-group]:not([data-lgp-control]),.lg-color-object').count(), 0, 'no shared group hosts or playground objects');
    assert.equal(await page.locator('footer [data-lg-site]').count(), 0, 'editorial footer links remain native');
    assert.equal(await chevron.getAttribute('aria-expanded'), String(width >= 768));
    await chevron.click();
    assert.equal(await chevron.getAttribute('aria-expanded'), String(width < 768));
    if (width >= 768) await chevron.click();
    await page.waitForTimeout(350);
    for (const material of await page.locator('.ov-nav [data-lg-site] > .lgp-material').all()) {
      assert.equal(await material.getAttribute('data-surfaces'), '1', 'each control owns one separate surface');
      assert.equal(await material.getAttribute('data-connections'), '0', 'controls have no shared connections');
    }
    const bar = await page.locator('.ov-nav__bar').boundingBox();
    assert.ok(bar.x >= 0 && bar.x + bar.width <= width + 1, 'expanded navigation fits viewport');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow');
    const tint = () => page.locator('.ov-nav__primary > .lgp-material').evaluate(el => getComputedStyle(el, '::after').backgroundColor);
    assert.notEqual(await tint(), 'rgba(0, 0, 0, 0)', 'Home accent is retained');
    await theme.click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark') && document.querySelector('.ov-nav__theme').dataset.lgpTheme === 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('vail_theme')), 'dark');
    assert.notEqual(await tint(), 'rgba(0, 0, 0, 0)', 'Home accent survives dark mode');
    await page.screenshot({ path: path.join(process.env.TEMP || root, `privacy-glass-${process.env.LIQUID_BROWSER || 'chromium'}-${width}-dark.png`), fullPage: true });
    await theme.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.ok(await theme.evaluate(el => el.matches(':focus-visible') && (getComputedStyle(el).boxShadow !== 'none' || getComputedStyle(el).outlineStyle !== 'none')), 'keyboard focus is visible');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
    assert.equal(await page.evaluate(() => localStorage.getItem('vail_theme')), 'light');
    await page.screenshot({ path: path.join(process.env.TEMP || root, `privacy-glass-${process.env.LIQUID_BROWSER || 'chromium'}-${width}.png`), fullPage: true });
    // Exercise native navigation while serving a minimal destination to avoid unrelated page behavior.
    await page.route('**/AI/tos.html', route => route.fulfill({ contentType: 'text/html', body: '<title>Terms destination</title>' }));
    await page.getByRole('link', { name: 'TOS', exact: true }).click();
    await page.waitForURL(`${origin}/AI/tos.html`);
    await page.goBack();
    await page.waitForFunction(() => !!window.LiquidDesignSite);
    await page.getByRole('link', { name: 'Terms of Service →' }).click();
    await page.waitForURL(`${origin}/AI/tos.html`);
    console.log(`${process.env.LIQUID_BROWSER || 'chromium'} ${width}px: seven independent surfaces/rims, nav collapse/expand, accent, dark/light, keyboard focus/activation, native nav/footer links, no overflow PASS`);
    await context.close();
  }
  const transitionSkips = errors.filter(message => message === 'Transition was skipped');
  assert.deepEqual(errors.filter(message => message !== 'Transition was skipped'), [], 'no control/plugin runtime errors');
  if (transitionSkips.length) console.log(`Browser notice: ${transitionSkips.length} cross-document view transitions skipped during destination/back navigation`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
