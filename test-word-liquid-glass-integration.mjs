import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await fs.readFile(path.join(root, 'word/index.html'), 'utf8');
assert.ok(html.indexOf('../src/site.css') < html.indexOf('../liquid-design/liquid-design.css'));
assert.ok(html.indexOf('defer src="../liquid-design/liquid-design.js"') < html.indexOf('defer src="../src/liquid-design-site.js"'));
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    const body = await fs.readFile(file);
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)];
    res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const engineName = process.env.WORD_GLASS_BROWSER || 'chromium';
const browser = await (engineName === 'webkit' ? webkit : chromium).launch();
const tint = (page, id) => page.locator(`#${id} > .lgp-material`).evaluate(el => getComputedStyle(el, '::after').backgroundColor);
const selectedText = page => page.evaluate(() => getSelection().toString());

try {
  for (const device of [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'mobile', viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' },
  ]) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('vail_theme', 'light'); });
    await page.route('https://api.okemovail.com/v1/chat/completions', async route => {
      await new Promise(resolve => setTimeout(resolve, 200));
      await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"Glass keeps native writing intact."}}]}\n\ndata: [DONE]\n\n' });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/word/index.html`);
    await page.waitForFunction(() => [...document.querySelectorAll('button')].every(el => el.hasAttribute('data-lg-site')));
    assert.equal(await page.locator('[data-liquid-design-group],[data-lgp-component],[data-liquid-color-scene]').count(), 0, 'no explicit groups or playground');
    assert.ok(await page.locator('button > .lgp-material').evaluateAll(els => els.every(el => Number(el.dataset.surfaces) <= 1 && Number(el.dataset.connections) === 0)), 'each button owns at most one surface and zero connections');
    assert.equal(await page.locator('.ow-toolbar > .lgp-material').count(), 0, 'toolbar has no shared face');
    assert.equal(await page.locator('button > .lgp-content > .lgp-content').count(), 0, 'no nested wrappers');
    await page.evaluate(() => { window.boldIdentity = document.getElementById('tb-bold'); });
    await page.locator('#editor').fill('Select these words');
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.focus();
      const range = document.createRange(); range.selectNodeContents(editor);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      captureRange();
    });
    const neutral = await tint(page, 'tb-bold');
    if (device.hasTouch) await page.locator('#tb-bold').tap();
    else await page.locator('#tb-bold').click();
    assert.equal(await selectedText(page), 'Select these words', 'formatting retains native selection');
    assert.equal(await page.locator('#tb-bold').getAttribute('aria-pressed'), 'true');
    assert.ok(await page.locator('#tb-bold').evaluate(el => el.classList.contains('skuo-accent')));
    assert.ok(await page.evaluate(() => document.queryCommandState('bold')));
    assert.notEqual(await tint(page, 'tb-bold'), neutral, 'selected formatting receives accent glass');
    await page.locator('#tb-italic').click();
    assert.ok(await page.evaluate(() => document.queryCommandState('italic')));
    await page.locator('#fmt-select').selectOption('h2');
    assert.equal(await page.locator('#editor h2').textContent(), 'Select these words');
    assert.ok(await page.evaluate(() => boldIdentity === document.getElementById('tb-bold')), 'editor button identity survives');
    await page.locator('#save-btn').focus();
    await page.keyboard.press('Tab');
    assert.notEqual(await page.locator('#document-menu-btn').evaluate(el => getComputedStyle(el).boxShadow), 'none', 'keyboard focus survives');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#document-menu').getAttribute('aria-hidden'), 'false');
    assert.equal(await page.locator('#document-menu button').first().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#document-menu-btn').evaluate(el => el === document.activeElement), true);
    const trigger = device.hasTouch ? '#ai-fab' : '#ai-edge-tab';
    if (device.hasTouch) await page.locator(trigger).tap();
    else await page.locator(trigger).click();
    assert.equal(await page.locator('#ai-panel').evaluate(el => el.inert), false);
    assert.equal(await page.locator('#ai-toggle-btn').getAttribute('aria-expanded'), 'true');
    for (const id of ['ai-toggle-btn', 'ai-send-btn', 'ai-fab']) assert.notEqual(await tint(page, id), 'rgba(0, 0, 0, 0)', `${id}: accent tint`);
    await page.locator('#ai-input').fill('Improve my document');
    await page.locator('#ai-send-btn').click();
    await page.waitForFunction(() => document.getElementById('ai-send-btn').disabled);
    await page.waitForFunction(() => document.querySelectorAll('.msg-insert-btn[data-lg-site]').length === 2);
    assert.equal(await page.locator('#ai-send-btn').isEnabled(), true);
    assert.equal(await page.locator('#ai-panel').getAttribute('aria-busy'), 'false');
    await page.getByRole('button', { name: 'Insert Below' }).click();
    assert.match(await page.locator('#editor').textContent(), /Glass keeps native writing intact/);
    await page.getByRole('button', { name: 'Clear conversation' }).click();
    assert.equal(await page.locator('.msg-insert-btn').count(), 0);
    assert.equal(await page.locator('#ai-welcome').count(), 1);
    const lightTint = await tint(page, 'ai-send-btn');
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.style.setProperty('--skuo-accent', '#129abc');
    });
    await page.waitForFunction(() => document.getElementById('ai-send-btn').dataset.lgpTheme === 'dark');
    assert.notEqual(await tint(page, 'ai-send-btn'), lightTint, 'live accent and theme update');
    if (device.hasTouch) {
      const panel = await page.locator('#ai-panel').boundingBox();
      assert.ok(panel.width >= 319 && panel.width <= 321, 'mobile Oaky remains full width');
      await page.locator('.ai-mobile-close').tap();
      assert.equal(await page.locator('#ai-panel').evaluate(el => el.inert), true);
      await page.locator('#ai-fab').tap();
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#ai-panel').getAttribute('aria-hidden'), 'true');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow');
    await page.locator('#save-btn').click();
    assert.match(await page.locator('#st-save').textContent(), /^Saved /);
    assert.deepEqual(errors, [], 'no runtime errors');
    console.log(`${engineName} ${device.name}: independent glass, selection/bold/italic/heading, focus/menu, Oaky/dynamic insertion, accent/theme, save, overflow PASS`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
