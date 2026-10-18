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
  for (const [width, height] of [[390, 900], [658, 1200]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    await page.addInitScript(() => {
      localStorage.setItem('vail_theme', 'dark');
      localStorage.setItem('vail_last_seen_build', '999999');
      localStorage.setItem('vail_settings_v4', JSON.stringify({
        userName: 'Mobile test',
        hasCompletedTutorial: true,
        sidebarMode: 'manual',
        folders: [],
        chatOrder: [],
        customAccents: []
      }));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html?__glass_native=1`);
    await page.waitForFunction(() => window.els?.sidebar && document.querySelector('#menu-toggle-btn'));
    await page.waitForTimeout(700);

    const closed = await page.locator('#sidebar').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        translate: style.translate,
        transform: style.transform
      };
    });
    assert.equal(closed.width, width - 24, `${width}px drawer should retain 12px side insets`);
    assert.equal(closed.translate, 'none', `${width}px drawer must not receive a duplicate translate transform`);
    assert.ok(closed.right <= 0, `${width}px closed drawer should be fully off-canvas: ${JSON.stringify(closed)}`);

    await page.locator('#menu-toggle-btn').click({ force: true });
    await page.waitForTimeout(350);
    const open = await page.evaluate(() => {
      const sidebar = document.querySelector('#sidebar');
      const material = sidebar.querySelector(':scope > .lgp-material');
      const header = document.querySelector('#top-left-chat-title');
      const rightActions = document.querySelector('#top-right-actions');
      const detachedConversationActions = document.querySelector('#chat-more-glass');
      const sidebarTools = document.querySelector('.chat-sidebar-actions');
      const searchButton = document.querySelector('#sidebar-search-toggle');
      const closeButton = document.querySelector('[data-sidebar-collapse]');
      const rect = sidebar.getBoundingClientRect();
      const toolsRect = sidebarTools.getBoundingClientRect();
      const searchRect = searchButton.getBoundingClientRect();
      const closeRect = closeButton.getBoundingClientRect();
      return {
        drawerOpen: document.body.classList.contains('sidebar-drawer-open'),
        left: rect.left,
        right: rect.right,
        width: rect.width,
        headerVisibility: getComputedStyle(header).visibility,
        rightActionsVisibility: getComputedStyle(rightActions).visibility,
        detachedActionsVisibility: getComputedStyle(detachedConversationActions).visibility,
        materialBlur: getComputedStyle(material).backdropFilter,
        materialBackground: getComputedStyle(material).backgroundColor,
        internalCloseVisible: getComputedStyle(closeButton).visibility,
        toolsRightInset: rect.right - toolsRect.right,
        toolsTopInset: toolsRect.top - rect.top,
        toolsRadius: getComputedStyle(sidebarTools).borderRadius,
        searchRadius: getComputedStyle(searchButton).borderRadius,
        closeRadius: getComputedStyle(closeButton).borderRadius,
        searchLeft: searchRect.left,
        closeLeft: closeRect.left
      };
    });
    assert.equal(open.drawerOpen, true, `${width}px drawer open state is published`);
    assert.equal(open.left, 12, `${width}px drawer should open at its inset`);
    assert.equal(open.right, width - 12, `${width}px drawer should cover the canvas`);
    assert.equal(open.width, width - 24, `${width}px drawer should be full-width minus insets`);
    assert.equal(open.headerVisibility, 'hidden', 'conversation header must not bleed over the drawer');
    assert.equal(open.rightActionsVisibility, 'hidden', 'conversation corner actions must not bleed over the drawer');
    assert.equal(open.detachedActionsVisibility, 'hidden', 'detached new-chat actions must not overlap the drawer toolbar');
    assert.equal(open.materialBlur, 'none', 'moving mobile drawer surface must not blur the full viewport');
    assert.equal(open.internalCloseVisible, 'visible', 'drawer retains its own close control');
    assert.ok(open.toolsRightInset >= 10 && open.toolsRightInset <= 16,
      `sidebar tools stay at the top-right edge: ${JSON.stringify(open)}`);
    assert.ok(open.toolsTopInset >= 10 && open.toolsTopInset <= 16,
      `sidebar tools retain the top inset: ${JSON.stringify(open)}`);
    assert.equal(open.toolsRadius, '24px', 'search and close share one rounded toolbar pill');
    assert.equal(open.searchRadius, '50%', 'search target is circular');
    assert.equal(open.closeRadius, '50%', 'close target is circular');
    assert.ok(open.searchLeft < open.closeLeft, 'search precedes close inside the right-aligned pill');

    await page.locator('[data-sidebar-collapse]').click({ force: true });
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#sidebar').evaluate(element => element.classList.contains('-translate-x-full')), true,
      `${width}px internal close returns the drawer off-canvas`);
    assert.equal(await page.locator('body').evaluate(element => element.classList.contains('sidebar-drawer-open')), false,
      `${width}px internal close clears the drawer state`);
    await page.close();
  }
  console.log('PASS mobile sidebar drawer geometry, layering, and motion contract');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
