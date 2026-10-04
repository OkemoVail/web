import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { PNG } from 'pngjs';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
const failures = [];
function check(name, actual, expected) {
  try { assert.deepEqual(actual, expected); console.log('PASS:', name); }
  catch { failures.push(name); console.error('FAIL:', name, { actual, expected }); }
}
try {
  for (const native of [false, true]) {
    for (const width of [429, 430, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); localStorage.setItem('vail_theme', 'dark'); });
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html${native ? '?__glass_native=1' : ''}`);
      if (!native) await page.waitForFunction(() => GlassShell.ready);
      const socials = page.getByRole('button', { name: 'Socials', exact: true, includeHidden: true });
      await socials.waitFor(); await page.waitForTimeout(700);
      for (const hold of [false, true]) {
        if (hold) {
          const b = await socials.boundingBox();
          await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
          await page.mouse.down();
        } else await socials.click();
        await page.waitForTimeout(900);
        const aligned = await socials.evaluate((el, width) => {
          const panel = document.getElementById(el.getAttribute('data-liquid-design-toggle'));
          const primary = document.querySelector('[data-glass-role="primary"],.ov-nav__labs');
          const p = panel.getBoundingClientRect(), b = primary.getBoundingClientRect();
          return { open: el.getAttribute('aria-expanded'), top: p.top, layoutTop: panel.offsetTop + panel.offsetParent.getBoundingClientRect().top, expected: width < 430 ? b.bottom + 12 : b.top };
        }, width);
        // Held material deforms toward the pointer; its opening layout must
        // still use the same top inset as a click.
        check(`${native ? 'native' : 'shell'} ${width}: Socials ${hold ? 'hold' : 'click'} respects 430px top alignment`, aligned.open === 'true' && Math.abs((hold ? aligned.layoutTop : aligned.top) - aligned.expected) < 1, true);
        if (hold) await page.mouse.up();
        await socials.evaluate(el => { if (el.getAttribute('aria-expanded') === 'true') el.click(); }); await page.waitForTimeout(900);
      }
      await page.close();
    }
  }
  for (const width of [1920, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 1080 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); localStorage.setItem('vail_theme', 'dark'); });
    await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ results: [], source: 'fixture' }) }));
    await page.route('https://cdn.tailwindcss.com/**', route => route.fulfill({ contentType: 'text/javascript', body: "window.tailwind={};var s=document.createElement('link');s.rel='stylesheet';s.href='/src/output.css';document.head.append(s);" }));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => GlassShell.ready);
    await page.waitForTimeout(600);
    check(`${width}: Socials retains its native navigation inset`, await page.locator('[data-glass-role="leading"]').evaluate(el => { const child = document.querySelector('[data-glass-page]:not([aria-hidden])').contentDocument.querySelector('.ov-nav__socials-toggle'); const actual = el.getBoundingClientRect(), expected = child.getBoundingClientRect(); return Math.abs(actual.x - expected.x) < 1 && Math.abs(actual.y - expected.y) < 1; }), true);
    const morph = await page.evaluate(async () => {
      const record = GlassShellControls.get('primary');
      const descriptors = GlassShellControls.descriptors(document.querySelector('[data-glass-page]:not([aria-hidden])').contentWindow, { variant: 'tools', primary: { label: 'Morph target' } });
      GlassShellControls.update(descriptors);
      const originalFirst = record.face.textContent.includes('Labs21');
      await new Promise(resolve => setTimeout(resolve, 75));
      const poppedFirst = parseFloat(getComputedStyle(record.wrapper).scale) > 1 && getComputedStyle(record.face).filter === 'none';
      await new Promise(resolve => setTimeout(resolve, 100));
      const blurringOld = record.face.textContent.includes('Labs21') && parseFloat(getComputedStyle(record.face).filter.slice(5)) > 0;
      await new Promise(resolve => setTimeout(resolve, 100));
      const swapped = record.face.textContent.includes('Morph target');
      await new Promise(resolve => setTimeout(resolve, 220));
      const settled = getComputedStyle(record.face).filter === 'none' && ['none', '1'].includes(getComputedStyle(record.wrapper).scale);
      GlassShellControls.update(GlassShellControls.descriptors(document.querySelector('[data-glass-page]:not([aria-hidden])').contentWindow, { variant: 'tools', primary: { label: 'Labs21' } }));
      await new Promise(resolve => setTimeout(resolve, 500));
      descriptors.find(d => d.role === 'primary').label = 'Stale icon';
      GlassShellControls.update(descriptors);
      await new Promise(resolve => setTimeout(resolve, 60));
      descriptors.find(d => d.role === 'primary').label = 'Latest icon';
      GlassShellControls.update(descriptors);
      await new Promise(resolve => setTimeout(resolve, 500));
      const latestWins = record.face.textContent.includes('Latest icon');
      GlassShellControls.update(GlassShellControls.descriptors(document.querySelector('[data-glass-page]:not([aria-hidden])').contentWindow, { variant: 'tools', primary: { label: 'Labs21' } }));
      await new Promise(resolve => setTimeout(resolve, 500));
      return { originalFirst, poppedFirst, blurringOld, swapped, settled, latestWins };
    });
    check(`${width}: morph pops with old face before blurring into new icon`, morph, { originalFirst: true, poppedFirst: true, blurringOld: true, swapped: true, settled: true, latestWins: true });
    const input = page.frameLocator('[data-glass-page]:not([aria-hidden])').locator('.hero-search input');
    await input.click();
    check(`${width}: editing search has no rectangular focus outline`, await input.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    check(`${width}: search submit retains accent glass`, await page.frameLocator('[data-glass-page]:not([aria-hidden])').locator('.hero-search button').evaluate(el => { const material = el.querySelector('.lgp-material'); return !!material && getComputedStyle(material, '::after').backgroundColor !== 'rgba(0, 0, 0, 0)'; }), true);
    check(`${width}: homepage retains More chevron`, await page.locator('[data-glass-role="menu"]').getAttribute('aria-label'), 'More');
    const menu = page.locator('[data-glass-role="menu"]');
    await menu.click();
    await page.waitForTimeout(900);
    check(`${width}: More opens horizontal work and design actions`, await menu.evaluate(el => { const panel = el.getAttribute('data-liquid-design-toggle'); const host = panel && document.getElementById(panel); const actions = host && [...host.querySelectorAll('[data-liquid-button]')].filter(item => !item.hidden); const b = el.getBoundingClientRect(); return !!actions && actions.length === 3 && actions.every(item => Math.abs(item.getBoundingClientRect().y - b.y) < 2); }), true);
    const themeAction = page.getByRole('button', { name: 'Toggle theme', exact: true });
    check(`${width}: theme icon reads as an eight-ray sun`, await themeAction.evaluate(el => { const path = el.querySelector('svg path'); return (path?.getAttribute('d').match(/M/g) || []).length >= 8; }), true);
    if (width === 1920) {
      const b = await menu.boundingBox();
      const clip = { x: Math.round(b.x + b.width / 2 - 3), y: Math.floor(b.y - 1), width: 6, height: 4 };
      const pixels = PNG.sync.read(await page.screenshot({ clip }));
      const brightness = [];
      for (let i = 0; i < pixels.data.length; i += 4) brightness.push(pixels.data[i]);
      console.log('Top rim brightness:', Math.max(...brightness));
      check('expanded Tools chevron retains a visible top rim', Math.max(...brightness) >= 40, true);
      for (const label of ['Toggle theme', 'Liquid Design', 'Selected work']) {
        const action = await page.getByRole('button', { name: label, exact: true }).boundingBox();
        const image = PNG.sync.read(await page.screenshot({ clip: { x: Math.round(action.x + action.width / 2 - 3), y: Math.floor(action.y - 1), width: 6, height: 4 } }));
        const values = []; for (let i = 0; i < image.data.length; i += 4) values.push(image.data[i]);
        check(`${label}: expanded action has matching top reflection`, Math.max(...values) >= 40, true);
      }
      if (process.env.GLASS_SCREENSHOTS) await page.screenshot({ path: 'C:/Users/okemo/AppData/Local/Temp/opencode/tools-rim.png' });
    }
    if (width === 360) check('mobile: expanded Tools slides Socials clear of the row', await page.getByRole('button', { name: 'Socials', exact: true }).evaluate(el => el.getBoundingClientRect().right <= 0), true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.waitForTimeout(900);
    await page.evaluate(() => window.workFrame = document.querySelector('[data-glass-page]:not([aria-hidden])'));
    await page.getByRole('button', { name: 'Selected work', exact: true }).click();
    await page.waitForTimeout(700);
    check(`${width}: Selected work scrolls without replacing the page`, await page.evaluate(() => workFrame === document.querySelector('[data-glass-page]:not([aria-hidden])') && workFrame.contentWindow.scrollY > 0), true);
    await page.locator('[data-glass-page]:not([aria-hidden])').evaluate(el => el.contentWindow.scrollTo(0, 0));
    await page.waitForTimeout(700);
    await page.locator('[data-glass-role="primary"]').click();
    await page.waitForFunction(() => GlassShell.currentURL.pathname === '/AI/index.html');
    check(`${width}: navigation frames have no page-sized focus ring`, await page.evaluate(async () => {
      for (let i = 0; i < 16; i++) {
        await new Promise(requestAnimationFrame);
        for (const frame of document.querySelectorAll('[data-glass-page]')) {
          const el = frame.contentDocument.activeElement;
          if (el?.matches('main,h1') && frame.contentWindow.getComputedStyle(el).outlineStyle !== 'none') return false;
        }
      }
      return true;
    }), true);
    await page.waitForTimeout(1000);
    await page.locator('[data-glass-role="menu"]').click();
    await page.waitForTimeout(900);
    check(`${width}: AI menu stays inside the viewport`, await page.locator('[data-glass-role="menu"]').evaluate(el => { const b = document.getElementById(el.getAttribute('data-liquid-design-toggle')).getBoundingClientRect(); return b.left >= 12 && b.right <= innerWidth - 12; }), true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    const aiMenuBounds = await page.locator('[data-glass-role="menu"]').boundingBox();
    await page.mouse.move(aiMenuBounds.x + aiMenuBounds.width / 2, aiMenuBounds.y + aiMenuBounds.height / 2);
    await page.mouse.down(); await page.waitForTimeout(450);
    check(`${width}: hold-open menu is clamped before its morph`, await page.locator('[data-glass-role="menu"]').evaluate(el => { const b = document.getElementById(el.getAttribute('data-liquid-design-toggle')).getBoundingClientRect(); return el.getAttribute('aria-expanded') === 'true' && b.left >= 12 && b.right <= innerWidth - 12; }), true);
    await page.mouse.up(); await page.keyboard.press('Escape'); await page.waitForTimeout(900);
    check(`${width}: destination focus cannot outline the entire page`, await page.frameLocator('[data-glass-page]:not([aria-hidden])').locator('main').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    check(`${width}: search has no fixed-layer replica`, await page.locator('.glass-shell-search').count(), 0);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForFunction(() => GlassShell.currentURL.pathname === '/index.html');
    await page.waitForTimeout(1000);
    check(`${width}: return cannot leave a stray focus perimeter`, await page.frameLocator('[data-glass-page]:not([aria-hidden])').locator('main').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    const parentBounds = await input.boundingBox();
    const slotBounds = await page.frameLocator('[data-glass-page]:not([aria-hidden])').locator('.hero-search').boundingBox();
    check(`${width}: search belongs to the page scroll tree`, await page.frameLocator('[data-glass-page]:not([aria-hidden])').locator('.hero-search').isVisible(), true);
    if (process.env.GLASS_SCREENSHOTS) await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/recording-home-${width}.png` });
    await page.locator('[data-glass-page]:not([aria-hidden])').evaluate(el => el.contentWindow.scrollTo(0, 350));
    await page.waitForTimeout(600);
    const scrollBounds = await input.boundingBox();
    const actualScroll = await page.locator('[data-glass-page]:not([aria-hidden])').evaluate(el => el.contentWindow.scrollY);
    check(`${width}: search follows scrolling content`, Math.abs(parentBounds.y - scrollBounds.y - actualScroll) < 2, true);
    check(`${width}: interaction sequence has no JavaScript errors`, errors, []);
    await page.close();
  }
  assert.deepEqual(failures, [], 'recorded regressions');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
