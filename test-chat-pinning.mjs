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
  } catch {
    res.writeHead(404).end();
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browserType = process.env.PIN_BROWSER === 'webkit' ? webkit : chromium;
const browser = await browserType.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    localStorage.setItem('vail_theme', 'light');
    localStorage.setItem('vail_last_seen_build', '999999');
    localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Pin test', sidebarMode: 'manual', hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: [] }));
  });
  await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html?__glass_native=1`);
  await page.waitForFunction(() => window.renderHistory && window.togglePin);

  await page.evaluate(() => {
    for (const id of ['onboarding-overlay', 'app-preloader']) document.getElementById(id)?.remove();
    window.allChats = {
      pinned: { id: 'pinned', title: 'Pinned conversation', timestamp: 2, pinned: true, folderId: null, history: [] },
      ordinary: { id: 'ordinary', title: 'Ordinary conversation', timestamp: 1, pinned: false, folderId: null, history: [] }
    };
    window.settings.chatOrder = ['pinned', 'ordinary'];
    window.renderHistory();
  });

  const pinnedSection = page.locator('#chat-pin-section');
  assert.equal(await pinnedSection.isVisible(), true, 'pinning creates a visible Pinned section');
  assert.equal(await pinnedSection.getByText('Pinned', { exact: true }).count(), 1, 'the section is named Pinned');
  assert.equal(await page.locator('#pinned-history-list [data-chat-id="pinned"]').count(), 1, 'pinned chat is separated from ordinary chats');
  assert.equal(await page.locator('#history-list [data-chat-id="ordinary"]').count(), 1, 'ordinary chat remains in Chats');
  assert.equal(await page.locator('.history-pin-button, .history-pin-icon').count(), 0, 'chat rows do not show pin controls');

  // Exercise the real pointer path rather than manufacturing DragEvents. The
  // Pinned destination appears only after the row crosses the drag threshold.
  const ordinaryRow = page.locator('#history-list [data-chat-id="ordinary"]');
  const chatsHeading = page.getByText('Chats', { exact: true });
  const chatsTopBeforeDrag = (await chatsHeading.boundingBox()).y;
  const ordinaryBox = await ordinaryRow.boundingBox();
  assert.ok(ordinaryBox, 'ordinary chat row has a draggable box');
  await page.mouse.move(ordinaryBox.x + ordinaryBox.width / 2, ordinaryBox.y + ordinaryBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(ordinaryBox.x + ordinaryBox.width / 2, ordinaryBox.y - 16, { steps: 8 });
  await page.waitForFunction(() => document.getElementById('chat-pin-drop-zone')?.classList.contains('is-visible'));
  const openingMotion = await page.locator('#chat-pin-drop-zone').evaluate(element => ({
    duration: getComputedStyle(element).transitionDuration,
    properties: getComputedStyle(element).transitionProperty,
    animations: element.getAnimations().length
  }));
  assert.match(openingMotion.properties, /height/, 'the target expands by layout height');
  assert.match(openingMotion.duration, /0\.28s/, 'the expansion has a visible eased duration');
  assert.ok(openingMotion.animations > 0, 'the browser is running the opening transition');
  await page.waitForTimeout(320);
  const chatsTopAfterDrag = (await chatsHeading.boundingBox()).y;
  assert.ok(chatsTopAfterDrag >= chatsTopBeforeDrag + 55,
    `opening Pinned pushes Chats downward (${chatsTopBeforeDrag} -> ${chatsTopAfterDrag})`);
  const pinBox = await page.locator('#chat-pin-drop-zone').boundingBox();
  assert.ok(pinBox, 'the pin destination appears during a real drag');
  await page.mouse.move(pinBox.x + pinBox.width / 2, pinBox.y + pinBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.allChats.ordinary.pinned === true);
  await page.waitForFunction(() => !document.querySelector('.chat-drag-ghost'));
  assert.equal(await pinnedSection.isVisible(), true, 'dragging into Pinned reveals the section');
  assert.equal(await page.locator('#pinned-history-list [data-chat-id="ordinary"]').count(), 1, 'dragging into Pinned pins the chat');

  const pinnedRow = page.locator('#pinned-history-list [data-chat-id="ordinary"]');
  const pinnedBox = await pinnedRow.boundingBox();
  assert.ok(pinnedBox, 'pinned row has a box');
  await page.mouse.move(pinnedBox.x + pinnedBox.width / 2, pinnedBox.y + pinnedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pinnedBox.x + pinnedBox.width / 2, pinnedBox.y + pinnedBox.height + 10, { steps: 8 });
  await page.waitForFunction(() => document.getElementById('chat-pin-drop-zone')?.classList.contains('is-visible'));
  await page.waitForTimeout(320);
  const chatsBox = await page.locator('#history-list').boundingBox();
  assert.ok(chatsBox, 'Chats destination has a box after the layout shift');
  await page.mouse.move(chatsBox.x + chatsBox.width / 2, chatsBox.y + 8, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#history-list [data-chat-id="ordinary"]')?.getAnimations().length > 0);
  assert.equal(await page.locator('.chat-drag-ghost').count(), 1, 'the drag preview remains while settling into the destination row');
  await page.waitForFunction(() => window.allChats.ordinary.pinned === false
    && document.querySelector('#history-list [data-chat-id="ordinary"]')
    && !document.querySelector('.chat-drag-ghost'));
  assert.equal(await page.locator('#history-list [data-chat-id="ordinary"]').count(), 1, 'dropping outside Pinned unpins the chat');
  assert.equal(await pinnedSection.isVisible(), true, 'Pinned remains while another pinned chat exists');
  assert.deepEqual(pageErrors, []);
  console.log('PASS chats pin and unpin by drag-and-drop without row pin icons');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
