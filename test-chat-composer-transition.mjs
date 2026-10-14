import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const root = process.cwd();
const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw Error('outside workspace');
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
    response.end(await fs.readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browserType = process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium;
const browser = await browserType.launch();

try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      localStorage.setItem('vail_theme', 'dark');
      localStorage.setItem('vail_last_seen_build', '999999');
      localStorage.setItem('vail_settings_v4', JSON.stringify({
        userName: 'Composer transition test',
        hasCompletedTutorial: true,
        sidebarMode: 'manual',
        folders: [],
        chatOrder: [],
        customAccents: []
      }));
    });
    await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html?__glass_native=1`);
    await page.waitForFunction(() => window.els?.input && document.querySelector('.input-box-wrap > .lgp-material'));
    await page.evaluate(() => {
      document.getElementById('onboarding-overlay').style.display = 'none';
      document.getElementById('app-preloader').style.display = 'none';
    });
    await page.waitForTimeout(500);

    const input = page.locator('#user-input');
    const composer = page.locator('.input-box-wrap');
    const height = () => composer.evaluate(element => element.getBoundingClientRect().height);

    const compactHeight = await height();
    assert.ok(compactHeight <= 80, `compact composer remains a one-row palette at ${width}px`);
    const compactGeometry = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const shell = rect('.input-box-wrap');
      const add = rect('#plus-menu-btn');
      const send = rect('#send-btn');
      return {
        radius: parseFloat(getComputedStyle(document.querySelector('.input-box-wrap')).borderTopLeftRadius),
        shellHeight: shell.height,
        addInsetTop: add.top - shell.top,
        addInsetBottom: shell.bottom - add.bottom,
        sendInsetTop: send.top - shell.top,
        sendInsetBottom: shell.bottom - send.bottom
      };
    });
    assert.ok(Math.abs(compactGeometry.addInsetTop - compactGeometry.addInsetBottom) <= 1, 'Add has equal vertical padding inside the shell');
    assert.ok(Math.abs(compactGeometry.sendInsetTop - compactGeometry.sendInsetBottom) <= 1, 'Send has equal vertical padding inside the shell');
    assert.ok(Math.abs(compactGeometry.radius - compactGeometry.shellHeight / 2) <= 1.5, 'compact shell radius follows its pill height');
    assert.equal(await input.evaluate(element => getComputedStyle(element).whiteSpace), 'nowrap', 'the compact placeholder stays on one unclipped line');

    await input.fill('A single line');
    await page.waitForTimeout(350);
    assert.equal(await composer.evaluate(element => element.classList.contains('is-multiline')), false, 'one rendered line keeps the original compact state');
    assert.ok(Math.abs(await height() - compactHeight) <= 2, 'one rendered line stays at the original composer position');

    await input.fill('First line\nSecond line');
    assert.notEqual(await input.evaluate(element => getComputedStyle(element).whiteSpace), 'nowrap', 'real copy retains native line wrapping');
    assert.equal(await composer.evaluate(element => element.classList.contains('is-multiline')), true, 'a line break opens the writing palette');
    const openingStart = await height();
    await page.waitForTimeout(110);
    const openingMiddle = await height();
    await page.waitForTimeout(300);
    const expandedHeight = await height();
    assert.ok(openingMiddle > openingStart && openingMiddle < expandedHeight, 'the palette expands continuously instead of snapping');
    assert.ok(expandedHeight >= compactHeight + 40, 'the second line creates a larger writing palette');

    const expandedLayout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const inputRect = rect('#user-input');
      const addRect = rect('#plus-menu-btn');
      const sendRect = rect('#send-btn');
      return { inputTop: inputRect.top, addTop: addRect.top, sendTop: sendRect.top, addBottom: addRect.bottom, sendBottom: sendRect.bottom };
    });
    assert.ok(expandedLayout.inputTop < expandedLayout.addTop, 'multiline copy occupies the top row');
    assert.ok(Math.abs(expandedLayout.addTop - expandedLayout.sendTop) < 1 && Math.abs(expandedLayout.addBottom - expandedLayout.sendBottom) < 1, 'controls settle together on the bottom row');

    await input.fill('First line');
    assert.equal(await composer.evaluate(element => element.classList.contains('is-multiline')), false, 'returning to one line closes the palette');
    const closingStart = await height();
    await page.waitForTimeout(110);
    const closingMiddle = await height();
    await page.waitForTimeout(300);
    const contractedHeight = await height();
    assert.ok(closingMiddle < closingStart && closingMiddle > contractedHeight, 'the palette contracts continuously instead of snapping');
    assert.ok(Math.abs(contractedHeight - compactHeight) <= 2, 'one line returns the palette to its original compact shape');
    const restoredLayout = await page.evaluate(() => {
      const rect = selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return { input: rect('#user-input'), add: rect('#plus-menu-btn'), send: rect('#send-btn') };
    });
    assert.ok(Math.abs(restoredLayout.add.y - restoredLayout.send.y) < 1, 'empty Add and Send return to their original shared row');
    assert.ok(restoredLayout.input.x > restoredLayout.add.x && restoredLayout.input.x + restoredLayout.input.width < restoredLayout.send.x, 'the empty field returns between its controls');

    await input.fill('');
    await page.waitForTimeout(350);
    assert.equal(await composer.evaluate(element => element.classList.contains('is-multiline')), false, 'empty remains in the compact state');
    assert.ok(Math.abs(await height() - compactHeight) <= 2, 'empty remains at the original composer position');

    await page.close();
  }
  console.log('PASS chat composer: line breaks smoothly open and close the writing palette');
} finally {
  await browser.close();
  server.close();
}
