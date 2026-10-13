import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
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
let searchRequests = 0;
let perspectiveRequests = 0;
let answerRequests = 0;
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
  await page.route('**/api/search?**', route => { searchRequests++; return route.fulfill({ json: { results: [result] } }); });
  await page.route('**/api/images?**', route => route.fulfill({ json: { results: [{ ...result, image: 'https://example.com/image.png', thumbnail: 'https://example.com/image.png' }] } }));
  await page.route('**/api/perspectives?**', route => { perspectiveRequests++; return route.fulfill({ json: { results: [{ ...result, sources: ['bing'] }], perspectives: null } }); });
  let summaryCalls = 0;
  await page.route('**/api/summary?**', route => route.fulfill(++summaryCalls === 1
    ? { status: 503, body: '' } : { json: { summary: 'Generated site brief.' } }));
  await page.route('**/v1/chat/completions', async route => {
    answerRequests++;
    const request = route.request().postDataJSON();
    if (!request.stream) return route.fulfill({ json: { choices: [{ message: { content: 'Consulting stars' } }] } });
    const followUp = request.messages.length > 2;
    if (followUp) await new Promise(resolve => setTimeout(resolve, 800));
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"A grounded answer [1]."}}]}\n\ndata: [DONE]\n\n' }).catch(() => {});
  });
  if (baseline) {
    await page.route(/\/liquid-design\.js(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route(/\/liquid-design-site\.js(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  }
  await page.goto(url);
  if (!baseline) {
    try { await page.waitForFunction(() => document.querySelector('#hero-bar > .lgp-material')); }
    catch (error) { console.error('Glass mount errors:', errors); throw error; }
  }
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
const contrast = buffer => {
  const png = PNG.sync.read(buffer);
  const values = [];
  for (let i = 0; i < png.data.length; i += 4) values.push(png.data[i]);
  return Math.max(...values) - Math.min(...values);
};
try {
  const page = await open({ width: 1280, height: 900 });
  await glass(page, '#hero-bar');
  assert.equal(await page.locator('#hero-bar').getAttribute('data-lgp-control'), 'surface', 'native search field uses the same editable glass API as Home');
  await page.evaluate(() => {
    const backdrop = document.createElement('div');
    backdrop.id = 'hero-blur-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:0;background:repeating-linear-gradient(90deg,#000 0px,#000 3px,#fff 3px,#fff 6px);pointer-events:none';
    document.body.prepend(backdrop);
    document.querySelector('#hero').style.setProperty('z-index', '1', 'important');
    document.querySelector('#stars').style.display = 'none';
    document.querySelector('#hero-bar > .lgp-content').style.opacity = '0';
    document.querySelector('#hero-bar > .lgp-outline').style.opacity = '0';
  });
  const heroBar = page.locator('#hero-bar');
  const heroMaterialBox = await heroBar.boundingBox();
  assert(heroMaterialBox);
  const heroMaterialClip = {
    x: Math.round(heroMaterialBox.x + heroMaterialBox.width / 2 - 24),
    y: Math.round(heroMaterialBox.y + heroMaterialBox.height / 2 - 3),
    width: 48,
    height: 6,
  };
  const blurredContrast = contrast(await page.screenshot({ clip: heroMaterialClip }));
  await heroBar.evaluate(el => {
    el.style.backdropFilter = 'none';
    el.style.webkitBackdropFilter = 'none';
  });
  const sharpContrast = contrast(await page.screenshot({ clip: heroMaterialClip }));
  assert.ok(blurredContrast < sharpContrast * .5, `hero search glass blurs its backdrop (blurred ${blurredContrast}, sharp ${sharpContrast})`);
  await page.evaluate(() => {
    document.querySelector('#hero-blur-backdrop').remove();
    document.querySelector('#stars').style.removeProperty('display');
    document.querySelector('#hero-bar > .lgp-content').style.removeProperty('opacity');
    document.querySelector('#hero-bar > .lgp-outline').style.removeProperty('opacity');
    const bar = document.querySelector('#hero-bar');
    bar.style.removeProperty('backdrop-filter');
    bar.style.removeProperty('-webkit-backdrop-filter');
    document.querySelector('#hero').style.removeProperty('z-index');
  });
  assert.equal(await page.locator('.ov-nav,[data-lgp-group]:not([data-lgp-control]),[data-liquid-color-scene]').count(), 0);
  await glass(page, '#hero-search');
  assert.equal(await page.locator('#hero-cosmic > .lgp-material').count(), 0, 'cosmic action remains a native button');
  assert.equal(await page.locator('.ai-ring').count(), 0, 'legacy aurora wrapper is removed');
  await page.locator('#tour-later').click();
  await page.locator('#hero-input').fill('glass');
  await page.locator('#hero-suggest button').first().waitFor();
  assert.equal(await page.locator('#hero-suggest-option-0 > .lgp-material').count(), 0, 'suggestions remain native rows');
  await page.locator('#hero-input').press('ArrowDown');
  const active = await page.locator('#hero-input').getAttribute('aria-activedescendant');
  assert.equal(await page.locator(`#${active}`).getAttribute('aria-selected'), 'true');
  await page.locator('#hero-input').press('Enter');
  await page.locator('#result-1').waitFor();
  await page.waitForFunction(() => document.querySelector('#ai-panel').getAttribute('aria-busy') === 'false');
  assert.match(page.url(), /q=glass\+stars|q=glass%20stars/);
  await glass(page, '#results-search');
  await glass(page, '#ai-mode-toggle');
  const standardResultNode = await page.locator('#result-1').evaluate(element => {
    window.__astraStandardResultNode = element;
    return element.textContent;
  });
  const requestsBeforeModeSwitch = searchRequests;
  const answersBeforeModeSwitch = answerRequests;
  const perspectivesBeforeModeSwitch = perspectiveRequests;
  const modeLayout = await page.locator('#ai-mode-toggle').evaluate((toggle) => {
    const content = toggle.querySelector(':scope > .lgp-content');
    const answer = toggle.querySelector('#ai-mode-answer').getBoundingClientRect();
    const perspectives = toggle.querySelector('#ai-mode-perspectives').getBoundingClientRect();
    return {
      display: getComputedStyle(content).display,
      widthDelta: Math.abs(answer.width - perspectives.width),
      centerDelta: Math.abs(answer.y + answer.height / 2 - (perspectives.y + perspectives.height / 2)),
    };
  });
  assert.equal(modeLayout.display, 'grid', 'glass wrapper preserves the equal-column segmented layout');
  assert(modeLayout.widthDelta < 1, 'Answer and Perspectives occupy equal-width tracks');
  assert(modeLayout.centerDelta < 1, 'Answer and Perspectives share one vertical center');
  const modeInsets = await page.locator('#ai-mode-toggle').evaluate((toggle) => {
    const host = toggle.getBoundingClientRect();
    const highlight = toggle.querySelector('.ai-mode-highlight').getBoundingClientRect();
    return { top: highlight.top - host.top, bottom: host.bottom - highlight.bottom };
  });
  assert(Math.abs(modeInsets.top - modeInsets.bottom) < 1, 'selected pill has balanced top and bottom insets');
  const answerBox = await page.locator('#ai-mode-answer').boundingBox();
  const perspectivesBox = await page.locator('#ai-mode-perspectives').boundingBox();
  assert(answerBox && perspectivesBox);
  await page.mouse.move(answerBox.x + answerBox.width / 2, answerBox.y + answerBox.height / 2);
  await page.mouse.down();
  const betweenModes = (answerBox.x + answerBox.width / 2 + perspectivesBox.x + perspectivesBox.width / 2) / 2;
  await page.mouse.move(betweenModes, answerBox.y + answerBox.height / 2, { steps: 3 });
  const continuousDrag = await page.locator('#ai-mode-toggle').evaluate((toggle) => {
    const track = toggle.querySelector(':scope > .lgp-content') || toggle;
    const x = parseFloat(toggle.style.getPropertyValue('--ai-mode-drag-x'));
    return { dragging: toggle.hasAttribute('data-dragging'), x, travel: (track.getBoundingClientRect().width - 6) / 2 };
  });
  assert.equal(continuousDrag.dragging, true);
  assert(continuousDrag.x > 0 && continuousDrag.x < continuousDrag.travel, 'highlight follows the cursor between both resting positions');
  await page.mouse.move(perspectivesBox.x + perspectivesBox.width / 2, perspectivesBox.y + perspectivesBox.height / 2, { steps: 2 });
  await page.mouse.up();
  assert.equal(await page.locator('#ai-mode-toggle').getAttribute('data-dragging'), null, 'highlight snaps back to a resting option on release');
  assert.equal(await page.locator('#ai-mode-toggle').getAttribute('data-mode'), 'perspectives', 'release applies the destination without an intermediate mode reset');
  assert.equal(await page.locator('#ai-mode-perspectives').evaluate((button) => button.scrollWidth <= button.clientWidth), true, 'Perspectives label fits inside its segment');
  await page.locator('#perspectives-fallback-answer').waitFor();
  assert.equal(await page.locator('#ai-mode-perspectives').getAttribute('aria-checked'), 'true', 'dragging the selected pill chooses Perspectives');
  assert.equal(await page.locator('#result-1').evaluate(element => element === window.__astraStandardResultNode), true, 'Perspectives does not replace the web-result rows');
  const currentAnswerBox = await page.locator('#ai-mode-answer').boundingBox();
  const currentPerspectivesBox = await page.locator('#ai-mode-perspectives').boundingBox();
  assert(currentAnswerBox && currentPerspectivesBox);
  await page.mouse.move(currentPerspectivesBox.x + currentPerspectivesBox.width / 2, currentPerspectivesBox.y + currentPerspectivesBox.height / 2);
  await page.mouse.down();
  assert.equal(await page.locator('#ai-mode-toggle').getAttribute('data-drag-mode'), 'perspectives', 'drag starts from the selected Perspectives pill');
  await page.mouse.move(currentAnswerBox.x + currentAnswerBox.width / 2, currentAnswerBox.y + currentAnswerBox.height / 2, { steps: 5 });
  assert.equal(await page.locator('#ai-mode-toggle').getAttribute('data-drag-mode'), 'answer', 'drag preview follows the pointer back to Answer');
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#ai-mode-answer').getAttribute('aria-checked') === 'true');
  assert.equal(await page.locator('#ai-mode-answer').getAttribute('aria-checked'), 'true', 'dragging the selected pill back chooses Answer');
  assert.equal(await page.locator('#result-1').evaluate(element => element === window.__astraStandardResultNode), true, 'returning to Answer keeps the same web-result DOM');
  assert.equal(await page.locator('#result-1').textContent(), standardResultNode);
  assert.equal(searchRequests, requestsBeforeModeSwitch, 'mode switching does not spend another web-search request');
  assert.equal(answerRequests, answersBeforeModeSwitch, 'returning to a completed Answer reuses its cached panel');
  assert.equal(perspectiveRequests, perspectivesBeforeModeSwitch + 1, 'Perspectives is fetched only on its first visit');
  await page.locator('#ai-mode-answer').focus();
  await page.keyboard.press('ArrowRight');
  await page.locator('#perspectives-fallback-answer').waitFor();
  assert.equal(await page.locator('#ai-mode-perspectives').getAttribute('aria-checked'), 'true', 'keyboard navigation still chooses Perspectives');
  assert.equal(perspectiveRequests, perspectivesBeforeModeSwitch + 1, 'returning to Perspectives reuses its cached panel');
  assert.equal(await page.locator('#result-1 .summary-hit > .lgp-material').count(), 0, 'result hit target is not converted into a glass card');
  await page.locator('#result-1 .summary-hit').focus();
  await page.keyboard.press('Enter');
  await page.locator('#result-1 .result-summary-retry').waitFor({ state: 'visible' });
  await page.locator('#result-1 .result-summary-retry').click();
  await page.locator('#result-1 .result-summary-body').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#result-1 .result-summary-body').textContent(), 'Generated site brief.');
  assert.equal(await page.locator('#result-1 .result-summary-visit').getAttribute('href'), result.url);
  assert.equal(await page.locator('#result-list .lgp-material,.r-tabs .lgp-material').count(), 0, 'results and tabs contain no liquid-glass surfaces');
  await page.locator('#tab-all').focus();
  await page.keyboard.press('ArrowRight');
  await page.locator('#image-grid .ig-item').first().waitFor();
  assert.equal(await page.locator('#tab-images').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#tab-all').getAttribute('tabindex'), '-1');
  await page.locator('#image-grid .ig-item').first().click();
  await page.locator('#ig-preview').waitFor({ state: 'visible' });
  await page.locator('#igp-close').click();
  assert.equal(await page.locator('#ig-preview').isVisible(), false);
  await page.locator('#tab-images').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#ai-mode-answer > .lgp-material,#ai-mode-perspectives > .lgp-material').count(), 0, 'Answer and Perspectives share one glass surface rather than nesting glass buttons');
  // Exercise the persisted Perspectives entry path before its native fallback.
  await page.reload();
  await page.locator('#perspectives-fallback-answer').waitFor();
  await page.locator('#perspectives-fallback-answer').click();
  await page.locator('#ai-follow').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#ai-panel').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#ai-mode-answer').getAttribute('aria-checked'), 'true');
  await page.locator('#ai-expand').click();
  assert.equal(await page.locator('#ai-expand').getAttribute('aria-label'), 'exit fullscreen');
  assert.equal(await page.locator('#ai-panel').getAttribute('role'), 'dialog');
  assert.equal(await page.locator('#results-bar').evaluate(el => !!el.closest('[inert]')), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ai-expand').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ai-expand');
  await page.locator('#ai-follow-input').fill('Explain more');
  await page.locator('#ai-follow-send').click();
  await page.locator('#ai-stop').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#ai-follow-send').isEnabled(), false);
  await page.locator('#ai-stop').click();
  await page.locator('#ai-follow-send').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#ai-panel').getAttribute('aria-busy'), 'false');
  await page.locator('#ai-toggle').click();
  assert.equal(await page.locator('#ai-toggle').getAttribute('aria-pressed'), 'false');
  // Fresh route retains the thinking node for the next Answer request.
  await page.reload();
  await page.locator('#result-1').waitFor();
  await page.locator('#ai-toggle').click();
  assert.equal(await page.locator('#ai-toggle').getAttribute('aria-pressed'), 'true');
  await page.locator('#ai-follow').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#ai-panel').getAttribute('aria-busy') === 'false');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const glassHosts = await page.locator('[data-lg-site]').evaluateAll(elements => elements.map(element => element.id).sort());
  assert.deepEqual(glassHosts, ['ai-mode-toggle', 'hero-bar', 'hero-search', 'results-bar', 'results-search']);
  console.log('PASS desktop: glass is limited to search surfaces/buttons and the draggable Answer/Perspectives surface; results and ordinary actions remain native');

  const mobile = await open({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await mobile.locator('#tour-sure').tap();
  await mobile.locator('#result-1').waitFor();
  await mobile.locator('#tour-next').tap();
  await mobile.locator('#tour-next').tap();
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
  const mobileGlassHosts = await mobile.locator('[data-lg-site]').evaluateAll(elements => elements.map(element => element.id).sort());
  assert.deepEqual(mobileGlassHosts, ['ai-mode-toggle', 'hero-bar', 'hero-search', 'results-bar', 'results-search']);
  assert.deepEqual(errors, []);
  console.log('PASS mobile/reduced-motion: touch tour works with the same five explicit glass surfaces and no overflow or new JS errors');
  // Mode switching is independent of the glass runtime and keeps its shared status node intact.
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
  await baseline.locator('#ai-thinking').waitFor({ state: 'attached' });
  assert.equal(await baseline.evaluate(() => !!window.LiquidDesign), false);
  assert.deepEqual(baselineErrors, []);
  console.log('PASS baseline without glass: repeated Answer/Perspectives switching retains #ai-thinking and throws no errors');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
