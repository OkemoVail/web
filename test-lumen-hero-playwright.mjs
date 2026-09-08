import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

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
const snapshotDirectory = join(root, 'tools', 'snapshots', 'after');
mkdirSync(snapshotDirectory, { recursive: true });

function relativeRect(rect, parent) {
  return {
    left: (rect.left - parent.left) / parent.width,
    top: (rect.top - parent.top) / parent.height,
    right: (rect.right - parent.left) / parent.width,
    bottom: (rect.bottom - parent.top) / parent.height,
    width: rect.width / parent.width,
    height: rect.height / parent.height,
  };
}

function luminance([red, green, blue]) {
  const linear = [red, green, blue].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function dominantRegionColor(image, region) {
  const { data, info } = await sharp(image).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = [[], [], []];
  for (let index = 0; index < data.length; index += info.channels) {
    channels[0].push(data[index]); channels[1].push(data[index + 1]); channels[2].push(data[index + 2]);
  }
  return channels.map((values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]);
}

async function normalizedDifference(first, second) {
  const options = { width: 400, height: 300, fit: 'cover', position: 'center' };
  const [a, b] = await Promise.all([
    sharp(first).resize(options).png().toBuffer(),
    sharp(second).resize(options).png().toBuffer(),
  ]);
  const imageA = PNG.sync.read(a);
  const imageB = PNG.sync.read(b);
  const diff = new PNG({ width: imageA.width, height: imageA.height });
  const mismatched = pixelmatch(imageA.data, imageB.data, diff.data, imageA.width, imageA.height, { threshold: 0.18, includeAA: false });
  return mismatched / (imageA.width * imageA.height);
}

async function assertHeldPathMatch(actual, tier, label, tolerance) {
  const poster = join(root, 'AI', 'assets', 'lumen', `poster-${tier}.webp`);
  const fallback = join(snapshotDirectory, `lumen-${tier}-held-7900ms.png`);
  const posterDifference = await normalizedDifference(poster, fallback);
  assert.ok(posterDifference <= 0.025, `${tier}: poster and extracted held video differ by ${(posterDifference * 100).toFixed(2)}%, within the 2.5% encoded-frame tolerance`);
  const actualDifference = await normalizedDifference(actual, fallback);
  assert.ok(actualDifference <= tolerance, `${label}: registered held frame differs by ${(actualDifference * 100).toFixed(2)}%, within ${(tolerance * 100).toFixed(0)}% cross-renderer tolerance`);
  return { posterDifference, actualDifference };
}

async function assertThemeContrast(page, theme) {
  await page.evaluate((nextTheme) => document.documentElement.classList.toggle('dark', nextTheme === 'dark'), theme);
  const hero = page.locator('#lumen-hero');
  const screenshot = await hero.screenshot();
  const geometry = await page.evaluate(() => {
    const heroRect = document.querySelector('#lumen-hero').getBoundingClientRect();
    const region = (selector) => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        rect: { left: Math.round(rect.left - heroRect.left), top: Math.round(rect.top - heroRect.top), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) },
        color: style.color.match(/[\d.]+/g).slice(0, 3).map(Number),
        background: style.backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number),
      };
    };
    return { eyebrow: region('.lumen-eyebrow'), deck: region('.lumen-deck'), start: region('.lumen-start') };
  });
  for (const name of ['eyebrow', 'deck']) {
    const item = geometry[name];
    const background = await dominantRegionColor(screenshot, item.rect);
    assert.ok(contrast(item.color, background) >= 4.5, `${theme} ${name} contrast meets WCAG AA against sampled rendered pixels`);
  }
  assert.ok(contrast(geometry.start.color, geometry.start.background) >= 4.5, `${theme} Start control contrast meets WCAG AA`);
}

async function assertReadableFrame(page, message, requireCopy = true) {
  const frame = await page.locator('#lumen-hero').screenshot();
  const stats = await sharp(frame).stats();
  const visibleChannels = stats.channels.slice(0, 3);
  assert.ok(frame.length > 10_000 && stats.entropy > 1 && visibleChannels.some(({ max }) => max > 96), `${message}: rendered card is not empty black output`);
  if (requireCopy) assert.equal(await page.locator('#lumen-copy').isVisible(), true, `${message}: final copy remains readable`);
  else assert.equal(await page.locator('#lumen-fallback').isVisible(), true, `${message}: active fallback remains visible`);
}

