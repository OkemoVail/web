import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) throw Error('outside');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await (process.env.LIQUID_BROWSER === 'webkit' ? webkit : chromium).launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const landingCDNRequests = [];
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); localStorage.setItem('vail_theme', 'dark'); });
  await page.route('https://cdn.tailwindcss.com/**', async route => {
    if (/\/(?:AI\/)?index\.html/.test(route.request().frame().url())) landingCDNRequests.push(route.request().frame().url());
    await new Promise(resolve => setTimeout(resolve, 700));
    return route.fulfill({ contentType: 'text/javascript', body: "window.tailwind={};var s=document.createElement('link');s.rel='stylesheet';s.href='/src/output.css';document.head.append(s);" });
  });
  if (process.env.GLASS_NO_LUMEN) await page.route('**/js/lumen-hero.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => GlassShell.ready);
  await page.waitForTimeout(700);
  const toolsMorph = await page.evaluate(async () => {
    const r = GlassShellControls.get('menu'), old = r.face.innerHTML;
    r.button.click();
    await new Promise(resolve => setTimeout(resolve, 65));
    const result = r.face.innerHTML === old && parseFloat(getComputedStyle(r.wrapper).scale) > 1;
    await new Promise(resolve => setTimeout(resolve, 500)); r.button.click();
    await new Promise(resolve => setTimeout(resolve, 600)); return result;
  });
  const observations = await page.evaluate(async () => {
    const timings = [], menu = GlassShellControls.get('menu').button, leading = GlassShellControls.get('leading').button;
    for (const url of ['/AI/index.html', '/index.html', '/design.html', '/AI/index.html']) {
      const start = performance.now(), gaps = [];
      let previous = start, running = true;
      function sample(now) { gaps.push(now - previous); previous = now; if (running) requestAnimationFrame(sample); }
      requestAnimationFrame(sample);
      await GlassShell.navigate(url);
      const committed = performance.now() - start;
      const control = GlassShellControls.get('menu');
      const box = control.button.getBoundingClientRect();
      const handoffOffset = Math.hypot(box.x + box.width / 2 - control.states.x.x - control.states.w.x / 2,
        box.y + box.height / 2 - control.states.y.x - control.states.h.x / 2);
      const incoming = document.querySelector('[data-glass-page]:not([aria-hidden])');
      const direction = new DOMMatrix(getComputedStyle(incoming).transform).e;
      await new Promise(resolve => setTimeout(resolve, 700)); running = false;
      timings.push({ url, committed, direction, handoffOffset, maxFrameGap: Math.max(...gaps), documentReady: incoming.contentDocument.readyState, sameMenu: menu === GlassShellControls.get('menu').button, sameLeading: leading === GlassShellControls.get('leading').button });
    }
    return timings;
  });
  console.log(JSON.stringify(observations, null, 2));
  if (!process.env.GLASS_PROFILE_ONLY) {
    assert.ok(observations.every(row => row.handoffOffset < 1), 'controller handoff keeps the menu at its live spring position before the first animation frame');
    assert.deepEqual(landingCDNRequests, [], 'landing commits have no parser-blocking Tailwind CDN dependency');
    assert.ok(observations[0].direction > 0, 'new page enters from the right');
    assert.ok(observations[1].direction < 0, 'previous page returns from the left even through an in-page Back link');
    assert.ok(observations[2].direction > 0 && observations[3].direction > 0, 'new visits enter from the right after returning to an earlier page');
    assert.ok(toolsMorph, 'Tools keeps the old chevron during its initial pop');
    assert.ok(observations.every(row => row.sameMenu && row.sameLeading), 'menu and leading icons morph through their original buttons');
    assert.equal(await page.locator('[data-glass-page]:not([aria-hidden])').evaluate(el => el.contentWindow.LumenHero.getState().mode), 'video', 'shell cinematic avoids GPU compilation');
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
