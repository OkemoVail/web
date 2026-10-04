import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    let content = await fs.readFile(file);
    if (url.searchParams.has('baseline')) content = content.toString().replace(/[^\n]*liquid-glass[^\n]*\n/g, '');
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(content);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/design.html`;
const selector = 'button,a.ov-nav__link,a.ov-nav__primary';
const measurements = page => page.locator(selector).evaluateAll(nodes => nodes.map(el => {
  const rect = el.getBoundingClientRect();
  return { text: el.textContent, width: rect.width, height: rect.height };
}));
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url + '?baseline');
      const before = await measurements(page);
      await page.goto(url);
      await page.waitForFunction(() => window.LiquidDesignSite && document.querySelectorAll('[data-lg-site]').length === 18);
      await page.waitForTimeout(200);
      const after = await measurements(page);
      assert.equal(after.length, before.length);
      after.forEach((item, index) => {
        assert.equal(item.text, before[index].text);
        for (const dimension of ['width', 'height']) assert.ok(Math.abs(item[dimension] - before[index][dimension]) < 1, `${name}: ${item.text} ${dimension} preserved`);
      });
      const independent = await page.locator(selector).evaluateAll(nodes => nodes.every(el =>
        el.hasAttribute('data-liquid-design-independent') &&
        el.querySelectorAll(':scope > .lgp-content').length === 1 &&
        el.querySelectorAll(':scope > .lgp-material').length === 1 &&
        el.querySelectorAll(':scope > .lgp-outline').length === 1 &&
        el.querySelector(':scope > .lgp-material').dataset.connections === '0'));
      assert.ok(independent, 'each button/link owns exactly one separate face, rim and content wrapper');
      assert.equal(await page.locator('[data-lgp-group]:not([data-lgp-control]),.lg-color-object').count(), 0, 'no shared group containers or playground objects');
      assert.equal(await page.locator('.body a[data-lg-site]').count(), 0, 'editorial links remain ordinary links');
      assert.equal(await page.locator('.ov-nav__primary > .lgp-content > svg').count(), 1, 'navigation logo stays inside native content');
      const tint = locator => locator.locator(':scope > .lgp-material').evaluate(el => getComputedStyle(el, '::after').backgroundColor);
      const accent = page.locator('.dsc button').first();
      const neutral = page.locator('.dsc .skuo-neutral').first();
      assert.notEqual(await tint(accent), await tint(neutral));
      assert.notEqual(await tint(page.locator('.ui-seg button.on').first()), await tint(page.locator('.ui-seg button:not(.on)').first()));
      if (process.env.DESIGN_GLASS_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.DESIGN_GLASS_SCREENSHOTS, `design-glass-${name}-desktop.png`), fullPage: true });
      const theme = page.getByRole('button', { name: 'Toggle theme', exact: true });
      await theme.click();
      await page.waitForFunction(() => [...document.querySelectorAll('[data-lg-site]')].every(el => el.dataset.lgpTheme === 'dark'));
      assert.equal(await page.evaluate(() => localStorage.getItem('vail_theme')), 'dark');
      await theme.click();
      await page.waitForFunction(() => [...document.querySelectorAll('[data-lg-site]')].every(el => el.dataset.lgpTheme === 'light'));
      const chevron = page.getByRole('button', { name: 'Toggle navigation links' });
      await chevron.click(); assert.equal(await chevron.getAttribute('aria-expanded'), 'false');
      await chevron.focus(); await page.keyboard.press('Enter');
      assert.equal(await chevron.getAttribute('aria-expanded'), 'true');
      assert.notEqual(await chevron.evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'keyboard focus is visible');
      await page.locator('.ui-opt input:not(:disabled)').first().uncheck();
      assert.equal(await page.locator('.ui-opt input').first().isChecked(), false);
      assert.equal(await page.locator('.ui-opt input:disabled').first().isDisabled(), true);
      await page.locator('.ui-accordion').first().locator('summary').click();
      assert.equal(await page.locator('.ui-accordion').first().getAttribute('open'), '');
      await page.evaluate(() => {
        window.testButton = document.querySelector('.dsc button');
        window.testClicks = 0;
        testButton.addEventListener('click', () => testClicks++);
        testButton.textContent = 'Replacement label';
      });
      await page.waitForFunction(() => testButton.querySelector(':scope > .lgp-content')?.textContent === 'Replacement label');
      await accent.click(); assert.equal(await page.evaluate(() => testClicks), 1, 'content replacement retains native handler');
      await accent.evaluate(el => { el.disabled = true; el.classList.remove('skuo-accent'); el.classList.add('modal-btn-danger'); });
      await page.waitForTimeout(100);
      assert.equal(await accent.isDisabled(), true);
      assert.match(await tint(accent), /239, 68, 68/);
      assert.equal(await accent.locator(':scope > .lgp-material').evaluate(el => getComputedStyle(el).opacity), '0.5');
      await accent.evaluate(el => el.click()); assert.equal(await page.evaluate(() => testClicks), 1, 'disabled native button cannot fire');
      await page.evaluate(() => LiquidDesignSite.destroy());
      assert.equal(await page.locator('.lgp-content,.lgp-material,.lgp-outline,[data-lg-site]').count(), 0);
      await theme.click(); assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true, 'theme handler survives teardown');
      await page.evaluate(() => LiquidDesignSite.refresh());
      await page.waitForFunction(() => document.querySelector('.ov-nav__link > .lgp-content'));
      await page.route('**/index.html', route => route.fulfill({ contentType: 'text/html', body: '<title>Navigation destination</title>' }));
      await page.getByRole('link', { name: 'Home', exact: true }).click();
      await page.waitForURL('**/index.html');
      assert.deepEqual(errors, []);
      console.log(`${name} desktop: 18 separate controls; unchanged dimensions/text; accent/selected/danger/disabled; native handlers; theme/focus/nav; wrapper repair/teardown PASS`);
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(url);
        await page.waitForFunction(() => window.LiquidDesignSite && document.querySelectorAll('[data-lg-site]').length === 18);
        await page.waitForTimeout(200);
        const toggle = page.getByRole('button', { name: 'Toggle navigation links' });
        if (width < 768) {
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        }
        await page.waitForTimeout(250);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${width}px no overflow`);
        assert.ok(await page.locator('.ov-nav__bar').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
        await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
        if (process.env.DESIGN_GLASS_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.DESIGN_GLASS_SCREENSHOTS, `design-glass-${name}-${width}.png`), fullPage: true });
      }
      assert.deepEqual(errors, []);
      console.log(`${name} mobile/tablet: 320/390/768px; expandable nav; working theme; no page/nav overflow PASS`);
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
