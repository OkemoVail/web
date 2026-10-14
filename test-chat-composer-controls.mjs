import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

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
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    localStorage.setItem('vail_theme', 'dark');
    localStorage.setItem('vail_last_seen_build', '999999');
    localStorage.setItem('vail_settings_v4', JSON.stringify({
      userName: 'Composer controls test',
      hasCompletedTutorial: true,
      sidebarMode: 'manual',
      folders: [],
      chatOrder: [],
      customAccents: []
    }));
  });
  await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html?__glass_native=1`);
  await page.waitForFunction(() => window.els?.input && document.querySelector('#plus-menu-btn > .lgc-content'));
  await page.evaluate(() => {
    document.getElementById('onboarding-overlay').style.display = 'none';
    document.getElementById('app-preloader').style.display = 'none';
  });

  const input = page.locator('#user-input');
  await input.pressSequentially('a');
  const firstIcon = await page.locator('#send-icon-wrapper > *').evaluate(element => {
    window.__composerSendIcon = element;
    return element.outerHTML;
  });
  await input.pressSequentially('b');
  assert.equal(await page.evaluate(() => document.querySelector('#send-icon-wrapper > *') === window.__composerSendIcon), true,
    `typing another key keeps the existing Send icon instead of refreshing it (${firstIcon})`);

  async function assertGlassTracksControl(controlSelector, glassHostSelector, rimSelector, label) {
    const control = page.locator(controlSelector);
    const box = await control.boundingBox();
    const before = await page.locator(glassHostSelector).locator(rimSelector).evaluate(rim => {
      const shape = rim.getBBox();
      const point = new DOMPoint(shape.x + shape.width / 2, shape.y + shape.height / 2).matrixTransform(rim.getScreenCTM());
      return { x: point.x, y: point.y };
    });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 42, box.y + box.height / 2, { steps: 6 });
    await page.waitForTimeout(180);
    const moved = await control.evaluate((element, selectors) => {
      const content = element.querySelector(':scope > .lgp-content, :scope > .lgc-content');
      const rim = document.querySelector(selectors.host).querySelector(selectors.rim);
      const matrix = new DOMMatrix(getComputedStyle(content).transform);
      const shape = rim.getBBox();
      const point = new DOMPoint(shape.x + shape.width / 2, shape.y + shape.height / 2).matrixTransform(rim.getScreenCTM());
      return {
        contentX: matrix.e,
        contentY: matrix.f,
        glassX: point.x - selectors.before.x,
        glassY: point.y - selectors.before.y
      };
    }, { host: glassHostSelector, rim: rimSelector, before });
    assert.ok(Math.hypot(moved.contentX, moved.contentY) > 2,
      `${label} icon visibly follows the pull: ${JSON.stringify(moved)}`);
    assert.ok(Math.hypot(moved.glassX - moved.contentX, moved.glassY - moved.contentY) < 2,
      `${label} glass follows its icon instead of remaining as a separate background: ${JSON.stringify(moved)}`);
    await page.mouse.up();
    await page.waitForTimeout(500);
  }

  await assertGlassTracksControl('#send-btn', '#send-btn', '.lgp-rim', 'Send');
  await assertGlassTracksControl('#plus-menu-btn', '#plus-menu-container', '.lgc-rim', 'Plus');

  const plusFillAlpha = await page.locator('#plus-menu-container > .lgc-material').evaluate(material => {
    const match = getComputedStyle(material).backgroundColor.match(/[\d.]+/g);
    return match && match.length === 4 ? Number(match[3]) : 1;
  });
  assert.ok(plusFillAlpha >= .7, `Plus has a visible glass face rather than a transparent background (${plusFillAlpha})`);

  const plusComponent = page.locator('#plus-menu-container');
  assert.equal(await plusComponent.getAttribute('data-lgp-component'), 'options',
    'Plus uses the same Liquid Options controller as Settings');
  assert.equal(await plusComponent.locator(':scope > .lgc-material').count(), 1,
    'Plus and its menu share one morphing Liquid Glass material');
  await page.evaluate(() => {
    window.__plusMorphFrames = [];
    const component = document.getElementById('plus-menu-container');
    const material = component.querySelector(':scope > .lgc-material');
    const started = performance.now();
    function sample(now) {
      const box = material.getBoundingClientRect();
      const rim = component.querySelector('.lgc-rim');
      const shape = rim?.getBBox();
      window.__plusMorphFrames.push({ time: now - started, width: box.width, height: box.height,
        shapeWidth: shape?.width || 0, shapeHeight: shape?.height || 0, phase: component.dataset.morphPhase });
      if (now - started < 500) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
    document.getElementById('plus-menu-btn').click();
  });
  const plusStateAfterClick = await plusComponent.evaluate(component => ({
    component: { kind: component.dataset.lgpComponent, expanded: component.dataset.expanded, phase: component.dataset.morphPhase },
    trigger: { expanded: component.querySelector('#plus-menu-btn')?.getAttribute('aria-expanded') },
    menu: { hidden: component.querySelector('#plus-menu')?.hidden, inert: component.querySelector('#plus-menu')?.inert }
  }));
  assert.equal(plusStateAfterClick.trigger.expanded, 'true',
    `the Plus trigger enters the Options expansion state: ${JSON.stringify(plusStateAfterClick)}`);
  assert.equal(await plusComponent.getAttribute('data-expanded'), 'true',
    'the Plus material expands through the Options controller');
  await page.waitForFunction(() => document.querySelector('#plus-menu-container')?.dataset.morphPhase === 'settled'
    && document.querySelector('#plus-menu-container')?.dataset.expanded === 'true');
  await page.waitForTimeout(500);
  const morphFrames = await page.evaluate(() => window.__plusMorphFrames);
  assert.ok(morphFrames.some(frame => frame.shapeWidth > 44 && frame.shapeWidth < 204),
    `the Plus material visibly passes through intermediate widths like Settings: ${JSON.stringify(morphFrames)}`);
  const plusMenuLayout = await page.locator('#plus-menu').evaluate(menu => {
    const box = menu.getBoundingClientRect();
    const composer = document.querySelector('.input-box-wrap').getBoundingClientRect();
    const grid = menu.querySelector('.grid');
    const material = menu.parentElement.querySelector(':scope > .lgc-material');
    return {
      width: box.width,
      gridColumns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      hasMaterial: !!material,
      materialBlur: material ? getComputedStyle(material).backdropFilter : 'none',
      cornerRadius: Number.parseFloat(getComputedStyle(menu).borderTopLeftRadius),
      morphRadius: Number.parseFloat(getComputedStyle(menu.parentElement).getPropertyValue('--liquid-design-menu-radius')),
      composerGap: composer.top - box.bottom
    };
  });
  assert.equal(plusMenuLayout.hasMaterial, true, 'the Plus menu uses the component Liquid Glass material');
  assert.match(plusMenuLayout.materialBlur, /blur\(18px\)/, 'the Plus menu uses its dedicated stronger refraction recipe');
  assert.equal(plusMenuLayout.width, 208, 'Liquid Glass preserves the existing Plus menu width');
  assert.equal(plusMenuLayout.gridColumns, 2, 'Liquid Glass preserves the existing two-column tools layout');
  assert.equal(plusMenuLayout.cornerRadius, 18, 'the Plus dropdown uses the reduced 18px corner radius');
  assert.equal(plusMenuLayout.morphRadius, 18, 'the morph settles at the same reduced corner radius');
  assert.ok(Math.abs(plusMenuLayout.composerGap - 16) <= 1,
    `the Plus dropdown has 16px of space above the composer: ${JSON.stringify(plusMenuLayout)}`);
  assert.equal(await page.locator('#plus-menu').evaluate(menu => {
    const box = menu.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 12);
    return !!hit?.closest('#plus-menu');
  }), true, 'the opened Plus menu is painted and hit-testable above the composer');

  const divider = page.locator('#plus-menu .h-px').first();
  const dividerBox = await divider.boundingBox();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2 + 55, dividerBox.y + dividerBox.height / 2, { steps: 6 });
  await page.waitForTimeout(180);
  const nestedStretch = await page.evaluate(() => {
    const scale = selector => {
      const element = document.querySelector(selector);
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return { x: matrix.a, y: matrix.d };
    };
    return {
      composer: scale('.input-box-wrap > .lgp-content'),
      menu: scale('#plus-menu')
    };
  });
  assert.ok(Math.abs(nestedStretch.composer.x - 1) < .002 && Math.abs(nestedStretch.composer.y - 1) < .002,
    `stretching glass inside Plus does not stretch the composer: ${JSON.stringify(nestedStretch)}`);
  await page.mouse.up();
  await page.waitForTimeout(500);

  assert.equal(await page.locator('#input-inner').evaluate(element => getComputedStyle(element).overflow), 'visible',
    'stretched composer controls are not clipped by the input layout frame');

  console.log('PASS chat composer controls: stable Send icon, working Plus menu, unclipped stretch');
} finally {
  await browser.close();
  server.close();
}
