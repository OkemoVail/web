import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await fs.readFile(path.join(root, 'AI/research.html'), 'utf8');
assert.ok(html.indexOf('../src/site.css') < html.indexOf('../liquid-design/liquid-design.css'));
assert.match(html, /<script defer src="\.\.\/liquid-design\/liquid-design.js"><\/script>\s*<script defer src="\.\.\/src\/liquid-design-site.js"><\/script>/);
const server = http.createServer(async (req, res) => {
  try {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    const data = await fs.readFile(file);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const engine = process.env.RESEARCH_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const url = `http://127.0.0.1:${server.address().port}/AI/research.html`;
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('vail_theme', 'light'));
    await page.goto(url);
    await page.waitForFunction(() => window.LiquidDesignSite && document.querySelector('#tag-cloud button > .lgp-material'));
    // Verify the real Tailwind-CDN layout, rather than an unstyled offline facsimile.
    await page.waitForFunction(() => getComputedStyle(document.querySelector('main')).paddingTop !== '0px');
    await page.waitForFunction(() => document.querySelector('#article-feed article'));
    const validateControls = async () => {
      const controls = await page.locator('button,a.ov-nav__link,a.ov-nav__primary').evaluateAll(nodes => nodes.map(el => ({
        text: el.textContent.trim(), independent: el.hasAttribute('data-liquid-design-independent'),
        material: el.querySelectorAll(':scope > .lgp-material').length,
        outline: el.querySelectorAll(':scope > .lgp-outline').length,
        content: el.querySelectorAll(':scope > .lgp-content').length,
        nested: el.querySelectorAll('.lgp-content .lgp-content').length
      })));
      assert.ok(controls.length >= 11);
      for (const control of controls) {
        assert.ok(control.independent, control.text);
        assert.equal(control.material, 1, control.text);
        assert.equal(control.outline, 1, control.text);
        assert.equal(control.content, 1, control.text);
        assert.equal(control.nested, 0, control.text);
      }
      assert.equal(await page.locator('[data-lgp-group]:not([data-lgp-control]),[data-lgp-component],.lg-color-object').count(), 0);
      assert.equal(await page.locator('.lgp-material[data-connections]:not([data-connections="0"])').count(), 0);
    };
    await validateControls();
    const tag = page.locator('#tag-cloud button').filter({ hasText: 'Architecture' });
    const tint = () => tag.locator(':scope > .lgp-material').evaluate(el => getComputedStyle(el, '::after').backgroundColor);
    const neutral = await tint();
    await tag.click();
    await page.waitForFunction(() => document.querySelector('#tag-cloud button.skuo-accent > .lgp-material'));
    assert.notEqual(await tint(), neutral, 'selected accent survives tag-cloud replacement');
    await validateControls();
    await tag.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => !document.querySelector('#tag-cloud button.skuo-accent'));
    await page.waitForFunction(() => document.querySelector('#tag-cloud button > .lgp-material'));
    await page.locator('#article-search').fill('no matching paper Liquid Design verification');
    await page.waitForFunction(() => document.querySelector('#article-feed').textContent.includes('No papers found'));
    await page.locator('#article-search').fill('');
    await page.locator('#article-feed article').first().click();
    await page.waitForFunction(() => document.querySelector('#reader-modal').classList.contains('active'));
    const close = page.locator('#reader-modal button');
    await page.waitForFunction(() => document.querySelector('#reader-modal button > .lgp-material').dataset.surfaces === '1');
    assert.equal(await close.locator(':scope > .lgp-content > i.fa-xmark').count(), 1, 'close icon survives wrapping');
    const closeBounds = await close.boundingBox();
    assert.ok(Math.abs(closeBounds.width - 48) < 1 && Math.abs(closeBounds.height - 48) < 1, 'native close dimensions survive');
    await close.click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#reader-modal')).display === 'none');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    const chevron = page.getByRole('button', { name: 'Toggle navigation links' });
    const initialExpanded = await chevron.getAttribute('aria-expanded');
    await chevron.click();
    assert.notEqual(await chevron.getAttribute('aria-expanded'), initialExpanded);
    await chevron.click();
    assert.equal(await chevron.getAttribute('aria-expanded'), initialExpanded);
    await chevron.focus();
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement, cs = getComputedStyle(el);
      return { glass: el.hasAttribute('data-lg-site'), visible: el.matches(':focus-visible'), ring: cs.boxShadow, outline: cs.outlineStyle };
    });
    assert.ok(focus.glass && focus.visible && (focus.ring !== 'none' || focus.outline !== 'none'), 'keyboard focus remains visible');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark') && document.querySelector('#tag-cloud button').dataset.lgpTheme === 'dark');
    assert.equal(await page.locator('.ov-nav__theme > .lgp-content > svg').count(), 2, 'both theme icons remain in the wrapper');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
    if (width < 768) await chevron.click();
    await page.waitForTimeout(250);
    const nav = await page.locator('.ov-nav__bar').boundingBox();
    assert.ok(nav.x >= 0 && nav.x + nav.width <= width + 1, 'navigation fits viewport');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no mobile/page horizontal overflow');
    await validateControls();
    // Concrete wrapper regression: native tag nodes/handlers survive content repair.
    await tag.evaluate(el => { window.researchTagIdentity = el; el.innerHTML = '<span>Architecture</span>'; });
    await page.waitForFunction(() => document.querySelector('#tag-cloud button > .lgp-content > span'));
    assert.ok(await tag.evaluate(el => el === window.researchTagIdentity));
    await tag.click();
    await page.waitForFunction(() => document.querySelector('#tag-cloud button.skuo-accent > .lgp-material'));
    await tag.click();
    await page.waitForFunction(() => !document.querySelector('#tag-cloud button.skuo-accent'));
    await page.waitForFunction(() => document.querySelector('#tag-cloud button > .lgp-material'));
    await validateControls();
    if (process.env.RESEARCH_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.RESEARCH_SCREENSHOT_DIR, `research-glass-${width}.png`), fullPage: true });
    }
    await page.evaluate(() => LiquidDesignSite.destroy());
    assert.equal(await page.locator('[data-lg-site],.lgp-material,.lgp-outline,.lgp-content').count(), 0);
    await tag.click();
    assert.equal(await page.locator('#tag-cloud button.skuo-accent').count(), 1, 'native tag action remains after teardown');
    assert.deepEqual(errors, [], 'no browser exceptions');
    console.log(`${process.env.RESEARCH_BROWSER || 'chromium'} ${width}px PASS: independent controls, dynamic tags/accent, search, reader/icon/48px layout, nav, theme icons, focus, overflow, wrapper repair, teardown`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
