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
  for (const mode of ['native', 'shell']) for (const width of [1280, 960, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      localStorage.setItem('vail_theme', 'light');
      localStorage.setItem('vail_last_seen_build', '999999');
      localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Glass test', accent: '#c96478', lang: 'en', sidebarMode: 'manual', hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: [] }));
    });
    await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html${mode === 'native' ? '?__glass_native=1' : ''}`);
    if (mode === 'shell') await page.waitForFunction(() => window.GlassShell?.ready);
    const frame = mode === 'shell' ? page.frames().find(f => f.parentFrame() && f.url().includes('/AI/chat.html')) : page.mainFrame();
    await frame.waitForFunction(() => window.els?.input && document.querySelector('.input-box-wrap[data-lgp-control="surface"]') && document.querySelector('#chat-title-menu'));
    await frame.evaluate(() => {
      document.getElementById('onboarding-overlay').style.display = 'none';
      document.getElementById('app-preloader').style.display = 'none';
    });
    const composer = frame.locator('.input-box-wrap');
    const input = frame.locator('#user-input');
    await page.waitForTimeout(400);
    const emptyAlignment = await frame.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const main = rect('main'), title = rect('#top-left-chat-title'), dock = rect('#chat-composer-dock'), greeting = rect('#welcome-greeting');
      return { dockOffset: dock.x + dock.width / 2 - main.x - main.width / 2,
        greetingOffset: greeting.y + greeting.height / 2 - (title.bottom + dock.top) / 2 };
    });
    assert.ok(Math.abs(emptyAlignment.dockOffset) < 1, 'composer centers in actual conversation pane');
    assert.ok(Math.abs(emptyAlignment.greetingOffset) < 3, 'greeting centers between heading and composer');
    await page.setViewportSize({ width, height: 650 });
    await page.waitForTimeout(400);
    assert.ok(await frame.evaluate(() => {
      const dock = document.getElementById('chat-composer-dock').getBoundingClientRect();
      const footer = document.querySelector('[data-t="saga_hallucination_warn"]').getBoundingClientRect();
      const greeting = document.getElementById('welcome-greeting').getBoundingClientRect();
      return footer.bottom < innerHeight && dock.right <= innerWidth && dock.left >= 0 && greeting.bottom < dock.top;
    }), 'short-window greeting/composer/footer remain within their layout bounds');
    if (mode === 'native') await page.screenshot({ path: path.join('C:/Users/okemo/AppData/Local/Temp/opencode', `chat-empty-alignment-${width}.png`) });
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
    assert.equal(await frame.locator('#chat-title-text').innerText(), 'New chat', 'empty chat has a content heading');
    assert.equal(await frame.locator('#chat-title-more').isVisible(), true, 'empty chats retain access to Personality and Memories');
    await input.fill('Native editing stays intact.\nA second line.');
    assert.equal(await input.inputValue(), 'Native editing stays intact.\nA second line.');
    await input.evaluate(el => { el.setSelectionRange(0, 6); });
    assert.equal(await input.evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd)), 'Native');
    await page.waitForTimeout(500);
    const writing = await input.boundingBox();
    const add = await frame.locator('#plus-menu-btn').boundingBox();
    const send = await frame.locator('#send-btn').boundingBox();
    const composerBox = await composer.boundingBox();
    assert.ok(writing.y + writing.height >= add.y && writing.y <= add.y + add.height, 'writing field shares the Add and Send row');
    assert.ok(Math.abs(add.y - send.y) < 1, 'Add and Send share the bottom control row');
    await input.fill('A short message');
    await page.waitForTimeout(500);
    const compactLayout = await frame.evaluate(() => Object.fromEntries(['.input-box-wrap', '#input-inner', '#user-input', '.input-textarea-wrap'].map(s => {
      const el = document.querySelector(s), c = getComputedStyle(el);
      return [s, { height: el.getBoundingClientRect().height, inline: el.style.height, min: c.minHeight, padding: c.padding, line: c.lineHeight }];
    })));
    assert.ok((await composer.boundingBox()).height <= 80, `composer is a compact messaging input: ${JSON.stringify(compactLayout)}`);
    await input.fill('Native editing stays intact.\nA second line.');
    await page.waitForTimeout(500);
    assert.equal(await composer.evaluate(el => getComputedStyle(el, '::before').content), 'none');
    assert.equal(await composer.evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    assert.equal(await composer.locator(':scope > .lgp-material').evaluate(el => getComputedStyle(el).backdropFilter.includes('12px')), true);
    const initialThread = await frame.locator('#chat-container').boundingBox();
    await input.fill(Array.from({ length: 8 }, (_, i) => `Writing line ${i + 1}`).join('\n'));
    await page.waitForTimeout(500);
    const grownThread = await frame.locator('#chat-container').boundingBox();
    const grownDock = await frame.locator('#chat-composer-dock').boundingBox();
    assert.ok(Math.abs(grownThread.height - initialThread.height) < 1, 'floating composer growth preserves full-height canvas');
    assert.ok(Math.abs(grownThread.y - initialThread.y) < 1, 'composer growth keeps header and thread top stationary');
    assert.ok(grownThread.y + grownThread.height > grownDock.y + grownDock.height, 'growing composer floats above the canvas');
    assert.ok(await frame.locator('#chat-messages').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom) > document.getElementById('chat-composer-dock').getBoundingClientRect().height), 'thread reserves enough trailing space for the growing composer');
    await input.fill('Native editing stays intact.\nA second line.');
    await page.waitForTimeout(500);
    if (width === 390) {
      await frame.evaluate(() => {
        Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 520 });
        Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, get: () => 0 });
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForTimeout(150);
      const keyboardLayout = await frame.evaluate(() => ({
        dockBottom: document.getElementById('chat-composer-dock').getBoundingClientRect().bottom,
        bodyHeight: getComputedStyle(document.body).height,
        bodyMinHeight: getComputedStyle(document.body).minHeight,
        viewportHeight: getComputedStyle(document.body).getPropertyValue('--chat-viewport-height')
      }));
      assert.ok(Math.abs(keyboardLayout.dockBottom - 504) < 1, `keyboard-sized visual viewport keeps the floating composer inset: ${JSON.stringify(keyboardLayout)}`);
      await frame.evaluate(() => {
        delete visualViewport.height;
        delete visualViewport.offsetTop;
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForTimeout(150);
    }

    async function pull(button) {
      const before = await button.boundingBox();
      const x = before.x + before.width / 2, y = before.y + before.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 65, y, { steps: 6 });
      await page.waitForTimeout(250);
      assert.equal(await button.locator(':scope > .lgp-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - 1) > .002), true, 'held button stretches');
      const held = await button.boundingBox();
      assert.ok(Math.abs(held.x - before.x) < 1 && Math.abs(held.width - before.width) < 1, 'layout hitbox stays fixed');
      await page.mouse.up();
      await page.waitForTimeout(1300);
      assert.equal(await button.locator(':scope > .lgp-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - 1) < .002), true, 'button rebounds');
    }
    await pull(frame.locator('#send-btn'));
    if (width === 390 && process.env.LIQUID_BROWSER !== 'webkit') {
      const button = frame.locator('#send-btn');
      const box = await button.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let d = 5; d <= 60; d += 5) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - d, y }] });
      await page.waitForTimeout(250);
      assert.equal(await button.locator(':scope > .lgp-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - 1) > .002), true, 'real touch stretches send');
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(1300);
      await session.detach();
    }
    assert.equal(await input.inputValue(), 'Native editing stays intact.\nA second line.', 'pull never sends');
    await frame.locator('#plus-menu-btn').click();
    assert.equal(await frame.locator('#plus-menu').evaluate(el => getComputedStyle(el).visibility), 'visible');
    await frame.locator('#plus-menu-btn').click();
    if (width === 390) {
      await frame.locator('#menu-toggle-btn').click();
      await page.waitForTimeout(500);
      assert.equal(await frame.locator('#sidebar').evaluate(el => el.classList.contains('-translate-x-full')), false);
      await frame.evaluate(() => window.toggleSidebar());
      await page.waitForTimeout(500);
    }

    for (const dark of [false, true]) {
      await frame.evaluate(dark => {
        document.documentElement.classList.toggle('dark', dark);
        window.chatHistory = Array.from({ length: 12 }, (_, i) => [`Question ${i}`, 'A readable answer.\n\n' + 'Long conversation content. '.repeat(30), null, Date.now()]);
        window.render();
        window.updateChatTitleDisplay('A glass conversation');
        document.body.classList.add('is-generating');
      }, dark);
      await page.waitForTimeout(400);
      assert.equal(await composer.getAttribute('data-lgp-theme'), dark ? 'dark' : 'light');
       assert.equal(await frame.locator('#top-left-chat-title > .lgp-material').count(), 0, 'heading remains plain content like the Music reference');
        for (const selector of ['.input-box-wrap', '#plus-menu-btn', '#send-btn']) {
         assert.ok(await frame.locator(selector + ' > .lgp-outline .lgp-rim').evaluate(el => {
           const style = getComputedStyle(el);
           return style.stroke !== 'none' && parseFloat(style.strokeWidth) > 0 && parseFloat(style.opacity) > 0;
         }), `${selector} keeps an engine-owned reflective rim at rest`);
       }
      assert.equal(await frame.locator('#tra-bar .lgp-material').count(), 1, 'one material for utility group');
        assert.equal(await frame.locator('#chat-messages .chat-action-glass > .lgp-material').count(), 36, 'each exchange has three functionally grouped glass action materials');
        assert.equal(await frame.locator('.chat-sidebar-actions > .lgp-material').count(), 0, 'sidebar utility buttons use separate Liquid Design materials');
        assert.equal(await frame.locator('.chat-sidebar-actions').getAttribute('data-liquid-design'), null, 'sidebar utility wrapper does not own a shared surface');
        assert.equal(await frame.locator('#sidebar-search-toggle[data-liquid-design-independent]').count(), 1, 'sidebar search is independently enhanced');
        assert.equal(await frame.locator('.chat-sidebar-actions > .sb-icon-btn[data-liquid-design-independent]').count(), 2, 'sidebar utility buttons are independently enhanced');
        assert.equal(await frame.locator('.chat-sidebar-actions [data-lg-site]').count(), 2, 'both sidebar utility buttons are enhanced by the production Liquid Design adapter');
        assert.ok(await frame.evaluate(() => {
          const group = document.querySelector('.chat-sidebar-actions').getBoundingClientRect();
          const header = document.querySelector('.chat-library-header').getBoundingClientRect();
          return Math.abs(group.right - (header.right - parseFloat(getComputedStyle(header).paddingRight))) < 1;
        }), 'sidebar glass group stays aligned to the header right edge');
        assert.equal(await frame.locator('.chat-sidebar-actions .chat-sidebar-actions-separator').count(), 1, 'sidebar glass group has one centered separator');
        assert.equal(await frame.locator('#sidebar-search-toggle').evaluate(el => `${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height}`), '40x40', 'sidebar search control is reduced to 40px');
        assert.equal(await frame.locator('.chat-sidebar-actions').evaluate(el => getComputedStyle(el).borderRadius), '0px', 'sidebar utility wrapper has no competing shared capsule radius');
        assert.ok(await frame.evaluate(() => {
          const group = document.querySelector('.chat-sidebar-actions').getBoundingClientRect();
          const search = document.querySelector('#sidebar-search-toggle').getBoundingClientRect();
          const collapse = document.querySelector('.chat-sidebar-actions > .sb-icon-btn:last-of-type').getBoundingClientRect();
          const separator = document.querySelector('.chat-sidebar-actions-separator').getBoundingClientRect();
          const outerLeft = search.left - group.left;
          const outerRight = group.right - collapse.right;
          const leftGap = separator.left - search.right;
          const rightGap = collapse.left - separator.right;
          return Math.abs(outerLeft - outerRight) < 1 && Math.abs(leftGap - rightGap) < 1;
        }), 'sidebar glass group has equal outer and separator spacing');
        assert.equal(await frame.locator('.chat-sidebar-actions .sb-icon-btn').evaluate(el => getComputedStyle(el).borderRadius), '9999px', 'child controls retain their original circular radius');
        assert.equal(await frame.locator('#sidebar a.sb-nav-item').count(), 0, 'sidebar keeps only New chat; secondary links were removed');
       assert.equal(await frame.locator('#sidebar > .lgp-material').count(), 1, 'floating sidebar uses the same live glass engine');
       assert.equal(await frame.evaluate(() => new Set(Array.from(document.querySelectorAll('[data-lgp-control]')).map(el => getComputedStyle(el).getPropertyValue('--liquid-design-fill').trim())).size), 1, 'all glass hosts use one resolved fill recipe');
       assert.ok(await frame.locator('.chat-action-glass button').evaluateAll(buttons => buttons.every(button => {
         const rect = button.getBoundingClientRect();
         return rect.width >= 44 && rect.height >= 44 && !!button.getAttribute('aria-label');
       })), 'grouped action buttons have 44px targets and accessible names');
       await frame.evaluate(() => window.refreshChatActionGlass());
       assert.equal(await frame.locator('#chat-messages .chat-action-glass > .lgp-material').count(), 36, 'refresh does not duplicate action glass');
       assert.equal(await frame.locator('#history-list .lgp-material').count(), 0, 'history remains plain');
       const messageLayout = await frame.evaluate(() => {
         const row = document.querySelector('.ai-row');
         const bubble = row.querySelector('.ai-bubble-container > .prose-target');
         const actions = row.querySelector('.ai-msg-actions');
         const b = bubble.getBoundingClientRect(), a = actions.getBoundingClientRect();
         return {
           fill: getComputedStyle(bubble).backgroundColor,
           userFill: getComputedStyle(document.querySelector('.user-msg-bubble')).backgroundColor,
            gap: b.top - a.bottom,
           aligned: Math.abs(a.left - b.left) < 1,
           aiSpacing: getComputedStyle(row).marginBottom,
           userSpacing: getComputedStyle(document.querySelector('.user-row')).marginBottom
         };
       });
       assert.notEqual(messageLayout.fill, 'rgba(0, 0, 0, 0)', 'assistant has a readable Messages-style bubble');
       assert.notEqual(messageLayout.userFill, messageLayout.fill, 'user and assistant bubbles have distinct theme-aware fills');
        assert.ok(messageLayout.aligned && messageLayout.gap >= 0 && messageLayout.gap <= 8, 'assistant actions reveal immediately above their bubble');
        assert.equal(messageLayout.aiSpacing, '16px');
        assert.equal(messageLayout.userSpacing, '8px');
      const title = await frame.locator('#top-left-chat-title').boundingBox();
      assert.ok(title.x >= 0 && title.x + title.width <= width + 1, 'title controls fit viewport');
      assert.ok(await frame.locator('#top-left-chat-title button:visible').evaluateAll(els => els.every(el => {
        const b = el.getBoundingClientRect(), parent = document.getElementById('top-left-chat-title').getBoundingClientRect();
        return b.bottom <= parent.bottom + 1;
      })), 'title material contains every action');
        for (const selector of ['#send-btn', '#plus-menu-btn', '#chat-model-trigger', '#chat-title-more']) {
        for (const box of await frame.locator(selector).evaluateAll(els => els.map(el => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })))) {
          assert.ok(box.w >= 44 && box.h >= 44, `${selector}: touch target >=44px`);
        }
      }
      {
        assert.ok(title.height < 90, `header stays a single row: ${JSON.stringify(await frame.evaluate(() => Object.fromEntries(['#top-left-chat-title','#chat-corner-actions','#chat-mobile-navigation'].map(s => { const el=document.querySelector(s); return [s,{h:el.getBoundingClientRect().height,display:getComputedStyle(el).display}];}))))}`);
        const more = frame.locator('#chat-title-more');
        await more.focus();
        await more.press('ArrowDown');
        assert.equal(await more.getAttribute('aria-expanded'), 'true');
        const menu = frame.locator('#chat-title-menu');
        await page.waitForTimeout(500);
        assert.equal(await frame.locator('#chat-more-glass > .lgc-material').count(), 1, 'menu and More share one morphing material');
        const bounds = await menu.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'menu is clamped');
        const focused = () => frame.evaluate(() => document.activeElement.textContent.trim());
        assert.equal(await focused(), 'Rename chat');
        await page.keyboard.press('ArrowDown');
        assert.equal(await focused(), 'Regenerate title');
        await page.keyboard.press('End');
        assert.equal(await focused(), 'Toggle theme');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1500);
        assert.equal(await more.evaluate(el => el === document.activeElement), true, 'Escape restores focus');
        assert.equal(await menu.isVisible(), false);
        assert.equal(await menu.getByRole('menuitem', { name: 'Rename chat', exact: true }).count(), 1,
          'title menu also exposes the shared Rename chat action');
      }
      if (width >= 768) {
        const sidebar = await frame.locator('#sidebar').boundingBox();
        assert.ok(Math.abs(sidebar.x - 12) < 1 && Math.abs(sidebar.y - 12) < 1 && Math.abs(sidebar.height - 876) < 1, 'sidebar floats with 12px insets');
        assert.ok(title.x > sidebar.x + sidebar.width, 'plain heading sits beside floating sidebar');
        await frame.evaluate(() => window.toggleSidebar());
        await page.waitForTimeout(500);
        assert.ok(await frame.locator('#sidebar').evaluate(el => Math.abs(el.getBoundingClientRect().width - 60) < 1), 'sidebar collapses to its internal reopen rail');
        assert.equal(await frame.locator('#sidebar #menu-toggle-btn').isVisible(), true, 'reopen control stays inside sidebar');
        await frame.evaluate(() => window.toggleSidebar());
        await page.waitForTimeout(500);
      }
      const dockBox = await frame.locator('#chat-composer-dock').boundingBox();
      const threadBox = await frame.locator('#chat-container').boundingBox();
      assert.ok(Math.abs(dockBox.y + dockBox.height - 884) < 1, 'composer floats inset from the bottom edge');
      assert.ok(threadBox.y + threadBox.height > dockBox.y + dockBox.height, 'conversation canvas continues behind floating composer');
      assert.ok(threadBox.y < title.y, 'heading sits over the continuous content canvas');
      await frame.locator('#chat-container').evaluate(el => { el.scrollTop = 0; });
      const before = await composer.boundingBox();
      const area = await frame.locator('#chat-container').boundingBox();
      await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(300);
      assert.ok(await frame.locator('#chat-container').evaluate(el => el.scrollTop > 0), 'thread scrolls natively');
      assert.equal(await frame.locator('.chat-scroll-edge').count(), 1, 'soft scroll edge protects the plain heading above scrolling content');
      assert.equal(await frame.locator('#chat-title-text').evaluate(el => {
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return !!hit?.closest('#top-left-chat-title');
      }), true, 'scroll edge never covers title controls');
      const after = await composer.boundingBox();
      assert.ok(Math.abs(after.y - before.y) < 1, 'composer remains anchored');
      if (mode === 'native') await page.screenshot({ path: path.join('C:/Users/okemo/AppData/Local/Temp/opencode', `chat-glass-${width}-${dark ? 'dark' : 'light'}.png`) });
    }
    await page.emulateMedia({ contrast: 'more', reducedMotion: 'reduce' });
    await frame.waitForFunction(() => getComputedStyle(document.querySelector('.input-box-wrap > .lgp-material')).backdropFilter === 'none');
    assert.equal(await composer.locator(':scope > .lgp-material').evaluate(el => getComputedStyle(el).backdropFilter), 'none', 'increased contrast removes transparency');
    assert.equal(await composer.evaluate(el => getComputedStyle(el).getPropertyValue('--liquid-design-prism-opacity').trim()), '0');
    const reducedButton = frame.locator('#send-btn');
    const reducedBox = await reducedButton.boundingBox();
    await page.mouse.move(reducedBox.x + 22, reducedBox.y + 22);
    await page.mouse.down();
    await page.mouse.move(reducedBox.x - 40, reducedBox.y + 22);
    await page.waitForTimeout(150);
    assert.equal(await reducedButton.locator(':scope > .lgp-content').evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - 1) < .002), true, 'reduced motion suppresses stretch');
    await page.mouse.up();
    await page.emulateMedia({ contrast: 'no-preference', reducedMotion: 'no-preference' });
    await frame.evaluate(() => window.toggleSettingsPanel());
    await page.waitForTimeout(350);
    const settings = frame.locator('#settings-panel');
    assert.equal(await settings.getAttribute('role'), 'dialog');
    const settingsBounds = await settings.boundingBox();
    assert.ok(settingsBounds.x >= 0 && settingsBounds.x + settingsBounds.width <= width + 1, 'settings dialog fits viewport');
    await frame.locator('#ptab-btn-profile').click();
    assert.equal(await frame.locator('#ptab-btn-profile').getAttribute('aria-selected'), 'true');
    assert.equal(await frame.locator('#tab-profile').isVisible(), true);
    if (width < 768) await frame.getByRole('button', { name: 'Back to settings categories' }).click();
    await frame.locator('#ptab-btn-general').click();
    for (const dark of [false, true]) {
      await frame.evaluate(dark => window.setTheme(dark ? 'dark' : 'light'), dark);
      await page.waitForTimeout(200);
      if (width === 390) assert.equal(await frame.locator('.Cadance-tab-bar').isVisible(), false, 'mobile category detail uses the full panel in both themes');
      if (mode === 'native') await page.screenshot({ path: path.join('C:/Users/okemo/AppData/Local/Temp/opencode', `chat-redesign-settings-${width}-${dark ? 'dark' : 'light'}.png`) });
    }
    await page.keyboard.press('Escape');
    assert.equal(await settings.isVisible(), false, 'Escape closes settings');
    await frame.evaluate(() => window.openPersonality());
    await page.waitForTimeout(150);
    assert.equal(await frame.locator('#personality-modal').isVisible(), true);
    const personalityBounds = await frame.locator('#personality-modal > .card').boundingBox();
    assert.ok(personalityBounds.x >= 0 && personalityBounds.x + personalityBounds.width <= width + 1, 'Personality sheet fits viewport');
    await page.keyboard.press('Escape');
    assert.equal(await frame.locator('#personality-modal').isVisible(), false);
    await frame.evaluate(() => window.showCustomConfirm('Delete conversation?', 'This action cannot be undone.', () => {}, true));
    assert.equal(await frame.locator('.custom-modal-card').getAttribute('role'), 'dialog');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    assert.equal(await frame.locator('.custom-modal-overlay').count(), 0, 'Escape dismisses confirmation');
    await frame.evaluate(() => {
      window.canvasEnabled = false;
      window.chatHistory = [['Show a snippet', '```python\nprint("Hello")\n```', null, Date.now()]];
      window.render();
    });
    await page.waitForTimeout(200);
    const codeColors = await frame.evaluate(() => {
      const windowEl = document.querySelector('.code-window');
      return ['.code-header', 'pre'].map(selector => getComputedStyle(windowEl.querySelector(selector)).backgroundColor);
    });
    assert.equal(codeColors[0], codeColors[1], 'code header and body use a continuous theme-matched surface');
    console.log(`PASS ${mode} ${width}: floating sidebar/internal rail, visible title, corner menu, rectangular composer and accessibility`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
