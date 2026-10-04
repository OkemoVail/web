import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.mp4': 'video/mp4' };
const server = http.createServer(async (req, res) => {
  try {
    const target = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
    res.end(await fs.readFile(target));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const width of [1280, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'dark' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://cdn.tailwindcss.com/**', route => route.fulfill({ contentType: 'text/javascript', body:
      "window.tailwind={};var css=document.createElement('link');css.rel='stylesheet';css.href='/src/output.css';document.head.append(css);" }));
    await page.addInitScript(() => localStorage.setItem('vail_theme', 'light'));
    await page.goto(`${origin}/AI/index.html`);
    await page.waitForFunction(() => document.querySelector('.ov-nav__page-menu > .lgc-material') && document.querySelector('#lumen-hero').dataset.state === 'held');
    assert.equal(await page.locator('.hero-card').count(), 3);
    assert.equal(await page.locator('.hero-dot').count(), 3);
    assert.equal(await page.locator('.lumen-copy').isVisible(), true);
    assert.equal(await page.locator('.ov-nav__labs').getAttribute('href'), '/AI/chat.html');
    assert.equal(await page.locator('.ov-nav__page-menu').getAttribute('data-lgp-theme'), 'light');
    assert.equal(await page.locator('.ov-nav__back').getAttribute('href'), '/index.html');
    assert.equal(await page.locator('.ov-nav__socials-toggle').count(), 0);
    assert.equal(await page.locator('.ov-nav__page-menu .ov-nav__tools-toggle').evaluate(el => getComputedStyle(el).borderRadius), '50%');
    assert.ok(await page.locator('.ov-nav__labs').evaluate(el => {
      const logo = el.querySelector('.ov-nav__logo');
      const label = [...el.querySelectorAll('span')].find(span => span.textContent === 'Chat' && !span.querySelector('svg'));
      return !!(logo.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), 'Chat logo precedes its text');
    assert.equal(await page.locator('.work-row .lgp-material, footer .lgp-material').count(), 0);
    assert.equal(await page.locator('main').count(), 1);
    assert.equal(await page.locator('footer a[href="/AI/privacy.html"]').count(), 1);
    assert.ok(await page.locator('.work-row').evaluateAll(rows => rows.every(row => row.getBoundingClientRect().height >= 44)));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: no horizontal page overflow`);
    const theme = page.getByRole('button', { name: 'Toggle theme' });
    assert.equal(await theme.isVisible(), true, 'theme is visible while menu is closed');
    assert.equal(await page.locator('#ov-nav-pages .ov-nav__theme').count(), 0);
    const order = await page.locator('.ov-nav--pages').evaluate(el => {
      const menu = el.querySelector('.ov-nav__page-menu').getBoundingClientRect();
      const theme = el.querySelector('.ov-nav__theme').getBoundingClientRect();
      const chat = el.querySelector('.ov-nav__labs').getBoundingClientRect();
      return menu.right <= theme.left && theme.right <= chat.left && menu.left >= 0;
    });
    assert.ok(order, `${width}: hamburger, theme and Chat are separate and ordered`);
    const more = page.getByRole('button', { name: 'Open menu', exact: true });
    await more.click();
    await page.waitForFunction(() => document.querySelector('.ov-nav__tools-toggle').getAttribute('aria-expanded') === 'true');
    assert.equal(await page.locator('.ov-nav__page-menu .ov-nav__tools-toggle svg path').getAttribute('d'), 'M4 6h16M4 12h16M4 18h16', 'open menu retains the hamburger glyph');
    for (const [name, href] of [['Goals', '/AI/goals.html'], ['Research', '/AI/research.html'], ['Privacy', '/AI/privacy.html'], ['Terms', '/AI/tos.html']]) {
      const link = page.locator('#ov-nav-pages').getByRole('button', { name, exact: true });
      assert.equal(await link.getAttribute('data-page-href'), href);
      assert.equal(await link.isVisible(), true);
    }
    const expanded = await page.locator('#ov-nav-pages').boundingBox();
    assert.ok(expanded.x >= 0 && expanded.x + expanded.width <= width, `${width}: More menu fits`);
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.waitForFunction(() => document.documentElement.dataset.liquidDesignTheme === 'dark');
    await page.keyboard.press('Escape');
    await page.locator('.hero-dot[data-index="1"]').click();
    await page.waitForFunction(() => document.querySelector('.hero-dot[data-index="1"]').classList.contains('active'));
    await page.locator('.hero-dot[data-index="2"]').click();
    await page.waitForFunction(() => document.querySelector('.hero-dot[data-index="2"]').classList.contains('active'));
    assert.equal(await page.locator('#hp-play').isVisible(), true);
    await page.locator('.hero-dot[data-index="0"]').click();
    await page.waitForFunction(() => document.querySelector('.hero-dot[data-index="0"]').classList.contains('active'));
    await page.waitForFunction(() => document.querySelector('#hero-scroll').scrollLeft < 1);
    assert.equal(await page.locator('.lumen-copy').isVisible(), true);
    const composition = await page.locator('.lumen-copy').evaluate(el => {
      const r = el.getBoundingClientRect();
      const c = document.querySelector('#lumen-hero').getBoundingClientRect();
      return { copyLeft: r.left, copyRight: r.right, cardLeft: c.left, cardRight: c.right, viewport: innerWidth };
    });
    assert.ok(composition.copyLeft >= composition.cardLeft - 1 && composition.copyRight <= composition.cardRight + 1 && composition.cardLeft >= -1 && composition.cardRight <= width + 1,
      `${width}: Lumen copy and slide are fully within the carousel ${JSON.stringify(composition)}`);
    if (process.env.AI_HOME_SCREENSHOTS) {
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
        document.activeElement?.blur();
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      await page.waitForFunction(() => document.documentElement.dataset.liquidDesignTheme === 'light');
      await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
      await page.screenshot({ path: path.join(process.env.AI_HOME_SCREENSHOTS, `ai-home-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log(`${width}px: preserved carousel, back link, More page links, theme and editorial links PASS`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
