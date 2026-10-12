import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await page.goto('http://127.0.0.1:8766/liquid-glass-demo-simple.html');
  const stage = page.locator('.lgd-chat-elements-stage');
  await stage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  assert.ok(await stage.locator('.lgc-material').count() >= 5);
  assert.equal(await stage.locator('.lgd-preview-sidebar-heading .lgc-outline').evaluate(el => getComputedStyle(el).stroke), 'none', 'nested material SVG does not inherit icon strokes');
  assert.equal(await stage.locator('.lgd-chat-send-cluster > .lgc-outline').evaluate(el => getComputedStyle(el).stroke), 'none', 'Send material does not acquire a white icon outline');
  assert.ok(await stage.locator('.lgc-content .lgc-outline path:not(.lgc-prism-rim):not(.lgc-tools-trigger-rim)').evaluateAll(paths => paths.filter(path => !path.closest('.lg-color-rims')).every(path => getComputedStyle(path).stroke === 'none')), 'nested material fill/mask paths cannot paint accidental white strokes');
  assert.ok(await page.locator('link[href*="site.css"]').getAttribute('href').then(href => href.includes('20261006-nested-rim-fix')), 'normal reload fetches the corrected stylesheet rather than the cached version');
  const glowSizes = await stage.evaluate(el => ({
    sidebar: parseFloat(el.querySelector('.lgd-preview-sidebar-cluster > .lgc-highlights .lgc-glow').style.width),
    send: parseFloat(el.querySelector('.lgd-chat-send-cluster > .lgc-highlights .lgc-glow').style.width)
  }));
  assert.ok(glowSizes.sidebar > glowSizes.send * 3, 'larger glass surfaces have proportionally broader touch glows');
  const input = page.locator('#lgd-preview-composer textarea');
  await input.fill('A preview message');
  await page.screenshot({ path: 'C:/Users/okemo/AppData/Local/Temp/opencode/internal-demo-chat.png' });
  await page.getByRole('button', { name: 'Send preview message', exact: true }).click();
  assert.equal(await input.inputValue(), '');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.waitForTimeout(450);
  assert.equal(await stage.evaluate(el => el.classList.contains('is-sidebar-collapsed')), true);
  await page.getByRole('button', { name: 'Open sidebar', exact: true }).click();
  await page.waitForTimeout(450);
  const sidebar = stage.locator('.lgd-preview-sidebar');
  await page.waitForFunction(() => !document.querySelector('.lgd-preview-sidebar-cluster').getAnimations().some(animation => animation.playState === 'running'));
  const box = await sidebar.boundingBox();
  await page.mouse.move(box.x + box.width - 10, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 160, box.y + 250, { steps: 8 });
  await page.waitForTimeout(250);
  const heldTransform = await sidebar.locator(':scope > .lgc-content').evaluate(el => getComputedStyle(el).transform);
  const heldGeometry = await sidebar.locator(':scope > .lgc-content').evaluate(el => {
    const matrix = new DOMMatrix(getComputedStyle(el).transform);
    const host = el.parentElement.getBoundingClientRect();
    return { x: matrix.e, y: matrix.f, widthChange: Math.abs(matrix.a - 1) * host.width, heightChange: Math.abs(matrix.d - 1) * host.height };
  });
  assert.ok(Math.abs(heldGeometry.x) < 3 && Math.abs(heldGeometry.y) < 3, `large sidebar stays anchored: ${JSON.stringify(heldGeometry)}`);
  assert.ok(heldGeometry.widthChange < 4 && heldGeometry.heightChange < 4, `large sidebar has restrained deformation on both axes: ${JSON.stringify(heldGeometry)}`);
  assert.ok(await sidebar.locator(':scope > .lgc-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - 1) > .002), `sidebar reuses live demo stretch: ${heldTransform}`);
  await page.mouse.up();
  const releaseFrames = await sidebar.locator(':scope > .lgc-content').evaluate(el => new Promise(resolve => {
    const samples = []; let start;
    function sample(time) {
      if (start === undefined) start = time;
      samples.push(new DOMMatrix(getComputedStyle(el).transform).a);
      if (time - start < 1400) requestAnimationFrame(sample); else resolve(samples);
    }
    requestAnimationFrame(sample);
  }));
  assert.ok(Math.min(...releaseFrames) >= .997, 'calm release does not visibly oscillate below resting size');
  assert.ok(Math.abs(releaseFrames.at(-1) - 1) < .002, 'calm release settles at resting geometry');
  const send = page.getByRole('button', { name: 'Send preview message', exact: true });
  const sendBox = await send.boundingBox();
  await page.mouse.move(sendBox.x + sendBox.width / 2, sendBox.y + sendBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.mouse.up();
  const buttonRelease = await send.locator(':scope > .lgc-content').evaluate(el => new Promise(resolve => {
    const samples = []; let start;
    function sample(time) {
      if (start === undefined) start = time;
      samples.push(new DOMMatrix(getComputedStyle(el).transform).a);
      if (time - start < 1200) requestAnimationFrame(sample); else resolve(samples);
    }
    requestAnimationFrame(sample);
  }));
  assert.ok(Math.min(...buttonRelease) < .997, 'small button visibly rebounds past rest');
  assert.ok(Math.abs(buttonRelease.at(-1) - 1) < .002, 'small button settles after rebound');
  await page.screenshot({ path: 'C:/Users/okemo/AppData/Local/Temp/opencode/internal-demo-chat.png' });
  console.log('PASS internal demo: original materials, composer submit, sidebar collapse/reopen');
} finally { await browser.close(); }
