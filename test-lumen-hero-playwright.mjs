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
  const earliest = await browser.newContext();
  await earliest.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => true }); });
  const earliestPage = await earliest.newPage();
  let releaseController;
  const controllerGate = new Promise((resolve) => { releaseController = resolve; });
  await earliestPage.route('**/AI/js/lumen-hero.js', async (route) => {
    await controllerGate;
    await route.continue();
  });
  await earliestPage.goto(`${baseUrl}/AI/index.html`, { waitUntil: 'domcontentloaded', timeout: 1000 }).catch(() => {});
  assert.equal(await earliestPage.locator('#lumen-hero').getAttribute('data-mode'), 'poster');
  assert.equal(await earliestPage.locator('#lumen-poster').isVisible(), true);
  assert.equal(await earliestPage.locator('#lumen-copy').isVisible(), true);
  assert.equal(await earliestPage.locator('#lumen-playback').isHidden(), true, 'initial markup hides playback before controller execution');
  await earliestPage.locator('#hero-next').click();
  await earliestPage.locator('.hero-dot[data-index="1"].active').waitFor();
  releaseController();
  await earliestPage.locator('#lumen-hero[data-state="held"]').waitFor();
  assert.equal((await earliestPage.evaluate(() => window.LumenHero.getState())).active, false, 'late Lumen initialization receives the current inactive carousel state');
  await earliest.close();

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
      async function createLumenScene(options){ await Promise.all(Object.values(options.assets).map(value=>fetch(value.desktop))); window.__lumenScene=scene; return scene; }
      window.createLumenScene=createLumenScene; export { createLumenScene };`,
  }));
  let textureRequests = 0;
  webglPage.on('request', (request) => {
    if (/journey-(mobile|desktop)\.mp4/.test(request.url())) videoRequests += 1;
    if (/earth-|moon-/.test(request.url())) textureRequests += 1;
  });
  await webglPage.goto(`${baseUrl}/AI/index.html`);
  assert.deepEqual(await webglPage.evaluate(() => window.LumenHero.ready), { mode: 'webgl' });
  assert.equal(textureRequests, 6, 'WebGL initialization requests its texture family');
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

  const destroyedInit = await browser.newContext();
  await destroyedInit.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  });
  const destroyedPage = await destroyedInit.newPage();
  await destroyedPage.route('**/AI/js/lumen-scene.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `let resolveScene; window.__lateScene=new Promise(resolve=>{resolveScene=resolve});
      window.__finishScene=()=>resolveScene({render(){},resize(){},pause(){},resume(){},dispose(){window.__lateDisposed=true}});
      function createLumenScene(){return window.__lateScene} window.createLumenScene=createLumenScene; export {createLumenScene};`,
  }));
  await destroyedPage.goto(`${baseUrl}/AI/index.html`);
  await destroyedPage.waitForFunction(() => typeof window.__finishScene === 'function');
  await destroyedPage.evaluate(() => { window.LumenHero.destroy(); window.__finishScene(); });
  assert.deepEqual(await destroyedPage.evaluate(() => Promise.race([
    window.LumenHero.ready,
    new Promise((resolve) => setTimeout(() => resolve('pending'), 100)),
  ])), { mode: 'poster' }, 'destroy settles ready and stale scene completion cannot reactivate WebGL');
  assert.equal(await destroyedPage.evaluate(() => window.__lateDisposed), true, 'stale resolved scenes are disposed');
  await destroyedInit.close();

  const inactiveFailure = await browser.newContext();
  await inactiveFailure.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () { window.__inactivePlays = (window.__inactivePlays || 0) + 1; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
  });
  const inactivePage = await inactiveFailure.newPage();
  await inactivePage.route('**/AI/js/lumen-scene.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `let rejectScene; window.__sceneFailure=new Promise((_,reject)=>{rejectScene=reject});
      window.__failScene=()=>rejectScene(new Error('failed')); function createLumenScene(){return window.__sceneFailure}
      window.createLumenScene=createLumenScene; export {createLumenScene};`,
  }));
  await inactivePage.goto(`${baseUrl}/AI/index.html`);
  await inactivePage.waitForFunction(() => typeof window.__failScene === 'function');
  await inactivePage.evaluate(() => { window.LumenHero.setActive(false); window.__failScene(); });
  await inactivePage.waitForTimeout(100);
  assert.equal(await inactivePage.evaluate(() => window.__inactivePlays || 0), 0, 'failed initialization cannot autoplay fallback while inactive');
  assert.equal(await inactivePage.locator('#lumen-fallback').getAttribute('src'), null, 'failed initialization cannot download fallback while inactive');
  await inactivePage.evaluate(() => window.LumenHero.setActive(true));
  assert.deepEqual(await inactivePage.evaluate(() => window.LumenHero.ready), { mode: 'video' });
  assert.equal(await inactivePage.evaluate(() => window.__inactivePlays), 1, 'reactivation starts the deferred fallback once');
  await inactiveFailure.close();

  const warmFallback = await browser.newContext();
  await warmFallback.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    const nativeRequest = window.requestAnimationFrame.bind(window);
    let synthetic = 0;
    window.requestAnimationFrame = (callback) => nativeRequest(() => { synthetic += 50; callback(synthetic); });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
  });
  const warmPage = await warmFallback.newPage();
  const warmRequests = [];
  warmPage.on('request', (request) => { if (/earth-|moon-|journey-/.test(request.url())) warmRequests.push(request.url()); });
  await warmPage.route('**/AI/js/lumen-scene.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `const scene={render(){},resize(){},pause(){},resume(){},dispose(){}};
      async function createLumenScene(options){await Promise.all(Object.values(options.assets).map(value=>fetch(value.desktop)));return scene}
      window.createLumenScene=createLumenScene; export {createLumenScene};`,
  }));
  await warmPage.goto(`${baseUrl}/AI/index.html`);
  assert.deepEqual(await warmPage.evaluate(() => window.LumenHero.ready), { mode: 'video' });
  assert.equal(warmRequests.filter((url) => /earth-|moon-/.test(url)).length, 6, 'warm-up attempt requests all texture families');
  assert.equal(await warmPage.locator('#lumen-fallback').getAttribute('src'), 'assets/lumen/journey-desktop.mp4', 'warm-up failure selects video only after scene warm-up');
  await warmFallback.close();

  const staleVideo = await browser.newContext();
  await staleVideo.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () { return new Promise((resolve) => { window.__resolveOldPlay = resolve; }); };
    HTMLMediaElement.prototype.pause = function () {};
  });
  const stalePage = await staleVideo.newPage();
  await stalePage.goto(`${baseUrl}/AI/index.html`);
  await stalePage.waitForFunction(() => typeof window.__resolveOldPlay === 'function');
  await stalePage.evaluate(() => {
    window.LumenHero.destroy();
    window.__resolveOldPlay();
    document.querySelector('#lumen-fallback').dispatchEvent(new Event('error'));
  });
  assert.deepEqual(await stalePage.evaluate(() => window.LumenHero.ready), { mode: 'poster' });
  assert.equal(await stalePage.locator('#lumen-fallback').getAttribute('src'), null, 'destroyed video callbacks cannot restore media');
  await staleVideo.close();

  const weak = await browser.newContext();
  await weak.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
    HTMLMediaElement.prototype.load = function () { window.__loads = (window.__loads || 0) + 1; };
    HTMLMediaElement.prototype.play = function () { this.__playing = true; window.__plays = (window.__plays || 0) + 1; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { this.__playing = false; window.__pauses = (window.__pauses || 0) + 1; };
  });
  const weakPage = await weak.newPage();
  const weakRequests = [];
  weakPage.on('request', (request) => { if (/earth-|moon-|journey-/.test(request.url())) weakRequests.push(request.url()); });
  await weakPage.goto(`${baseUrl}/AI/index.html`);
  assert.deepEqual(await weakPage.evaluate(() => window.LumenHero.ready), { mode: 'video' });
  assert.equal(weakRequests.some((url) => /earth-|moon-/.test(url)), false, 'known-weak video mode never requests textures');
  await weakPage.evaluate(() => window.LumenHero.setActive(false));
  assert.equal(await weakPage.evaluate(() => document.querySelector('#lumen-fallback').__playing), false);
  await weakPage.evaluate(() => window.LumenHero.setActive(true));
  assert.equal(await weakPage.evaluate(() => document.querySelector('#lumen-fallback').__playing), false, 'held video does not auto-replay on activation');
  await weakPage.evaluate(() => window.LumenHero.replay());
  assert.equal(await weakPage.evaluate(() => document.querySelector('#lumen-fallback').__playing), true, 'explicit replay resumes held video');
  await weakPage.evaluate(() => window.LumenHero.destroy());
  assert.equal(await weakPage.locator('#lumen-fallback').getAttribute('src'), null, 'destroy clears fallback source');
  await weak.close();

  const carousel = await browser.newContext();
  await carousel.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () { this.__playing = true; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { this.__playing = false; };
  });
  const carouselPage = await carousel.newPage();
  await carouselPage.goto(`${baseUrl}/AI/index.html`);
  await carouselPage.evaluate(() => window.LumenHero.ready);
  await carouselPage.evaluate(() => window.LumenHero.skip());
  assert.equal(await carouselPage.locator('.hero-dot[data-index="0"]').getAttribute('class'), 'hero-dot active', 'dot 0 is active initially');

  await carouselPage.locator('#hero-next').click();
  await carouselPage.locator('.hero-dot[data-index="1"].active').waitFor();
  assert.equal((await carouselPage.evaluate(() => window.LumenHero.getState())).active, false, 'leaving card 0 deactivates Lumen');
  assert.equal((await carouselPage.evaluate(() => window.LumenHero.getState())).state, 'held', 'leaving Lumen holds its final frame');
  assert.deepEqual(await carouselPage.evaluate(() => Array.from(document.querySelectorAll('.hero-card video')).map((video) => Boolean(video.__playing))), [false, true, false], 'only the active Labs21 card video plays');

  await carouselPage.locator('#hero-next').click();
  await carouselPage.locator('.hero-dot[data-index="2"].active').waitFor();
  assert.deepEqual(await carouselPage.evaluate(() => Array.from(document.querySelectorAll('.hero-card video')).map((video) => Boolean(video.__playing))), [false, false, true], 'only the active product card video plays');
  await carouselPage.waitForFunction(() => {
    const scroller = document.querySelector('#hero-scroll');
    const card = document.querySelectorAll('.hero-card')[2];
    return Math.abs(scroller.scrollLeft - (card.offsetLeft - scroller.offsetLeft)) < 2;
  });

  await carouselPage.locator('#hero-prev').click();
  await carouselPage.locator('.hero-dot[data-index="1"].active').waitFor();
  await carouselPage.locator('#hero-prev').click();
  await carouselPage.locator('.hero-dot[data-index="0"].active').waitFor();
  assert.deepEqual(await carouselPage.evaluate(() => window.LumenHero.getState()), {
    mode: 'video', state: 'held', active: true, elapsedMs: 8000, phase: 'held',
  }, 'returning to Lumen preserves the held frame without replay');
  assert.equal(await carouselPage.evaluate(() => document.querySelector('#lumen-fallback').__playing), false, 'Lumen remains paused until Replay is deliberate');
  await carouselPage.locator('#lumen-playback').click();
  assert.equal((await carouselPage.evaluate(() => window.LumenHero.getState())).state, 'playing', 'Replay deliberately starts Lumen');
  assert.equal(await carouselPage.evaluate(() => document.querySelector('#lumen-fallback').__playing), true, 'Replay resumes the Lumen video');
  await carousel.close();

  const keyboard = await browser.newContext();
  await keyboard.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => true }); });
  const keyboardPage = await keyboard.newPage();
  await keyboardPage.goto(`${baseUrl}/AI/index.html`);
  const dots = keyboardPage.locator('.hero-dot');
  for (let index = 0; index < 3; index += 1) {
    await dots.nth(index).focus();
    await keyboardPage.keyboard.press(index % 2 ? 'Space' : 'Enter');
    await keyboardPage.waitForFunction((selected) => document.querySelectorAll('.hero-dot')[selected].classList.contains('active'), index);
    await keyboardPage.waitForFunction((selected) => {
      const scroller = document.querySelector('#hero-scroll');
      const card = document.querySelectorAll('.hero-card')[selected];
      return Math.abs(scroller.scrollLeft - (card.offsetLeft - scroller.offsetLeft)) < 2;
    }, index);
    assert.equal((await keyboardPage.evaluate(() => window.LumenHero.getState())).active, index === 0, 'dot navigation updates Lumen lifecycle');
  }
  await keyboard.close();
  console.log('Lumen hero browser assertions passed.');
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
