import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.join(root, pathname);
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/search/index.html`;
const browser = await chromium.launch({ headless: true });
const errors = [];
const result = { url: 'https://example.com/result', title: 'Glass integration result', description: 'A native result row.' };
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');

async function open(viewport, options = {}) {
  const { baseline = false, ...browserOptions } = options;
  const page = await browser.newPage({ viewport, ...browserOptions });
  page.on('pageerror', error => { if (!baseline) errors.push(error.stack); });
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('https://example.com/**', route => route.fulfill({ contentType: 'image/png', body: pixel }));
  await page.route('**/api/suggest?**', route => route.fulfill({ json: ['glass stars', 'glass moons'] }));
  await page.route('**/api/search?**', route => route.fulfill({ json: { results: [result] } }));
  await page.route('**/api/images?**', route => route.fulfill({ json: { results: [{ ...result, image: 'https://example.com/image.png', thumbnail: 'https://example.com/image.png' }] } }));
  await page.route('**/api/perspectives?**', route => route.fulfill({ json: { results: [{ ...result, sources: ['bing'] }], perspectives: null } }));
  let summaryCalls = 0;
  await page.route('**/api/summary?**', route => route.fulfill(++summaryCalls === 1
    ? { status: 503, body: '' } : { json: { summary: 'Generated site brief.' } }));
  await page.route('**/v1/chat/completions', async route => {
    const request = route.request().postDataJSON();
    if (!request.stream) return route.fulfill({ json: { choices: [{ message: { content: 'Consulting stars' } }] } });
    const followUp = request.messages.length > 2;
    if (followUp) await new Promise(resolve => setTimeout(resolve, 800));
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"A grounded answer [1]."}}]}\n\ndata: [DONE]\n\n' }).catch(() => {});
  });
  if (baseline) {
    await page.route('**/liquid-design.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route('**/liquid-design-site.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  }
  await page.goto(url);
  if (!baseline) await page.waitForFunction(() => document.querySelector('#hero-search > .lgp-material'));
  return page;
}

async function glass(page, selector) {
  await page.waitForFunction(selector => {
    const el = document.querySelector(selector);
    return el?.hasAttribute('data-liquid-design-independent') &&
      el.querySelectorAll(':scope > .lgp-material').length === 1 &&
      el.querySelectorAll(':scope > .lgp-outline').length === 1 &&
      el.querySelectorAll(':scope > .lgp-content').length === 1;
  }, selector);
}
const tint = (page, selector) => page.locator(`${selector} > .lgp-material`).evaluate(el => getComputedStyle(el, '::after').backgroundColor);

try {
  const page = await open({ width: 1280, height: 900 });
  assert.equal(await page.locator('.ov-nav,[data-lgp-group]:not([data-lgp-control]),[data-liquid-color-scene]').count(), 0);
  assert.equal(await page.locator('.ai-ring > #hero-cosmic').count(), 1, 'cosmic aurora wrapper remains intact');
  await page.locator('#tour-later').click();
  await page.locator('#hero-input').fill('glass');
  await page.locator('#hero-suggest button').first().waitFor();
  await glass(page, '#hero-suggest-option-0');
  await page.locator('#hero-input').press('ArrowDown');
  const active = await page.locator('#hero-input').getAttribute('aria-activedescendant');
  assert.equal(await page.locator(`#${active}`).getAttribute('aria-selected'), 'true');
  await page.locator('#hero-input').press('Enter');
  await page.locator('#result-1').waitFor();
  await page.waitForFunction(() => document.querySelector('#ai-panel').getAttribute('aria-busy') === 'false');
  assert.match(page.url(), /q=glass\+stars|q=glass%20stars/);
  await glass(page, '#result-1 .summary-hit');
  await page.locator('#result-1 .summary-hit').focus();
  await page.keyboard.press('Enter');
  await page.locator('#result-1 .result-summary-retry').waitFor({ state: 'visible' });
  await glass(page, '#result-1 .result-summary-retry');
  await page.locator('#result-1 .result-summary-retry').click();
  await page.locator('#result-1 .result-summary-body').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result-1 .result-summary-body').textContent(), 'Generated site brief.');
  await glass(page, '#result-1 .result-summary-visit');
  assert.equal(await page.locator('#result-1 .result-summary-visit').getAttribute('href'), result.url);
  const allTint = await tint(page, '#tab-all');
  await page.locator('#tab-all').focus();
  await page.keyboard.press('ArrowRight');
  await page.locator('#image-grid .ig-item').first().waitFor();
  assert.equal(await page.locator('#tab-images').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#tab-all').getAttribute('tabindex'), '-1');
  assert.notEqual(await tint(page, '#tab-all'), allTint, 'selected tint follows native tab state');
  await page.locator('#image-grid .ig-item').first().click();
  await page.locator('#ig-preview').waitFor({ state: 'visible' });
  await glass(page, '#igp-close');
  await page.locator('#igp-close').click();
  assert.equal(await page.locator('#ig-preview').isVisible(), false);
  await page.locator('#tab-images').focus();
  await page.keyboard.press('ArrowLeft');
  await page.locator('#ai-mode-answer').focus();
  await page.keyboard.press('ArrowRight');
  await page.locator('#perspectives-fallback-answer').waitFor();
  await glass(page, '#perspectives-fallback-answer');
  assert.equal(await page.locator('#ai-mode-perspectives').getAttribute('aria-checked'), 'true');
  assert.notEqual(await tint(page, '#ai-mode-perspectives'), 'rgba(0, 0, 0, 0)');
  // Exercise the persisted Perspectives entry path before its native fallback.
  await page.reload();
  await page.locator('#perspectives-fallback-answer').waitFor();
  await glass(page, '#perspectives-fallback-answer');
  await page.locator('#perspectives-fallback-answer').click();
  await page.locator('#ai-follow').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#ai-panel').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#ai-mode-answer').getAttribute('aria-checked'), 'true');
  await page.locator('#ai-expand').click();
  await glass(page, '#ai-expand');
  assert.equal(await page.locator('#ai-expand').getAttribute('aria-label'), 'exit fullscreen');
  assert.equal(await page.locator('#ai-panel').getAttribute('role'), 'dialog');
  assert.equal(await page.locator('#results-bar').evaluate(el => !!el.closest('[inert]')), true);
  await page.keyboard.press('Escape');
  await glass(page, '#ai-expand');
  assert.equal(await page.locator('#ai-expand').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ai-expand');
  await page.locator('#ai-follow-input').fill('Explain more');
  await page.locator('#ai-follow-send').click();
  await page.locator('#ai-stop').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#ai-follow-send').isEnabled(), false);
  await glass(page, '#ai-stop');
  await page.locator('#ai-stop').click();
  await page.locator('#ai-follow-send').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#ai-panel').getAttribute('aria-busy'), 'false');
  await page.locator('#ai-toggle').click();
  assert.equal(await page.locator('#ai-toggle').getAttribute('aria-pressed'), 'false');
  // Fresh route retains the thinking node for the next Answer request.
  await page.reload();
  await page.locator('#result-1').waitFor();
  await glass(page, '#ai-toggle');
  await page.locator('#ai-toggle').click();
  assert.equal(await page.locator('#ai-toggle').getAttribute('aria-pressed'), 'true');
  await page.locator('#ai-follow').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#ai-panel').getAttribute('aria-busy') === 'false');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log('PASS desktop: independent glass, autocomplete/ARIA, search, dynamic summary retry/visit, tabs/tints, image dialog, radio modes/fallback, fullscreen content repair/focus, composer send/stop, AI toggle; no new JS errors');

  const mobile = await open({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await mobile.locator('#tour-sure').tap();
  await mobile.locator('#result-1').waitFor();
  await mobile.locator('#tour-next').tap();
  await mobile.locator('#tour-next').tap();
  await glass(mobile, '#tour-next');
  assert.equal(await mobile.locator('#tour-next').isEnabled(), false);
  await mobile.locator('#tour-target-action').tap();
  assert.equal(await mobile.locator('#tour-next').isEnabled(), true);
  assert.equal(await mobile.locator('#result-1 .summary-hit').getAttribute('aria-expanded'), 'true');
  await mobile.locator('#tour-next').tap();
  assert.equal(await mobile.locator('#tour-guide').isVisible(), false);
  await mobile.locator('#result-1 .result-summary-retry').tap();
  await mobile.locator('#result-1 .result-summary-body').waitFor({ state: 'visible' });
  await mobile.locator('#ai-mode-perspectives').tap();
  await mobile.locator('#perspectives-fallback-answer').waitFor();
  const box = await mobile.locator('#ai-mode-toggle').boundingBox();
  assert(box && box.x >= 0 && box.x + box.width <= 391);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await mobile.locator('[data-lgp-group]:not([data-lgp-control]),.ov-nav').count(), 0);
  const missing = await mobile.locator('button').evaluateAll(buttons => buttons.filter(button => !button.querySelector(':scope > .lgp-material')).map(button => button.id));
  assert.deepEqual(missing, []);
  assert.deepEqual(errors, []);
  console.log('PASS mobile/reduced-motion: touch tour, disabled Finish gate, textContent repair, real summary action/retry, radio controls, all dynamic buttons enhanced, no overflow or new JS errors');
  // Confirm the unrelated Answer→Perspectives→Answer failure without glass.
  const baseline = await open({ width: 1280, height: 900 }, { baseline: true });
  const baselineErrors = [];
  baseline.on('pageerror', error => baselineErrors.push(error.message));
  await baseline.locator('#tour-later').click();
  await baseline.locator('#hero-input').fill('baseline');
  await baseline.locator('#hero-search').click();
  await baseline.locator('#ai-follow').waitFor({ state: 'visible' });
  await baseline.waitForFunction(() => document.querySelector('#ai-panel').getAttribute('aria-busy') === 'false');
  await baseline.locator('#ai-mode-perspectives').click();
  await baseline.locator('#perspectives-fallback-answer').click();
  await baseline.locator('#ai-toggle').click();
  await baseline.locator('#ai-toggle').click();
  await baseline.waitForFunction(() => !document.querySelector('#ai-thinking'));
  assert.equal(await baseline.evaluate(() => !!window.LiquidDesign), false);
  assert(baselineErrors.some(error => error.includes("Cannot set properties of null (setting 'hidden')")));
  console.log('BASELINE confirmed without glass: Answer→Perspectives→Answer removes #ai-thinking and throws; reported separately, application behavior left untouched');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
