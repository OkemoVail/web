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
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      localStorage.setItem('vail_theme', 'light');
      localStorage.setItem('vail_last_seen_build', '999999');
      localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Demo integration', accent: '#c96478', lang: 'en', sidebarMode: 'manual', hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: [] }));
    });
    await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html${mode === 'native' ? '?__glass_native=1' : ''}`);
    if (mode === 'shell') await page.waitForFunction(() => window.GlassShell?.ready);
    const frame = mode === 'shell' ? page.frames().find(f => f.parentFrame() && f.url().includes('/AI/chat.html')) : page.mainFrame();
    await frame.waitForFunction(() => window.els?.input && document.querySelector('#sidebar > .lgp-material') && document.querySelector('#chat-title-menu'));
    await frame.evaluate(() => {
      document.getElementById('onboarding-overlay').style.display = 'none';
      document.getElementById('app-preloader').style.display = 'none';
    });
    await page.waitForTimeout(400);
    if (width < 768) {
      await frame.locator('#menu-toggle-btn').click();
      await page.waitForTimeout(500);
      assert.ok(await frame.locator('#sidebar').evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.right - 30, innerHeight - 60));
      }), 'open mobile sidebar paints above the floating composer');
    }

    // Rail morph (2026-10-12): the shell narrows continuously while its
    // controls glide to their rail positions, with no scale-down/swap.
    const contraction = await frame.evaluate(() => new Promise(resolve => {
      const sidebar = document.getElementById('sidebar');
      const width = sidebar.offsetWidth;
      window.toggleSidebar();
      setTimeout(() => resolve({ width, duringWidth: sidebar.offsetWidth,
        scale: parseFloat(getComputedStyle(sidebar).scale) || 1 }), 120);
    }));
    if (width >= 768) {
      assert.ok(contraction.duringWidth < contraction.width && contraction.duringWidth > 60,
        `sidebar width animates continuously (${contraction.width} -> ${contraction.duringWidth})`);
    }
    assert.equal(contraction.scale, 1, 'the sidebar no longer scales down before a layout swap');
    await page.waitForTimeout(500);
    assert.equal(await frame.locator('#sidebar').evaluate(el => el.offsetWidth), 60, 'sidebar settles into a 60px reopen rail');
    // Desktop rail keeps its toolbar/Settings/profile live and reopens from
    // the toolbar; the off-canvas mobile drawer is inert and uses the header trigger.
    assert.equal(await frame.locator('#sidebar-full-content').evaluate(el => el.inert), width < 768,
      'collapsed library is inert only while off-canvas on mobile');
    await frame.locator(width < 768 ? '#menu-toggle-btn' : '#sidebar [data-sidebar-collapse]').click();
    await page.waitForTimeout(500);
    assert.equal(await frame.locator('#sidebar-full-content').evaluate(el => el.inert), false);
    await frame.evaluate(() => { window.toggleSidebar(); setTimeout(() => window.toggleSidebar(), 60); });
    await page.waitForTimeout(600);
    assert.ok(await frame.locator('#sidebar').evaluate(el => el.offsetWidth > 200), 'interrupted collapse returns to the latest expanded state');

    const more = frame.locator('#chat-title-more');
    await more.click();
    const menuMotion = await frame.locator('#chat-title-menu').evaluate(el => ({
      inert: el.inert, phase: el.closest('[data-lgp-component]')?.dataset.morphPhase,
      material: el.closest('[data-lgp-component]')?.querySelector('.lgc-material')?.getBoundingClientRect().width,
      width: el.offsetWidth
    }));
    assert.equal(menuMotion.phase, 'expand', 'More uses the live demo Options morph');
    assert.ok(menuMotion.material < menuMotion.width, 'menu glass grows from the More button instead of appearing at full size');
    await page.waitForTimeout(500);
    await more.evaluate(el => el.closest('[data-lgp-component]').querySelector('[role="menuitem"]').focus());
    await page.keyboard.press('End');
    assert.equal(await frame.evaluate(() => document.activeElement.textContent.trim()), 'Toggle theme');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    assert.equal(await frame.locator('#chat-title-menu').isVisible(), false, 'closing morph hides the menu');
    assert.equal(await more.evaluate(el => document.activeElement === el), true, 'Escape restores More focus');
    for (const dark of [false, true]) {
      await frame.evaluate(dark => window.setTheme(dark ? 'dark' : 'light'), dark);
      await page.waitForTimeout(350);
      assert.equal(await frame.evaluate(() => getComputedStyle(document.body).backgroundColor), await frame.locator('main').evaluate(el => getComputedStyle(el).backgroundColor), 'sidebar and floating conversation controls share one continuous canvas color');
      const optics = await frame.locator('#sidebar > .lgp-material').evaluate(el => ({
        alpha: Number(getComputedStyle(el).backgroundColor.match(/[\d.]+(?=\s*\)$)/)?.[0]),
        blur: getComputedStyle(el).backdropFilter,
        top: Number(getComputedStyle(el.parentElement.querySelector('.lgp-outline linearGradient stop')).stopOpacity)
      }));
      assert.equal(optics.alpha, dark ? .18 : .64, 'live chat uses the approved homepage glass material');
      assert.ok(optics.blur.includes('12px'));
      assert.equal(optics.top, dark ? .24 : .85, 'rim reflection follows the approved homepage material');
    }
    await frame.evaluate(() => {
      window.chatHistory = [['A real exchange', 'A real answer.', null, Date.now()]];
      window.render();
      window.VoiceMode = null;
      window.els.input.value = '';
      window.updateUI();
    });
    assert.equal(await frame.locator('#send-btn').evaluate(el => el.disabled), false, 'unavailable Send retains native glass gesture capture');
    assert.equal(await frame.locator('#send-btn').getAttribute('aria-disabled'), 'true', 'empty Send is semantically unavailable');
    const copy = frame.locator('.chat-message-options [aria-label="Copy"]').last();
    assert.equal(await copy.getAttribute('data-lgp-control'), null, 'Copy is a static row inside the shared Options menu');
    await frame.evaluate(() => { window.isGenerating = true; window.updateUI(); });
    assert.equal(await frame.locator('.input-box-wrap').getAttribute('aria-busy'), 'true', 'composer generation follows real request state');
    assert.ok(await frame.locator('.input-box-wrap > .lgp-material .chat-generation-glint').evaluate(el => parseFloat(getComputedStyle(el).opacity) > 0), 'generation light paints inside composer material');
    await frame.locator('#send-btn').click();
    assert.equal(await frame.evaluate(() => window.isGenerating), false, 'native Stop cancels real generation state');
    assert.equal(await frame.locator('.input-box-wrap').getAttribute('aria-busy'), 'false');
    assert.equal(await frame.locator('.input-box-wrap > .lgp-material .chat-generation-glint').evaluate(el => parseFloat(getComputedStyle(el).opacity)), 0, 'stop clears generation light');
    await page.route('https://api.okemovail.com/v1/chat/completions', async route => {
      const request = route.request().postDataJSON();
      if (!request.stream) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'Material notes' } }] }) });
      await new Promise(resolve => setTimeout(resolve, 450));
      return route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Glass controls keep native chat working.\n\nA **streamed** answer.' }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n' });
    });
    await frame.locator('#user-input').fill('Check the integrated chat');
    await frame.locator('#send-btn').click();
    await frame.waitForFunction(() => document.querySelector('.input-box-wrap').getAttribute('aria-busy') === 'true');
    await frame.waitForFunction(() => !window.isGenerating && !window.typeInterval && window.chatHistory.at(-1)?.[1]?.includes('streamed'));
    assert.equal(await frame.locator('#user-input').inputValue(), '', 'real Send clears native input');
    assert.ok((await frame.locator('.ai-row').last().innerText()).includes('A streamed answer.'), 'SSE response renders through the real markdown path');
    assert.equal(await frame.locator('.chat-message-options').last().locator(':scope > .lgc-material').count(), 1, 'in-place streaming completion initializes the shared Options material');
    await frame.locator('.chat-message-options').last().getByRole('button', { name: 'Message actions', exact: true }).click();
    await page.waitForTimeout(500);
    await frame.locator('.chat-message-options').last().getByRole('menuitem', { name: 'Good response', exact: true }).click();
    await frame.waitForFunction(() => window.chatHistory.at(-1)[2] === 'good');
    const savedId = await frame.evaluate(() => window.currentChatId);
    assert.ok(await frame.evaluate(async id => !!(await window.StorageController.getAllChats())[id], savedId), 'working conversation persists in IndexedDB');
    await frame.locator('#chat-title-more').click();
    await page.waitForTimeout(500);
    await frame.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    await page.waitForTimeout(450);
    assert.equal(await frame.locator('#settings-panel').isVisible(), true, 'morphing menu opens real Settings');
    assert.ok(await frame.locator('#settings-panel').evaluate(el => el.contains(document.activeElement)), 'menu close does not steal focus from Settings');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    if (width === 390) { await frame.locator('#menu-toggle-btn').click(); await page.waitForTimeout(500); }
    for (const dark of [false, true]) {
      await frame.evaluate(dark => window.setTheme(dark ? 'dark' : 'light'), dark);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/chat-demo-product-${mode}-${width}-${dark ? 'dark' : 'light'}.png` });
    }
    await page.route('https://api.okemovail.com/v1/chat/completions', route => route.fulfill({ status: 503, body: 'unavailable' }));
    await frame.locator('#user-input').fill('Failure should settle');
    await frame.locator('#user-input').press('Enter');
    await frame.waitForFunction(() => !window.isGenerating && window.chatHistory.at(-1)?.[1]?.includes('503'));
    assert.equal(await frame.locator('.input-box-wrap').getAttribute('aria-busy'), 'false', 'API failure clears generation state');
    await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
    await frame.locator('#menu-toggle-btn').click();
    assert.equal(await frame.locator('#sidebar').evaluate(el => el.getAnimations().length), 0, 'reduced motion switches sidebar immediately');
    await page.close();
    console.log(`PASS demo integration ${mode} ${width}: sidebar, Options morph, translucent optics, Send/Stop/SSE, feedback, storage, Settings and failure recovery`);
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
