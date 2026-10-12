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
      localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Messaging test', accent: '#c96478', lang: 'en', sidebarMode: 'manual', hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: [] }));
    });
    await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html${mode === 'native' ? '?__glass_native=1' : ''}`);
    if (mode === 'shell') await page.waitForFunction(() => window.GlassShell?.ready);
    const frame = mode === 'shell' ? page.frames().find(f => f.parentFrame() && f.url().includes('/AI/chat.html')) : page.mainFrame();
    await frame.waitForFunction(() => window.els?.input && document.querySelector('#sidebar > .lgp-material'));
    await frame.evaluate(() => {
      document.getElementById('onboarding-overlay').style.display = 'none';
      document.getElementById('app-preloader').style.display = 'none';
    });
    if (width < 768) { await frame.locator('#menu-toggle-btn').click(); await page.waitForTimeout(500); }
    const titleMenuTrigger = frame.locator('#chat-title-more');
    await titleMenuTrigger.click();
    await page.waitForTimeout(500);
    const selectionBlocked = await frame.locator('#chat-title-menu').evaluate(el => {
      const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 901, clientX: 20, clientY: 20 });
      el.querySelector('button').dispatchEvent(event);
      el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 901 }));
      return event.defaultPrevented;
    });
    assert.ok(selectionBlocked, 'top-right Options menu prevents native selection from the initial row press');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    // A clipped sidebar must fail even when the child's DOM reports stretched bounds.
    const button = frame.locator('#menu-toggle-btn');
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 200, box.y + box.height / 2, { steps: 10 });
    await page.waitForTimeout(250);
    const overflow = await button.evaluate(el => {
      const sidebar = document.getElementById('sidebar').getBoundingClientRect();
      const material = el.querySelector(':scope > .lgp-material').getBoundingClientRect();
      const clippers = [];
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
        if ((style.overflowX === 'hidden' || style.overflowX === 'clip' || style.contain.includes('paint')) && material.right > rect.right) clippers.push(parent.id || parent.className);
      }
      return { outside: material.right - sidebar.right, clippers };
    });
    assert.ok(overflow.outside > 2, 'sidebar button material visibly extends beyond the sidebar edge');
    assert.deepEqual(overflow.clippers, [], 'no ancestor clips the escaping button material');
    await page.mouse.up();
    await page.waitForTimeout(1300);
    if (width < 768) { await frame.locator('#menu-toggle-btn').click(); await page.waitForTimeout(500); }
    await frame.evaluate(() => {
      window.chatHistory = [['Are you around?', 'Yep. What are we working on?', null, Date.now()], ['The chat layout.', 'Let’s make it feel like a conversation.', null, Date.now()]];
      window.render();
      window.updateUI();
    });
    await page.mouse.move(width - 5, 100);
    await page.waitForTimeout(300);
    const layout = await frame.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect();
      const user = r('.user-msg-bubble'), answer = r('.ai-bubble-container > .prose-target');
      const rows = Array.from(document.querySelectorAll('#chat-messages > .user-row,#chat-messages > .ai-row')).map(el => el.getBoundingClientRect());
      return { composer: r('.input-box-wrap').height, input: r('#user-input'), add: r('#plus-menu-btn'), send: r('#send-btn'),
        gap: rows[1].top - rows[0].bottom, bottomGap: r('#chat-composer-dock').top - rows.at(-1).bottom,
        userWidth: user.width, answerWidth: answer.width, actionsOpacity: getComputedStyle(document.querySelector('.ai-msg-actions')).opacity };
    });
    assert.ok(layout.composer <= 80, 'resting composer is a compact messaging input');
    assert.ok(Math.abs(layout.add.y - layout.send.y) < 1 && layout.input.y < layout.send.y + 44 && layout.input.y + layout.input.height > layout.send.y, 'Add, input and Send share one writing row');
    assert.ok(layout.gap >= 6 && layout.gap <= 16, 'message exchanges have close conversational spacing');
    assert.ok(layout.bottomGap >= 12 && layout.bottomGap <= 60, 'short conversations rest above the composer rather than at the top of an empty canvas');
    assert.ok(layout.userWidth < 250 && layout.answerWidth < 400, 'short messages have natural-width bubbles');
    assert.equal(layout.actionsOpacity, '0', 'message toolbars stay quiet at rest');
     const row = frame.locator('.ai-row').last();
     const cluster = frame.locator('.chat-message-options').last();
     const trigger = cluster.getByRole('button', { name: 'Message actions', exact: true });
     await cluster.locator(':scope > .lgc-material').waitFor({ state: 'attached' });
     assert.equal(await cluster.locator(':scope > .lgc-material').count(), 1, 'message ellipsis uses a real Liquid Glass button');
     const highlight = await cluster.evaluate(el => ({
       actual: getComputedStyle(el).getPropertyValue('--liquid-design-touch-light').trim(),
       library: getComputedStyle(el).getPropertyValue('--lgp-touch-light').trim()
     }));
     assert.equal(highlight.actual, highlight.library, 'chat button uses the library touch highlight without a dimmed chat override');
     const materialRecipe = el => {
       const material = el.querySelector(':scope > .lgp-material,:scope > .lgc-material');
       const gradient = el.querySelector(':scope > .lgp-outline linearGradient:not([id$="-prism"]),:scope > .lgc-outline linearGradient:not([id$="-prism"])');
       const stops = gradient.querySelectorAll('stop');
       return { fill: getComputedStyle(material).backgroundColor,
         blur: getComputedStyle(material).backdropFilter || getComputedStyle(material).webkitBackdropFilter,
         top: getComputedStyle(stops[0]).stopOpacity,
         bottom: getComputedStyle(stops[stops.length - 1]).stopOpacity };
     };
     const home = await browser.newPage({ viewport: { width, height: 900 } });
     await home.addInitScript(() => { localStorage.setItem('vail_theme', 'light'); Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
     await home.goto(`http://127.0.0.1:${server.address().port}/index.html?__glass_native=1`);
     await home.waitForSelector('.hero-profile > .lgp-material');
     assert.deepEqual(await cluster.evaluate(materialRecipe), await home.locator('.hero-profile').evaluate(materialRecipe), 'chat and actual homepage buttons render the same glass material');
     await frame.evaluate(() => window.setTheme('dark'));
     await home.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-liquid-design-theme', 'dark'); });
     await page.waitForTimeout(100);
     assert.deepEqual(await cluster.evaluate(materialRecipe), await home.locator('.hero-profile').evaluate(materialRecipe), 'dark chat and homepage glass also match');
     await frame.evaluate(() => window.setTheme('light'));
     await home.close();
     assert.equal(await trigger.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'ellipsis background is transparent');
     const dates = await frame.evaluate(() => {
       const now = new Date(); now.setHours(10, 0, 0, 0);
       const today = now.getTime(), yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10).getTime();
       const saved = window.chatHistory;
       window.chatHistory = [['Yesterday', 'Reply', null, yesterday], ['Today', 'Reply', null, today],
         ['Close together', 'Reply', null, today + 60000], ['After a pause', 'Reply', null, today + 3600000]];
       window.render();
       const labels = Array.from(document.querySelectorAll('.chat-date-separator')).map(el => el.textContent);
       window.chatHistory = saved; window.render();
       return labels;
     });
     assert.equal(dates.length, 3, 'dates group adjacent exchanges and separate new days or hour-long pauses');
     assert.ok(dates[0].includes('Yesterday') && dates[1].includes('Today') && dates[2].includes('Today'), 'date labels use iMessage-style relative days and times');
     const options = frame.locator('.chat-message-options').last();
     const optionsTrigger = options.locator('.message-actions-toggle');
     const menu = options.locator('[role="menu"]');
     await optionsTrigger.evaluate(el => el.click());
     await page.waitForTimeout(80);
     const startWidth = await options.locator(':scope > .lgc-material').evaluate(el => el.getBoundingClientRect().width);
     await page.waitForTimeout(500);
     const endWidth = await options.locator(':scope > .lgc-material').evaluate(el => el.getBoundingClientRect().width);
     assert.ok(startWidth < endWidth, 'actual Options material grows from the trigger');
     await menu.waitFor({ state: 'visible' });
     await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/chat-dropdown-${mode}-${width}.png` });
     assert.equal(await options.locator(':scope > .lgc-material').count(), 1, 'one real glass surface owns the action menu');
     assert.equal(await menu.locator('button[data-lgp-control]').count(), 0, 'menu action rows are not independent stretchable controls');
     const rowStyle = await menu.locator('button').first().evaluate(el => {
       const style = getComputedStyle(el), icon = getComputedStyle(el.querySelector('svg'));
       return { font: style.fontSize, weight: style.fontWeight, padding: style.paddingLeft, radius: style.borderRadius, icon: icon.width };
     });
     assert.deepEqual(rowStyle, { font: '17px', weight: '500', padding: '16px', radius: '999px', icon: '20px' }, 'message menu rows match library Options rows');
     assert.deepEqual(await menu.locator('[role="menuitem"]').evaluateAll(items => items.map(el => el.textContent.trim())), ['Copy', 'Regenerate', 'Good response', 'Bad response']);
     const menuBox = await menu.boundingBox();
     assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= width, 'dropdown fits the viewport');
     await page.keyboard.press('End');
     assert.equal(await menu.getByRole('menuitem', { name: 'Bad response', exact: true }).evaluate(el => el === document.activeElement), true);
     await page.keyboard.press('Escape');
     assert.equal(await menu.evaluate(el => el.inert), true, 'closing menu becomes inert immediately');
     await menu.waitFor({ state: 'hidden' });
     await page.waitForTimeout(1200);
     assert.equal(await optionsTrigger.evaluate(el => el === document.activeElement), true, 'Escape restores the glass message trigger');
     await optionsTrigger.click();
     await page.waitForTimeout(500);
     const feedback = menu.getByRole('menuitem', { name: 'Good response', exact: true });
     const feedbackBox = await feedback.boundingBox();
     await page.mouse.move(feedbackBox.x + 20, feedbackBox.y + 22);
     await page.mouse.down();
     const panelBounds = await menu.boundingBox();
     await page.mouse.move(panelBounds.x + panelBounds.width + 140, feedbackBox.y + 22, { steps: 8 });
     await page.waitForTimeout(200);
     const panelGesture = await options.locator('.lgc-glow').first().evaluate(el => Number(el.style.opacity));
     assert.ok(panelGesture > .5, 'pressing a static row activates shared panel lighting');
     assert.equal(await feedback.locator('.lgc-content').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).isIdentity), true, 'feedback rows do not stretch independently');
     assert.equal(await frame.evaluate(() => getSelection().toString()), '', 'initial panel press and pulling do not select labels');
     await page.mouse.up();
     await page.waitForTimeout(1500);
     assert.equal(await frame.evaluate(() => window.chatHistory.at(-1)[2]), null, 'pulling a feedback row does not submit feedback');
     if (await optionsTrigger.getAttribute('aria-expanded') === 'true') { await page.keyboard.press('Escape'); await page.waitForTimeout(1500); }
     await optionsTrigger.click();
     await page.waitForTimeout(500);
     await feedback.click();
     await frame.waitForFunction(() => window.chatHistory.at(-1)[2] === 'good');
     await menu.waitFor({ state: 'hidden' });
     await page.waitForTimeout(1500);
     await optionsTrigger.click();
     await page.waitForTimeout(500);
     await frame.locator('#user-input').click();
     await menu.waitFor({ state: 'hidden' });
     await page.waitForTimeout(1500);
     await optionsTrigger.click();
     await page.waitForTimeout(500);
     await page.keyboard.press('Escape');
     await optionsTrigger.evaluate(el => el.click());
     await page.waitForTimeout(500);
     assert.equal(await menu.isVisible(), true, 'reopening during close cancels stale closing cleanup');
     await frame.locator('#user-input').click();
     await menu.waitFor({ state: 'hidden' });
     await page.mouse.move(width - 5, 100);
     await page.waitForTimeout(300);
     await page.waitForTimeout(1200);
     await frame.locator('#user-input').focus();
     await page.waitForTimeout(300);
     const triggerOpacity = await options.evaluate(el => Number(getComputedStyle(el).opacity));
     assert.ok(triggerOpacity <= .01, 'unused message ellipsis completely disappears on every device');
     await page.keyboard.press('Escape');
    await frame.locator('#user-input').focus();
    await frame.locator('#user-input').fill('Line one\nLine two\nLine three\nLine four');
    assert.ok(await frame.locator('.input-box-wrap').evaluate(el => el.getBoundingClientRect().height > 80), 'native multiline writing grows the compact composer');
    await frame.locator('#user-input').fill('');
    await page.mouse.move(width - 5, 100);
    for (const dark of [false, true]) {
      await frame.evaluate(dark => window.setTheme(dark ? 'dark' : 'light'), dark);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/chat-messaging-${mode}-${width}-${dark ? 'dark' : 'light'}.png` });
    }
    await page.close();
    console.log(`PASS messaging ${mode} ${width}: escaping sidebar glass, compact composer, close bottom-aligned bubbles and accessible actions`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
