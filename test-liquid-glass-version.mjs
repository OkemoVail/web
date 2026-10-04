import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await fs.readFile(path.join(root, 'AI/version.html'), 'utf8');
assert.ok(html.indexOf('../liquid-design/liquid-design.css') > html.indexOf('../src/site.css'), 'plugin CSS follows site CSS');
assert.match(html, /<script defer src="\.\.\/liquid-design\/liquid-design\.js"><\/script>\s*<script defer src="\.\.\/src\/liquid-design-site\.js"><\/script>/, 'ordered deferred plugin and adapter');

const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await fs.readFile(file);
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[path.extname(file)];
    res.setHeader('Content-Type', type || 'application/octet-stream'); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/AI/version.html`;
const engineName = process.env.LIQUID_BROWSER || 'chromium';
const browser = await (engineName === 'webkit' ? webkit : chromium).launch();
const errors = [];
let phase = 'initialization';
const screenshots = path.join(process.env.TEMP, 'opencode');
const selector = 'button,a.skuo,a.ov-nav__link';
async function open(viewport, reducedMotion = 'no-preference') {
  const page = await browser.newPage({ viewport, reducedMotion });
  page.on('pageerror', error => errors.push({ phase, url: page.url(), message: error.message, stack: error.stack }));
  await page.addInitScript(() => {
    localStorage.setItem('vail_theme', 'light');
    localStorage.setItem('vail_remote_build', '1042');
    localStorage.setItem('vail_remote_changelog', JSON.stringify(['Initial release note']));
    localStorage.setItem('vail_last_seen_build', '1042');
  });
  await page.goto(url);
  await page.waitForFunction(() => window.LiquidDesignSite && document.querySelector('button > .lgp-material'));
  // Let the page's one-second initial changelog check finish against seeded data.
  await page.waitForTimeout(1100);
  return page;
}
async function independent(page) {
  await page.waitForFunction(selector => [...document.querySelectorAll(selector)].every(el => el.hasAttribute('data-lg-site')), selector);
  const controls = await page.locator(selector).evaluateAll(els => els.map(el => ({
    label: el.getAttribute('aria-label') || el.textContent.trim(),
    materials: el.querySelectorAll(':scope > .lgp-material').length,
    wrappers: el.querySelectorAll(':scope > .lgp-content').length,
    independent: el.hasAttribute('data-liquid-design-independent'),
    connections: el.querySelector(':scope > .lgp-material')?.dataset.connections
  })));
  for (const control of controls) {
    assert.equal(control.materials, 1, control.label);
    assert.equal(control.wrappers, 1, control.label);
    assert.equal(control.independent, true, control.label);
    assert.equal(control.connections, '0', control.label);
  }
  assert.equal(await page.locator('[data-lgp-group]:not([data-lgp-control]),[data-lgp-component],.lg-color-object').count(), 0);
  return controls;
}
async function fits(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal document overflow');
  for (const control of await page.locator('main button,.ov-nav__bar,#changelog-modal.active button').all()) {
    const box = await control.boundingBox();
    assert.ok(box && box.x >= -1 && box.x + box.width <= page.viewportSize().width + 1, 'visible control fits viewport');
  }
}
try {
  const page = await open({ width: 1280, height: 900 });
  const apply = page.getByRole('button', { name: 'Apply & Push', exact: true });
  const reset = page.getByRole('button', { name: 'Reset Seen', exact: true });
  await independent(page);
  await page.evaluate(() => window.applyIdentity = document.querySelector('[onclick="saveBuild()"]'));
  const originalBox = await apply.boundingBox();
  await page.locator('#build-input').fill('1043');
  await page.locator('#changelog-input').fill('Updated glass controls\n\nKeyboard actions retained');
  await apply.click();
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem('vail_remote_build'), JSON.parse(localStorage.getItem('vail_remote_changelog'))]), ['1043', ['Updated glass controls', 'Keyboard actions retained']]);
  assert.equal(await page.locator('#status-msg').evaluate(el => el.style.opacity), '1');
  await reset.focus(); await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => localStorage.getItem('vail_last_seen_build')), '0', 'native keyboard reset');
  await page.evaluate(() => window.checkChangelog());
  await page.getByRole('button', { name: 'Dismiss', exact: true }).waitFor();
  await independent(page);
  assert.equal(await page.locator('#changelog-version').textContent(), 'Build 1043');
  assert.match(await page.locator('#changelog-content').innerText(), /Updated glass controls/);
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  assert.equal(await page.locator('#changelog-modal').isVisible(), false);
  await page.evaluate(() => { localStorage.setItem('vail_remote_changelog', JSON.stringify(['Refreshed changelog content'])); window.showChangelog(true); });
  assert.equal((await page.locator('#changelog-content').innerText()).trim(), 'Refreshed changelog content');
  await independent(page);
  await page.getByRole('button', { name: 'Dismiss', exact: true }).focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#changelog-modal').isVisible(), false);
  phase = 'native button innerHTML replacement';
  await apply.evaluate(el => el.innerHTML = '<span>Apply &amp; Push</span>');
  await page.waitForFunction(() => document.querySelector('[onclick="saveBuild()"] > .lgp-content > span'));
  assert.ok(await page.evaluate(() => applyIdentity === document.querySelector('[onclick="saveBuild()"]')), 'native button identity retained');
  await page.locator('#build-input').fill('1044');
  await apply.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => localStorage.getItem('vail_remote_build')), '1044', 'inline handler survives replaced content');
  const replacedBox = await apply.boundingBox();
  assert.ok(Math.abs(replacedBox.width - originalBox.width) < 1 && Math.abs(replacedBox.height - originalBox.height) < 1, 'replacement preserves native dimensions');
  phase = 'disabled/focus/tint/nav/theme';
  await apply.evaluate(el => el.disabled = true);
  await page.locator('#build-input').fill('1045');
  await apply.evaluate(el => el.click());
  assert.equal(await page.evaluate(() => localStorage.getItem('vail_remote_build')), '1044', 'native disabled prevents action');
  await apply.evaluate(el => el.disabled = false);
  await reset.focus();
  assert.notEqual(await reset.evaluate(el => getComputedStyle(el).boxShadow), 'none', 'visible keyboard focus');
  const tint = () => apply.locator(':scope > .lgp-material').evaluate(el => getComputedStyle(el, '::after').backgroundColor);
  assert.notEqual(await tint(), 'rgba(0, 0, 0, 0)', 'Apply accent retained');
  const oldTint = await tint();
  await page.evaluate(() => document.documentElement.style.setProperty('--skuo-accent', '#129abc'));
  assert.notEqual(await tint(), oldTint, 'live accent update');
  await page.evaluate(() => document.documentElement.style.removeProperty('--skuo-accent'));
  const nav = page.getByRole('button', { name: 'Toggle navigation links' });
  await nav.click(); assert.equal(await nav.getAttribute('aria-expanded'), 'false');
  await nav.click(); assert.equal(await nav.getAttribute('aria-expanded'), 'true');
  const theme = page.getByRole('button', { name: 'Toggle theme' });
  await theme.click();
  await page.waitForFunction(() => document.querySelector('[onclick="saveBuild()"]').dataset.lgpTheme === 'dark');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => localStorage.getItem('vail_theme')), 'dark');
  await page.screenshot({ path: path.join(screenshots, `liquid-glass-version-${engineName}-dark.png`), fullPage: true });
  await theme.click();
  await page.waitForFunction(() => document.querySelector('[onclick="saveBuild()"]').dataset.lgpTheme === 'light');
  await page.waitForTimeout(400);
  await fits(page);
  await page.screenshot({ path: path.join(screenshots, `liquid-glass-version-${engineName}-desktop.png`), fullPage: true });
  await page.evaluate(() => window.showChangelog(true));
  await page.screenshot({ path: path.join(screenshots, `liquid-glass-version-${engineName}-changelog.png`), fullPage: true });
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  const chat = page.locator('.ov-nav__link[href="/AI/chat.html"]');
  await Promise.all([page.waitForURL('**/AI/chat.html'), chat.click()]);
  assert.ok(page.url().endsWith('/AI/chat.html'), 'native nav link navigation');
  await page.close();
  console.log(`${engineName}: native click/keyboard/disabled, save/reset, dynamic changelog, content replacement, identity/dimensions, independent glass, focus, tints, nav and light/dark PASS`);

  for (const width of [390, 320]) {
    const mobile = await open({ width, height: 844 }, 'reduce');
    await independent(mobile);
    const toggle = mobile.getByRole('button', { name: 'Toggle navigation links' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await fits(mobile);
    await mobile.locator('#build-input').fill('1050');
    await mobile.getByRole('button', { name: 'Apply & Push', exact: true }).click();
    assert.equal(await mobile.evaluate(() => localStorage.getItem('vail_remote_build')), '1050');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'outside action collapses mobile nav');
    await mobile.evaluate(() => window.showChangelog(true));
    await independent(mobile); await fits(mobile);
    await mobile.screenshot({ path: path.join(screenshots, `liquid-glass-version-${engineName}-mobile-${width}-changelog.png`), fullPage: true });
    await mobile.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await mobile.screenshot({ path: path.join(screenshots, `liquid-glass-version-${engineName}-mobile-${width}.png`), fullPage: true });
    await mobile.close();
    console.log(`${engineName}: ${width}px mobile/reduced-motion controls, nav collapse/expand, dynamic modal and overflow PASS`);
  }
  assert.deepEqual(errors, [], 'no page JS errors');
  console.log(`Evidence: ${screenshots}\\liquid-glass-version-${engineName}-*.png`);
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
