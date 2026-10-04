import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await fs.readFile(path.join(root, 'AI/goals.html'), 'utf8');
assert.ok(html.indexOf('../src/site.css') < html.indexOf('../liquid-design/liquid-design.css'));
assert.match(html, /<script defer src="\.\.\/liquid-design\/liquid-design\.js"><\/script>\s*<script defer src="\.\.\/src\/liquid-design-site\.js"><\/script>/);
assert.doesNotMatch(html, /data-liquid-design-group|data-liquid-color-scene|liquid-glass-live-demo/);

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const content = await fs.readFile(file);
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)];
    res.setHeader('Content-Type', type || 'application/octet-stream');
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/AI/goals.html`;
const engineName = process.env.LIQUID_BROWSER || 'chromium';
const browser = await (engineName === 'webkit' ? webkit : chromium).launch();
const errors = [];
const controls = 'button,a.ov-nav__link,a.ov-nav__primary';
const measure = page => page.locator(controls).evaluateAll(els => els.map(el => ({
  name: el.getAttribute('aria-label') || el.textContent.trim(),
  width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height
})));
async function open(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.tailwind && window.LiquidDesignSite && document.querySelectorAll('[data-lg-site]').length === 7);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  return page;
}
async function independent(page) {
  assert.equal(await page.locator(controls).count(), 7);
  assert.equal(await page.locator('[data-lgp-group]:not([data-lgp-control]),.lg-color-object,[data-lgp-component]').count(), 0);
  for (const control of await page.locator(controls).all()) {
    assert.equal(await control.locator(':scope > .lgp-content').count(), 1);
    assert.equal(await control.locator(':scope > .lgp-material').count(), 1);
    assert.equal(await control.locator(':scope > .lgp-outline').count(), 1);
    assert.equal(await control.getAttribute('data-liquid-design-independent'), '');
    assert.equal(await control.locator(':scope > .lgp-material').getAttribute('data-connections'), '0');
  }
}
async function fits(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page has no horizontal overflow');
  const box = await page.locator('.ov-nav__bar').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= (await page.evaluate(() => innerWidth)) + 1, 'nav stays inside viewport');
}
try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const baseline = await desktop.newPage();
  baseline.on('pageerror', error => errors.push(error.message));
  await baseline.route(/\/(liquid-design\/liquid-design\.(?:js|css)|src\/liquid-design-site\.js)$/, route => route.fulfill({ body: '', contentType: route.request().url().endsWith('.css') ? 'text/css' : 'text/javascript' }));
  await baseline.goto(url);
  await baseline.waitForFunction(() => window.tailwind && document.querySelector('.ov-nav'));
  await baseline.evaluate(() => document.fonts.ready);
  await baseline.waitForTimeout(200);
  const before = await measure(baseline);
  const page = await open(desktop);
  await independent(page);
  const after = await measure(page);
  assert.equal(after.length, before.length);
  before.forEach((old, i) => {
    assert.equal(after[i].name, old.name);
    for (const axis of ['width', 'height']) assert.ok(Math.abs(old[axis] - after[i][axis]) < 1, `${old.name} retains ${axis}`);
  });
  const chevron = page.getByRole('button', { name: 'Toggle navigation links' });
  await chevron.click();
  assert.equal(await chevron.getAttribute('aria-expanded'), 'false');
  await chevron.focus();
  await page.keyboard.press('Enter');
  assert.equal(await chevron.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Goals');
  assert.notEqual(await page.locator('.ov-nav__link').first().evaluate(el => getComputedStyle(el).boxShadow), 'none', 'keyboard focus remains visible');
  const theme = page.getByRole('button', { name: 'Toggle theme' });
  const tint = () => page.locator('.ov-nav__primary > .lgp-material').evaluate(el => getComputedStyle(el, '::after').backgroundColor);
  const lightTint = await tint();
  assert.notEqual(lightTint, 'rgba(0, 0, 0, 0)', 'Home retains accent tint');
  await theme.click();
  await page.waitForFunction(() => document.querySelector('.ov-nav__theme').dataset.lgpTheme === 'dark');
  assert.equal(await page.evaluate(() => localStorage.getItem('vail_theme')), 'dark');
  await independent(page);
  await fits(page);
  const evidenceDir = 'C:/Users/okemo/AppData/Local/Temp/opencode';
  await fs.access(evidenceDir);
  await page.screenshot({ path: path.join(evidenceDir, `goals-glass-${engineName}-desktop-dark.png`), fullPage: true });
  await theme.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
  assert.equal(await page.evaluate(() => localStorage.getItem('vail_theme')), 'light');
  await theme.evaluate(el => el.blur());
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(evidenceDir, `goals-glass-${engineName}-desktop-light.png`), fullPage: true });
  // Cross-document view transitions can report timing-dependent browser skip
  // rejections when a test immediately navigates again. Keep navigation native,
  // but disable that unrelated animation in this control integration harness.
  await page.addStyleTag({ content: '@view-transition { navigation: none; }' });
  await Promise.all([page.waitForURL(url), page.getByRole('link', { name: 'Goals', exact: true }).click()]);
  await page.waitForFunction(() => document.querySelectorAll('[data-lg-site]').length === 7);
  await page.addStyleTag({ content: '@view-transition { navigation: none; }' });
  await page.route('**/AI/index.html', route => route.fulfill({ contentType: 'text/html', body: '<title>Native Home destination</title>' }));
  await Promise.all([page.waitForURL('**/AI/index.html'), page.getByRole('link', { name: 'Home', exact: true }).click()]);
  assert.deepEqual(errors, []);
  console.log(`${engineName}: seven independent surfaces, baseline dimensions, keyboard focus/activation, native navigation, light/dark theme and accent PASS`);

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', colorScheme: 'light' });
  const small = await open(mobile);
  const toggle = small.getByRole('button', { name: 'Toggle navigation links' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await fits(small);
  await toggle.tap();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  await small.waitForTimeout(300);
  await fits(small);
  await independent(small);
  await small.screenshot({ path: path.join(evidenceDir, `goals-glass-${engineName}-mobile-expanded.png`), fullPage: true });
  await small.getByRole('button', { name: 'Toggle theme' }).tap();
  await small.waitForFunction(() => document.querySelector('.ov-nav__theme').dataset.lgpTheme === 'dark');
  await small.locator('h1').tap();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'outside tap collapses mobile navigation');
  await small.setViewportSize({ width: 320, height: 740 });
  await toggle.tap();
  await small.waitForTimeout(300);
  await fits(small);
  await toggle.tap();
  await toggle.tap();
  await independent(small);
  assert.equal(await toggle.locator('.lgp-content').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a), 1, 'reduced-motion controls stay stable');
  assert.deepEqual(errors, []);
  console.log(`${engineName}: mobile touch, initial/outside collapse, repeated expansion, 390px/320px overflow, reduced motion and zero page errors PASS`);
  console.log(`Screenshots: ${evidenceDir}/goals-glass-${engineName}-{desktop-light,desktop-dark,mobile-expanded}.png`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
