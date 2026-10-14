import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('outside root');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => localStorage.setItem('vail_theme', 'dark'));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?__glass_native=1`);
  await page.waitForFunction(() => document.querySelector('.ov-nav__socials-toggle[data-liquid-button]'));

  await page.locator('.ov-nav__socials-toggle').click();
  await page.waitForFunction(() => {
    const menu = document.querySelector('#ov-nav-socials');
    return menu && !menu.hidden && menu.querySelector('[data-liquid-button]');
  });

  const github = page.locator('#ov-nav-socials [data-liquid-button]').first();
  await github.focus();
  const menuFocus = await github.evaluate(el => {
    const style = getComputedStyle(el);
    return { visible: el.matches(':focus-visible'), outline: style.outlineStyle, shadow: style.boxShadow };
  });
  assert.equal(menuFocus.visible, true, 'GitHub action is keyboard-focused');
  assert.equal(menuFocus.outline, 'none', 'component Liquid Glass buttons do not draw a focus outline');
  assert.equal(menuFocus.shadow, 'none', 'component Liquid Glass buttons do not draw a focus highlight');

  const standalone = page.locator('.ov-nav__labs[data-lgp-control]');
  await standalone.focus();
  const standaloneFocus = await standalone.evaluate(el => {
    const style = getComputedStyle(el);
    return { visible: el.matches(':focus-visible'), outline: style.outlineStyle, shadow: style.boxShadow };
  });
  assert.equal(standaloneFocus.visible, true, 'standalone Liquid Glass action is keyboard-focused');
  assert.equal(standaloneFocus.outline, 'none', 'standalone Liquid Glass buttons do not draw a focus outline');
  assert.equal(standaloneFocus.shadow, 'none', 'standalone Liquid Glass buttons do not draw a focus highlight');

  const regularLink = page.locator('.home-footer a').first();
  await regularLink.focus();
  assert.notEqual(await regularLink.evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'non-glass keyboard focus remains visible');

  console.log('Liquid Glass focus highlight regression PASS');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
