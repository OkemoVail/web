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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    localStorage.setItem('vail_theme', 'light');
    localStorage.setItem('vail_last_seen_build', '999999');
    localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Chat menu test', sidebarMode: 'manual', hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: [] }));
  });
  await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html?__glass_native=1`);
  await page.waitForFunction(() => window.LiquidDesign && window.showChatMenu);

  await page.evaluate(() => {
    for (const id of ['onboarding-overlay', 'app-preloader']) {
      const element = document.getElementById(id);
      if (element) element.style.display = 'none';
    }
    const id = 'chat-menu-return-test';
    window.allChats[id] = { id, title: 'Return target', timestamp: Date.now(), pinned: false, folderId: null, history: [] };
    window.settings.chatOrder = [id];
    window.renderHistory();
    const source = document.querySelector(`[data-chat-id="${id}"] .history-action-btn`);
    source.id = 'chat-menu-return-source';
    window.__chatMenuReturnResult = null;
    window.togglePin = () => {
      window.__chatMenuReturnResult = {
        menuPresent: !!document.querySelector('#chat-library-action-menu'),
        sourceConnected: source.isConnected,
        sourceVisibility: getComputedStyle(source).visibility,
        sourceExpanded: source.getAttribute('aria-expanded')
      };
      // Match the real action's renderHistory(): replace the original anchor.
      source.remove();
    };
    source.click();
  });

  await page.waitForFunction(() => document.querySelector('#chat-library-action-menu-motion'));
  assert.equal(await page.locator('#chat-menu-return-source').evaluate(element => getComputedStyle(element).visibility), 'visible', 'the original three-dot button remains visible while its menu is open');
  assert.equal(await page.locator('#chat-menu-return-source').getAttribute('data-lgp-control'), null, 'the three-dot trigger is not a Liquid Glass control');
  assert.equal(await page.locator('#chat-library-action-menu-motion').getAttribute('data-lgp-component'), 'options', 'the dropdown uses the native Liquid Options controller');
  await page.waitForFunction(() => ['expand', 'overshoot'].includes(document.querySelector('#chat-library-action-menu-motion')?.dataset.morphPhase));
  await page.waitForFunction(() => document.querySelector('#chat-library-action-menu-motion')?.dataset.morphPhase === 'settled');
  const bounds = await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar').getBoundingClientRect();
    const menu = document.getElementById('chat-library-action-menu').getBoundingClientRect();
    return { sidebar: { left: sidebar.left, right: sidebar.right }, menu: { left: menu.left, right: menu.right } };
  });
  assert.ok(bounds.menu.left >= bounds.sidebar.left && bounds.menu.right <= bounds.sidebar.right,
    `chat-row menu stays over the sidebar: ${JSON.stringify(bounds)}`);
  assert.equal(await page.locator('#chat-library-action-menu-motion > .lgc-material').count(), 1, 'the Options controller owns the liquid material');
  assert.equal(await page.locator('.chat-library-action-trigger-overlay').count(), 1, 'a noninteractive ellipsis stays above the opening glass');
  assert.equal(await page.locator('.chat-library-action-trigger-overlay circle').count(), 3, 'the overlay renders its own persistent three-dot icon');
  assert.equal(await page.getByRole('menuitem', { name: 'Rename chat' }).count(), 1,
    'chat-row three-dot actions include Rename chat');
  await page.evaluate(() => {
    const cluster = document.querySelector('#chat-library-action-menu-motion');
    window.__chatLibraryClosePhases = [];
    window.__chatLibraryCloseFrames = [];
    new MutationObserver(() => window.__chatLibraryClosePhases.push(cluster.dataset.morphPhase))
      .observe(cluster, { attributes: true, attributeFilter: ['data-morph-phase'] });
    function captureCloseFrame() {
      const current = document.querySelector('#chat-library-action-menu-motion');
      if (!current) return;
      const material = current.querySelector(':scope > .lgc-material');
      const box = material?.getBoundingClientRect();
      window.__chatLibraryCloseFrames.push({
        time: performance.now(),
        phase: current.dataset.morphPhase,
        opacity: material ? Number.parseFloat(getComputedStyle(material).opacity) : 0,
        area: box ? box.width * box.height : 0
      });
      requestAnimationFrame(captureCloseFrame);
    }
    requestAnimationFrame(captureCloseFrame);
  });
  await page.getByRole('menuitem', { name: 'Pin' }).click();
  await page.waitForFunction(() => window.__chatMenuReturnResult !== null);

  const result = await page.evaluate(() => window.__chatMenuReturnResult);
  assert.deepEqual(result, {
    menuPresent: true,
    sourceConnected: true,
    sourceVisibility: 'visible',
    sourceExpanded: 'true'
  }, 'pin state updates immediately while the independent liquid menu returns');
  await page.waitForFunction(() => !document.querySelector('#chat-library-action-menu-motion'));
  assert.equal((await page.evaluate(() => window.__chatLibraryClosePhases)).includes('collapse'), true, 'closing morphs the liquid sheet back into the three-dot trigger');
  const closingFrames = await page.evaluate(() => window.__chatLibraryCloseFrames.filter(frame => frame.phase === 'collapse'));
  assert.ok(closingFrames.length > 2, 'the return animation produces observable closing frames');
  const closeDuration = closingFrames.at(-1).time - closingFrames[0].time;
  assert.ok(closeDuration <= 500,
    `the return ends with the reverse morph instead of a trailing blob spring (${closeDuration.toFixed(1)}ms)`);
  assert.ok(closingFrames.at(-1).opacity <= 0.15,
    `the returning glass blends out before teardown instead of disappearing at opacity ${closingFrames.at(-1).opacity}`);

  // Rename is owned by this same row menu and opens the same naming dialog
  // used by folders after the liquid sheet has returned to its source.
  await page.evaluate(() => {
    const id = 'chat-menu-rename-test';
    window.allChats[id] = { id, title: 'Old row title', timestamp: Date.now(), pinned: false, folderId: null, history: [] };
    window.settings.chatOrder = [id];
    window.renderHistory();
    document.querySelector(`[data-chat-id="${id}"] .history-action-btn`).click();
  });
  await page.waitForFunction(() => document.querySelector('#chat-library-action-menu-motion')?.dataset.morphPhase === 'settled');
  await page.getByRole('menuitem', { name: 'Rename chat' }).click();
  await page.waitForFunction(() => document.querySelector('[data-naming-dialog="chat"]'));
  assert.equal(await page.locator('#chat-title-menu [role="menuitem"]').filter({ hasText: 'Rename chat' }).count(), 1,
    'Rename chat remains available from the top title actions too');
  await page.locator('[data-naming-dialog="chat"] .custom-modal-input').fill('Renamed from row menu');
  await page.locator('[data-naming-dialog="chat"] .modal-btn-primary').click();
  await page.waitForFunction(() => !document.querySelector('[data-naming-dialog="chat"]'));
  assert.equal(await page.evaluate(() => window.allChats['chat-menu-rename-test'].title), 'Renamed from row menu');
  assert.equal(await page.locator('[data-chat-id="chat-menu-rename-test"]').getByText('Renamed from row menu').count(), 1,
    'renaming from the row menu updates the rendered chat title');
  assert.deepEqual(pageErrors, []);
  console.log('PASS plain trigger opens the native liquid morph and returns through the same animation');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