async function assertPosterComposition(page, viewport, name) {
  await page.setViewportSize(viewport);
  await assertHeldPoster(page);
  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const value = document.querySelector(selector).getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      hero: rect('#lumen-hero'),
      copy: rect('#lumen-copy'),
      nav: rect('.ov-nav__bar'),
      start: rect('.lumen-start'),
      earth: window.LumenHeroTest?.getProjections().earth,
      moon: window.LumenHeroTest?.getProjections().moon,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert.ok(layout.hero.top >= layout.nav.bottom, `${name}: hero does not collide with floating navigation`);
  assert.ok(layout.copy.left >= layout.hero.left && layout.copy.bottom <= layout.hero.bottom, `${name}: copy remains within hero bounds`);
  assert.ok(layout.copy.top >= layout.hero.top && layout.copy.right <= layout.hero.right, `${name}: copy is unclipped on every edge`);
  const copy = relativeRect(layout.copy, layout.hero);
  assert.ok(copy.left < 0.2 && copy.bottom > 0.7, `${name}: copy occupies the lower-left composition`);
  assert.ok(layout.earth.x + layout.earth.radius > 0.6 && layout.earth.y - layout.earth.radius < 0.45 && layout.earth.radius > 0.08, `${name}: Earth visibly occupies the upper-right composition`);
  assert.ok(layout.moon.x > 0 && layout.moon.x < 1 && layout.moon.y > 0 && layout.moon.y < 1 && layout.moon.radius > 0.015, `${name}: Moon is visibly projected within the frame`);
  assert.ok(layout.start.left >= layout.hero.left && layout.start.right <= layout.hero.right, `${name}: CTA remains within hero bounds`);
  assert.equal(layout.overflow, 0, `${name}: page has no horizontal clipping`);
  const snapshotPath = join(snapshotDirectory, `lumen-poster-${name}.png`);
  await page.screenshot({ path: snapshotPath });
  const metadata = await sharp(snapshotPath).metadata();
  assert.deepEqual([metadata.width, metadata.height], [viewport.width, viewport.height], `${name}: snapshot exists at exact viewport dimensions`);
  await assertReadableFrame(page, name);
  if (name === 'desktop-1440x900') {
    await assertThemeContrast(page, 'light');
    await assertThemeContrast(page, 'dark');
    await assertHeldPathMatch(await page.locator('#lumen-hero').screenshot(), 'desktop', 'desktop poster path', 0.08);
  }
}

