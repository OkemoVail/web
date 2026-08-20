import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  let requestPath;
  try {
    requestPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(error?.code === 'EACCES' ? 403 : 404).end(error?.code === 'EACCES' ? 'Forbidden' : 'Not found');
  }
});

let browser;

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string', 'static server did not bind to a TCP port');
  browser = await chromium.launch();

  for (const viewport of [
    { name: 'mobile', width: 320, height: 720 },
    { name: 'tablet', width: 768, height: 900 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('vail_theme', 'light');
    });

    try {
      await page.goto(`http://127.0.0.1:${address.port}/word/index.html`, { waitUntil: 'load' });

      assert.equal(await page.locator('.wordmark').count(), 1, `${viewport.name}: wordmark`);
      assert.equal(await page.locator('.format-capsule').count(), 1, `${viewport.name}: format capsule`);
      assert.equal(await page.locator('#document-menu-btn[aria-haspopup="menu"]').count(), 1, `${viewport.name}: document menu button`);
      assert.equal(await page.locator('#ai-toggle-btn[aria-controls="ai-panel"]').count(), 1, `${viewport.name}: AI toggle`);
      assert.equal(await page.locator('#ai-edge-tab[aria-controls="ai-panel"]').count(), 1, `${viewport.name}: AI edge tab`);
      assert.equal(await page.locator('#workspace-status[aria-live="polite"]').count(), 1, `${viewport.name}: workspace status`);
      assert.equal(await page.locator('.ai-quick-actions button').count(), 9, `${viewport.name}: quick action count`);
      assert.equal(
        await page.locator('.ai-quick-actions').getByText(/[✨➡️📝✔️📏📖💡👔😊]/).count(),
        0,
        `${viewport.name}: quick actions contain emoji`,
      );

      const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(bodyOverflow <= 1, `${viewport.name}: horizontal overflow ${bodyOverflow}px`);

      if (viewport.width > 768) {
        await assertPanelState(page, false);
        await page.locator('#ai-edge-tab').click();
        await assertPanelState(page, true);
        await page.locator('#ai-toggle-btn').click();
        await assertPanelState(page, false);
      } else {
        await page.locator('#ai-fab').click();
        await assertPanelState(page, true);
        await page.locator('.ai-mobile-close').click();
        await assertPanelState(page, false);
        const paper = await page.locator('.editor-paper').boundingBox();
        assert.ok(paper && paper.width >= viewport.width - 2, `${viewport.name}: edge-to-edge paper`);
      }

      await page.locator('#document-menu-btn').click();
      assert.equal(await page.locator('#document-menu').getAttribute('aria-hidden'), 'false', `${viewport.name}: open menu state`);
      assert.equal(await page.locator('#document-menu-btn').getAttribute('aria-expanded'), 'true', `${viewport.name}: open menu button state`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#document-menu').getAttribute('aria-hidden'), 'true', `${viewport.name}: closed menu state`);
      assert.equal(await page.locator('#document-menu-btn').getAttribute('aria-expanded'), 'false', `${viewport.name}: closed menu button state`);

      await page.locator('#editor').fill('A focused document with four words.');
      await page.locator('#save-btn').click();
      assert.match(await page.locator('#st-save').textContent(), /^Saved /, `${viewport.name}: saved state`);
      assert.equal(await page.locator('#hdr-word-count').textContent(), '6 words', `${viewport.name}: header word count`);

      assert.deepEqual(errors, [], `${viewport.name}: browser errors`);
    } finally {
      await page.close();
    }
  }

  console.log('word focus canvas contracts passed');
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}

async function assertPanelState(page, open) {
  assert.equal(await page.locator('#ai-panel').getAttribute('aria-hidden'), String(!open));
  assert.equal(await page.locator('#ai-panel').evaluate(panel => panel.inert), !open);
  assert.equal(await page.locator('#ai-toggle-btn').getAttribute('aria-expanded'), String(open));
  assert.equal(await page.locator('#ai-edge-tab').getAttribute('aria-expanded'), String(open));
}
