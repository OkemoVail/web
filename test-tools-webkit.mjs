import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { PNG } from 'pngjs';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
const failures = [];
function check(name, value) {
  if (!value) failures.push(name);
  console.log(`${value ? 'PASS' : 'FAIL'}: ${name}`);
}
try {
  for (const native of [false, true]) {
    const mode = native ? 'native' : 'shell';
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      localStorage.setItem('vail_theme', 'light');
      const read = Element.prototype.getBoundingClientRect;
      window.toolReads = 0; window.probeTools = false;
      Element.prototype.getBoundingClientRect = function () {
        if (window.probeTools && this.matches('[data-liquid-button]') && this.closest('[data-lgp-component="tools"]')) window.toolReads++;
        return read.call(this);
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html${native ? '?__glass_native=1' : ''}`);
    if (!native) await page.waitForFunction(() => GlassShell.ready);
    const menu = page.locator(native ? '.ov-nav__tools-toggle' : '[data-glass-role="menu"]');
    const group = page.locator(native ? '.ov-nav [data-lgp-component="tools"]' : '[data-liquid-design-component="tools"]');
    await menu.waitFor(); await page.waitForTimeout(700);
    await menu.click();
    await page.waitForTimeout(1300);
    check(`${mode}: only the trigger and three real actions contribute material`, await group.locator('.lgc-material').getAttribute('data-surfaces') === '4');
    // A broken cross-layer fragment must never turn the clipped material into
    // a rectangular pink patch. Pink makes leaks independently measurable.
    await group.evaluate(el => {
      el.querySelector('clipPath').remove();
      el.querySelector('.lgc-material').style.background = 'rgb(255, 0, 128)';
    });
    const bounds = await group.locator('.lgc-material').boundingBox();
    const image = PNG.sync.read(await page.screenshot({ clip: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } }));
    let leaked = 0;
    for (const x of [2, image.width - 3]) for (const y of [2, image.height - 3]) {
      const i = (y * image.width + x) * 4;
      if (image.data[i] > 230 && image.data[i + 1] < 30 && image.data[i + 2] > 90) leaked++;
    }
    check(`${mode}: compound material corners stay transparent without the SVG fragment`, leaked === 0);
    await group.evaluate(el => { el.querySelector('.lgc-material').style.removeProperty('background'); });
    await menu.click(); await page.waitForTimeout(1300);
    await menu.click(); await page.waitForTimeout(120);
    const reads = await page.evaluate(async () => {
      window.toolReads = 0; window.probeTools = true;
      // Two callbacks bracket exactly one component animation frame.
      await new Promise(requestAnimationFrame);
      window.toolReads = 0;
      await new Promise(requestAnimationFrame);
      window.probeTools = false;
      return window.toolReads;
    });
    console.log(`${mode}: native button measurements/frame: ${reads}`);
    // Four material hitboxes plus the held trigger's physics measurement.
    check(`${mode}: animation stays within five native button reads per frame`, reads <= 5);
    await page.waitForTimeout(1300);
    await menu.click(); await page.waitForTimeout(100); await menu.click();
    await page.waitForTimeout(1400);
    check(`${mode}: interrupted collapse returns to expanded horizontal actions`, await menu.getAttribute('aria-expanded') === 'true' && await group.locator('.lgc-material').getAttribute('data-surfaces') === '4');
    const box = await menu.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 6 });
    await page.waitForTimeout(250);
    check(`${mode}: trigger retains liquid stretch`, await menu.locator('.lgc-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - 1) > .002));
    await page.mouse.up();
    await menu.locator('.lgc-content').evaluate(async el => {
      const deadline = performance.now() + 4000;
      while (Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - 1) >= .002 && performance.now() < deadline) await new Promise(requestAnimationFrame);
    });
    check(`${mode}: trigger rebounds after release`, await menu.locator('.lgc-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - 1) < .002));
    await page.close();
  }
  // The physical iPad recording has magenta glyph-sized L-shaped flashes,
  // rather than leaked material corners. Exercise the filtered icon phases at
  // its landscape CSS size with repeated reversals and the sharp final frame.
  for (const native of [false, true]) {
    const mode = native ? 'native iPad' : 'shell iPad';
    const page = await browser.newPage({ viewport: { width: 1376, height: 900 }, deviceScaleFactor: 2, hasTouch: true });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      localStorage.setItem('vail_theme', 'light');
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html${native ? '?__glass_native=1' : ''}`);
    if (!native) await page.waitForFunction(() => GlassShell.ready);
    const menu = page.locator(native ? '.ov-nav__tools-toggle' : '[data-glass-role="menu"]');
    await menu.waitFor(); await page.waitForTimeout(700);
    const phases = await menu.evaluate(async el => {
      const group = el.closest('[data-lgp-component]');
      let htmlFilters = 0, localBlurFrames = 0;
      for (let cycle = 0; cycle < 4; cycle++) {
        el.click();
        for (let frame = 0; frame < 12; frame++) {
          await new Promise(requestAnimationFrame);
          const contents = [...group.querySelectorAll('[data-liquid-button]:not([hidden]) .lgc-content')];
          for (const content of contents) {
            for (const node of [content, ...content.querySelectorAll('span')]) {
              if (getComputedStyle(node).filter !== 'none') htmlFilters++;
            }
            if ([...content.querySelectorAll('feGaussianBlur')].some(blur => +blur.getAttribute('stdDeviation') > .05)) localBlurFrames++;
          }
        }
      }
      return { htmlFilters, localBlurFrames };
    });
    check(`${mode}: icon defocus avoids filtered HTML compositor layers`, phases.htmlFilters === 0);
    check(`${mode}: icon defocus is retained inside the glyph SVG`, phases.localBlurFrames > 0);
    await page.waitForTimeout(1500);
    await menu.click(); await page.waitForTimeout(1500);
    check(`${mode}: expanded action icons use black rather than Safari blue`, await menu.evaluate(el => [...el.closest('[data-lgp-component]').querySelectorAll('.lgd-tools [data-liquid-button]:not([hidden]) svg')].every(icon => {
      const channels = getComputedStyle(icon).color.match(/\d+/g)?.map(Number);
      return channels && channels.slice(0, 3).every(channel => channel < 40) && Math.max(...channels.slice(0, 3)) - Math.min(...channels.slice(0, 3)) < 3;
    })));
    check(`${mode}: settled glyphs return to sharp`, await menu.evaluate(el => [...el.closest('[data-lgp-component]').querySelectorAll('.lgc-content feGaussianBlur')].every(blur => +blur.getAttribute('stdDeviation') < .01)));
    const anchor = await menu.boundingBox();
    await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2); await page.mouse.down();
    await page.mouse.move(anchor.x + anchor.width / 2 - 200, anchor.y + anchor.height / 2, { steps: 8 });
    await page.waitForTimeout(300);
    check(`${mode}: held overlap keeps foreground HTML filter-free`, await menu.evaluate(el => [...el.closest('[data-lgp-component]').querySelectorAll('.lgc-content')].every(content => getComputedStyle(content).filter === 'none')));
    await page.mouse.up(); await page.waitForTimeout(1500);
    // Inspect rendered glyph colors, not just filter ownership. The recorded
    // artifact is saturated magenta; ordinary pink Labs21 lies outside this crop.
    const region = { x: anchor.x - 3 * 61 - 20, y: anchor.y - 20, width: 3 * 61 + anchor.width + 40, height: anchor.height + 40 };
    const pixels = PNG.sync.read(await page.screenshot({ clip: region }));
    let magenta = 0, ink = 0;
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (pixels.data[i] > 200 && pixels.data[i + 1] < 80 && pixels.data[i + 2] > 200) magenta++;
      if (pixels.data[i] < 100 && pixels.data[i + 1] < 100 && pixels.data[i + 2] < 100) ink++;
    }
    check(`${mode}: rendered icons retain ink without saturated magenta`, magenta === 0 && ink > 10);
    if (process.env.GLASS_SCREENSHOTS) await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/ipad-tools-${native ? 'native' : 'shell'}-corrected.png` });
    await page.close();
  }
  assert.deepEqual(failures, [], 'Tools WebKit regressions');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
