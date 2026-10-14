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
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(() => {
      localStorage.setItem('vail_theme', 'light');
      localStorage.setItem('vail_last_seen_build', '999999');
      localStorage.setItem('vail_settings_v4', JSON.stringify({
        userName: 'Folder test', accent: '#c96478', lang: 'en', sidebarMode: 'manual',
        hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: []
      }));
    });
    await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html?__glass_native=1`);
    await page.waitForFunction(() => document.querySelector('.folder-create-btn[data-lgp-control]'));
    await page.evaluate(() => {
      document.getElementById('onboarding-overlay').style.display = 'none';
      document.getElementById('app-preloader').style.display = 'none';
      if (innerWidth < 768 && document.getElementById('sidebar').classList.contains('-translate-x-full')) window.toggleSidebar();
      if (innerWidth >= 768 && document.body.classList.contains('sidebar-collapsed')) window.toggleSidebar();
    });
    await page.waitForTimeout(500);

    const trigger = page.locator('.folder-create-btn');
    assert.equal(await trigger.getAttribute('aria-label'), 'New folder');
    assert.equal(await trigger.locator(':scope > .lgp-material').count(), 1, 'folder-plus owns one Liquid Glass material');
    await trigger.click();

    const card = page.locator('.custom-prompt-card');
    await card.waitFor({ state: 'visible' });
    assert.equal(await card.getAttribute('data-naming-dialog'), 'folder', 'folder create uses the shared naming-dialog path');
    await page.waitForFunction(() => document.querySelector('.custom-prompt-card')?.getAttribute('data-lgp-control') === 'surface');
    assert.ok(await page.locator('.custom-modal-overlay').evaluate(overlay => {
      const overlayZ = Number(getComputedStyle(overlay).zIndex);
      const sidebarZ = Number(getComputedStyle(document.getElementById('sidebar')).zIndex);
      return overlayZ > sidebarZ;
    }), 'dialog stacking context stays above the chat sidebar and canvas');
    assert.equal(await card.locator(':scope > .lgp-material').count(), 1, 'prompt card owns one Liquid Glass material');
    assert.equal(await page.locator('.custom-modal-input-shell > .lgp-material').count(), 1, 'text field owns one Liquid Glass material');
    assert.equal(await page.locator('.custom-modal-actions .modal-btn > .lgp-material').count(), 2, 'both actions use Liquid Glass');
    assert.ok(await card.locator(':scope > .lgp-material').evaluate(el => {
      const alpha = Number(getComputedStyle(el).backgroundColor.match(/[\d.]+(?=\))/)?.[0]);
      return alpha >= .8 && getComputedStyle(el).backdropFilter.includes('32px');
    }), 'card frost is opaque enough to keep page copy from competing through the glass');

    const layout = await page.evaluate(() => {
      const input = document.querySelector('.custom-modal-input-shell').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.custom-modal-actions .modal-btn')].map(el => el.getBoundingClientRect());
      const card = document.querySelector('.custom-prompt-card').getBoundingClientRect();
      return {
        inputBottom: input.bottom,
        buttonTop: Math.min(...buttons.map(box => box.top)),
        widths: buttons.map(box => box.width),
        card: { left: card.left, right: card.right }
      };
    });
    assert.ok(layout.inputBottom <= layout.buttonTop, 'text field sits above the actions');
    assert.ok(Math.abs(layout.widths[0] - layout.widths[1]) < 1, 'actions split the row evenly');
    assert.ok(layout.card.left >= 0 && layout.card.right <= width, 'glass prompt fits the viewport');
    assert.equal(await page.locator('.modal-btn-primary').innerText(), 'Create');
    if (process.env.FOLDER_DIALOG_SCREENSHOT) {
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join('C:/Users/okemo/AppData/Local/Temp/opencode', `chat-folder-dialog-${width}.png`) });
    }

    await page.locator('.custom-modal-input').fill('Field Notes');
    await page.locator('.modal-btn-primary').click();
    await page.waitForFunction(() => !document.querySelector('.custom-prompt-card'));
    assert.equal(await page.locator('.folder-header').filter({ hasText: 'Field Notes' }).count(), 1, 'Create saves and renders the folder');

    await page.evaluate(() => document.querySelector('.folder-container .folder-action-btn').click());
    await page.locator('#chat-action-menu').getByRole('button', { name: 'Rename Folder' }).click();
    await page.waitForFunction(() => document.querySelector('[data-naming-dialog="folder"]'));
    assert.equal(await page.locator('[data-naming-dialog="folder"] .custom-modal-title').innerText(), 'Rename Folder',
      'folder row rename opens the same shared naming dialog');
    await page.locator('[data-naming-dialog="folder"] .custom-modal-input').fill('Archive');
    await page.locator('[data-naming-dialog="folder"] .modal-btn-primary').click();
    await page.waitForFunction(() => !document.querySelector('[data-naming-dialog="folder"]'));
    assert.equal(await page.locator('.folder-header').filter({ hasText: 'Archive' }).count(), 1, 'Rename saves and renders the folder name');
    await page.close();
  }

  console.log('PASS folder Liquid Glass dialog');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
