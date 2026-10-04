import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (file === 'index.html') {
      // Native reference is the same current page, with only glass assets removed.
      const source = url.searchParams.has('native')
        ? html.replace(/\s*<(?:link|script)[^>]+(?:liquid-design\/liquid-design\.(?:css|js)|src\/liquid-design-site\.js)[^>]*>(?:<\/script>)?/g, '')
        : html;
      res.setHeader('Content-Type', 'text/html');
      res.end(source);
      return;
    }
    const target = path.resolve(root, file);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    res.end(await fs.readFile(target));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const engine = process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const errors = [];
const bounds = page => page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('button,.ov-nav__link,.ov-nav__primary')].map(el => {
    const r = el.getBoundingClientRect();
    return [el.getAttribute('aria-label') || el.textContent.trim(), { width: r.width, height: r.height }];
  })));
async function prepare(page) {
  page.on('pageerror', error => errors.push(error.stack || error.message));
  // Exercise production markup offline with its existing compiled Tailwind utilities.
  await page.route('https://cdn.tailwindcss.com/**', route => route.fulfill({ contentType: 'text/javascript', body:
    "window.tailwind={};var css=document.createElement('link');css.rel='stylesheet';css.href='/src/output.css';document.head.append(css);" }));
  await page.route('https://avatars.githubusercontent.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"/>' }));
  await page.context().route('https://github.com/ar12c', route => route.fulfill({ contentType: 'text/html', body: '<title>GitHub profile</title>' }));
  await page.addInitScript(() => localStorage.setItem('vail_theme', 'light'));
}
async function coverage(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('button:not([data-liquid-button])')]
    .every(el => el.querySelector(':scope > .lgp-material') && el.querySelector(':scope > .lgp-outline')));
  assert.equal(await page.locator('[data-lgp-component="tools"] > .lgc-material').count(), 1, 'nav uses the real compound Tools material');
  assert.equal(await page.locator('.lgp-content > .lgp-content').count(), 0, 'controls never get duplicate content wrappers');
  assert.equal(await page.locator('.ov-nav__bar > .lgp-material,.ov-nav__links > .lgp-material').count(), 0, 'nav controls have separate faces');
  assert.equal(await page.locator('.work-row .lgp-material,footer .lgp-material').count(), 0, 'editorial links remain editorial');
  const connections = await page.locator('[data-lg-site] > .lgp-material').evaluateAll(els => els.map(el => el.dataset.connections));
  assert.ok(connections.every(n => n === '0'), 'production controls have no connecting necks');
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await prepare(page);
  await page.goto(`${origin}/?native=1`);
  await page.waitForTimeout(300);
  await page.goto(origin);
  await coverage(page);
  assert.equal(await page.locator('.hero-search button').getAttribute('data-lgp-theme'), 'light', 'saved light mode overrides OS dark preference');
  assert.equal(await page.locator('.ov-nav__toolkit').getAttribute('data-lgp-theme'), 'light', 'Tools material follows the explicit page theme');
  assert.equal(await page.locator('.ov-nav__socials').getAttribute('data-lgp-theme'), 'light', 'Socials follows saved light mode');
  assert.equal(await page.locator('.hero-profile > .lgp-material').count(), 1, 'profile is a native engine-backed control');
  assert.ok(await page.locator('.hero-profile').evaluate(el => {
    const light = el.querySelector(':scope > .lgp-highlights');
    const text = el.querySelector(':scope > .lgp-content');
    return +getComputedStyle(light).zIndex > +getComputedStyle(text).zIndex && getComputedStyle(light).pointerEvents === 'none';
  }), 'touch highlight is above content and pointer-inert');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-reveal]')].every(el => getComputedStyle(el).opacity === '1'));
  const search = page.locator('.hero-search button');
  assert.equal(await page.locator('.hero-search').getAttribute('data-lgp-control'), 'surface', 'entire search pill uses editable framework glass');
  assert.equal(await page.locator('.hero-search > .lgp-material').count(), 1, 'search field owns one material');
  await page.waitForFunction(() => document.querySelector('.hero-search > .lgp-material .lg-color-spill'));
  assert.ok(await page.locator('.hero-search > .lgp-material .lg-color-spill').first().evaluate(el => getComputedStyle(el).backgroundImage.includes('139, 93, 182')), 'search glass reflects the nearby purple stardust source');
  assert.equal(await page.locator('.hero-search > .lgp-content > input').count(), 1, 'input stays native inside the surface');
  const tint = locator => locator.locator(':scope > .lgp-material').evaluate(el => getComputedStyle(el, '::after').backgroundColor);
  assert.notEqual(await tint(search), 'rgba(0, 0, 0, 0)', 'search preserves its rose accent');
  const liquidLink = page.locator('.work-row[href="/design.html"]');
  assert.equal(await liquidLink.getAttribute('href'), '/design.html', 'framework link targets the public showcase');
  assert.equal(await liquidLink.locator(':scope > .lgp-material').count(), 0, 'framework project stays in the editorial content layer');
  assert.ok(await liquidLink.evaluate(el => {
    const projects = [...document.querySelectorAll('.work-row')];
    return projects.length === 4 && projects[3] === el && projects.slice(0, 3).every(project => !!(project.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
  }), 'Liquid Design is the fourth selected project');
  assert.equal(await page.locator('h1').textContent(), 'Made ofstardust.', 'homepage has the approved main heading');
  assert.equal(await page.locator('.home-stardust').textContent(), 'stardust');
  const texture = await page.locator('.home-stardust').evaluate(el => ({ clip: getComputedStyle(el).backgroundClip, image: getComputedStyle(el).backgroundImage }));
  assert.ok(texture.clip.split(',').every(value => value.trim() === 'text') && texture.image.includes('radial-gradient'), `stardust has a native clipped space texture: ${JSON.stringify(texture)}`);
  if (process.env.HOME_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.HOME_SCREENSHOTS, 'home-light-desktop.png'), fullPage: true });
  const socials = page.locator('.ov-nav__socials-toggle');
  assert.equal(await socials.count(), 1, 'homepage exposes a dedicated Socials control');
  const socialBounds = await socials.boundingBox();
  assert.ok(socialBounds.width >= 44 && Math.abs(socialBounds.width - socialBounds.height) < 1, 'Socials has a circular touch-sized hitbox');
  assert.equal(socialBounds.x, 128, 'desktop Socials aligns to the main content edge');
  assert.equal(socialBounds.y, 32, 'desktop controls have a comfortable top inset');
  const desktopLabs = await page.locator('.ov-nav__labs').boundingBox();
  assert.ok(Math.abs(desktopLabs.x + desktopLabs.width - 1152) < 1, 'desktop Tools aligns to the opposite content edge');
  assert.ok(await page.locator('.work-row').evaluateAll(rows => rows.every(row => row.getBoundingClientRect().height >= 44 && row.getBoundingClientRect().height <= 54)), 'project rows are compact with accessible hitboxes');
  await socials.focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await socials.getAttribute('aria-expanded'), 'true', 'keyboard opens Socials');
  assert.equal(await page.getByRole('button', { name: 'GitHub', exact: true }).evaluate(el => el === document.activeElement), true, 'opening focuses the first social');
  const popupPromise = page.waitForEvent('popup');
  await page.keyboard.press('Enter');
  const popup = await popupPromise;
  await popup.waitForURL('https://github.com/ar12c');
  assert.equal(popup.url(), 'https://github.com/ar12c', 'GitHub opens the configured profile');
  await popup.close();
  assert.equal(await socials.getAttribute('aria-expanded'), 'false', 'choosing a social closes the dropdown');
  await socials.click();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.getByRole('button', { name: 'YouTube', exact: true }).evaluate(el => el === document.activeElement), true, 'arrow keys reach YouTube');
  await page.keyboard.press('Escape');
  assert.equal(await socials.getAttribute('aria-expanded'), 'false', 'Escape closes Socials');
  assert.equal(await socials.evaluate(el => el === document.activeElement), true, 'Escape restores the trigger focus');
  await socials.click();
  if (process.env.HOME_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.HOME_SCREENSHOTS, 'home-socials-open.png') });
  await page.locator('h1').click();
  assert.equal(await socials.getAttribute('aria-expanded'), 'false', 'outside click closes Socials');
  await page.locator('.ov-nav__tools-toggle').click();
  assert.equal(await page.locator('.ov-nav__tools-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('.ov-nav__tools-toggle').getAttribute('aria-label'), 'Close');
  assert.equal(await page.locator('.ov-nav__tools-arrow path').getAttribute('d'), 'm9 6 6 6-6 6');
  await page.locator('.ov-nav__tools-toggle').click();
  assert.equal(await page.locator('.ov-nav__tools-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.ov-nav__tools-toggle').getAttribute('aria-label'), 'More');
  assert.equal(await page.locator('.ov-nav__tools-arrow path').getAttribute('d'), 'm15 6-6 6 6 6');
  const labs = page.locator('.ov-nav__labs');
  assert.equal(await labs.getAttribute('href'), '/AI/index.html');
  assert.ok(await labs.locator('.lgp-content > span').evaluate(el => +getComputedStyle(el).fontWeight >= 700), 'Labs21 text is bold');
  assert.equal(await labs.locator(':scope > .lgp-material').count(), 1, 'Labs21 uses real glass');
  assert.ok(await labs.evaluate(el => {
    const label = el.querySelector('.lgp-content > span').getBoundingClientRect();
    const logo = el.querySelector('.ov-nav__logo').getBoundingClientRect();
    return logo.left >= label.right;
  }), 'Labs21 logo is on the right');
  await page.locator('.ov-nav__tools-toggle').click();
  await page.locator('.ov-nav__theme').click();
  await page.waitForFunction(() => document.querySelector('.hero-search button').dataset.lgpTheme === 'dark');
  assert.equal(await page.locator('.ov-nav__socials').getAttribute('data-lgp-theme'), 'dark', 'Socials follows dark mode');
  assert.equal(await page.locator('.ov-nav__sun').evaluate(el => getComputedStyle(el).display), 'block');
  assert.equal(await page.locator('.ov-nav__moon').evaluate(el => getComputedStyle(el).display), 'none');
  if (process.env.HOME_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.HOME_SCREENSHOTS, 'home-dark-desktop.png'), fullPage: true });
  await page.locator('.ov-nav__theme').click();
  await page.locator('.hero-search input').focus();
  await page.keyboard.press('Tab');
  assert.equal(await search.evaluate(el => el === document.activeElement && getComputedStyle(el).outlineStyle !== 'none'), true, 'search keyboard focus remains visible');
  await page.locator('.hero-search').evaluate(form => {
    window.homeSubmits = [];
    form.addEventListener('submit', event => { event.preventDefault(); homeSubmits.push({ action: form.action, method: form.method, query: new FormData(form).get('q') }); });
  });
  await page.locator('.hero-search input').fill('glass & stardust');
  await search.click();
  await search.focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => homeSubmits), Array(2).fill({ action: `${origin}/search/`, method: 'get', query: 'glass & stardust' }), 'native pointer and keyboard submit retain search payload');
  await page.locator('.ov-nav__tools-toggle').click();
  await page.locator('#ov-nav-tools a').first().click();
  assert.ok(page.url().endsWith('#work'), 'nav anchor still navigates');
  await coverage(page);
  console.log('Desktop: initial/dynamic nav glass, native dimensions, independent rims, accents, theme, focus, search actions and anchor navigation PASS');

  for (const width of [390, 375, 374, 360, 320]) {
    const mobile = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const small = await mobile.newPage(); await prepare(small); await small.goto(origin); await coverage(small);
    const toggle = small.locator('.ov-nav__tools-toggle');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'mobile starts collapsed');
    await toggle.tap();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await small.waitForTimeout(350);
    await coverage(small);
    assert.ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px mobile has no overflow`);
    await toggle.tap();
    await small.getByRole('button', { name: 'Socials', exact: true }).tap();
    const menuBounds = await small.locator('#ov-nav-socials').boundingBox();
    assert.ok(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= width, 'social dropdown stays within the mobile viewport');
    const oppositeBounds = await small.locator('.ov-nav__tools-toggle').boundingBox();
    assert.ok(menuBounds.x + menuBounds.width + 8 <= oppositeBounds.x || menuBounds.y >= oppositeBounds.y + oppositeBounds.height + 8, 'social dropdown moves below overlapping controls');
    assert.equal(menuBounds.width, 200, 'dropdown keeps its normal width');
    assert.equal(await small.locator('.ov-nav__labs .lgp-content > span').isVisible(), true, 'Labs21 retains its full label');
    await small.keyboard.press('Escape');
    await toggle.tap();
    assert.ok(await small.locator('.work-row[href="/design.html"]').evaluate(el => el.getBoundingClientRect().height >= 44), 'Liquid Design has a touch-sized native hitbox');
    const bar = await small.locator('.ov-nav__toolkit').boundingBox();
    assert.ok(bar.x >= 0 && bar.x + bar.width <= width, 'expanded nav stays in viewport');
    const triggerBounds = await toggle.boundingBox();
    assert.ok(Math.abs(triggerBounds.x + triggerBounds.width - bar.x - bar.width) < 1, 'Tools source stays on the right of its fixed footprint');
    const labsBounds = await small.locator('.ov-nav__labs').boundingBox();
    assert.ok(await small.locator('.ov-nav__labs').evaluate(el => {
      const box = el.getBoundingClientRect();
      const label = el.querySelector('.lgp-content > span').getBoundingClientRect();
      const logo = el.querySelector('.ov-nav__logo').getBoundingClientRect();
      if (getComputedStyle(el.querySelector('.lgp-content > span')).display === 'none') return Math.abs((logo.left + logo.right) / 2 - (box.left + box.right) / 2) < 1;
      const left = label.left - box.left, right = box.right - logo.right;
      return left >= 9 && right >= 9 && Math.abs(left - right) < 1;
    }), 'mobile Labs21 label/logo have balanced visible side padding');
    for (const action of await small.locator('#ov-nav-tools [data-liquid-button]').all()) {
      const actionBounds = await action.boundingBox();
      assert.ok(Math.abs(actionBounds.y - triggerBounds.y) < 1 && actionBounds.x >= 0 && actionBounds.x + actionBounds.width <= triggerBounds.x, 'mobile actions expand left in the same row inside the viewport');
    }
    assert.ok(triggerBounds.x + triggerBounds.width < labsBounds.x && Math.abs(triggerBounds.y - labsBounds.y) < 1, 'chevron sits directly left of Labs21 in the same row');
    const socialsBounds = await small.getByRole('button', { name: 'Socials', exact: true }).boundingBox();
    assert.ok(Math.abs(socialsBounds.x - 16) < 1 || socialsBounds.x + socialsBounds.width <= 0, 'Socials rests at the left inset or slides offscreen for Tools');
    for (const action of await small.locator('#ov-nav-tools [data-liquid-button]').all()) {
      const actionBounds = await action.boundingBox();
      assert.ok(socialsBounds.x + socialsBounds.width + 8 <= actionBounds.x, 'Socials slides left clear of expanded actions without shrinking');
    }
    await toggle.tap();
    assert.equal((await small.locator('.ov-nav__socials-toggle').boundingBox()).x, 16, 'closing Tools returns Socials to its left inset');
    await small.getByRole('button', { name: 'Socials', exact: true }).tap();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'opening Socials compacts the opposite Tools controls');
    await small.keyboard.press('Escape');
    await toggle.tap();
    assert.ok(Math.abs(labsBounds.y - (width - labsBounds.x - labsBounds.width)) < 1, 'rightmost Labs21 has matching top/right insets');
    await small.locator('#ov-nav-tools a').first().tap();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'mobile link auto-collapse survives wrapping');
    await small.locator('.hero-search input').fill('mobile stars');
    await small.locator('.hero-search').evaluate(form => form.addEventListener('submit', event => { event.preventDefault(); window.mobileSubmitted = new FormData(form).get('q'); }));
    await small.locator('.hero-search button').tap();
    assert.equal(await small.evaluate(() => mobileSubmitted), 'mobile stars');
    assert.equal(await small.locator('.hero-search button > .lgp-content').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a), 1, 'reduced motion keeps stable content');
    if (process.env.HOME_SCREENSHOTS) await small.screenshot({ path: path.join(process.env.HOME_SCREENSHOTS, `home-light-${width}.png`), fullPage: true });
    console.log(`${width}px mobile: navigation expansion/auto-collapse, separate surfaces, viewport bounds, native search tap, reduced motion PASS`);
    await mobile.close();
  }
  const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const fallback = await noScript.newPage();
  await fallback.goto(origin);
  assert.equal(await fallback.locator('.home-work').evaluate(el => getComputedStyle(el).opacity), '1', 'projects remain visible without JavaScript');
  assert.equal(await fallback.locator('.home-words').evaluate(el => getComputedStyle(el).opacity), '1', 'quotes remain visible without JavaScript');
  const fallbackLayout = await fallback.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('body *')].map(el => ({ tag: el.tagName, class: el.className, x: el.getBoundingClientRect().x, right: el.getBoundingClientRect().right, box: getComputedStyle(el).boxSizing })).filter(el => el.right > innerWidth) }));
  assert.ok(fallbackLayout.scrollWidth <= fallbackLayout.width, `no-JS layout has no overflow: ${JSON.stringify(fallbackLayout)}`);
  await noScript.close();
  console.log('Redesign: Liquid Design engine/link/order, single hero heading, touch target and no-JS visibility PASS');
  const live = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await prepare(live);
  await live.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await live.goto(origin + '/?__glass_native=1');
  await coverage(live);
  await live.setViewportSize({ width: 320, height: 844 });
  const holdSocials = await live.locator('.ov-nav__socials-toggle').boundingBox();
  await live.mouse.move(holdSocials.x + holdSocials.width / 2, holdSocials.y + holdSocials.height / 2);
  await live.mouse.down();
  await live.waitForFunction(() => document.querySelector('.ov-nav__socials-toggle').getAttribute('aria-expanded') === 'true');
  await live.waitForFunction(() => document.querySelector('.ov-nav__socials').dataset.morphPhase === 'settled');
  const heldMenuBounds = await live.locator('#ov-nav-socials').boundingBox();
  const holdChevron = await live.locator('.ov-nav__tools-toggle').boundingBox();
  assert.ok(heldMenuBounds.y >= holdChevron.y + holdChevron.height + 8, `holding Socials opens below the opposite chevron row: ${JSON.stringify({ heldMenuBounds, holdChevron })}`);
  await live.mouse.up();
  await live.keyboard.press('Escape');
  await live.waitForFunction(() => document.querySelector('.ov-nav__socials').dataset.morphPhase === 'settled');
  await live.locator('.ov-nav__socials-toggle').click();
  await live.waitForFunction(() => document.querySelector('.ov-nav__socials').dataset.morphPhase === 'settled');
  const liveMenu = await live.locator('#ov-nav-socials').boundingBox();
  const liveTools = await live.locator('.ov-nav__tools-toggle').boundingBox();
  assert.ok(liveMenu.y >= liveTools.y + liveTools.height + 8 && liveMenu.width === 200, 'live narrow dropdown moves below the chevron without shrinking');
  await live.keyboard.press('Escape');
  await live.waitForFunction(() => document.querySelector('.ov-nav__socials').dataset.morphPhase === 'settled');
  await live.locator('.ov-nav__tools-toggle').click();
  await live.waitForTimeout(100);
  const slidingSocials = await live.locator('.ov-nav__socials-toggle').boundingBox();
  assert.ok(slidingSocials.x < 16 && slidingSocials.x + slidingSocials.width > 0, 'Socials visibly travels left before leaving the viewport');
  await live.waitForFunction(() => document.querySelector('.ov-nav__toolkit').dataset.morphPhase === 'settled');
  const liveSocials = await live.locator('.ov-nav__socials-toggle').boundingBox();
  await live.waitForFunction(() => document.querySelector('.ov-nav__socials-toggle').getBoundingClientRect().right <= 0);
  assert.equal(liveSocials.y, 16, 'live Tools opening slides Socials horizontally without moving it down');
  await live.keyboard.press('Escape');
  await live.waitForFunction(() => document.querySelector('.ov-nav__toolkit').dataset.morphPhase === 'settled');
  await live.setViewportSize({ width: 1280, height: 900 });
  // Rendered acceptance on pure white: the resting face and touch wash must
  // both survive the brightest background, independent of colored scenery.
  await live.evaluate(() => {
    const scene = document.createElement('div'); scene.id = 'white-glass-check';
    scene.style.cssText = 'position:fixed;left:16px;top:90px;width:280px;height:120px;background:white;z-index:var(--z-toast)';
    const control = document.createElement('button'); control.type = 'button'; control.className = 'skuo';
    control.setAttribute('aria-label', 'White background glass test');
    control.style.cssText = 'position:absolute;left:24px;top:20px;width:200px;height:64px;border-radius:999px';
    scene.append(control); document.body.append(scene); LiquidDesignSite.refresh(scene);
  });
  const whiteControl = live.getByRole('button', { name: 'White background glass test' });
  await live.waitForTimeout(150);
  async function whitePixel() {
    const { data, info } = await sharp(await whiteControl.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const offset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    return (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
  }
  const restWhite = await whitePixel();
  assert.ok(restWhite <= 247 && restWhite >= 215, `resting glass is softly visible on white (${restWhite})`);
  const whiteBounds = await whiteControl.boundingBox();
  const restPrism = await whiteControl.locator('.lgp-prism-rim').evaluate(el => +getComputedStyle(el).opacity);
  await live.mouse.move(whiteBounds.x + whiteBounds.width / 2, whiteBounds.y + whiteBounds.height / 2);
  await live.mouse.down(); await live.waitForTimeout(250);
  const heldWhite = await whitePixel();
  assert.ok(await whiteControl.locator('.lgp-prism-rim').evaluate((el, rest) => +getComputedStyle(el).opacity > rest + .02, restPrism), 'prismatic edge responds to contact spring');
  assert.ok(await whiteControl.evaluate(el => el.querySelector('.lgp-prism-rim').getAttribute('d') === el.querySelector('.lgp-rim').getAttribute('d')), 'prism follows the exact glass perimeter');
  assert.ok(heldWhite - restWhite >= 3, `white touch highlight visibly brightens the neutral face (${restWhite} → ${heldWhite})`);
  if (process.env.HOME_SCREENSHOTS) await live.screenshot({ path: path.join(process.env.HOME_SCREENSHOTS, 'home-white-held.png') });
  await live.mouse.up();
  await live.locator('#white-glass-check').evaluate(el => el.remove());
  console.log(`White-background glass: resting luminance ${restWhite.toFixed(1)}, pressed ${heldWhite.toFixed(1)} PASS`);
  await live.locator('.hero-search').evaluate(form => form.addEventListener('submit', event => event.preventDefault()));
  const glassField = live.locator('.hero-search');
  await live.locator('.hero-search input').fill('native glass search');
  assert.equal(await glassField.evaluate(el => getComputedStyle(el).boxShadow), 'none', 'focused search has no pink fixed-hitbox outline');
  const fieldStart = await glassField.boundingBox();
  await live.mouse.move(fieldStart.x + 12, fieldStart.y + fieldStart.height / 2);
  await live.mouse.down();
  await live.mouse.move(fieldStart.x - 100, fieldStart.y + fieldStart.height / 2, { steps: 8 });
  await live.waitForTimeout(200);
  assert.ok(await glassField.locator(':scope > .lgp-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - 1) > .005), 'whole search surface stretches from its padding');
  assert.ok(await glassField.evaluate(el => {
    const foreground = el.querySelector(':scope > .lgp-content');
    const input = foreground.querySelector('input');
    const scale = new DOMMatrix(getComputedStyle(foreground).transform).a;
    return Math.abs(input.getBoundingClientRect().width / input.offsetWidth - scale) < .015;
  }), 'native input text box shares the material horizontal stretch');
  assert.equal(await live.locator('.hero-search input').inputValue(), 'native glass search', 'surface pull preserves typed query');
  assert.ok(await glassField.evaluate(el => {
    const button = el.querySelector('button');
    const face = button.querySelector(':scope > .lgp-material').getBoundingClientRect();
    const hitbox = button.getBoundingClientRect();
    return Math.abs(face.width - hitbox.width) < 1 && Math.abs(face.height - hitbox.height) < 1;
  }), 'nested Search material follows parent stretch exactly once');
  const fieldHeld = await glassField.boundingBox();
  assert.ok(Math.abs(fieldHeld.x - fieldStart.x) < 1 && Math.abs(fieldHeld.width - fieldStart.width) < 1, 'search layout stays fixed while glass stretches');
  await live.mouse.up();
  await live.waitForTimeout(1800);
  const liveSearch = live.locator('.hero-search button');
  const searchBounds = await liveSearch.boundingBox();
  await live.mouse.move(searchBounds.x + searchBounds.width * .8, searchBounds.y + searchBounds.height * .8);
  await live.mouse.down();
  await live.waitForTimeout(250);
  assert.ok(await liveSearch.evaluate(el => {
    const material = el.querySelector('.lgp-material').getBoundingClientRect();
    const light = el.querySelector('.lgp-highlights');
    const bounds = light.getBoundingClientRect();
    const clip = el.querySelector('.lgp-outline clipPath path').getAttribute('d');
    const expected = document.createElement('span'); expected.style.clipPath = 'path("' + clip + '")';
    return light.style.clipPath === expected.style.clipPath && getComputedStyle(light).overflow === 'hidden' &&
      Math.abs(bounds.x - material.x) < .1 && Math.abs(bounds.width - material.width) < .1;
  }), 'held highlight uses the exact moving material silhouette and dimensions');
  if (process.env.HOME_SCREENSHOTS) await live.screenshot({ path: path.join(process.env.HOME_SCREENSHOTS, 'home-held-search.png') });
  await live.mouse.up();
  const profile = live.locator('.hero-profile');
  const start = await profile.boundingBox();
  await live.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await live.mouse.down();
  await live.mouse.move(start.x + start.width / 2 + 100, start.y + start.height / 2, { steps: 8 });
  await live.waitForTimeout(150);
  assert.ok(await profile.locator('.lgp-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - 1) > .01), 'profile image stretches during a live pull');
  const held = await profile.boundingBox();
  assert.ok(Math.abs(held.x - start.x) < 1 && Math.abs(held.width - start.width) < 1, 'profile native hitbox remains fixed');
  await live.mouse.up();
  await live.waitForTimeout(1800);
  assert.ok(await profile.locator('.lgp-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - 1) < .02), 'profile rebounds to resting size');
  await live.close();
  console.log('Live profile: image/material stretch, fixed hitbox and release rebound PASS');
  if (engine === chromium) {
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const touchPage = await touchContext.newPage(); await prepare(touchPage);
    await touchPage.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    await touchPage.goto(origin + '/?__glass_native=1'); await coverage(touchPage);
    await touchPage.locator('.hero-search input').fill('touch query');
    const field = touchPage.locator('.hero-search');
    const rect = await field.boundingBox();
    const cdp = await touchContext.newCDPSession(touchPage);
    const x = rect.x + rect.width * .4, y = rect.y + rect.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + step * 14 }] });
      await touchPage.waitForTimeout(20);
    }
    await touchPage.waitForTimeout(150);
    assert.ok(await field.locator(':scope > .lgp-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).d - 1) > .005), 'real mobile input-origin touch stretches search glass');
    assert.equal(await touchPage.locator('.hero-search input').inputValue(), 'touch query', 'mobile pull preserves text');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touchPage.waitForTimeout(1800);
    assert.ok(await field.locator(':scope > .lgp-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).d - 1) < .02), 'mobile search glass rebounds after touch release');
    await touchContext.close();
    console.log('Mobile live touch: input-origin vertical pull, text preservation and rebound PASS');
  }
  assert.deepEqual(errors, [], 'integration emits no browser exceptions');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
