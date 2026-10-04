import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import sharp from 'sharp';

// Catches face-only color spill, reflections detached from the live contour,
// and stale rim color after a source leaves its proximity range.
const root = process.cwd();
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
try {
  const page = await browser.newPage({ viewport: { width: 700, height: 400 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await page.setContent(`<style>
    body { margin:0; background:#141414; }
    #source { position:absolute; left:200px; top:40px; width:240px; height:60px; background:#bc8ae8; }
    #glass { position:absolute; left:120px; top:140px; width:400px; height:80px; border-radius:40px; padding:0; border:0;
      --liquid-design-color-range:160; --liquid-design-prism-opacity:0; }
  </style><div id="source" data-liquid-color-source="#bc8ae8"></div>
  <form id="glass" data-liquid-design="surface" data-liquid-design-theme="dark"></form>`);
  await page.addStyleTag({ path: path.join(root, 'liquid-design/liquid-design.css') });
  await page.addScriptTag({ path: path.join(root, 'liquid-design/liquid-design.js') });
  await page.waitForFunction(() => document.querySelector('.lg-color-spill'));
  await page.waitForTimeout(100);
  const tinted = await page.screenshot();
  if (process.env.GLASS_REFLECTION_SCREENSHOT) await fs.writeFile(process.env.GLASS_REFLECTION_SCREENSHOT, tinted);
  await page.locator('#source').evaluate(el => { el.hidden = true; });
  await page.waitForTimeout(100);
  const neutral = await page.screenshot();
  const decode = buffer => sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = await decode(tinted), b = await decode(neutral);
  function colorChange(top, bottom) {
    let sum = 0, count = 0;
    for (let y = top * 2; y < bottom * 2; y++) for (let x = 285 * 2; x < 355 * 2; x++) {
      const i = (y * a.info.width + x) * 3;
      // Purple is a positive blue-minus-green change, independent of rim brightness.
      sum += (a.data[i + 2] - a.data[i + 1]) - (b.data[i + 2] - b.data[i + 1]); count++;
    }
    return sum / count;
  }
  const rim = colorChange(139, 141), face = colorChange(149, 156), opposite = colorChange(218, 221);
  console.log({ rim, face, opposite });
  assert.ok(rim > 4, 'nearby purple produces a visible rim reflection');
  assert.ok(rim > face * 2, 'reflection is concentrated on the facing rim rather than the blurred face');
  assert.ok(face < 4, 'interior reflection stays subtle');
  assert.ok(rim > opposite * 3, 'reflection favors the edge facing the source');
  await page.locator('#source').evaluate(el => { el.hidden = false; });
  await page.waitForTimeout(100);
  const before = await page.locator('.lg-color-rims path').first().getAttribute('d');
  await page.mouse.move(300, 180); await page.mouse.down();
  await page.mouse.move(400, 180, { steps: 6 }); await page.waitForTimeout(180);
  const after = await page.locator('.lg-color-rims path').first().getAttribute('d');
  assert.notEqual(after, before, 'color rim follows the stretched geometry');
  assert.ok(await page.locator('#glass').evaluate(el =>
    el.querySelector('.lg-color-rims path').getAttribute('d') === el.querySelector('.lgp-rim').getAttribute('d')),
  'color and material share the same live contour in each frame');
  await page.mouse.up();
  await page.locator('#source').evaluate(el => { el.style.top = '-300px'; });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.lg-color-rims path').count(), 0, 'out-of-range source removes its rim reflection');
  assert.equal(await page.locator('.lg-color-spill').count(), 0, 'out-of-range source removes its face reflection');
  await page.evaluate(() => {
    window.LiquidDesign.destroy();
    document.querySelector('#glass').remove();
    const group = document.createElement('div');
    group.id = 'compound';
    group.setAttribute('data-liquid-design-component', 'options');
    group.setAttribute('data-liquid-design-theme', 'dark');
    group.style.cssText = 'position:absolute;left:180px;top:140px;--liquid-design-color-range:160';
    group.innerHTML = '<button data-liquid-design-toggle="menu" aria-expanded="false">More</button><div id="menu" hidden><button data-liquid-design>Action</button></div>';
    document.body.append(group);
    const source = document.querySelector('#source'); source.style.top = '40px';
    window.LiquidDesign.refresh();
  });
  await page.waitForFunction(() => document.querySelector('#compound .lg-color-rims path'));
  assert.ok(await page.locator('#compound').evaluate(el =>
    el.querySelector('.lg-color-rims path').getAttribute('d') === el.querySelector('.lgc-rim').getAttribute('d')),
  'compound controls also reflect on their actual material contour');
  await page.locator('#source').evaluate(el => { el.hidden = true; });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.lg-color-rims path').count(), 0, 'compound rim clears when its source is hidden');
  assert.deepEqual(errors, []);
  console.log('Rim-first color reflection passes.');
} finally { await browser.close(); }
