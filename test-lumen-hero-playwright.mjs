import assert from 'node:assert/strict';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.webp': 'image/webp' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const candidate = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  if (relative(root, candidate).startsWith('..') || !existsSync(candidate) || !statSync(candidate).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': types[extname(candidate)] || 'application/octet-stream' });
  createReadStream(candidate).pipe(response);
});
await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });

async function assertHeldPoster(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${baseUrl}/AI/index.html`);
  try {
    await page.locator('#lumen-hero[data-state="held"]').waitFor();
  } catch (error) {
    throw new Error(`${error.message}\nBrowser errors: ${errors.join(' | ') || 'none'}\nState: ${JSON.stringify(await page.evaluate(() => ({ hero: document.querySelector('#lumen-hero')?.dataset, api: typeof window.LumenHero })))}`);
  }
  assert.equal(await page.locator('#lumen-hero').getAttribute('data-mode'), 'poster');
  assert.equal(await page.locator('#lumen-copy').isVisible(), true);
  assert.equal(await page.locator('#lumen-playback').isHidden(), true);
  assert.deepEqual(await page.evaluate(() => window.LumenHero.getState()), {
    mode: 'poster', state: 'held', active: true, elapsedMs: 8000, phase: 'held',
  });
}

try {
  const automated = await browser.newContext();
  await automated.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => true }); });
  const automatedPage = await automated.newPage();
  await assertHeldPoster(automatedPage);
  assert.deepEqual(await automatedPage.evaluate(() => window.LumenHero.ready), { mode: 'poster' });
  await automatedPage.locator('.lumen-start').focus();
  await automatedPage.keyboard.press('Enter');
  await automatedPage.waitForURL(/\/AI\/chat\.html$/);
  await automated.close();

  const reduced = await browser.newContext();
  await reduced.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === '(prefers-reduced-motion: reduce)'
      ? { matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } }
      : nativeMatchMedia(query);
  });
  const reducedPage = await reduced.newPage();
  await assertHeldPoster(reducedPage);
  await reduced.close();

  const webgl = await browser.newContext();
  await webgl.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    let outstanding = 0;
    let maximum = 0;
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    window.requestAnimationFrame = (callback) => {
      outstanding += 1;
      maximum = Math.max(maximum, outstanding);
      let id;
      id = nativeRequest((time) => {
        if (pending.delete(id)) outstanding -= 1;
        callback(time);
      });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (pending.delete(id)) outstanding -= 1;
      nativeCancel(id);
    };
    window.__lumenMaxRaf = () => maximum;
  });
  let videoRequests = 0;
  const webglPage = await webgl.newPage();
  await webglPage.route('**/AI/js/lumen-scene.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `const scene={render(){},resize(){},pause(){},resume(){},dispose(){}};
      function createLumenScene(){ window.__lumenScene=scene; return Promise.resolve(scene); }
      window.createLumenScene=createLumenScene; export { createLumenScene };`,
  }));
  webglPage.on('request', (request) => { if (/journey-(mobile|desktop)\.mp4/.test(request.url())) videoRequests += 1; });
  await webglPage.goto(`${baseUrl}/AI/index.html`);
  assert.deepEqual(await webglPage.evaluate(() => window.LumenHero.ready), { mode: 'webgl' });
  assert.equal(videoRequests, 0, 'WebGL initialization must not download fallback video');
  await webglPage.evaluate(() => window.LumenHero.skip());
  assert.equal((await webglPage.evaluate(() => window.LumenHero.getState())).state, 'held');
  assert.equal(await webglPage.locator('#lumen-playback').textContent(), 'Replay');
  await webglPage.evaluate(() => window.LumenHero.setActive(false));
  assert.equal((await webglPage.evaluate(() => window.LumenHero.getState())).active, false);
  await webglPage.evaluate(() => window.LumenHero.setActive(true));
  assert.equal((await webglPage.evaluate(() => window.LumenHero.getState())).state, 'held');
  assert.equal(await webglPage.evaluate(() => window.__lumenMaxRaf()), 1, 'controller owns at most one animation frame');
  await webglPage.evaluate(() => window.LumenHero.destroy());
  await webgl.close();

  const keyboard = await browser.newContext();
  await keyboard.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => true }); });
  const keyboardPage = await keyboard.newPage();
  await keyboardPage.goto(`${baseUrl}/AI/index.html`);
  const dots = keyboardPage.locator('.hero-dot');
  for (let index = 0; index < 3; index += 1) {
    await dots.nth(index).focus();
    await keyboardPage.keyboard.press('Enter');
    await keyboardPage.waitForFunction((selected) => document.querySelectorAll('.hero-dot')[selected].classList.contains('active'), index);
  }
  await keyboard.close();
  console.log('Lumen hero browser assertions passed.');
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
