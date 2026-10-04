import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await fs.readFile(path.join(root, 'AI/editor.html'), 'utf8');
assert.match(html, /site\.css[\s\S]*liquid-design\/liquid-design\.css/);
assert.match(html, /<script defer src="\.\.\/liquid-design\/liquid-design\.js"><\/script>\s*<script defer src="\.\.\/src\/liquid-design-site\.js">/);
const tailwind = await fetch('https://cdn.tailwindcss.com').then(r => { assert.ok(r.ok); return r.text(); });
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
const errors = [];
async function open(viewport, baseline = false) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**', route => route.request().url().startsWith('https://cdn.tailwindcss.com')
    ? route.fulfill({ contentType: 'text/javascript', body: tailwind }) : route.abort());
  await page.route('**/AI/updatenotes.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.checkChangelog = function () {};' }));
  if (baseline) await page.route('**/AI/editor.html', route => route.fulfill({ contentType: 'text/html', body: html.replace(/\s*<(?:link|script)[^>]*(?:liquid-design\.css|liquid-design\.js|liquid-design-site\.js)[^>]*>(?:<\/script>)?/g, '') }));
  await page.goto(origin + '/AI/editor.html');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('header')).position === 'fixed');
  if (!baseline) await page.waitForFunction(() => [...document.querySelectorAll('button')].every(el => el.hasAttribute('data-lg-site')));
  await page.waitForTimeout(200);
  return page;
}
const dimensions = page => page.locator('button').evaluateAll(els => els.map(el => ({ name: el.title || el.textContent.trim(), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
async function selectText(page, text = 'Selected words') {
  await page.locator('#blog-editor').evaluate((el, text) => {
    el.innerHTML = '<h1>Glass editor test</h1><p>' + text + '</p>';
    el.focus(); const range = document.createRange(); range.selectNodeContents(el.querySelector('p'));
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  }, text);
}
async function checkChrome(page) {
  assert.equal(await page.locator('[data-lgp-group]:not([data-lgp-control]),.lg-color-object,[data-lgp-component]').count(), 0);
  assert.equal(await page.locator('.lgp-content .lgp-content').count(), 0);
  assert.ok(await page.locator('button').evaluateAll(els => els.every(el => el.querySelectorAll(':scope > .lgp-material').length === 1 && el.querySelectorAll(':scope > .lgp-outline').length === 1 && el.hasAttribute('data-liquid-design-independent'))));
}
try {
  const baseline = await open({ width: 1280, height: 900 }, true);
  const originalDimensions = await dimensions(baseline);
  console.log('Desktop native header/nav bounds:', await baseline.locator('#connect-btn').boundingBox(), await baseline.locator('.ov-nav__bar').boundingBox());
  const page = await open({ width: 1280, height: 900 });
  const enhancedDimensions = await dimensions(page);
  assert.equal(enhancedDimensions.length, originalDimensions.length);
  enhancedDimensions.forEach((entry, i) => {
    assert.equal(entry.name, originalDimensions[i].name);
    for (const key of ['width', 'height']) assert.ok(Math.abs(entry[key] - originalDimensions[i][key]) < 1, `${entry.name} ${key} preserved`);
  });
  await baseline.close();
  await checkChrome(page);
  console.log('Desktop enhanced header/nav bounds:', await page.locator('#connect-btn').boundingBox(), await page.locator('.ov-nav__bar').boundingBox());
  for (const [title, selector] of [['Bold', 'b,strong'], ['Italic', 'i,em'], ['Heading 1', 'h1'], ['Heading 2', 'h2'], ['Paragraph', 'p'], ['Bullet List', 'ul li']]) {
    await selectText(page);
    await page.locator(`button[title="${title}"]`).click();
    assert.equal(await page.locator(`#blog-editor ${selector}`).filter({ hasText: 'Selected words' }).count(), 1, `${title} formats the selected editor text`);
  }
  await selectText(page);
  await page.locator('.editor-toolbar select').selectOption('5');
  assert.equal(await page.locator('#blog-editor font[size="5"]').textContent(), 'Selected words');
  console.log('PASS: native selection, bold/italic/headings/paragraph/list and font-size; desktop dimensions and independent wrappers');

  const tint = locator => locator.locator(':scope > .lgp-material').evaluate(el => getComputedStyle(el, '::after').backgroundColor);
  assert.match(await tint(page.getByRole('button', { name: 'Publish', exact: true })), /37 99 235|37, 99, 235/);
  for (const name of ['Architecture', 'Core Logic', 'UX/Design', 'Hardware']) {
    const tag = page.locator(`[id="tag-${name}"]`);
    await tag.click();
    await page.waitForTimeout(100);
    assert.notEqual(await tint(tag), 'rgba(0, 0, 0, 0)', `${name} selected tint preserved`);
    await tag.click();
  }
  const toggle = page.getByRole('button', { name: 'Toggle navigation links' });
  await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark') && document.querySelector('#connect-btn').dataset.lgpTheme === 'dark');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.locator('button[title="Bold"]').focus(); await page.keyboard.press('Tab');
  assert.notEqual(await page.locator('button[title="Italic"]').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
  console.log('PASS: Publish accent, four live tag tints, navigation collapse/expand, theme and keyboard focus');

  await page.evaluate(() => {
    window.testWrites = [];
    window.showOpenFilePicker = async () => [{ name: 'blogs.json', queryPermission: async () => 'granted', getFile: async () => ({ text: async () => '[]' }), createWritable: async () => ({ write: async value => testWrites.push(value), close: async () => {} }) }];
    window.connectIdentity = document.querySelector('#connect-btn');
  });
  // The existing expanded nav overlaps the fixed action header in both baseline
  // and enhanced pages. Collapse it before exercising native pointer actions.
  await toggle.click();
  await page.locator('#connect-btn').click();
  await page.waitForFunction(() => document.querySelector('#connect-btn > .lgp-content')?.textContent === 'Connected');
  assert.ok(await page.evaluate(() => connectIdentity === document.querySelector('#connect-btn')));
  assert.notEqual(await tint(page.locator('#connect-btn')), 'rgba(0, 0, 0, 0)', 'Connected green tint survives content replacement');
  await checkChrome(page);

  await selectText(page, 'Draft with image');
  await page.locator('#blog-editor').evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(range);
    const transfer = new DataTransfer();
    const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=');
    transfer.items.add(new File([Uint8Array.from(binary, c => c.charCodeAt(0))], 'pixel.png', { type: 'image/png' }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await page.waitForFunction(() => document.querySelectorAll('.image-controls button[data-lg-site]').length === 5);
  const image = page.locator('.editor-image-container');
  if (process.env.LIQUID_BROWSER === 'webkit') {
    const native = await open({ width: 1280, height: 900 }, true);
    await selectText(native);
    await native.evaluate(() => document.execCommand('insertHTML', false, '<button id="native-image-handler" onclick="alignImg(this, \'inline\')">Center</button>'));
    assert.equal(await native.locator('#native-image-handler').getAttribute('onclick'), null, 'WebKit strips inline handlers even without glass');
    await native.close();
    // Verify glass wrappers with intact host handlers, independently of WebKit's
    // pre-existing insertHTML sanitization. Chromium above tests the actual drop.
    await image.locator('button').evaluateAll(buttons => {
      const actions = ["alignImg(this, 'float-left')", "alignImg(this, 'inline')", "alignImg(this, 'float-right')", 'resizeImg(this, -50)', 'resizeImg(this, 50)'];
      buttons.forEach((button, i) => button.setAttribute('onclick', actions[i]));
    });
    console.log('BASELINE ISSUE: WebKit insertHTML strips image onclick handlers without glass; dynamic wrapper actions verified with intact handlers');
  }
  await image.hover(); await image.getByRole('button', { name: 'Left', exact: true }).click();
  assert.match(await image.getAttribute('class'), /float-left/);
  await image.hover(); await image.getByRole('button', { name: '+', exact: true }).click();
  assert.equal(await image.locator('img').evaluate(el => el.style.width), '350px');
  await image.hover(); await image.getByRole('button', { name: '-', exact: true }).click();
  assert.equal(await image.locator('img').evaluate(el => el.style.width), '300px');
  await image.hover(); await image.getByRole('button', { name: 'Right', exact: true }).click();
  assert.match(await image.getAttribute('class'), /float-right/);
  await image.hover(); await image.getByRole('button', { name: 'Center', exact: true }).click();
  assert.match(await image.getAttribute('class'), /inline/);
  await checkChrome(page);
  console.log('PASS: Connect innerHTML repair/identity, image drop enhancement and dynamic alignment/resize handlers');

  // Publish is also covered by the baseline fixed nav; native keyboard
  // activation verifies the action without hiding or moving either component.
  await page.getByRole('button', { name: 'Publish', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.testWrites.length === 1);
  const published = await page.evaluate(() => JSON.parse(testWrites[0])[0]);
  assert.equal(published.title, 'Glass editor test');
  assert.ok(published.content.includes('Draft with image'));
  assert.ok(!/class="[^"]*lgp-|data-lg|data-liquid-design/.test(published.content), 'published rich text contains no runtime glass decorations');
  assert.ok(published.content.includes('onclick="alignImg('), 'published image actions retain their native handlers');
  await page.waitForURL('**/AI/research.html');
  console.log('PASS: native Publish writes clean rich content and navigates to Research');

  for (const width of [390, 320]) {
    const smallBaseline = await open({ width, height: 844 }, true);
    const baselineWidth = await smallBaseline.evaluate(() => document.documentElement.scrollWidth);
    const small = await open({ width, height: 844 });
    assert.equal(await small.evaluate(() => document.documentElement.scrollWidth), baselineWidth, `${width}px glass does not add overflow`);
    const nav = small.getByRole('button', { name: 'Toggle navigation links' });
    assert.equal(await nav.getAttribute('aria-expanded'), 'false');
    await nav.click(); assert.equal(await nav.getAttribute('aria-expanded'), 'true');
    await small.getByRole('button', { name: 'Toggle theme' }).click();
    assert.ok(await small.evaluate(() => document.documentElement.classList.contains('dark')));
    await selectText(small); await small.locator('button[title="Bold"]').click();
    assert.equal(await small.locator('#blog-editor b').textContent(), 'Selected words');
    await checkChrome(small);
    await small.screenshot({ path: path.join(process.env.TEMP || root, `liquid-glass-editor-${width}.png`) });
    await smallBaseline.close(); await small.close();
    console.log(`PASS: ${width}px mobile baseline overflow preserved, native nav/theme/formatting, separate glass; screenshot in TEMP`);
  }
  const navigation = await open({ width: 1280, height: 900 });
  await navigation.locator('.ov-nav__link').filter({ hasText: 'Research' }).click();
  await navigation.waitForURL('**/AI/research.html');
  assert.deepEqual(errors, []);
  console.log(`${process.env.LIQUID_BROWSER || 'chromium'}: editor integration PASS; zero browser page errors`);
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
