import fs from 'node:fs/promises'; import http from 'node:http'; import path from 'node:path'; import { chromium } from 'playwright';
const root = process.cwd();
const server = http.createServer(async (req, res) => { try { const f = path.resolve(root, '.' + new URL(req.url,'http://l').pathname); res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(f)]||'application/octet-stream'); res.end(await fs.readFile(f)); } catch { res.writeHead(404).end(); } });
await new Promise(r => server.listen(0,'127.0.0.1',r));
const browser = await chromium.launch();
for (const [w,h] of [[1280,900],[390,844]]) {
  const page = await browser.newPage({ viewport:{width:w,height:h} });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }); localStorage.setItem('vail_theme','light'); localStorage.setItem('vail_last_seen_build','999999'); localStorage.setItem('vail_settings_v4', JSON.stringify({userName:'D',hasCompletedTutorial:true,sidebarMode:'manual',folders:[],chatOrder:[],customAccents:[]})); });
  await page.goto(`http://127.0.0.1:${server.address().port}/AI/chat.html?__glass_native=1`);
  await page.waitForFunction(() => window.els?.sidebar && window.resetChat && !String(window.resetChat).includes('not ready'));
  await page.waitForTimeout(800);
  await page.evaluate(() => { for (const id of ['onboarding-overlay','app-preloader']) { const e=document.getElementById(id); if(e) e.style.display='none'; }
    window.chatHistory=[['hi','hello',null]]; document.body.classList.remove('chat-empty'); window.render(); });
  if (w < 768) await page.evaluate(() => window.toggleSidebar && window.toggleSidebar());
  await page.waitForTimeout(500);
  const b = await page.locator('#sidebar .sb-new-chat-btn').boundingBox();
  const info = await page.evaluate(({x,y}) => { const el=document.elementFromPoint(x,y); const btn=document.querySelector('#sidebar .sb-new-chat-btn'); const cs=getComputedStyle(btn);
    const chain=[]; for(let n=el;n&&n!==document.body;n=n.parentElement) chain.push(n.tagName+(n.id?'#'+n.id:'')+'.'+String(n.className.baseVal??n.className).split(' ').slice(0,2).join('.'));
    return { hitInBtn: !!el?.closest('.sb-new-chat-btn'), chain: chain.slice(0,6), pe: cs.pointerEvents, attrs:[...btn.attributes].map(a=>a.name+'='+a.value).join(' '), opacity: cs.opacity, vis: cs.visibility, sbInert: document.getElementById('sidebar').inert }; }, {x:b.x+b.width/2,y:b.y+b.height/2});
  await page.mouse.move(b.x+60,b.y+24); await page.mouse.down(); await page.mouse.move(b.x+63,b.y+25); await page.mouse.up();
  await page.waitForTimeout(400);
  console.log(w, JSON.stringify(b), JSON.stringify(info), 'historyAfter=', await page.evaluate(()=>window.chatHistory.length), 'empty=', await page.evaluate(()=>document.body.classList.contains('chat-empty')));
  await page.close();
}
await browser.close(); server.close();
