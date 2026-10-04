import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
if (process.argv.includes('--approved-portability')) {
  let suite = await fs.readFile(path.join(root, '.worktrees/liquid-glass/test-liquid-glass-plugin.mjs'), 'utf8');
  suite = suite.replace("from 'playwright'", `from '${import.meta.resolve('playwright')}'`)
    .replace('const root = path.dirname(fileURLToPath(import.meta.url));', `const root = ${JSON.stringify(root)};`);
  await import('data:text/javascript;base64,' + Buffer.from(suite).toString('base64'));
  process.exit(0);
}
const read = async file => fs.readFile(path.join(root, file), 'utf8');
const plugin = await read('liquid-design/liquid-design.js');
const pluginCSS = await read('liquid-design/liquid-design.css');
const adapter = await read('src/liquid-design-site.js');
const siteCSS = await read('src/site.css');
const fixture = `<!doctype html><html><head><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/plugin.css">
<style>body{padding:24px;font:16px Arial}.row{display:flex;gap:0}button,a.skuo{font:inherit}#host{width:220px;height:48px;display:flex;gap:8px}#host .grow{flex:1}#stream{height:40px}#hidden{display:none}
#passwordField{position:relative;width:240px;height:48px;margin:12px}#passwordField input{height:48px;box-sizing:border-box}#passwordToggle{position:absolute;top:50%;right:4px;height:24px;transform:translateY(-50%)}#passwordToggle:hover{transform:translateY(-50%) scale(1.1)}#passwordToggle:active{transform:translateY(-50%) scale(.9)}</style></head><body>
<form id="form"><div class="row" data-liquid-design-group><button class="skuo" id="host" type="submit"><span class="grow" id="label">Send</span><span>↑</span></button><button class="skuo" id="peer" type="button">Peer</button></div></form>
<button id="disabled" disabled class="skuo">Disabled</button><button id="aria" aria-disabled="true" class="skuo">Unavailable</button>
<button id="tint" class="skuo skuo-accent">Tint</button><button class="skuo modal-btn-danger" id="danger">Delete</button><a class="skuo discord" id="brand" href="#brand">Discord</a>
<div class="ui-seg"><button id="selected">Selected</button></div><a id="editorial" href="#editorial">Editorial</a><a class="ov-nav__link" id="navlink" href="#nav">Home</a>
<div id="hidden"><button id="hiddenButton" class="skuo">Hidden</button></div><div id="dynamic"></div><div id="stream">Tokens</div>
<div id="passwordField"><input type="password" aria-label="Password"><button type="button" class="skuo" id="passwordToggle">Eye</button></div>
<button type="button" id="themeChoice" class="skuo Cadance-theme-item">Theme</button>
<script>window.clicks=0;window.submits=0;window.unavailable=0;window.identity=document.querySelector('#host');window.labelIdentity=document.querySelector('#label');window.before=identity.getBoundingClientRect().toJSON();identity.addEventListener('click',()=>clicks++);document.querySelector('#form').addEventListener('submit',e=>{e.preventDefault();submits++});document.querySelector('#aria').addEventListener('click',()=>unavailable++);</script>
<script src="/plugin.js"></script><script src="/adapter.js"></script></body></html>`;
const portable = `<!doctype html><link rel="stylesheet" href="/plugin.css"><style>
body{margin:30px;font:16px Arial;background:#aab5c9}button,a{display:inline-flex;border-radius:24px;padding:12px;gap:8px}#editor{padding:16px;border:1px solid;border-radius:24px;width:320px}
</style><a id="portableLink" href="#destination" data-liquid-design>Navigate</a><a id="regular" href="#regular">Regular</a>
<div id="editor" data-liquid-design="surface"><textarea aria-label="Draft">Draft</textarea><a id="editorLink" href="#editorDestination">Editor link</a><button id="editorAction" type="button">Action</button></div>
<div id="portableGroup" data-liquid-design-group><button data-liquid-design type="button">One</button><button data-liquid-design type="button">Two</button></div>
<script>window.actions=0;document.querySelector('#editorAction').addEventListener('click',()=>actions++);</script><script src="/plugin.js"></script>`;
const server = http.createServer((req, res) => {
  const assets = { '/plugin.js': plugin, '/adapter.js': adapter, '/plugin.css': pluginCSS, '/site.css': siteCSS };
  res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : req.url.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(assets[req.url] ?? (req.url === '/portable' ? portable : fixture));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const engine = process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForTimeout(150);
  // These catch four observed integration regressions independently, so a red
  // run reports every break instead of hiding later failures behind the first.
  const regressions = [];
  async function regression(name, run) { try { await run(); console.log(name + ' PASS'); } catch (error) { regressions.push(name + ': ' + error.message); } }
  await regression('positional transforms retain password centering without hover/press scale', async () => {
    const alignment = await page.locator('#passwordToggle').evaluate(el => {
      const a=el.getBoundingClientRect(),b=el.parentElement.querySelector('input').getBoundingClientRect();
      return Math.abs(a.y+a.height/2-b.y-b.height/2);
    });
    assert.ok(alignment < 1, `input/button center difference ${alignment}px`);
    await page.locator('#passwordToggle').hover();
    assert.equal(await page.locator('#passwordToggle').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a),1,'legacy hover scale suppressed');
    await page.locator('#passwordToggle').evaluate(el=>{window.positioned=el;el.remove();});
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(()=>positioned.style.getPropertyValue('--lg-site-layout-transform')),'','layout ownership cleaned up');
    await page.evaluate(()=>document.querySelector('#passwordField').append(positioned));
    await page.evaluate(()=>{
      const b=document.createElement('button');b.id='latePosition';b.textContent='Late Eye';b.style.cssText='position:absolute;top:50%;right:40px;height:24px';document.querySelector('#passwordField').append(b);
    });
    await page.waitForFunction(()=>document.querySelector('#latePosition .lgp-content'));
    await page.evaluate(()=>{const s=document.createElement('style');s.textContent='#latePosition{--tw-translate-y:-50%;--tw-translate-x:0px;transform:translate(var(--tw-translate-x),var(--tw-translate-y))}';document.head.append(s);});
    const lateAlignment=await page.locator('#latePosition').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.querySelector('input').getBoundingClientRect();return Math.abs(a.y+a.height/2-b.y-b.height/2)});
    assert.ok(lateAlignment<1,`late Tailwind input/button center difference ${lateAlignment}px`);
  });
  await regression('active-theme selection follows live accent and deselection', async () => {
    await page.locator('#themeChoice').evaluate(el=>el.classList.add('active-theme'));
    const selected=await page.locator('#themeChoice .lgp-material').evaluate(el=>getComputedStyle(el,'::after').backgroundColor);
    assert.notEqual(selected,'rgba(0, 0, 0, 0)');
    await page.evaluate(()=>document.documentElement.style.setProperty('--skuo-accent','#129abc'));
    assert.notEqual(await page.locator('#themeChoice .lgp-material').evaluate(el=>getComputedStyle(el,'::after').backgroundColor),selected);
    await page.locator('#themeChoice').evaluate(el=>el.classList.remove('active-theme'));
    assert.equal(await page.locator('#themeChoice .lgp-material').evaluate(el=>getComputedStyle(el,'::after').backgroundColor),'rgba(0, 0, 0, 0)');
    await page.evaluate(()=>document.documentElement.style.removeProperty('--skuo-accent'));
  });
  await regression('source discovery is cached across paints and invalidates real sources', async () => {
    await page.evaluate(()=>{
      window.sourceQueries=0;const original=Document.prototype.querySelectorAll;
      Document.prototype.querySelectorAll=function(selector,...args){if(selector.includes('data-liquid-color-source'))sourceQueries++;return original.call(this,selector,...args)};
    });
    for(let i=0;i<8;i++){await page.evaluate(()=>LiquidDesign.refresh());await page.waitForTimeout(20);}
    assert.equal(await page.evaluate(()=>sourceQueries),0,'no source discovery document queries per material/frame');
    await page.evaluate(()=>{const b=document.querySelector('#host').getBoundingClientRect();const s=document.createElement('div');s.id='colorSource';s.setAttribute('data-liquid-color-source','#f02030');s.style.cssText=`position:fixed;left:${b.x+b.width-5}px;top:${b.y}px;width:30px;height:40px`;document.body.append(s);});
    await page.waitForFunction(()=>document.querySelector('#host .lg-color-spill'));
    await page.locator('#colorSource').evaluate(el=>el.setAttribute('data-liquid-color-source','#10a0f0'));
    await page.waitForFunction(()=>document.querySelector('#host .lg-color-spill').style.background.includes('16, 160, 240'));
    await page.locator('#colorSource').evaluate(el=>el.hidden=true);
    await page.waitForFunction(()=>!document.querySelector('#host .lg-color-spill'));
    await page.locator('#colorSource').evaluate(el=>el.hidden=false);
    await page.waitForFunction(()=>document.querySelector('#host .lg-color-spill'));
    await page.locator('#colorSource').evaluate(el=>{window.sourceLeft=el.style.left;el.style.left='1800px';});
    await page.waitForFunction(()=>!document.querySelector('#host .lg-color-spill'));
    await page.locator('#colorSource').evaluate(el=>el.style.left=sourceLeft);
    await page.waitForFunction(()=>document.querySelector('#host .lg-color-spill'));
    await page.locator('#colorSource').evaluate(el=>el.removeAttribute('data-liquid-color-source'));
    await page.waitForFunction(()=>!document.querySelector('#host .lg-color-spill'));
    await page.locator('#colorSource').evaluate(el=>el.setAttribute('data-liquid-color-source','#f02030'));
    await page.waitForFunction(()=>document.querySelector('#host .lg-color-spill'));
    await page.locator('#colorSource').evaluate(el=>el.remove());
    await page.waitForFunction(()=>!document.querySelector('#host .lg-color-spill'));
  });
  await regression('queued paint tolerates focused host replacement and detached cleanup', async () => {
    const race=await browser.newPage();const raceErrors=[];race.on('pageerror',error=>raceErrors.push(error.message));
    try{
      await race.goto(`http://127.0.0.1:${server.address().port}`);
      await race.waitForTimeout(100);
      for(let i=0;i<8;i++){
        await race.locator('#host').click();
        // refresh queues plugin paint first, then replacement queues adapter repair.
        await race.evaluate(i=>{LiquidDesign.refresh(document.querySelector('#host'));identity[i%2?'textContent':'innerHTML']=i%2?'Replaced':'<b>Replaced</b>';},i);
        await race.waitForTimeout(40);
      }
      assert.deepEqual(raceErrors,[],'no paint may dereference detached content');
      await race.evaluate(()=>{identity.textContent='Final content';identity.remove();});
      await race.waitForTimeout(80);
      assert.equal(await race.evaluate(()=>identity.textContent),'Final content','cleanup never resurrects removed wrapper text');
      assert.equal(await race.evaluate(()=>identity.hasAttribute('data-lgp-control')),false);
      assert.deepEqual(raceErrors,[]);
    }finally{await race.close();}
  });
  assert.deepEqual(regressions,[],'shared integration regressions');
  assert.equal(await page.locator('#host > .lgp-material').count(), 1, 'site adapter enhances an existing native button');
  assert.equal(await page.locator('.row > .lgp-material').count(), 0, 'even explicitly grouped production siblings own separate glass');
  assert.equal(await page.locator('#peer > .lgp-material').count(), 1);
  assert.equal(await page.locator('#editorial .lgp-material').count(), 0, 'editorial links stay native');
  assert.equal(await page.locator('#navlink > .lgp-material').count(), 1, 'button-like nav links receive glass');
  const bounds = await page.locator('#host').boundingBox();
  const before = await page.evaluate(() => window.before);
  for (const key of ['width', 'height']) assert.ok(Math.abs(bounds[key] - before[key]) < 1, `native ${key} survives`);
  assert.ok(await page.evaluate(() => identity === document.querySelector('#host') && labelIdentity === document.querySelector('#label')));
  assert.ok(await page.locator('#label').evaluate(el => el.getBoundingClientRect().width > 120), 'flex child retains available space');
  await page.locator('#host').click();
  assert.deepEqual(await page.evaluate(() => [clicks, submits]), [1, 1]);
  await page.locator('#host').focus(); await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => [clicks, submits]), [2, 2]);
  await page.keyboard.press('Tab');
  assert.notEqual(await page.locator('#peer').evaluate(el => getComputedStyle(el).boxShadow), 'none', 'keyboard focus survives plugin ownStyles');
  await page.locator('#aria').click({ force: true });
  assert.equal(await page.evaluate(() => unavailable), 0);
  assert.equal(await page.locator('#disabled').evaluate(el => el.disabled), true);
  const tint = id => page.locator(`#${id} > .lgp-material`).evaluate(el => getComputedStyle(el, '::after').backgroundColor);
  assert.notEqual(await tint('tint'), 'rgba(0, 0, 0, 0)');
  assert.match(await tint('danger'), /239, 68, 68|220, 38, 38/);
  assert.match(await tint('brand'), /88, 101, 242/);
  const initialTint = await tint('tint');
  await page.evaluate(() => document.documentElement.style.setProperty('--skuo-accent', '#129abc'));
  assert.notEqual(await tint('tint'), initialTint, 'accent variable changes propagate through CSS');
  await page.locator('#selected').evaluate(el => el.classList.add('on'));
  await page.waitForTimeout(80);
  assert.notEqual(await tint('selected'), 'rgba(0, 0, 0, 0)', 'selected tint updates');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForFunction(() => document.querySelector('#host').dataset.lgpTheme === 'dark');
  await page.evaluate(() => { identity.innerHTML = '<span id="newLabel">Stop</span>'; });
  await page.waitForTimeout(120);
  assert.equal(await page.locator('#host > .lgp-material').count(), 1, 'innerHTML replacement restores glass once');
  assert.equal(await page.locator('#host > .lgp-content #newLabel').count(), 1);
  assert.equal(await page.locator('#host').textContent(), 'Stop');
  await page.locator('#host').click(); assert.equal(await page.evaluate(() => clicks), 3, 'host handler survives content replacement');
  await page.evaluate(() => { identity.textContent = 'Again'; });
  await page.waitForTimeout(120);
  assert.equal(await page.locator('#host > .lgp-material').count(), 1, 'textContent replacement restores glass');
  await page.evaluate(() => { document.querySelector('#host .lgp-content').innerHTML = '<b>Updated</b>'; });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#host > .lgp-content > b').count(), 1, 'wrapper content updates do not nest wrappers');
  await page.evaluate(() => { const b = document.createElement('button'); b.id='late'; b.className='skuo'; b.textContent='Late'; document.querySelector('#dynamic').append(b); });
  await page.waitForFunction(() => document.querySelector('#late > .lgp-material'));
  await page.locator('#late').evaluate(el => el.style.backgroundColor = 'rgb(18, 154, 188)');
  await page.waitForTimeout(100);
  assert.match(await tint('late'), /18, 154, 188|0\.070588\d* 0\.603922 0\.737255/, 'host inline semantic background becomes glass tint');
  assert.equal(await page.locator('#late').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'host state update cannot restore a solid face above glass');
  await page.locator('#late').evaluate(el => el.style.backgroundColor = '');
  await page.waitForTimeout(100);
  assert.equal(await tint('late'), 'rgba(0, 0, 0, 0)', 'cleared inline tint returns to neutral');
  await page.evaluate(() => { window.removed = document.querySelector('#late'); removed.remove(); });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => removed.hasAttribute('data-lgp-control')), false, 'removed controls release resources and chrome');
  await page.locator('#hidden').evaluate(el => el.style.display = 'block');
  await page.waitForFunction(() => document.querySelector('#hiddenButton .lgp-material').dataset.surfaces === '1');
  // Instrument actual native DOM queries: token churn must not cause document scans.
  await page.evaluate(() => { window.scans=0; window.mutations=0; const query=Document.prototype.querySelectorAll; Document.prototype.querySelectorAll=function(...args){scans++;return query.apply(this,args)}; window.counter=new MutationObserver(records=>mutations+=records.length); counter.observe(document.body,{subtree:true,attributes:true,childList:true}); });
  await page.waitForTimeout(150); const baseline = await page.evaluate(() => mutations);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => mutations), baseline, 'idle decorations do not recursively repaint');
  for (let i=0; i<15; i++) { await page.locator('#stream').evaluate((el,i)=>el.textContent='Token '+i,i); await page.waitForTimeout(20); }
  assert.equal(await page.evaluate(() => scans), 0, 'streamed text outside controls causes no document-wide scans');
  await page.evaluate(() => { counter.disconnect(); LiquidDesignSite.destroy(); });
  assert.equal(await page.locator('[data-lg-site],.lgp-content,.lgp-material,.lgp-outline').count(), 0, 'adapter teardown restores all native content');
  assert.equal(await page.locator('#host').textContent(), 'Updated');
  await page.locator('#host').click(); assert.equal(await page.evaluate(() => clicks), 4);
  await page.evaluate(() => LiquidDesignSite.refresh());
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#host > .lgp-content').count(), 1, 'explicit reinitialization is idempotent');
  await page.locator('#host .lgp-content').evaluate(el => { const b=document.createElement('button');b.id='nestedLate';b.textContent='Nested dynamic';el.append(b); });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#nestedLate > .lgp-material').count(), 1, 'new controls inside enhanced contents are discovered');
  assert.deepEqual(errors, []);
  console.log(`${process.env.LIQUID_BROWSER || 'chromium'}: lifecycle, independent glass, native actions/layout, focus, tints, scoped updates, teardown PASS`);
  // Exercise the actual shipped bundle on a foreign site with no site adapter.
  const foreign = await browser.newPage();
  foreign.on('pageerror', error => errors.push(error.message));
  await foreign.goto(`http://127.0.0.1:${server.address().port}/portable`);
  await foreign.locator('#portableLink').click();
  assert.ok(foreign.url().endsWith('#destination'), 'standalone opt-in link keeps navigation');
  await foreign.locator('#regular').click(); assert.ok(foreign.url().endsWith('#regular'));
  await foreign.locator('#editorLink').click(); assert.ok(foreign.url().endsWith('#editorDestination'), 'editable-surface link action remains native');
  await foreign.locator('#editorAction').click(); assert.equal(await foreign.evaluate(() => actions), 1);
  await foreign.locator('textarea').fill('Retained');
  assert.equal(await foreign.locator('textarea').inputValue(), 'Retained');
  assert.equal(await foreign.locator('#portableGroup > .lgp-material').getAttribute('data-surfaces'), '2', 'standalone explicit grouping stays opt-in');
  await foreign.evaluate(() => LiquidDesign.destroy());
  assert.equal(await foreign.locator('.lgp-material,.lgp-content,.lgp-outline').count(), 0);
  await foreign.locator('#editorLink').click(); assert.ok(foreign.url().endsWith('#editorDestination'));
  console.log('Standalone bundle: regular/opt-in/editor links, editor actions, editable content, opt-in grouping, teardown PASS');
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const small = await mobile.newPage(); small.on('pageerror', error => errors.push(error.message));
  await small.goto(`http://127.0.0.1:${server.address().port}`);
  await small.locator('#host').tap();
  assert.deepEqual(await small.evaluate(() => [clicks, submits]), [1, 1]);
  assert.equal(await small.locator('#host .lgp-content').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a), 1, 'reduced-motion touch keeps stable glass');
  assert.ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'native mobile controls do not introduce horizontal overflow');
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('Mobile/reduced-motion: native tap submission, stable material, no horizontal overflow PASS');
  const live = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  await live.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  live.on('pageerror', error => errors.push(error.message));
  await live.goto(`http://127.0.0.1:${server.address().port}`);
  await live.evaluate(()=>{window.dragSourceQueries=0;const original=Document.prototype.querySelectorAll;Document.prototype.querySelectorAll=function(selector,...args){if(selector.includes('data-liquid-color-source'))dragSourceQueries++;return original.call(this,selector,...args)}});
  const hit = await live.locator('#host').boundingBox();
  await live.mouse.move(hit.x + hit.width/2, hit.y + hit.height/2); await live.mouse.down();
  await live.mouse.move(hit.x + hit.width + 100, hit.y + hit.height/2, { steps: 10 });
  await live.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('#host .lgp-content')).transform).a > 1.05);
  assert.equal(await live.locator('.row > .lgp-material').count(), 0, 'overlapping live drag does not create a sibling union');
  assert.equal(await live.locator('#host > .lgp-material').getAttribute('data-connections'), '0');
  assert.equal(await live.locator('#peer > .lgp-material').getAttribute('data-connections'), '0');
  await live.mouse.up();
  assert.deepEqual(await live.evaluate(() => [clicks, submits]), [0, 0], 'drag release does not trigger native submission');
  await live.waitForFunction(() => Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('#host .lgp-content')).transform).a - 1) < .001);
  await live.locator('#host').click(); assert.deepEqual(await live.evaluate(() => [clicks, submits]), [1, 1]);
  assert.equal(await live.evaluate(()=>dragSourceQueries),0,'live spring paints never rediscover color sources');
  assert.deepEqual(errors, []);
  console.log('Live motion: independent overlapping surfaces/rims, drag-release guard, rebound, native click PASS');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
