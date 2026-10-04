import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
const failures = [];
try {
  for (const native of [false, true]) {
    for (const fixture of [
      { saved: 'light', os: 'dark', dark: false },
      { saved: 'dark', os: 'light', dark: true },
      { saved: 'system', os: 'dark', dark: true },
      { saved: 'system', os: 'light', dark: false }
    ]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: fixture.os });
      await page.addInitScript(saved => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        localStorage.setItem('vail_theme', saved);
      }, fixture.saved);
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html${native ? '?__glass_native=1' : ''}`);
      for (const refresh of [false, true]) {
        if (refresh) await page.reload();
        if (!native) await page.waitForFunction(() => window.GlassShell?.ready);
        const menu = page.getByRole('button', { name: 'More', exact: true });
        await menu.waitFor();
        await menu.click();
        await page.getByRole('button', { name: 'Toggle theme', exact: true }).waitFor();
        await page.waitForTimeout(600);
        const state = await page.evaluate(() => {
          const shell = !!window.GlassShell;
          const buttons = [
            document.querySelector(shell ? '[data-glass-role="leading"]' : '.ov-nav__socials-toggle'),
            document.querySelector(shell ? '[data-glass-role="menu"]' : '.ov-nav__tools-toggle'),
            ...document.querySelectorAll(shell ? '.lgd-tools [data-liquid-button]' : '#ov-nav-tools [data-liquid-button]')
          ].filter(button => button && !button.hidden);
          return {
            dark: document.documentElement.classList.contains('dark'),
            icons: buttons.map(button => {
              const svg = button.querySelector('svg');
              return { label: button.getAttribute('aria-label'), color: svg && getComputedStyle(svg).color, theme: button.closest('[data-lgp-theme]')?.getAttribute('data-lgp-theme') };
            })
          };
        });
        const name = `${native ? 'native' : 'shell'} ${fixture.saved} over OS ${fixture.os}, ${refresh ? 'refresh' : 'initial load'}`;
        console.log(name, state);
        try {
          assert.equal(state.dark, fixture.dark);
          assert.ok(state.icons.length >= 5, 'Socials, chevron and all three Tools icons are checked');
          for (const icon of state.icons) {
            assert.equal(icon.theme, fixture.dark ? 'dark' : 'light', `${icon.label}: material follows the page theme`);
            const channels = icon.color.match(/[\d.]+/g).slice(0, 3).map(Number);
            assert.ok(fixture.dark ? Math.min(...channels) > 180 : Math.max(...channels) < 160, `${icon.label}: readable icon color ${icon.color}`);
          }
          console.log('PASS:', name);
        } catch (error) { failures.push(`${name}: ${error.message}`); }
      }
      await page.close();
    }
  }
  assert.deepEqual(failures, [], 'glass icons must remain readable after refresh');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
