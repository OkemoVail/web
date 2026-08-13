#!/usr/bin/env node
// tools/snapshot.mjs <before|after> [pageNameFilter]
// Serves the repo root statically and screenshots every page in light + dark.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const phase = process.argv[2];
const filter = process.argv[3];
if (!['before', 'after'].includes(phase)) { console.error('usage: node tools/snapshot.mjs <before|after> [page]'); process.exit(1); }

const PAGES = [
  ['home', '/index.html'], ['whitename', '/whitename.html'], ['design', '/design.html'],
  ['design-lab', '/design-lab.html'], ['themes', '/Themes/Themes.html'], ['word', '/word/index.html'],
  ['search', '/search/index.html'], ['ai-home', '/AI/index.html'], ['chat', '/AI/chat.html'],
  ['manage', '/AI/manage.html'], ['editor', '/AI/editor.html'], ['research', '/AI/research.html'],
  ['tos', '/AI/tos.html'], ['privacy', '/AI/privacy.html'], ['goals', '/AI/goals.html'],
  ['version', '/AI/version.html'],
];
const pages = filter ? PAGES.filter(([n]) => n === filter) : PAGES;
if (!pages.length) { console.error('unknown page filter: ' + filter); process.exit(1); }

const outDir = path.resolve('tools/snapshots', phase);
fs.mkdirSync(outDir, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', '8901'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const [name, url] of pages) {
    for (const theme of ['light', 'dark']) {
      const page = await ctx.newPage();
      await page.addInitScript(t => localStorage.setItem('vail_theme', t), theme);
      await page.goto(`http://127.0.0.1:8901${url}`, { waitUntil: 'load', timeout: 20000 }).catch(e => console.error('NAV WARN', name, e.message));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(outDir, `${name}-${theme}.png`) });
      await page.close();
      console.log(`shot ${name}-${theme}`);
    }
  }
} finally {
  await browser.close();
  server.kill();
}
