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
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      localStorage.setItem('vail_theme', 'light'); localStorage.setItem('vail_last_seen_build', '999999');
      localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Layout test', hasCompletedTutorial: true, sidebarMode: 'manual', folders: [], chatOrder: [], customAccents: [] }));
    });
    await page.route('https://api.okemovail.com/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html${mode === 'native' ? '?__glass_native=1' : ''}`);
    if (mode === 'shell') await page.waitForFunction(() => window.GlassShell?.ready);
    const frame = mode === 'shell' ? page.frames().find(f => f.parentFrame() && f.url().includes('/AI/chat.html')) : page.mainFrame();
    await frame.waitForFunction(() => window.els?.settingsPanel && document.querySelector('.chat-settings-body'));
    await frame.evaluate(() => {
      document.getElementById('onboarding-overlay').style.display = 'none';
      document.getElementById('app-preloader').style.display = 'none';
    });
    if (width < 768) { await frame.locator('#menu-toggle-btn').click(); await page.waitForTimeout(500); }
    assert.equal(await frame.locator('#sidebar a.sb-nav-item').count(), 0, 'sidebar keeps only New chat; secondary links were removed');
    const nav = frame.locator('#sidebar .sb-new-chat-btn');
    assert.ok(await nav.evaluate(el => el.getBoundingClientRect().height >= 44 && el.getBoundingClientRect().height <= 48), 'New chat row is compact but touch sized');
    assert.equal(await frame.locator('#history-list .history-section-header').count(), 0, 'chat list has no date divider headers');
    assert.ok(await frame.locator('.chat-library-header').evaluate(el => el.getBoundingClientRect().height <= 72), 'compact library header leaves room for history');
    assert.equal(await frame.locator('#sidebar .sb-new-chat-btn').locator('.lgp-material').count(), 0, 'New chat is a normal sidebar row, not nested glass');
    for (const dark of [false, true]) {
      await frame.evaluate(dark => { window.setTheme(dark ? 'dark' : 'light'); window.toggleSettingsPanel(); }, dark);
      await page.waitForTimeout(350);
      const close = frame.getByRole('button', { name: 'Close settings', exact: true });
      if (width >= 768) {
        assert.equal(await frame.locator('.chat-settings-navigation #chat-settings-heading').count(), 1, 'Settings title belongs to the category column');
        assert.equal(await frame.locator('#settings-sidebar-pfp-card').isVisible(), false, 'no oversized profile/header strip');
        assert.ok(await frame.locator('.chat-settings-category-heading').evaluate(el => parseFloat(getComputedStyle(el).fontSize) <= 22), 'compact content heading');
      }
      assert.equal(await close.locator(':scope > .lgp-material').evaluate(el => getComputedStyle(el).borderTopLeftRadius), '22px', 'circular Close material clips its backdrop blur at the rounded layer boundary');
      await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/settings-inspect-${mode}-${width}-${dark}.png` });
      if (width < 768) {
        assert.equal(await frame.locator('.Cadance-tab-bar').isVisible(), true);
        assert.equal(await frame.locator('#settings-content-area').isVisible(), false, 'mobile opens category list first');
      }
      await frame.locator('#ptab-btn-profile').click();
      assert.equal(await frame.locator('#tab-profile').isVisible(), true);
      if (width < 768) {
        assert.equal(await frame.locator('.Cadance-tab-bar').isVisible(), false, 'selected category owns the mobile view');
        await frame.getByRole('button', { name: 'Back to settings categories' }).click();
        assert.equal(await frame.locator('#ptab-btn-profile').evaluate(el => el === document.activeElement), true, 'Back restores category focus');
      }
      await frame.locator('#ptab-btn-general').click();
      await frame.locator('#btn-theme-dark').click();
      assert.equal(await frame.evaluate(() => document.documentElement.classList.contains('dark')), true, 'real setting controls work');
      assert.ok(await frame.locator('#settings-panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'settings never overflows horizontally');
      await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/settings-layout-${mode}-${width}-${dark}.png` });
      await page.keyboard.press('Escape');
      assert.equal(await frame.locator('#settings-panel').isVisible(), false);
    }
    await page.close(); console.log(`PASS sidebar and Settings layout: ${mode} ${width}`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
