import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    localStorage.setItem('vail_theme', 'light');
    localStorage.setItem('vail_last_seen_build', '999999');
    localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Settings glass test', sidebarMode: 'manual', hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: [] }));
  });
  await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html?__glass_native=1`);
  await page.waitForFunction(() => document.querySelector('#settings-submenu-wrap')?.dataset.lgpComponent === 'options');
  await page.evaluate(() => {
    document.getElementById('onboarding-overlay')?.remove();
    document.getElementById('app-preloader')?.remove();
  });

  const component = page.locator('#settings-submenu-wrap');
  const trigger = component.getByRole('button', { name: 'Settings' });
  assert.equal(await component.locator(':scope > .lgc-material').count(), 1, 'the component owns one liquid material');
  assert.equal(await trigger.getAttribute('data-liquid-button'), '', 'the gear is the Liquid Options source');
  assert.equal(await page.locator('#settings-submenu').getAttribute('data-liquid-menu'), '', 'the shortcut panel is the liquid menu');

  await trigger.click();
  await page.waitForFunction(() => document.querySelector('#settings-submenu-wrap')?.dataset.morphPhase === 'settled'
    && document.querySelector('#settings-submenu-wrap')?.dataset.expanded === 'true');
  const geometry = await page.evaluate(() => {
    const trigger = document.querySelector('#settings-submenu-wrap > [data-liquid-toggle]').getBoundingClientRect();
    const menu = document.getElementById('settings-submenu').getBoundingClientRect();
    const style = getComputedStyle(document.querySelector('#settings-submenu-wrap > .lgc-material'));
    return { triggerTop: trigger.top, menuBottom: menu.bottom, backdrop: style.backdropFilter || style.webkitBackdropFilter };
  });
  assert.ok(geometry.menuBottom < geometry.triggerTop, `settings menu opens above the gear: ${JSON.stringify(geometry)}`);
  assert.match(geometry.backdrop, /blur/, 'the open sheet uses Liquid Glass backdrop blur');
  assert.equal(await page.locator('#settings-submenu [role="menuitem"]').count(), 5, 'all shortcut actions remain available');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const morph = document.querySelector('#settings-submenu-wrap > .lgc-exit');
    const content = morph?.querySelector(':scope > .lgc-content');
    return morph?.querySelector('svg.feather-settings')
      && Number.parseFloat(getComputedStyle(morph).opacity) > 0.05
      && Number.parseFloat(getComputedStyle(content).opacity) === 1;
  });
  assert.equal(await component.locator(':scope > .lgc-exit svg.feather-settings').count(), 1,
    'the visible gear rides the retracting material like the title dots');
  await page.waitForFunction(() => document.querySelector('#settings-submenu-wrap')?.dataset.morphPhase === 'settled'
    && document.querySelector('#settings-submenu-wrap')?.dataset.expanded === 'false');
  assert.deepEqual(pageErrors, []);
  console.log('PASS settings shortcuts morph through one Liquid Glass Options component');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
