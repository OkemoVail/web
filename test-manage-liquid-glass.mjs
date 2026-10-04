import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

// Exercises the real management page: missing loads, wrapper damage, lost
// connection state, broken delete actions, and mobile clipping must fail here.
const root = path.dirname(fileURLToPath(import.meta.url));
const artifacts = process.env.MANAGE_GLASS_ARTIFACTS || 'C:/Users/okemo/AppData/Local/Temp/opencode';
const engineName = process.env.LIQUID_BROWSER || 'chromium';
await fs.access(artifacts);
const tailwind = await (await fetch('https://cdn.tailwindcss.com')).text();
const records = [
  { id: 'glass-one', title: 'Glass verification: research paper', date: '2026-10-03', tags: [{ name: 'Physics', color: 'blue' }] },
  { id: 'glass-two', title: 'A deliberately long research title checking mobile truncation and independent delete controls', date: '2026-10-02', tags: [{ name: 'Material', color: 'red' }] },
  { id: 'glass-three', title: 'Native confirmation and file synchronization', date: '2026-10-01', tags: [] }
];
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await fs.readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/AI/manage.html`;
const browser = await ({ chromium, webkit })[engineName].launch();
const errors = [];
async function open({ width = 1280, theme = 'light', baseline = false, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
  await context.route('https://cdn.tailwindcss.com/**', route => route.fulfill({ contentType: 'text/javascript', body: tailwind }));
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await context.route('https://fonts.gstatic.com/**', route => route.abort());
  if (baseline) await context.route('**/liquid-glass*.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await context.addInitScript(({ records, theme }) => {
    localStorage.setItem('olm_blogs', JSON.stringify(records));
    localStorage.setItem('vail_theme', theme);
    localStorage.setItem('vail_last_seen_build', '999999');
    // The OS picker is unavailable to automation; retain real page update/sync code.
    window.showOpenFilePicker = async () => [{
      requestPermission: async () => 'granted',
      createWritable: async () => ({ write: async value => { window.fileWritten = value; }, close: async () => {} })
    }];
  }, { records, theme });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#manage-list button')?.getBoundingClientRect().width === 40);
  await page.waitForTimeout(250);
  return page;
}
async function enhanced(page) {
  assert.equal(await page.locator('button:not([data-lg-site]),.ov-nav a:not([data-lg-site])').count(), 0, 'all native buttons/nav links are enhanced');
  assert.equal(await page.locator('[data-lgp-group]:not([data-lgp-control]),[data-lgp-component],.lg-color-object').count(), 0, 'no shared grouped/playground surfaces');
  const invalid = await page.locator('[data-lg-site]').evaluateAll(buttons => buttons.filter(button =>
    button.querySelectorAll(':scope > .lgp-content').length !== 1 ||
    button.querySelectorAll(':scope > .lgp-material').length !== 1 ||
    button.querySelectorAll(':scope > .lgp-outline').length !== 1 ||
    button.querySelector('.lgp-content .lgp-content') ||
    button.querySelector(':scope > .lgp-material').getAttribute('data-connections') !== '0'
  ).map(button => button.id || button.className));
  assert.deepEqual(invalid, [], 'one independent material/rim/content wrapper per button');
}
const tint = (page, selector) => page.locator(selector + ' > .lgp-material').first().evaluate(el => getComputedStyle(el, '::after').backgroundColor);
const shot = (page, name) => page.screenshot({ path: path.join(artifacts, `manage-glass-${engineName}-${name}.png`) });
try {
  const baseline = await open({ baseline: true });
  const before = await baseline.locator('#connect-btn').boundingBox();
  await baseline.context().close();
  const page = await open();
  await enhanced(page);
  const after = await page.locator('#connect-btn').boundingBox();
  for (const dimension of ['width', 'height']) assert.ok(Math.abs(before[dimension] - after[dimension]) < 1, `connection button ${dimension} preserved`);
  assert.match(await tint(page, '#manage-list button'), /239, 68, 68/);
  assert.equal(await page.locator('#manage-list button i').first().evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)', 'delete glyph contrasts with destructive red glass');
  assert.notEqual(await tint(page, '.ov-nav__primary'), 'rgba(0, 0, 0, 0)', 'accent navigation tint retained');
  await shot(page, 'desktop-light');

  await page.evaluate(() => { window.connectionIdentity = document.getElementById('connect-btn'); });
  await page.locator('#connect-btn').click();
  await page.waitForFunction(() => document.querySelector('#connect-btn > .lgp-content')?.textContent.includes('Connected'));
  assert.equal(await page.evaluate(() => connectionIdentity === document.getElementById('connect-btn')), true);
  assert.notEqual(await tint(page, '#connect-btn'), 'rgba(0, 0, 0, 0)', 'connected accent state remains visible through glass');
  await enhanced(page);
  await page.locator('#connect-btn').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.matches('#manage-list button')), true);
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none', 'keyboard focus remains visible');

  await page.evaluate(() => {
    window.showChangelog(true);
    // Existing shared updatenotes.js uses inline display:none, overriding its
    // active rule. Expose only in the test to verify hidden-to-visible glass.
    const style = document.createElement('style');
    style.textContent = '#changelog-modal { display:none; }';
    document.head.append(style);
    document.getElementById('changelog-modal').style.removeProperty('display');
  });
  await page.waitForFunction(() => document.querySelector('#changelog-modal button > .lgp-material')?.dataset.surfaces === '1');
  await enhanced(page);
  await shot(page, 'dialog-light');
  await page.getByRole('button', { name: 'Dismiss' }).click();
  assert.equal(await page.locator('#changelog-modal').isVisible(), false);

  const dialogs = [];
  let acceptDelete = false;
  page.on('dialog', async dialog => {
    dialogs.push(dialog.type());
    if (dialog.type() === 'confirm' && !acceptDelete) await dialog.dismiss();
    else await dialog.accept();
  });
  await page.locator('#manage-list button').first().click();
  assert.equal(await page.locator('.manage-card').count(), 3, 'cancelled deletion preserves records');
  acceptDelete = true;
  await page.evaluate(() => { window.deletedButton = document.querySelector('#manage-list button'); });
  await page.locator('#manage-list button').first().click();
  await page.waitForFunction(() => window.fileWritten && !window.deletedButton.hasAttribute('data-lgp-control'));
  assert.deepEqual(await page.evaluate(() => JSON.parse(fileWritten).map(record => record.id)), ['glass-two', 'glass-three']);
  assert.deepEqual(dialogs, ['confirm', 'confirm']);
  await enhanced(page);

  await page.getByRole('button', { name: 'Toggle navigation links' }).click();
  assert.equal(await page.locator('.ov-nav__chevron').getAttribute('aria-expanded'), 'false');
  await page.getByRole('button', { name: 'Toggle navigation links' }).click();
  assert.equal(await page.locator('.ov-nav__chevron').getAttribute('aria-expanded'), 'true');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.waitForFunction(() => document.querySelector('#connect-btn').dataset.lgpTheme === 'dark');
  assert.match(await tint(page, '#manage-list button'), /239, 68, 68/);
  await shot(page, 'desktop-dark');
  await page.locator('#manage-list button').first().click();
  await page.locator('#manage-list button').first().click();
  assert.equal(await page.locator('#empty-state').isVisible(), true);
  assert.equal(await page.locator('#empty-state a[data-lg-site]').count(), 0, 'editorial create link stays native');
  console.log(`${engineName}: seeded management, independent glass, native dimensions/focus, connected replacement/tint, dynamic dialog, confirmation cancellation/deletion, file sync/cleanup, nav/theme, empty state PASS`);

  for (const width of [320, 390]) {
    const small = await open({ width, theme: 'dark', reducedMotion: 'reduce' });
    await enhanced(small);
    assert.equal(await small.locator('.ov-nav__chevron').getAttribute('aria-expanded'), 'false');
    await small.getByRole('button', { name: 'Toggle navigation links' }).click();
    await small.waitForTimeout(300);
    assert.equal(await small.locator('.ov-nav__chevron').getAttribute('aria-expanded'), 'true');
    assert.ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no mobile horizontal overflow');
    const nav = await small.locator('.ov-nav__bar').boundingBox();
    assert.ok(nav.x >= 0 && nav.x + nav.width <= width, 'expanded nav fits viewport');
    const deletion = await small.locator('#manage-list button').first().boundingBox();
    assert.equal(deletion.width, 40); assert.equal(deletion.height, 40);
    await small.locator('#connect-btn').click();
    await small.waitForFunction(() => document.querySelector('#connect-btn > .lgp-content')?.textContent.includes('Connected'));
    await small.evaluate(() => {
      window.showChangelog(true);
      const style = document.createElement('style');
      style.textContent = '#changelog-modal { display:none; }';
      document.head.append(style);
      document.getElementById('changelog-modal').style.removeProperty('display');
    });
    await small.waitForFunction(() => document.querySelector('#changelog-modal button > .lgp-material')?.dataset.surfaces === '1');
    await enhanced(small);
    await shot(small, `mobile-${width}-dialog`);
    await small.getByRole('button', { name: 'Dismiss' }).click();
    await shot(small, `mobile-${width}`);
    await small.context().close();
  }
  assert.deepEqual(errors, [], 'no page exceptions');
  console.log(`${engineName}: mobile 320/390, reduced motion, nav expand, connected replacement, dynamic dialog, no overflow PASS`);
  console.log(`Screenshots: ${artifacts}/manage-glass-${engineName}-*.png`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
