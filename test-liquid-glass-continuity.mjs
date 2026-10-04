import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { PNG } from 'pngjs';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (/^\/fixture-/.test(url.pathname)) {
    const variant = url.pathname.includes('tools') ? 'tools' : url.pathname.includes('pages') ? 'pages' : 'default';
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head><link rel="stylesheet" href="/src/site.css"><link rel="stylesheet" href="/liquid-design/liquid-design.css">
      <style>.ov-nav--tools{display:flex;gap:8px;align-items:center}.ov-social-nav{position:fixed;top:24px;left:24px;width:44px;height:44px}.ov-nav__toolkit,.ov-nav__page-menu{width:52px;height:52px;pointer-events:auto;padding:0}.ov-nav__tools-toggle{width:52px;height:52px;padding:0}.ov-nav__labs{padding:12px 20px;pointer-events:auto}.ov-nav__page-menu{--liquid-design-menu-offset-y:56px}</style>
      <script src="/src/glass-navigation.js"></script><script defer src="/liquid-design/liquid-design.js"></script><script defer src="/src/liquid-design-site.js"></script></head>
      <body data-page="fixture"><main style="margin:160px 24px">Continuity fixture</main><script>
      window.NAV_CONFIG={variant:${JSON.stringify(variant)},back:${variant === 'pages' ? "{href:'/fixture-tools',label:'Back'}" : 'null'},
        links:[{label:'Next',href:'/fixture-pages'}],primary:{label:'Next',href:'/fixture-pages'}};
      addEventListener('pagereveal',e=>{if(e.viewTransition)e.viewTransition.ready.then(()=>{
        window.transitionState={names:[...document.querySelectorAll('nav')].map(el=>getComputedStyle(el).viewTransitionName),
          chrome:getComputedStyle(document.documentElement,'::view-transition-new(site-nav-primary)').animationName,
          oldAnimation:getComputedStyle(document.documentElement,'::view-transition-old(site-nav-primary)').animationName};
      }).catch(error=>window.transitionError=error.message)});
      </script><script src="/src/nav.js"></script></body></html>`);
    return;
  }
  try {
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) throw new Error('outside root');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const variant of ['tools', 'pages', 'default']) {
      await page.goto(`${origin}/fixture-${variant}`);
      await page.waitForFunction(() => document.querySelector('[data-lgp-control],[data-lgp-component]'));
      assert.equal(await page.locator('.ov-nav').evaluate(el => getComputedStyle(el).viewTransitionName), 'none', 'resting glass has no backdrop-root transition isolation');
      await page.evaluate(() => document.documentElement.classList.add('glass-navigation-transition'));
      const identity = await page.locator('.ov-nav__labs,.ov-nav__primary').evaluate(el => getComputedStyle(el).viewTransitionName);
      assert.equal(identity, 'site-nav-primary', `${variant}: primary control has its own persistent identity`);
      assert.equal(await page.locator('.ov-nav').evaluate(el => getComputedStyle(el).viewTransitionName), 'none', 'navigation is never stretched as one screenshot');
      const names = await page.evaluate(() => [...document.querySelectorAll('*')].map(el => getComputedStyle(el).viewTransitionName).filter(name => name !== 'none'));
      assert.equal(new Set(names).size, names.length, 'transition identities are unique');
      await page.evaluate(() => document.documentElement.classList.remove('glass-navigation-transition'));
      if (variant === 'default') {
        assert.equal(await page.locator('.ov-nav__bar > .lgp-material').count(), 1, 'legacy capsule uses the same real glass surface');
      }
      if (variant !== 'default') {
        const group = page.locator(variant === 'tools' ? '.ov-nav__toolkit' : '.ov-nav__page-menu');
        await group.evaluate(el => { window.face = el.querySelector('.lgc-material'); });
        await group.locator('[data-liquid-design-toggle]').evaluate(el => { el.focus(); el.click(); });
        await page.waitForTimeout(90);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(70);
        await group.locator('[data-liquid-design-toggle]').evaluate(el => el.click());
        await page.waitForFunction(() => [...document.querySelectorAll('[data-lgp-component]')].every(el => el.dataset.morphPhase === 'settled'));
        assert.equal(await group.evaluate(el => el.querySelector('.lgc-material') === window.face), true, 'reversals retain the original glass face');
        assert.equal(await group.locator('[data-liquid-design-toggle]').getAttribute('aria-expanded'), 'true', `${variant}: interrupted close can reopen`);
        await page.keyboard.press('Escape');
      }
    }
    await page.goto(`${origin}/fixture-tools`);
    await page.waitForFunction(() => document.querySelector('.ov-nav__toolkit > .lgc-material'));
    // A declared backdrop-filter is insufficient: compare rendered stripe contrast.
    await page.evaluate(() => {
      const backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:fixed;inset:0;background:repeating-linear-gradient(90deg,#000 0px,#000 3px,#fff 3px,#fff 6px);pointer-events:none';
      document.body.prepend(backdrop);
    });
    const glass = page.locator('.ov-nav__toolkit > .lgc-material');
    const rect = await glass.boundingBox();
    const clip = { x: Math.round(rect.x + rect.width / 2 - 12), y: Math.round(rect.y + rect.height / 2 + 8), width: 24, height: 6 };
    const contrast = buffer => {
      const png = PNG.sync.read(buffer); const values = [];
      for (let i = 0; i < png.data.length; i += 4) values.push(png.data[i]);
      return Math.max(...values) - Math.min(...values);
    };
    const blurred = contrast(await page.screenshot({ clip }));
    await glass.evaluate(el => { el.style.backdropFilter = 'none'; el.style.webkitBackdropFilter = 'none'; });
    const sharp = contrast(await page.screenshot({ clip }));
    if (process.env.LIQUID_BROWSER === 'webkit') {
      // Windows WebKit may declare backdrop-filter without rasterizing it.
      // Compare a plain native backdrop to distinguish that runner limitation.
      await page.evaluate(clip => {
        const el = document.createElement('div'); el.id = 'native-backdrop';
        el.style.cssText = `position:fixed;left:${clip.x}px;top:${clip.y}px;width:24px;height:6px;z-index:900;background:rgba(240,240,240,.64);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)`;
        document.body.append(el);
      }, clip);
      const nativeBlur = contrast(await page.screenshot({ clip }));
      await page.locator('#native-backdrop').evaluate(el => { el.style.backdropFilter = 'none'; el.style.webkitBackdropFilter = 'none'; });
      const nativeSharp = contrast(await page.screenshot({ clip }));
      await page.locator('#native-backdrop').evaluate(el => el.remove());
      if (nativeBlur < nativeSharp * .5) assert.ok(blurred < sharp * .5);
      else console.log('Windows WebKit native backdrop rasterization unavailable; pixel blur verified in Chromium');
    } else assert.ok(blurred < sharp * .5, `glass actually blurs the page behind it (blurred ${blurred}, sharp ${sharp})`);
    await glass.evaluate(el => { el.style.backdropFilter = ''; el.style.webkitBackdropFilter = ''; });
    await page.locator('.ov-nav__labs').click();
    await page.waitForURL('**/fixture-pages');
    if (await page.evaluate(() => 'onpagereveal' in window)) {
      await page.waitForFunction(() => window.transitionState || window.transitionError, { timeout: 5000 });
      assert.equal(await page.evaluate(() => window.transitionError), undefined);
      assert.ok((await page.evaluate(() => window.transitionState.names)).every(name => name === 'none'));
      assert.doesNotMatch(await page.evaluate(() => window.transitionState.chrome), /fade|vt-root/);
      assert.equal(await page.evaluate(() => window.transitionState.oldAnimation), 'none', 'outgoing material never fades away beneath incoming face');
    }
    assert.deepEqual(errors, []);
    console.log(`${width}px: shared chrome identity, real material, reversible menus and cross-page transition PASS`);
    await page.close();
  }
  for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route('https://cdn.tailwindcss.com/**', route => route.fulfill({ contentType: 'text/javascript', body:
    "window.tailwind={};var css=document.createElement('link');css.rel='stylesheet';css.href='/src/output.css';document.head.append(css);" }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    localStorage.setItem('vail_theme', 'dark');
    addEventListener('pagereveal', event => {
      if (!event.viewTransition) return;
      event.viewTransition.ready.then(() => {
        window.realTransition = {
          url:location.href,ready:document.readyState,nav:document.querySelectorAll('.ov-nav').length,classes:document.documentElement.className,
          names: [...document.querySelectorAll('*')].map(el => getComputedStyle(el).viewTransitionName).filter(name => name !== 'none'),
          revealed: [...document.querySelectorAll('[data-reveal]')].filter(el=>el.getBoundingClientRect().top<innerHeight).every(el => getComputedStyle(el).opacity === '1'),
          reveals:[...document.querySelectorAll('[data-reveal]')].map(el=>[el.className,getComputedStyle(el).opacity,el.style.cssText]),
          animations: document.getAnimations().filter(a => a.effect?.pseudoElement).map(a => a.effect.pseudoElement)
        };
        if (sessionStorage.getItem('freeze-transition')) document.getAnimations().filter(a => a.effect?.pseudoElement).forEach(a => { a.pause(); a.currentTime = 200; });
      }).catch(error => window.realTransitionError = error.message);
    });
  });
  await page.goto(`${origin}/index.html`);
  await page.waitForFunction(() => document.querySelector('.ov-nav__labs > .lgp-material'));
  await page.evaluate(() => sessionStorage.setItem('freeze-transition', 'true'));
  await page.locator('.ov-nav__labs').click();
  await page.waitForURL('**/AI/index.html');
  await page.waitForFunction(() => window.realTransition || window.realTransitionError);
  assert.equal(await page.evaluate(() => window.realTransitionError), undefined);
  const state = await page.evaluate(() => window.realTransition);
  assert.ok(state.names.includes('site-nav-primary') && state.names.includes('site-nav-menu'), JSON.stringify(state));
  assert.ok(!state.names.includes('site-search') && !state.names.includes('site-nav'), 'homepage→AI has no orphan search or whole-nav snapshot');
  assert.ok(state.revealed, 'incoming content is visible at capture, without a second reveal flash: ' + JSON.stringify(state));
  if (process.env.LIQUID_BROWSER !== 'webkit') {
    assert.ok(!state.animations.some(name => name.includes('site-search')), 'no ghost search pseudo-element exists');
    await page.screenshot({ path: `C:/Users/okemo/AppData/Local/Temp/opencode/continuity-home-ai-${width}-midpoint.png` });
  }
  await page.evaluate(() => { sessionStorage.removeItem('freeze-transition'); document.getAnimations().filter(a => a.effect?.pseudoElement).forEach(a => a.finish()); });
  await page.locator('.ov-nav__back').click();
  await page.waitForURL('**/index.html');
  await page.waitForFunction(() => window.realTransition || window.realTransitionError);
  assert.equal(await page.evaluate(() => window.realTransition.names.includes('site-search')), false, 'AI→homepage does not invent an unmatched search morph');
  await page.close();
  console.log(`${width}px real homepage↔AI: individual control pairing, no orphan search, no replayed content reveal PASS`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