async function assertHeldPoster(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${baseUrl}/AI/index.html?lumen-test=1`);
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

  for (const snapshot of [
    { name: 'desktop-1440x900', viewport: { width: 1440, height: 900 } },
    { name: 'tablet-768x1024', viewport: { width: 768, height: 1024 } },
    { name: 'mobile-390x844', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: snapshot.viewport });
    await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => true }); });
    const page = await context.newPage();
    await assertPosterComposition(page, snapshot.viewport, snapshot.name);
    await context.close();
  }

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

  const posterFirst = await browser.newContext();
  await posterFirst.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  });
  const posterFirstPage = await posterFirst.newPage();
  let releaseTextures;
  const textureGate = new Promise((resolve) => { releaseTextures = resolve; });
  await posterFirstPage.route(/earth-|moon-/, async (route) => { await textureGate; await route.continue(); });
  await posterFirstPage.goto(`${baseUrl}/AI/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await posterFirstPage.locator('#lumen-poster').isVisible(), true, 'poster paints while WebGL textures are pending');
  assert.equal(await posterFirstPage.locator('#lumen-hero').getAttribute('data-mode'), 'poster', 'pending textures cannot expose an empty WebGL layer');
  releaseTextures();
  await posterFirstPage.evaluate(() => window.LumenHero.ready);
  await posterFirst.close();

  const saveData = await browser.newContext();
  await saveData.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.pause = function () { this.__playing = false; };
    HTMLMediaElement.prototype.play = function () { this.__playing = true; return Promise.resolve(); };
  });
  const saveDataPage = await saveData.newPage();
  const saveDataRequests = [];
  saveDataPage.on('request', (request) => { if (/three|earth-|moon-/.test(request.url())) saveDataRequests.push(request.url()); });
  await saveDataPage.goto(`${baseUrl}/AI/index.html`);
  assert.deepEqual(await saveDataPage.evaluate(() => window.LumenHero.ready), { mode: 'video' });
  assert.deepEqual(saveDataRequests, [], 'Save-Data users do not download Three.js or textures');
  await assertReadableFrame(saveDataPage, 'Save-Data fallback', false);
  await saveData.close();

  const probeFailure = await browser.newContext();
  await probeFailure.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    HTMLCanvasElement.prototype.getContext = function () { return null; };
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
  });
  const probePage = await probeFailure.newPage();
  let probeTextureRequests = 0;
  probePage.on('request', (request) => { if (/earth-|moon-/.test(request.url())) probeTextureRequests += 1; });
  await probePage.goto(`${baseUrl}/AI/index.html`);
  assert.deepEqual(await probePage.evaluate(() => window.LumenHero.ready), { mode: 'video' });
  assert.equal(probeTextureRequests, 0, 'WebGL probe failure bypasses texture downloads');
  await assertReadableFrame(probePage, 'WebGL probe fallback', false);
  await probeFailure.close();

  const importFailure = await browser.newContext();
  await importFailure.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
  });
  const importPage = await importFailure.newPage();
  await importPage.route('**/AI/js/lumen-scene.js', (route) => route.abort('failed'));
  await importPage.goto(`${baseUrl}/AI/index.html`);
  assert.deepEqual(await importPage.evaluate(() => window.LumenHero.ready), { mode: 'poster' });
  await assertReadableFrame(importPage, 'dynamic import poster');
  await importFailure.close();

  const rejectedAutoplay = await browser.newContext();
  await rejectedAutoplay.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('blocked', 'NotAllowedError')); };
    HTMLMediaElement.prototype.pause = function () {};
  });
  const rejectedPage = await rejectedAutoplay.newPage();
  await rejectedPage.goto(`${baseUrl}/AI/index.html`);
  assert.deepEqual(await rejectedPage.evaluate(() => window.LumenHero.ready), { mode: 'poster' });
  await assertReadableFrame(rejectedPage, 'autoplay rejection poster');
  await rejectedAutoplay.close();

  const videoError = await browser.newContext();
  await videoError.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
  });
  const videoErrorPage = await videoError.newPage();
  await videoErrorPage.goto(`${baseUrl}/AI/index.html`);
  await videoErrorPage.evaluate(() => document.querySelector('#lumen-fallback').dispatchEvent(new Event('error')));
  await videoErrorPage.locator('#lumen-hero[data-mode="poster"][data-state="held"]').waitFor();
  await assertReadableFrame(videoErrorPage, 'video error poster');
  await videoError.close();

  const missingMedia = await browser.newContext();
  await missingMedia.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  });
  const missingMediaPage = await missingMedia.newPage();
  await missingMediaPage.route(/journey-(mobile|desktop)\.mp4/, (route) => route.fulfill({ status: 404, body: 'missing' }));
  await missingMediaPage.goto(`${baseUrl}/AI/index.html`);
  await missingMediaPage.locator('#lumen-fallback').dispatchEvent('error');
  await missingMediaPage.locator('#lumen-hero[data-mode="poster"][data-state="held"]').waitFor();
  await assertReadableFrame(missingMediaPage, 'missing fallback media poster');
  await missingMedia.close();

  for (const failure of ['texture', 'renderer']) {
    const failureContext = await browser.newContext();
    await failureContext.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      HTMLMediaElement.prototype.load = function () {};
      HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function () {};
    });
    const failurePage = await failureContext.newPage();
    if (failure === 'texture') await failurePage.route(/earth-day-desktop\.webp/, (route) => route.abort('failed'));
    else await failurePage.route('**/AI/js/lumen-scene.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `function createLumenScene(){throw new Error('renderer creation failed')}window.createLumenScene=createLumenScene;export{createLumenScene};` }));
    await failurePage.goto(`${baseUrl}/AI/index.html`);
    assert.deepEqual(await failurePage.evaluate(() => window.LumenHero.ready), { mode: 'poster' }, `${failure} failure settles to poster after WebGL commitment`);
    await assertReadableFrame(failurePage, `${failure} failure poster`);
    await failureContext.close();
  }

  const contextLoss = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await contextLoss.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__lumenDocumentHidden || false });
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    let syntheticFrameTime = 0;
    window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame(() => {
      syntheticFrameTime += 100;
      callback(syntheticFrameTime);
    });
    let actualDrawCount = 0;
    let instrumentedDrawMethods = 0;
    for (const constructorName of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const prototype = window[constructorName]?.prototype;
      if (!prototype) continue;
      for (const methodName of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const nativeDraw = prototype[methodName];
        if (!nativeDraw) continue;
        instrumentedDrawMethods += 1;
        prototype[methodName] = function (...args) {
          actualDrawCount += 1;
          return nativeDraw.apply(this, args);
        };
      }
    }
    window.__lumenActualDrawCount = () => actualDrawCount;
    window.__lumenActualDrawSupported = () => instrumentedDrawMethods > 0;
    let policy;
    Object.defineProperty(window, 'LumenHeroPolicy', {
      configurable: true,
      get: () => policy,
      set: (value) => {
        policy = value;
      },
    });
  });
  const contextLossPage = await contextLoss.newPage();
  await contextLossPage.goto(`${baseUrl}/AI/index.html?lumen-test=1`);
  const realWebglResult = await contextLossPage.evaluate(async () => {
    const result = await window.LumenHero.ready;
    const canvas = document.querySelector('#lumen-stage canvas');
    if (result.mode !== 'webgl' || !canvas) return { status: 'unsupported', mode: result.mode, reason: 'Chromium could not initialize the actual Three.js WebGL scene' };
    if (!window.__lumenActualDrawSupported()) return { status: 'unsupported', mode: result.mode, reason: 'Chromium exposed no instrumentable WebGL draw methods' };
    return { status: 'tested', canvas: { width: canvas.width, height: canvas.height } };
  });
  if (realWebglResult.status === 'tested') {
    await contextLossPage.waitForFunction(() => {
      const state = window.LumenHero.getState();
      return state.state === 'playing' && state.elapsedMs >= 2200 && state.phase === 'terra';
    });
    const playingCheckpoint = await contextLossPage.evaluate(() => ({
      draws: window.__lumenActualDrawCount(),
      state: window.LumenHero.getState(),
      identity: window.LumenHeroTest.getLifecycleIdentity(),
    }));
    assert.equal(playingCheckpoint.state.phase, 'terra', 'actual WebGL visibility test reaches a substantial Terra checkpoint');
    assert.equal(typeof playingCheckpoint.identity.replayCount, 'number', 'test identity records explicit replay count');
    await contextLossPage.evaluate(() => { window.__lumenDocumentHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = await contextLossPage.evaluate(() => ({
      draws: window.__lumenActualDrawCount(),
      state: window.LumenHero.getState(),
      identity: window.LumenHeroTest.getLifecycleIdentity(),
    }));
    await contextLossPage.waitForTimeout(350);
    const hiddenAfterWait = await contextLossPage.evaluate(() => ({ draws: window.__lumenActualDrawCount(), state: window.LumenHero.getState() }));
    assert.equal(hiddenAfterWait.draws, hidden.draws, 'hidden document stops actual WebGL draw calls');
    assert.equal(hiddenAfterWait.state.elapsedMs, hidden.state.elapsedMs, 'hidden document freezes the playing timeline');
    assert.deepEqual(hidden.identity, playingCheckpoint.identity, 'hiding preserves generation and replay identity');
    await contextLossPage.evaluate(() => {
      window.__lumenFirstResumedSample = null;
      const before = window.__lumenActualDrawCount();
      const capture = window.setInterval(() => {
        if (window.__lumenActualDrawCount() <= before) return;
        window.__lumenFirstResumedSample = {
          state: window.LumenHero.getState(),
          identity: window.LumenHeroTest.getLifecycleIdentity(),
        };
        clearInterval(capture);
      }, 0);
      window.__lumenDocumentHidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await contextLossPage.waitForFunction(({ draws, elapsedMs }) => window.__lumenFirstResumedSample && window.__lumenActualDrawCount() > draws && window.LumenHero.getState().elapsedMs > elapsedMs, {
      draws: hidden.draws,
      elapsedMs: hidden.state.elapsedMs,
    });
    const resumed = await contextLossPage.evaluate(() => ({
      draws: window.__lumenActualDrawCount(),
      state: window.LumenHero.getState(),
      first: window.__lumenFirstResumedSample,
      identity: window.LumenHeroTest.getLifecycleIdentity(),
    }));
    assert.equal(resumed.state.state, 'playing', 'visibility restoration resumes the existing journey without replay');
    assert.ok(resumed.first.state.elapsedMs >= hidden.state.elapsedMs - 100, 'first resumed draw cannot fall materially below the Terra checkpoint');
    assert.notEqual(resumed.first.state.phase, 'solar', 'first resumed draw does not return to Solar');
    assert.deepEqual(resumed.first.identity, hidden.identity, 'first resumed draw preserves generation and replay identity');
    assert.deepEqual(resumed.identity, hidden.identity, 'continued progression preserves generation and replay identity');
    await contextLossPage.evaluate(() => window.LumenHero.skip());
    const heldWebgl = await contextLossPage.locator('#lumen-hero').screenshot({ path: join(snapshotDirectory, 'lumen-webgl-held-desktop.png') });
    await assertHeldPathMatch(heldWebgl, 'desktop', 'actual WebGL held path', 0.38);
    await contextLossPage.setViewportSize({ width: 390, height: 844 });
    await contextLossPage.waitForFunction(() => {
      const canvas = document.querySelector('#lumen-stage canvas');
      const stage = document.querySelector('#lumen-stage').getBoundingClientRect();
      return canvas && Math.abs(canvas.width / devicePixelRatio - stage.width) < 2 && Math.abs(canvas.height / devicePixelRatio - stage.height) < 2;
    });
    assert.deepEqual(await contextLossPage.evaluate(() => window.LumenHero.getState()), {
      mode: 'webgl', state: 'held', active: true, elapsedMs: 8000, phase: 'held',
    }, 'real WebGL resize preserves the held composition');
    const contextLossResult = await contextLossPage.evaluate(() => {
      const canvas = document.querySelector('#lumen-stage canvas');
      const event = new Event('webglcontextlost', { cancelable: true });
      canvas.dispatchEvent(event);
      return { prevented: event.defaultPrevented };
    });
    assert.equal(contextLossResult.prevented, true, 'actual Three.js canvas prevents the WebGL context-loss event');
    await contextLossPage.locator('#lumen-hero[data-mode="poster"]').waitFor();
    await assertReadableFrame(contextLossPage, 'real canvas context loss poster');
  } else {
    assert.equal(realWebglResult.status, 'unsupported');
    console.log(`Lumen actual-WebGL lifecycle tests SKIPPED: ${realWebglResult.reason} (mode=${realWebglResult.mode})`);
  }
  await contextLoss.close();

  const lifecycle = await browser.newContext();
  await lifecycle.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__documentHidden || false });
  });
  const lifecyclePage = await lifecycle.newPage();
  await lifecyclePage.route('**/AI/js/lumen-scene.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `const counts={pause:0,resume:0,resize:[]};window.__lumenCounts=counts;const scene={render(){},resize(w,h){counts.resize.push([Math.round(w),Math.round(h)])},pause(){counts.pause++},resume(){counts.resume++},dispose(){}};async function createLumenScene(){return scene}window.createLumenScene=createLumenScene;export{createLumenScene};`,
  }));
  await lifecyclePage.goto(`${baseUrl}/AI/index.html`);
  assert.deepEqual(await lifecyclePage.evaluate(() => window.LumenHero.ready), { mode: 'webgl' });
  await lifecyclePage.evaluate(() => { window.__documentHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  const hiddenState = await lifecyclePage.evaluate(() => ({ state: window.LumenHero.getState(), counts: window.__lumenCounts }));
  assert.equal(hiddenState.state.state, 'playing', 'tab hiding pauses rather than finalizing the journey');
  assert.ok(hiddenState.counts.pause >= 1, 'tab hiding pauses scene work');
  await lifecyclePage.evaluate(() => { window.__documentHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  assert.ok((await lifecyclePage.evaluate(() => window.__lumenCounts.resume)) >= 1, 'tab visibility restoration resumes scene work');
  await lifecyclePage.evaluate(() => window.LumenHero.skip());
  const beforeResize = await lifecyclePage.evaluate(() => window.__lumenCounts.resize.length);
  await lifecyclePage.setViewportSize({ width: 390, height: 844 });
  await lifecyclePage.waitForFunction((count) => window.__lumenCounts.resize.length > count, beforeResize);
  assert.deepEqual(await lifecyclePage.evaluate(() => window.LumenHero.getState()), {
    mode: 'webgl', state: 'held', active: true, elapsedMs: 8000, phase: 'held',
  }, 'orientation-sized resize preserves the held final composition');
  await assertReadableFrame(lifecyclePage, 'resized held WebGL');
  await lifecycle.close();

  if (process.env.LUMEN_PROFILE === '1') {
    const profileBrowser = await chromium.launch({ headless: false });
    const profileTier = process.env.LUMEN_PROFILE_TIER === 'mobile' ? 'mobile' : 'desktop';
    const profileViewport = profileTier === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const profileBrowserContext = await profileBrowser.newContext({ viewport: profileViewport, deviceScaleFactor: profileTier === 'mobile' ? 3 : 1.5 });
    await profileBrowserContext.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      let policy;
      Object.defineProperty(window, 'LumenHeroPolicy', {
        configurable: true,
        get: () => policy,
        set: (value) => {
          const naturalChooseMode = value.chooseMode;
          value.chooseMode = (signals) => {
            const result = naturalChooseMode(signals);
            if (signals.warmupFps != null) window.__lumenNaturalProfile = { result, warmupFps: signals.warmupFps };
            return signals.warmupFps != null && window.__forceLumenProfile ? 'webgl' : result;
          };
          policy = value;
        },
      });
      window.__forceLumenProfile = true;
      window.__lumenDrawSamples = [];
      for (const constructorName of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
        const prototype = window[constructorName]?.prototype;
        if (!prototype?.drawElements) continue;
        const nativeDraw = prototype.drawElements;
        prototype.drawElements = function (...args) {
          window.__lumenDrawSamples.push(performance.now());
          return nativeDraw.apply(this, args);
        };
      }
    });
    const profilePage = await profileBrowserContext.newPage();
    const requested = [];
    profilePage.on('response', async (response) => {
      const url = response.url();
      if (/lumen|three\.(module|core)/.test(url)) requested.push({ url, bytes: Number((await response.allHeaders())['content-length']) || 0 });
    });
    const started = performance.now();
    await profilePage.goto(`${baseUrl}/AI/index.html`);
    const posterPaintMs = await profilePage.evaluate(() => performance.getEntriesByName(document.querySelector('#lumen-poster img').currentSrc)[0]?.responseEnd || 0);
    assert.equal(await profilePage.evaluate(() => navigator.webdriver), false, 'profiling session exposes the non-webdriver policy signal');
    assert.deepEqual(await profilePage.evaluate(() => window.LumenHero.ready), { mode: 'webgl' }, 'forced diagnostic exercises the real Three.js scene after natural classification is recorded');
    const warmReadyMs = performance.now() - started;
    await profilePage.waitForTimeout(2200);
    const metrics = await profilePage.evaluate(() => {
      const samples = window.__lumenDrawSamples.filter((time, index, values) => index === 0 || time - values[index - 1] > 5);
      const recent = samples.filter((time) => time >= samples.at(-1) - 2000);
      const duration = recent.at(-1) - recent[0];
      return {
        fps: duration > 0 ? (recent.length - 1) * 1000 / duration : 0,
        dpr: document.querySelector('#lumen-stage canvas').width / document.querySelector('#lumen-stage').getBoundingClientRect().width,
        state: window.LumenHero.getState(),
        natural: window.__lumenNaturalProfile,
      };
    });
    assert.ok(metrics.fps >= 30, `real-time profile remains at least 30 FPS (measured ${metrics.fps.toFixed(1)})`);
    assert.ok(metrics.dpr <= 1.5, `real-time profile caps DPR at 1.5 (measured ${metrics.dpr})`);
    await profilePage.evaluate(() => window.LumenHero.setActive(false));
    const samplesAtPause = await profilePage.evaluate(() => window.__lumenDrawSamples.length);
    await profilePage.waitForTimeout(350);
    assert.equal(await profilePage.evaluate(() => window.__lumenDrawSamples.length), samplesAtPause, 'leaving Lumen stops real scene draws');
    const uniqueRequests = [...new Map(requested.map((entry) => [entry.url, entry])).values()];
    for (const entry of uniqueRequests) {
      const pathname = decodeURIComponent(new URL(entry.url).pathname);
      const localPath = normalize(join(root, pathname));
      if (existsSync(localPath)) entry.bytes = statSync(localPath).size;
    }
    const textureBytes = uniqueRequests.filter(({ url }) => /earth-|moon-/.test(url)).reduce((sum, entry) => sum + entry.bytes, 0);
    const textureWidth = profileTier === 'mobile' ? 1024 : 2048;
    const gpuBytesEstimate = 6 * textureWidth * (textureWidth / 2) * 4 + Math.round(profileViewport.width * (profileTier === 'mobile' ? profileViewport.height * .75 : profileViewport.width * 9 / 16) * metrics.dpr * metrics.dpr * 8);
    console.log(`Lumen profile: ${JSON.stringify({ tier: profileTier, posterPaintMs, warmReadyMs, fps: metrics.fps, dpr: metrics.dpr, natural: metrics.natural, textureBytes, gpuBytesEstimate, bytes: uniqueRequests.reduce((sum, entry) => sum + entry.bytes, 0), requests: uniqueRequests })}`);
    await profileBrowserContext.close();
    await profileBrowser.close();
  }

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
  assert.deepEqual(await inactivePage.evaluate(() => window.LumenHero.ready), { mode: 'poster' });
  assert.equal(await inactivePage.evaluate(() => window.__inactivePlays || 0), 0, 'reactivation does not purchase video after WebGL commitment');
  await inactiveFailure.close();

  const committedWebgl = await browser.newContext();
  await committedWebgl.addInitScript(() => {
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
  const warmPage = await committedWebgl.newPage();
  const warmRequests = [];
  warmPage.on('request', (request) => { if (/earth-|moon-|journey-/.test(request.url())) warmRequests.push(request.url()); });
  await warmPage.route('**/AI/js/lumen-scene.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `const scene={render(){},resize(){},pause(){},resume(){},dispose(){}};
      async function createLumenScene(options){await Promise.all(Object.values(options.assets).map(value=>fetch(value.desktop)));return scene}
      window.createLumenScene=createLumenScene; export {createLumenScene};`,
  }));
  await warmPage.goto(`${baseUrl}/AI/index.html`);
  assert.deepEqual(await warmPage.evaluate(() => window.LumenHero.ready), { mode: 'webgl' });
  assert.equal(warmRequests.filter((url) => /earth-|moon-/.test(url)).length, 6, 'committed WebGL requests its texture family');
  assert.equal(warmRequests.filter((url) => /journey-/.test(url)).length, 0, 'frame cadence cannot reject a committed scene into video');
  await committedWebgl.close();

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

  const carousel = await browser.newContext({ hasTouch: true });
  await carousel.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () { this.__playing = true; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { this.__playing = false; };
  });
  const carouselPage = await carousel.newPage();
  const carouselErrors = [];
  carouselPage.on('pageerror', (error) => carouselErrors.push(error.message));
  await carouselPage.goto(`${baseUrl}/AI/index.html`);
  await carouselPage.evaluate(() => window.LumenHero.ready);
  await carouselPage.evaluate(() => window.LumenHero.skip());
  const playbackVector = () => carouselPage.evaluate(() => Array.from(document.querySelectorAll('.hero-card video')).map((video) => Boolean(video.__playing)));
  assert.equal(await carouselPage.locator('.hero-dot[data-index="0"]').getAttribute('class'), 'hero-dot active', 'dot 0 is active initially');

  const swipe = async (fromX, toX) => {
    const box = await carouselPage.locator('#hero-scroll').boundingBox();
    const y = box.y + box.height / 2;
    await carouselPage.evaluate(({ fromX, toX, y }) => {
      const scroller = document.querySelector('#hero-scroll');
      scroller.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [new Touch({ identifier: 1, target: scroller, clientX: fromX, clientY: y })] }));
      scroller.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [new Touch({ identifier: 1, target: scroller, clientX: toX, clientY: y })] }));
      scroller.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [new Touch({ identifier: 1, target: scroller, clientX: toX, clientY: y })] }));
    }, { fromX, toX, y });
  };
  const carouselBox = await carouselPage.locator('#hero-scroll').boundingBox();
  await swipe(carouselBox.x + carouselBox.width * 0.8, carouselBox.x + carouselBox.width * 0.2);
  await carouselPage.locator('.hero-dot[data-index="1"].active').waitFor();
  assert.equal((await carouselPage.evaluate(() => window.LumenHero.getState())).active, false, 'left touch swipe advances and deactivates Lumen');
  await swipe(carouselBox.x + carouselBox.width * 0.2, carouselBox.x + carouselBox.width * 0.8);
  await carouselPage.locator('.hero-dot[data-index="0"].active').waitFor();
  assert.equal((await carouselPage.evaluate(() => window.LumenHero.getState())).active, true, 'right touch swipe returns to Lumen');

  await carouselPage.locator('#hero-next').click();
  await carouselPage.locator('.hero-dot[data-index="1"].active').waitFor();
  assert.equal((await carouselPage.evaluate(() => window.LumenHero.getState())).active, false, 'leaving card 0 deactivates Lumen');
  assert.equal((await carouselPage.evaluate(() => window.LumenHero.getState())).state, 'held', 'leaving Lumen holds its final frame');
  assert.deepEqual(await playbackVector(), [false, true, false], 'only the active Labs21 card video plays');

  await carouselPage.locator('.hero-card[data-card="1"] .hero-replay').focus();

  await carouselPage.locator('#hero-next').click();
  await carouselPage.locator('.hero-dot[data-index="2"].active').waitFor();
  assert.deepEqual(await playbackVector(), [false, false, true], 'only the active product card video plays');
  await carouselPage.keyboard.press('Enter');
  assert.deepEqual(await playbackVector(), [false, false, true], 'retained keyboard focus cannot replay inactive Labs21 video');
  await carouselPage.waitForFunction(() => {
    const scroller = document.querySelector('#hero-scroll');
    const card = document.querySelectorAll('.hero-card')[2];
    return Math.abs(scroller.scrollLeft - (card.offsetLeft - scroller.offsetLeft)) < 2;
  });

  const productControlState = await carouselPage.evaluate(() => {
    const video = document.querySelector('.hero-card[data-card="2"] video');
    const seek = document.querySelector('#hp-seek');
    Object.defineProperty(video, 'duration', { configurable: true, get: () => 100 });
    video.currentTime = 10;
    video.muted = false;
    const rect = seek.getBoundingClientRect();
    seek.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left + rect.width * 0.2 }));
    return { currentTime: video.currentTime, muted: video.muted, moveX: rect.left + rect.width * 0.8 };
  });
  await carouselPage.locator('#hp-mute').focus();
  await carouselPage.evaluate(() => {
    document.querySelector('#hero-prev').click();
    document.querySelector('#hero-prev').click();
  });
  await carouselPage.locator('.hero-dot[data-index="0"].active').waitFor();
  await carouselPage.evaluate((moveX) => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: moveX })), productControlState.moveX);
  await carouselPage.keyboard.press('Space');
  assert.equal(await carouselPage.evaluate(() => document.querySelector('.hero-card[data-card="2"] video').muted), productControlState.muted, 'retained keyboard focus cannot mute inactive product video');
  await carouselPage.evaluate(() => {
    const seek = document.querySelector('#hp-seek');
    const rect = seek.getBoundingClientRect();
    seek.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + rect.width * 0.6 }));
    document.querySelector('#hp-mute').click();
  });
  assert.deepEqual(await carouselPage.evaluate(() => {
    const video = document.querySelector('.hero-card[data-card="2"] video');
    return { currentTime: video.currentTime, muted: video.muted };
  }), { currentTime: productControlState.currentTime, muted: productControlState.muted }, 'inactive pointer drag, click seek, and programmatic mute preserve product media state');
  await carouselPage.locator('#hp-play').focus();
  await carouselPage.keyboard.press('Space');
  assert.deepEqual(await playbackVector(), [false, false, false], 'retained keyboard focus cannot play inactive product video');
  await carouselPage.evaluate(() => document.querySelector('#hp-replay').click());
  assert.deepEqual(await playbackVector(), [false, false, false], 'programmatic activation cannot replay inactive product video');
  assert.deepEqual(await carouselPage.evaluate(() => window.LumenHero.getState()), {
    mode: 'video', state: 'held', active: true, elapsedMs: 8000, phase: 'held',
  }, 'returning to Lumen preserves the held frame without replay');
  assert.equal(await carouselPage.evaluate(() => document.querySelector('#lumen-fallback').__playing), false, 'Lumen remains paused until Replay is deliberate');
  await carouselPage.locator('#lumen-playback').click();
  assert.equal((await carouselPage.evaluate(() => window.LumenHero.getState())).state, 'playing', 'Replay deliberately starts Lumen');
  assert.equal(await carouselPage.evaluate(() => document.querySelector('#lumen-fallback').__playing), true, 'Replay resumes the Lumen video');

  await carouselPage.evaluate(() => {
    document.querySelector('#hero-next').click();
    document.querySelector('#hero-next').click();
  });
  await carouselPage.locator('.hero-dot[data-index="2"].active').waitFor();
  assert.deepEqual(await playbackVector(), [false, false, true], 'rapid Next twice reaches product video with active-only playback');
  await carouselPage.evaluate(() => {
    document.querySelector('#hero-prev').click();
    document.querySelector('#hero-prev').click();
  });
  await carouselPage.locator('.hero-dot[data-index="0"].active').waitFor();
  assert.deepEqual(await playbackVector(), [false, false, false], 'rapid Previous twice returns to held Lumen');

  await carouselPage.evaluate(() => {
    document.querySelector('#hero-next').click();
    document.querySelector('#hero-next').click();
    document.querySelector('#hero-prev').click();
  });
  await carouselPage.locator('.hero-dot[data-index="1"].active').waitFor();
  assert.deepEqual(await playbackVector(), [false, true, false], 'rapid reversal settles predictably on Labs21');

  await carouselPage.evaluate(() => {
    const scroller = document.querySelector('#hero-scroll');
    const card = document.querySelectorAll('.hero-card')[1];
    scroller.scrollTo({ left: card.offsetLeft - scroller.offsetLeft, behavior: 'instant' });
  });
  await carouselPage.waitForTimeout(150);
  await carouselPage.locator('#hero-next').click();
  await carouselPage.locator('.hero-dot[data-index="2"].active').waitFor();
  assert.deepEqual(await playbackVector(), [false, false, true], 'arrow navigation continues from a manually settled scroll target');
  await carouselPage.evaluate(() => {
    const scroller = document.querySelector('#hero-scroll');
    const card = document.querySelectorAll('.hero-card')[0];
    scroller.scrollTo({ left: card.offsetLeft - scroller.offsetLeft, behavior: 'instant' });
  });
  await carouselPage.locator('.hero-dot[data-index="0"].active').waitFor();
  await carouselPage.waitForTimeout(150);
  await carouselPage.locator('#hero-next').click();
  await carouselPage.locator('.hero-dot[data-index="1"].active').waitFor();
  await carouselPage.locator('#hero-prev').click();
  await carouselPage.locator('.hero-dot[data-index="0"].active').waitFor();
  assert.deepEqual(await carouselPage.evaluate(() => window.LumenHero.getState()), {
    mode: 'video', state: 'held', active: true, elapsedMs: 8000, phase: 'held',
  }, 'final carousel state reactivates held Lumen without replay');
  assert.deepEqual(await playbackVector(), [false, false, false], 'final held Lumen state leaves every video paused');
  assert.deepEqual(carouselErrors, [], 'carousel interactions produce no page errors');
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
