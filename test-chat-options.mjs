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
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
try {
  for (const mode of ['native', 'shell']) for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      localStorage.setItem('vail_theme', 'light');
      localStorage.setItem('vail_last_seen_build', '999999');
      localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Options test', sidebarMode: 'manual', hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: [] }));
    });
    await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html${mode === 'native' ? '?__glass_native=1' : ''}`);
    if (mode === 'shell') await page.waitForFunction(() => window.GlassShell?.ready);
    const frame = mode === 'shell' ? page.frames().find(f => f.parentFrame() && f.url().includes('/AI/chat.html')) : page.mainFrame();
    await frame.waitForFunction(() => window.els?.input && window.refreshChatActionGlass);
     await frame.evaluate(() => {
      document.getElementById('onboarding-overlay').style.display = 'none';
       document.getElementById('app-preloader')?.remove();
      window.chatHistory = [['Hello', 'A real reply.', null, Date.now()]];
       window.render(); window.updateUI();
     });
     const bubble = frame.locator('.ai-bubble-container > .prose-target');
     const trigger = frame.locator('.chat-message-options .message-actions-toggle').last();
     assert.equal(await trigger.isVisible(), false, 'no visible ellipsis button remains');
     await bubble.click();
     assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'ordinary click does not open actions');
     const box = await bubble.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(750);
     assert.equal(await trigger.getAttribute('aria-expanded'), 'true', 'holding message opens the actual Options menu');
    const cluster = frame.locator('.chat-message-options').last();
    const menu = cluster.locator('[role="menu"]');
    assert.equal(await cluster.getAttribute('data-lgp-component'), 'options');
    const items = menu.locator('[role="menuitem"]');
    assert.equal(await items.count(), 4);
    const first = await items.nth(0).boundingBox(), second = await items.nth(1).boundingBox();
    const pill = menu.locator('.lgc-selection-pill');
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.waitForTimeout(250);
    assert.equal(await items.nth(0).getAttribute('data-liquid-highlighted'), 'true', 'held pointer selects the first row');
    const initial = await pill.boundingBox();
    await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
    await page.waitForTimeout(50);
    const middle = await pill.boundingBox();
    await page.waitForTimeout(250);
    const final = await pill.boundingBox();
    assert.ok(middle.y > initial.y && middle.y < final.y - 1, `selection pill travels rather than jumping: ${initial.y}, ${middle.y}, ${final.y}`);
    await page.mouse.move(10, 100);
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
     await bubble.focus();
     await page.keyboard.press('Shift+F10');
     await page.waitForTimeout(750);
    const good = await items.nth(2).boundingBox();
     await items.nth(2).click();
    await frame.waitForFunction(() => window.chatHistory[0][2] === 'good');
    await page.waitForTimeout(1500);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await menu.isVisible(), false);
    await page.mouse.move(width - 5, 100);
    await frame.locator('#user-input').focus();
    await page.waitForTimeout(300);
    assert.equal(await cluster.evaluate(el => Number(getComputedStyle(el).opacity)), 0);
    assert.equal(await frame.evaluate(() => getSelection().toString()), '');
    await page.close();
    console.log(`PASS Options hold/drag, sliding selection, original feedback, closing and fade: ${mode} ${width}`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
