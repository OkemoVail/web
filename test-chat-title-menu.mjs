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
    localStorage.setItem('vail_settings_v4', JSON.stringify({
      userName: 'Title menu test', sidebarMode: 'manual', hasCompletedTutorial: true,
      folders: [], chatOrder: [], customAccents: []
    }));
  });
  await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html?__glass_native=1`);
  await page.waitForFunction(() => window.LiquidDesign && document.querySelector('#chat-more-glass[data-morph-phase="settled"]'));
  await page.evaluate(() => {
    document.getElementById('onboarding-overlay').style.display = 'none';
    document.getElementById('app-preloader').style.display = 'none';
  });

  const positions = await page.evaluate(() => ({
    more: document.getElementById('chat-title-more').getBoundingClientRect().left,
    model: document.getElementById('chat-model-trigger').getBoundingClientRect().left,
    compose: document.getElementById('chat-new-button').getBoundingClientRect().left,
    composeTop: document.getElementById('chat-new-button').getBoundingClientRect().top,
    moreTop: document.getElementById('chat-title-more').getBoundingClientRect().top,
    modelText: document.getElementById('chat-model-trigger-name').innerText
  }));
  assert.ok(positions.model < positions.more, 'the model selector is left of the three-dot menu');
  assert.ok(positions.compose < positions.more, 'new chat is left of the three-dot menu');
  assert.ok(Math.abs(positions.composeTop - positions.moreTop) < 1, 'new chat and three-dot menu share one row');
  assert.equal(positions.modelText, 'Saga', 'the full model name is visible');
  assert.equal(await page.locator('#chat-model-chevron > .lgc-material').count(), 1,
    'the model name and chevron share one compact glass control');
  assert.equal(await page.locator('#chat-more-glass > .lgc-material').count(), 1,
    'new chat and the three-dot menu share one glass material');
  const headerInsets = await page.evaluate(() => {
    const actions = document.getElementById('chat-more-glass').getBoundingClientRect();
    const heading = document.getElementById('top-left-chat-title').getBoundingClientRect();
    const main = document.querySelector('main').getBoundingClientRect();
    return { top: actions.top, right: innerWidth - actions.right, left: heading.left - main.left };
  });
  assert.ok(Math.abs(headerInsets.top - 15) < 1 && Math.abs(headerInsets.right - 15) < 1
    && Math.abs(headerInsets.left - 15) < 1,
    `header edge insets are uniformly 15px: ${JSON.stringify(headerInsets)}`);

  await page.locator('#chat-model-trigger').click();
  await page.waitForFunction(() => document.querySelector('#chat-model-chevron')?.dataset.morphPhase === 'settled'
    && document.getElementById('chat-model-trigger')?.getAttribute('aria-expanded') === 'true');
  assert.equal(await page.locator('#chat-model-menu').isVisible(), true, 'model settings open below the model name');
  assert.equal(await page.locator('#chat-model-chevron > .lgc-material').count(), 1,
    'the Saga trigger and its dropdown share one morphing liquid glass material');
  assert.equal(await page.locator('#chat-model-options .chat-model-option').count(), 1, 'available models are listed');
  await page.locator('#chat-thinking-effort').evaluate(input => {
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.evaluate(() => window.isThinkingEnabled), true, 'thinking slider updates chat state');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#chat-model-chevron')?.dataset.morphPhase === 'settled'
    && document.getElementById('chat-model-trigger')?.getAttribute('aria-expanded') === 'false');
  await page.locator('#chat-model-trigger').click();
  await page.waitForFunction(() => document.getElementById('chat-model-trigger')?.getAttribute('aria-expanded') === 'true');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#chat-model-chevron')?.dataset.morphPhase === 'settled'
    && document.getElementById('chat-model-trigger')?.getAttribute('aria-expanded') === 'false');
  assert.equal(await page.locator('#chat-model-menu').isVisible(), false, 'Escape closes model settings');

  await page.locator('#chat-title-more').click();
  await page.waitForFunction(() => document.querySelector('#chat-more-glass')?.dataset.morphPhase === 'settled'
    && document.getElementById('chat-title-more')?.getAttribute('aria-expanded') === 'true');
  await page.evaluate(() => {
    const cluster = document.getElementById('chat-more-glass');
    window.__titleMenuClosePhases = [];
    new MutationObserver(() => window.__titleMenuClosePhases.push(cluster.dataset.morphPhase))
      .observe(cluster, { attributes: true, attributeFilter: ['data-morph-phase'] });
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#chat-more-glass')?.dataset.morphPhase === 'collapse');
  await page.waitForFunction(() => document.querySelector('#chat-more-glass')?.dataset.morphPhase === 'settled'
    && document.getElementById('chat-title-more')?.getAttribute('aria-expanded') === 'false');
  assert.ok((await page.evaluate(() => window.__titleMenuClosePhases)).includes('collapse'), 'the title menu retracts into its source control');
  assert.equal(await page.locator('#chat-title-menu').isVisible(), false);

  await page.evaluate(() => {
    const id = 'title-menu-rename-test';
    window.currentChatId = id;
    window.chatHistory = [['Question', 'Answer']];
    window.allChats[id] = { id, title: 'Top menu title', history: window.chatHistory, timestamp: Date.now() };
  });
  await page.locator('#chat-title-more').click();
  await page.waitForFunction(() => document.getElementById('chat-title-more')?.getAttribute('aria-expanded') === 'true');
  await page.getByRole('menuitem', { name: 'Rename chat' }).click();
  await page.waitForFunction(() => document.querySelector('[data-naming-dialog="chat"]'));
  assert.equal(await page.locator('[data-naming-dialog="chat"] .custom-modal-title').innerText(), 'Rename Chat',
    'top title actions open the shared chat naming dialog');
  await page.locator('[data-naming-dialog="chat"] .modal-btn-cancel').click();
  assert.deepEqual(pageErrors, []);
  console.log('PASS model settings replace the title and the options menu retracts on close');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
