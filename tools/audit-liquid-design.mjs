import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routes = (process.env.LIQUID_ROUTES || 'index.html,AI/index.html,AI/chat.html,AI/manage.html,AI/editor.html,AI/research.html,AI/goals.html,AI/privacy.html,AI/tos.html,AI/version.html,Themes/Themes.html,search/index.html,word/index.html,design.html,whitename.html').split(',');
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw Error('outside root');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browserName = process.env.LIQUID_BROWSER || 'chromium';
const browser = await (browserName === 'webkit' ? webkit : chromium).launch();
const results = [];
const inspect = () => {
  const name = el => el.id ? '#' + el.id : el.getAttribute('aria-label') || el.textContent.trim().slice(0, 48) || el.tagName;
  const visible = el => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && !el.closest('[hidden],[inert],[aria-hidden="true"]'); };
  const controls = Array.from(document.querySelectorAll('[data-lgp-control],[data-lgp-component]')).filter(visible).map(el => {
    const compound = el.hasAttribute('data-lgp-component');
    const material = el.querySelector(compound ? ':scope > .lgc-material' : ':scope > .lgp-material');
    const rim = el.querySelector(compound ? '.lgc-rim' : '.lgp-rim');
    const stops = el.querySelectorAll(':scope > svg linearGradient:not([id$="-prism"]) stop');
    const content = el.querySelector(':scope > .lgp-content') || el.querySelector('.lgc-content');
    const style = getComputedStyle(el), ms = material && getComputedStyle(material);
    return { name: name(el), kind: el.dataset.lgpControl || el.dataset.lgpComponent, theme: el.dataset.lgpTheme,
      fill: ms?.backgroundColor, tint: material && getComputedStyle(material, '::after').backgroundColor,
      blur: ms?.backdropFilter || ms?.webkitBackdropFilter, rim: rim && getComputedStyle(rim).strokeWidth,
      stops: Array.from(stops).map(stop => getComputedStyle(stop).stopOpacity),
      color: content && getComputedStyle(content).color, font: style.fontFamily, fontSize: style.fontSize,
      radius: style.borderRadius, hostBackground: style.backgroundColor, hostShadow: style.boxShadow,
      materials: el.querySelectorAll(':scope > .lgp-material,:scope > .lgc-material').length,
      bounds: el.getBoundingClientRect().toJSON() };
  });
  return { page: document.body.dataset.page || 'shell', controls,
    plainButtons: Array.from(document.querySelectorAll('button,a.skuo,a.skuomorphic-button,a[role="button"]')).filter(visible).filter(el => !el.closest('[data-lgp-control],[data-lgp-component]')).map(name),
    searchSurfaces: Array.from(document.querySelectorAll('.hero-search,#hero-bar,#results-bar')).map(el => ({ name:name(el), kind:el.dataset.lgpControl || null })),
    scripts: Array.from(document.scripts).map(el => el.src).filter(src => /liquid-design|chat-glass/.test(src)) };
};
try {
  for (const mode of ['native', 'shell']) for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 768 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(theme => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        localStorage.setItem('vail_theme', theme);
        localStorage.setItem('vail_last_seen_build', '999999');
        localStorage.setItem('vail_settings_v4', JSON.stringify({ userName: 'Glass audit', sidebarMode: 'manual', hasCompletedTutorial: true, folders: [], chatOrder: [], customAccents: [] }));
      }, theme);
      await page.route('https://api.okemovail.com/**', r => r.fulfill({ contentType: 'application/json', body: '{}' }));
      await page.route('https://cdn.tailwindcss.com/**', r => r.fulfill({ contentType: 'text/javascript', body: "window.tailwind={};var css=document.createElement('link');css.rel='stylesheet';css.href='/src/output.css';document.head.append(css);" }));
      await page.route('https://accounts.google.com/**', r => r.abort());
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/${route}${mode === 'native' ? '?__glass_native=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (mode === 'shell') await page.waitForFunction(() => window.GlassShell?.ready, { timeout: 15000 });
        const frame = mode === 'shell' ? page.frames().find(f => f.parentFrame() && new URL(f.url()).pathname === '/' + route) : page.mainFrame();
        if (!frame) throw Error('missing page frame');
        await frame.waitForFunction(() => !!window.LiquidDesignSite, { timeout: 15000 });
        if (route === 'AI/chat.html') {
          await frame.waitForFunction(() => window.els?.input);
          await frame.evaluate(() => { document.getElementById('onboarding-overlay').style.display = 'none'; document.getElementById('app-preloader').style.display = 'none'; });
        }
        await page.waitForTimeout(800);
        const documents = [await frame.evaluate(inspect)];
        if (mode === 'shell') documents.unshift(await page.evaluate(inspect));
        if (process.env.GLASS_SCREENSHOTS && mode === 'native' && width === 1280 && theme === 'light' && ['search/index.html','word/index.html'].includes(route)) {
          await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/glass-audit-${browserName}-${route.split('/')[0]}.png` });
        }
        results.push({ route, mode, width, theme, documents, errors });
        const all = documents.flatMap(d => d.controls);
        console.log(`${mode} ${width} ${theme} ${route}: ${all.length} glass, ${documents.reduce((n,d) => n + d.plainButtons.length, 0)} plain; fills ${[...new Set(all.map(c => c.fill))].join(' / ')}; errors ${errors.length}`);
      } catch (error) {
        results.push({ route, mode, width, theme, failure: error.message, errors });
        console.log(`FAIL ${mode} ${width} ${theme} ${route}: ${error.message}`);
      } finally { await page.close(); }
    }
  }
  const output = 'C:/Users/okemo/AppData/Local/Temp/opencode/liquid-design-audit-' + browserName + '.json';
  await fs.writeFile(output, JSON.stringify(results, null, 2) + '\n');
  console.log('Audit data: ' + output);
  if (process.argv.includes('--check')) {
    for (const r of results) {
      assert.equal(r.failure, undefined, `${r.route}: page audit completed`);
      assert.deepEqual(r.errors, [], `${r.route}: runtime errors`);
      for (const d of r.documents) for (const c of d.controls) {
        assert.equal(c.theme, r.theme, `${r.route} ${c.name}: page theme`);
        assert.equal(c.fill, r.theme === 'dark' ? 'rgba(28, 30, 33, 0.18)' : 'rgba(240, 240, 240, 0.64)', `${r.route} ${c.name}: common fill`);
        assert.equal(c.materials, 1, `${r.route} ${c.name}: one owned material`);
        assert.match(c.blur, /blur\(12px\)/, `${r.route} ${c.name}: common blur`);
        assert.equal(c.rim, r.theme === 'dark' ? '0.75px' : '1.25px', `${r.route} ${c.name}: common rim`);
        assert.match(c.font, /^Satoshi/, `${r.route} ${c.name}: common font`);
      }
      if (r.route === 'search/index.html') {
        const searches = r.documents.flatMap(d => d.searchSurfaces);
        assert.equal(searches.length, 2);
        assert.ok(searches.every(s => s.kind === 'surface'), 'both Astra fields own editable glass');
      }
    }
    console.log(`PASS: ${results.length} page states share theme, material, blur, rim and typography`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
