import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await fs.readFile(path.join(root, 'AI/chat.html'), 'utf8');
assert.ok(html.indexOf('../src/site.css') < html.indexOf('../liquid-design/liquid-design.css'));
assert.match(html, /<script defer src="\.\.\/liquid-design\/liquid-design.js"><\/script>\s*<script defer src="\.\.\/src\/liquid-design-site.js">/);
const server = http.createServer(async (req, res) => {
  try {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://local').pathname));
    const bytes = await fs.readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const engine = process.env.CHAT_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const external = new Map();
const errors = [];
const bootstrapErrors = [];
async function setup(context) {
  await context.addInitScript(() => {
    localStorage.setItem('vail_settings_v4', JSON.stringify({ hasCompletedTutorial: true, userName: 'Glass tester', lang: 'en', accent: '#c96478' }));
    localStorage.setItem('vail_theme', 'light');
    localStorage.setItem('vail_last_seen_build', '999999');
    window.__clipboard = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => window.__clipboard.push(text) } });
    // Stub transport only; sendMessage, SSE parsing, typing, rendering and stop
    // all remain the real application. Holding a response exercises stop UI.
    const nativeFetch = window.fetch;
    window.fetch = async (url, options = {}) => {
      if (!String(url).includes('api.okemovail.com')) return nativeFetch(url, options);
      if (String(url).endsWith('/v1/chat/completions')) {
        const request = JSON.parse(options.body);
        if (!request.stream) return new Response(JSON.stringify({ choices: [{ message: { content: 'Glass response' } }] }), { headers: { 'Content-Type': 'application/json' } });
        if (window.__holdResponse) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
        const content = 'A real streamed answer.\n\n```js\nconsole.log("glass");\n```';
        return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (String(url).includes('/api/accounts/')) return new Response(JSON.stringify({ detail: 'Stubbed authentication failure' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    };
  });
  // Use the actual CDN implementations, fetched once, so bootstrap/layout are
  // real and reproducible without depending on browser CDN connection timing.
  await context.route('https://**/*', async route => {
    const url = route.request().url();
    if (/cdn\.tailwindcss\.com|marked\/marked.min.js|katex.*\.js|anime.*\.js/.test(url)) {
      if (!external.has(url)) external.set(url, await (await fetch(url)).text());
      return route.fulfill({ contentType: 'text/javascript', body: external.get(url) });
    }
    return route.fulfill({ status: 200, contentType: url.endsWith('.css') ? 'text/css' : 'text/plain', body: '' });
  });
}
async function open(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.stack));
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('Initialization error:')) bootstrapErrors.push(message.text()); });
  await page.goto(origin + '/AI/chat.html');
  await page.waitForFunction(() => window.els?.input && window.LiquidDesignSite && !document.querySelector('#app-preloader'));
  await page.waitForFunction(() => [...document.querySelectorAll('button')].every(button => button.querySelector(':scope > .lgp-material')));
  return page;
}
async function chrome(page, selector) {
  await page.waitForFunction(selector => {
    const button = document.querySelector(selector);
    return button && button.querySelectorAll(':scope > .lgp-content').length === 1 && button.querySelectorAll(':scope > .lgp-material').length === 1 && !button.querySelector('.lgp-content .lgp-content');
  }, selector);
}
const tint = (page, selector) => page.locator(selector + ' > .lgp-material').evaluate(el => getComputedStyle(el, '::after').backgroundColor);
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await setup(desktop);
  const page = await open(desktop);
  assert.deepEqual(bootstrapErrors, []);
  await chrome(page, '#send-btn');
  assert.equal(await page.locator('a.sb-nav-item[data-lg-site]').count(), 2);
  assert.equal(await page.locator('.lgp-material[data-surfaces="2"]').count(), 0);
  await page.evaluate(() => { window.__send = els.send; window.__input = els.input; window.__sendIcon = els.icon; window.__handler = els.send.onclick; window.__nativeChildren = getButtonContent(els.send).innerHTML; });
  await page.locator('#tra-chevron').click();
  assert.equal(await page.locator('#tra-chevron').getAttribute('aria-expanded'), 'true');
  await page.locator('#tra-theme').click();
  await page.waitForFunction(() => document.querySelector('#send-btn').dataset.lgpTheme === 'dark');
  assert.ok(await page.locator('html').evaluate(el => el.classList.contains('dark')));
  await page.evaluate(() => window.updateAccent('#3b82f6'));
  assert.match(await tint(page, '.sb-new-chat-btn'), /59, 130, 246|0\.231373 0\.509804 0\.964706/);
  await page.locator('#tra-theme').click();
  await page.evaluate(() => { window.__handler = els.send.onclick; LiquidDesignSite.refresh(); });
  assert.ok(await page.evaluate(() => __send === els.send && __handler === els.send.onclick));
  await page.locator('#tra-chevron').focus();
  await page.keyboard.press('Tab');
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none');
  console.log('Shared CSS rim dimensions:', await page.evaluate(() => ['#tra-theme', '#tra-chevron'].map(selector => {
    const button = document.querySelector(selector), rim = button.querySelector('.lgp-outline');
    return { selector, host: [button.getBoundingClientRect().width, button.getBoundingClientRect().height], rim: [rim.getBoundingClientRect().width, rim.getBoundingClientRect().height] };
  })));

  // Settings: selected tabs, native field editing, smart toggle and hidden-size repair.
  await page.locator('#sidebar-bottom-actions button[title="Settings"]').click();
  await page.locator('#settings-submenu button').filter({ hasText: 'General' }).click();
  await page.waitForFunction(() => document.querySelector('#settings-panel').classList.contains('active'));
  await page.locator('#ptab-btn-profile').click();
  assert.ok(await page.locator('#ptab-btn-profile').evaluate(el => el.classList.contains('skuo-accent')));
  assert.notEqual(await tint(page, '#ptab-btn-profile'), 'rgba(0, 0, 0, 0)');
  await page.locator('#ptab-btn-general').click();
  const toggle = page.locator('#toggle-smart-sidebar');
  if (await toggle.count()) {
    const before = await page.evaluate(() => settings.sidebarMode);
    await toggle.click();
    assert.notEqual(await page.evaluate(() => settings.sidebarMode), before);
    assert.equal(await toggle.locator('.lgp-content > div').evaluate(el => el.style.transform), before === 'smart' ? 'translateX(0px)' : 'translateX(22px)');
  }
  await page.evaluate(() => toggleSettingsPanel());
  await page.waitForFunction(() => !document.querySelector('#settings-panel').classList.contains('active'));

  // Onboarding's native label must survive the wrapper and failed-submit restore.
  await page.evaluate(() => { els.onboarding.classList.remove('hidden'); document.body.classList.add('onboarding-active'); });
  await page.locator('#ob-mode-register').click();
  assert.match(await page.locator('#ob-auth-submit .lgp-content > span').textContent(), /Create Account/i);
  assert.equal(await page.locator('#ob-auth-submit .lgp-content svg').count(), 1);
  await page.locator('#ob-mode-login').click();
  await page.locator('#ob-email-input').fill('glass@example.com');
  await page.locator('#ob-password-input').fill('glass-password');
  await page.locator('#ob-password-input').locator('..').locator('button').click();
  assert.equal(await page.locator('#ob-password-input').getAttribute('type'), 'text');
  console.log('Password visibility vertical centers:', await page.evaluate(() => {
    const input = document.querySelector('#ob-password-input'), button = input.parentElement.querySelector('button');
    const a = input.getBoundingClientRect(), b = button.getBoundingClientRect();
    return { input: a.y + a.height / 2, button: b.y + b.height / 2 };
  }));
  await page.locator('#ob-auth-submit').click();
  await page.waitForFunction(() => !document.querySelector('#ob-auth-submit').disabled);
  await chrome(page, '#ob-auth-submit');
  assert.equal(await page.locator('#ob-auth-submit .lgp-content svg').count(), 1);
  await page.locator('button[onclick="window.continueAsGuest()"]').click();
  await page.evaluate(() => setLang('zh'));
  await chrome(page, '#ob-mode-login');
  await page.evaluate(() => setLang('en'));
  await chrome(page, '#ob-mode-login');

  // Editable prompt, real send/stream/render, dynamic message + code controls.
  await page.locator('#user-input').fill('Verify native glass chat');
  assert.equal(await page.locator('#user-input').inputValue(), 'Verify native glass chat');
  await chrome(page, '#send-btn');
  assert.notEqual(await tint(page, '#send-btn'), 'rgba(0, 0, 0, 0)');
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => chatHistory.length === 1 && !isGenerating && document.querySelector('.main-response-content')?.textContent.includes('streamed answer'));
  await page.waitForFunction(() => [...document.querySelectorAll('#chat-messages button')].every(button => button.querySelector(':scope > .lgp-material')));
  assert.ok(await page.locator('#chat-messages button').count() >= 4);
  assert.ok(await page.evaluate(() => __send === els.send && __input === els.input && __sendIcon === els.icon));
  const copy = page.locator('#chat-messages button[onclick*="copyMsg"]').first();
  await copy.click();
  assert.match(await page.evaluate(() => __clipboard.at(-1)), /streamed answer/);
  await page.waitForTimeout(2150);
  assert.equal(await copy.locator(':scope > .lgp-material').count(), 1);
  assert.equal(await copy.locator('.lgp-content .lgp-content').count(), 0);
  await page.locator('.code-copy-btn').first().click();
  assert.match(await page.evaluate(() => __clipboard.at(-1)), /console.log/);
  await page.waitForTimeout(2150);
  assert.equal(await page.locator('.code-copy-btn .lgp-content .lgp-content').count(), 0);

  // Title feedback loading/restore and editable dynamic prompt dialog.
  await page.locator('#header-feedback-good').click();
  await page.waitForFunction(() => !document.querySelector('#header-feedback-good').disabled);
  await chrome(page, '#header-feedback-good');
  page.once('dialog', dialog => dialog.accept('Native glass title'));
  await page.locator('#top-left-chat-title button[title="Rename Chat"]').click();
  await page.waitForFunction(() => document.querySelector('#chat-title-text').textContent.includes('Native glass title'));
  await page.evaluate(() => { window.__promptValue = ''; showCustomPrompt('Editable dialog', 'Title', 'Initial', value => __promptValue = value); });
  await page.locator('.custom-modal-input').fill('Native editable dialog');
  await page.locator('.custom-modal-overlay .modal-btn-primary').click();
  assert.equal(await page.evaluate(() => __promptValue), 'Native editable dialog');
  await page.waitForFunction(() => !document.querySelector('.custom-modal-overlay'));
  await page.evaluate(() => { window.__confirmed = 0; showCustomConfirm('Delete test', 'Dynamic danger control', () => __confirmed++, true); });
  await chrome(page, '.custom-modal-overlay .modal-btn-primary');
  assert.match(await tint(page, '.custom-modal-overlay .modal-btn-primary'), /239, 68, 68/);
  await page.locator('.custom-modal-overlay .modal-btn-primary').click();
  assert.equal(await page.evaluate(() => __confirmed), 1);
  await page.waitForFunction(() => !document.querySelector('.custom-modal-overlay'));

  // Hold transport to inspect stop and invoke the real cancellation handler.
  await page.evaluate(() => { window.__holdResponse = true; });
  await page.locator('#user-input').fill('Stop this response');
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => isGenerating && document.querySelector('#send-icon-wrapper .fa-square'));
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => !isGenerating);
  await chrome(page, '#send-btn');

  // Voice is intentionally disabled in production. Exercise icon/action handoff
  // with a capability stub, preserving the real updateUI and button dispatch.
  await page.evaluate(() => { window.__voiceStarts = 0; VoiceMode.isSupported = () => true; VoiceMode.start = () => __voiceStarts++; els.input.value = ''; updateUI(); });
  await page.waitForFunction(() => document.querySelector('#send-icon-wrapper svg'));
  await page.locator('#send-btn').click();
  assert.equal(await page.evaluate(() => __voiceStarts), 1);
  await page.locator('#user-input').fill('Back to text');
  assert.equal(await page.locator('#send-icon-wrapper .fa-arrow-up').count(), 1);

  // No document rescans or cloned decoration during normal content churn.
  await page.evaluate(() => { window.__scans = 0; window.__scanSites = {}; const query = Document.prototype.querySelectorAll; Document.prototype.querySelectorAll = function (...args) { __scans++; const key = args[0] + ':' + new Error().stack.split('\n').slice(2, 4).join(' '); __scanSites[key] = (__scanSites[key] || 0) + 1; return query.apply(this, args); }; });
  await page.locator('#user-input').fill('More editable text');
  await page.waitForTimeout(100);
  console.log('Chat content-churn document query sites:', await page.evaluate(() => __scanSites));
  assert.ok(await page.evaluate(() => Object.keys(__scanSites).every(key => !key.includes('liquid-design-site.js'))), 'site adapter does not rescan the document for content replacement');
  assert.equal(await page.locator('.lgp-content .lgp-content').count(), 0);
  await page.evaluate(() => { window.__handler = els.send.onclick; LiquidDesignSite.destroy(); });
  assert.equal(await page.locator('[data-lg-site],.lgp-material,.lgp-outline,.lgp-content').count(), 0);
  assert.ok(await page.evaluate(() => __send === els.send && __handler === els.send.onclick));
  await page.evaluate(() => LiquidDesignSite.refresh());
  await chrome(page, '#send-btn');
  console.log('Desktop: actual chat bootstrap, independent buttons/links, theme, settings, onboarding submit/restore, editable prompt, real SSE send/stop, response copy, title feedback/rename, dynamic danger confirm, voice icon/action handoff PASS');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await setup(mobile);
  const small = await open(mobile);
  await small.locator('#menu-toggle-btn').tap();
  assert.ok(await small.locator('#sidebar-overlay').evaluate(el => getComputedStyle(el).pointerEvents !== 'none'));
  await small.locator('#sidebar-overlay').tap({ position: { x: 350, y: 400 } });
  await small.locator('#plus-menu-btn').tap();
  assert.equal(await small.locator('#upload-file-btn').evaluate(el => el.disabled), true);
  assert.equal(await small.locator('#web-search-btn').evaluate(el => el.disabled), true);
  await small.locator('#user-input').fill('Mobile native send');
  await small.locator('#send-btn').tap();
  await small.waitForFunction(() => chatHistory.length === 1 && !isGenerating);
  await small.waitForFunction(() => [...document.querySelectorAll('#chat-messages button')].every(button => button.querySelector(':scope > .lgp-material')));
  assert.ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await small.locator('.lgp-content .lgp-content').count(), 0);
  console.log('Mobile 390x844/reduced motion: sidebar open/close, disabled menu controls, native tap send, dynamic response enhancement, no document horizontal overflow PASS');
  assert.deepEqual(bootstrapErrors, []);
  assert.deepEqual(errors, []);
  console.log(`${process.env.CHAT_BROWSER || 'chromium'}: zero page errors and zero bootstrap errors PASS`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
