import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await fs.readFile(path.join(root, 'Themes/Themes.html'), 'utf8');
const includes = [
  '<link rel="stylesheet" href="../liquid-design/liquid-design.css">',
  '<script defer src="../liquid-design/liquid-design.js"></script>',
  '<script defer src="../src/liquid-design-site.js"></script>',
];
let last = html.indexOf('href="/src/site.css"');
for (const include of includes) {
  assert.ok(html.indexOf(include) > last, 'glass assets load after site CSS in dependency order');
  last = html.indexOf(include);
}
assert.doesNotMatch(html, /data-liquid-design|liquid-glass-group|liquid-color-scene/, 'page needs no marking, groups or playground');
const baseline = includes.reduce((text, include) => text.replace(include, ''), html);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
    res.end(url.searchParams.has('baseline') ? baseline : await fs.readFile(filename));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/Themes/Themes.html`;
const controls = ['#More', '#Close', '.ov-nav__chevron', '.ov-nav__theme', '.ov-nav__primary', '.ov-nav__link'];
const inspect = async page => {
  // The preview card has an existing hover scale; compare resting geometry.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(30);
  return page.evaluate(selectors => ({
  overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
  controls: selectors.flatMap(selector => Array.from(document.querySelectorAll(selector), el => {
    const r = el.getBoundingClientRect();
    const content = el.querySelector(':scope > .lgp-content') || el;
    return { selector, width: r.width, height: r.height, text: el.textContent.trim(), icons: Array.from(content.querySelectorAll('i,svg'), icon => ({
      width: icon.getBoundingClientRect().width, height: icon.getBoundingClientRect().height,
      display: getComputedStyle(icon).display, mask: getComputedStyle(icon).maskImage,
    })) };
  })),
}), controls);
};
const compare = (before, after, label) => {
  assert.equal(after.overflow, before.overflow, `${label}: no added page overflow`);
  assert.equal(after.controls.length, before.controls.length);
  before.controls.forEach((old, i) => {
    const current = after.controls[i];
    assert.equal(current.text, old.text, `${label}: native label retained`);
    for (const key of ['width', 'height']) assert.ok(Math.abs(current[key] - old[key]) < 1, `${label}: ${old.selector} ${key} retained (${old[key]} / ${current[key]})`);
    assert.deepEqual(current.icons, old.icons, `${label}: ${old.selector} icons survive content wrapper`);
  });
};
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      for (const width of [1280, 390, 320]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light', hasTouch: width < 768 });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url + '?baseline');
        await page.waitForTimeout(100);
        const initial = await inspect(page);
        await page.locator('#More').click();
        const opened = await inspect(page);
        await page.locator('#Close').click();
        if (width < 768) await page.locator('.ov-nav__chevron').click();
        const expanded = await inspect(page);
        await page.goto(url);
        await page.waitForFunction(() => window.LiquidDesignSite && document.querySelector('#More > .lgp-material'));
        await page.waitForTimeout(120);
        compare(initial, await inspect(page), `${name}/${width} initial`);
        assert.equal(await page.locator('.ov-nav__primary').getAttribute('href'), '/AI/index.html');
        assert.equal(await page.locator('.ov-nav__link').first().getAttribute('href'), '/index.html');
        assert.equal(await page.locator('.ov-nav__link').last().getAttribute('target'), '_blank');
        if (process.argv.includes('--screenshots')) await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/themes-glass-${name}-${width}.png` });
        assert.equal(await page.locator('[data-lgp-group]:not([data-lgp-control]), [data-lgp-component], .lg-color-object').count(), 0, 'no shared sibling group or playground');
        assert.equal(await page.locator('a:not(.skuo):not(.ov-nav__link):not(.ov-nav__primary) [class="lgp-material"]').count(), 0, 'editorial links stay native');
        for (const selector of controls) {
          for (const el of await page.locator(selector).all()) {
            assert.equal(await el.locator(':scope > .lgp-content').count(), 1);
            assert.equal(await el.locator(':scope > .lgp-material').count(), 1);
            assert.equal(await el.locator(':scope > .lgp-outline').count(), 1);
            assert.equal(await el.getAttribute('data-liquid-design-independent'), '');
          }
        }
        await page.locator('#More').click();
        await page.waitForFunction(() => document.querySelector('#Close > .lgp-material').dataset.surfaces === '1');
        compare(opened, await inspect(page), `${name}/${width} details open`);
        await page.locator('#Close').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#test').isVisible(), false, 'native close action works through keyboard');
        if (width < 768) await page.locator('.ov-nav__chevron').click();
        compare(expanded, await inspect(page), `${name}/${width} navigation expanded`);
        const bar = await page.locator('.ov-nav__bar').boundingBox();
        assert.ok(bar.x >= 0 && bar.x + bar.width <= width + 1, 'nav stays within mobile/desktop viewport');
        await page.locator('.ov-nav__chevron').click();
        assert.equal(await page.locator('.ov-nav__chevron').getAttribute('aria-expanded'), 'false');
        await page.locator('.ov-nav__chevron').focus();
        await page.keyboard.press('Tab');
        // WebKit's native tab policy can skip links; inspect the actual focus target.
        assert.ok(await page.evaluate(() => {
          const el = document.activeElement;
          return el.hasAttribute('data-lg-site') && el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none';
        }), 'keyboard focus remains visible on the native next control');
        const tint = () => page.locator('.ov-nav__primary > .lgp-material').evaluate(el => getComputedStyle(el, '::after').backgroundColor);
        const firstTint = await tint();
        assert.notEqual(firstTint, 'rgba(0, 0, 0, 0)', 'Labs21 keeps accent tint');
        await page.evaluate(() => document.documentElement.style.setProperty('--skuo-accent', '#129abc'));
        assert.notEqual(await tint(), firstTint, 'live accent changes reach glass');
        await page.locator('.ov-nav__theme').click();
        await page.waitForFunction(() => document.querySelector('#More').dataset.lgpTheme === 'dark');
        if (process.argv.includes('--screenshots')) await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/themes-glass-${name}-${width}-dark.png` });
        assert.equal(await page.evaluate(() => localStorage.getItem('vail_theme')), 'dark');
        assert.equal(await page.locator('.ov-nav__sun').isVisible(), true);
        assert.equal(await page.locator('.ov-nav__moon').isVisible(), false);
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#More')?.dataset.lgpTheme === 'dark');
        await page.locator('.ov-nav__theme').click();
        await page.waitForFunction(() => document.querySelector('#More').dataset.lgpTheme === 'light');
        assert.equal(await page.locator('.ov-nav__moon').isVisible(), true);
        assert.equal(await page.locator('.ov-nav__sun').isVisible(), false);
        await page.evaluate(() => LiquidDesignSite.destroy());
        assert.equal(await page.locator('.lgp-content,.lgp-material,.lgp-outline').count(), 0);
        await page.locator('#More').click();
        assert.equal(await page.locator('#test').isVisible(), true, 'native handlers survive teardown');
        await page.locator('#Close').click();
        assert.deepEqual(errors, []);
        console.log(`${name}/${width}: layout/icons, independent surfaces, details click/keyboard, nav/focus, accent, light/dark persistence, teardown PASS; baseline overflow=${initial.overflow}px, open=${opened.overflow}px`);
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
