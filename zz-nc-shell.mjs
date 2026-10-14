import fs from 'node:fs/promises'; import http from 'node:http'; import path from 'node:path'; import { chromium, webkit } from 'playwright';
const root = process.cwd();
const server = http.createServer(async (req, res) => { try { let p=new URL(req.url,'http://l').pathname; if(p.endsWith('/')) p+='index.html'; const f = path.resolve(root, '.' + p); res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream'); res.end(await fs.readFile(f)); } catch { res.writeHead(404).end(); } });
await new Promise(r => server.listen(0,'127.0.0.1',r));
const port = server.address().port;
for (const [bt, name] of [[chromium,'chromium'],[webkit,'webkit']]) {
const browser = await bt.launch();
for (const [w,h,touch] of [[1280,900,false],[1024,1366,true],[390,844,true]]) {
  const ctx = await browser.newContext({ viewport:{width:w,height:h}, hasTouch: touch, isMobile: touch && name==='chromium' });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }); localStorage.setItem('vail_theme','light'); localStorage.setItem('vail_last_seen_build','999999'); localStorage.setItem('vail_settings_v4', JSON.stringify({userName:'D',hasCompletedTutorial:true,sidebarMode:'manual',folders:[],chatOrder:[],customAccents:[]})); });
  await page.goto(`http://127.0.0.1:${port}/AI/chat.html`);
  await page.waitForTimeout(2500);
  const frame = page.frames().find(f => f.url().includes('chat.html') && f !== page.mainFrame() ) || page.mainFrame();
  await frame.waitForFunction(() => window.els?.sidebar && window.resetChat && !String(window.resetChat).includes('not ready'));
  await frame.evaluate(() => { for (const id of ['onboarding-overlay','app-preloader']) { const e=document.getElementById(id); if(e) e.style.display='none'; }
    window.chatHistory=[['hi','hello',null]]; document.body.classList.remove('chat-empty'); window.render(); });
  if (w < 768) await frame.evaluate(() => window.toggleSidebar && window.toggleSidebar());
  await page.waitForTimeout(600);
  const el = await frame.$('#sidebar .sb-new-chat-btn');
  const b = await el.boundingBox(); // page coords
  const x=b.x+70, y=b.y+b.height/2;
  const hit = await page.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y); return e.tagName+'#'+e.id+'.'+e.className;},{x,y});
  if (touch) await page.touchscreen.tap(x,y); else { await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+3,y+1); await page.mouse.up(); }
  await page.waitForTimeout(500);
  console.log(name, w, touch?'touch':'mouse', 'shell=', frame!==page.mainFrame(), 'topHit=', hit, 'history=', await frame.evaluate(()=>window.chatHistory.length));
  await page.screenshot({ path: `zz-nc-${name}-${w}.png` });
  await ctx.close();
}
await browser.close(); }
server.close();
