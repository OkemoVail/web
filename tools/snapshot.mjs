#!/usr/bin/env node
// tools/snapshot.mjs <before|after> [pageNameFilter]
// Serves the repo root statically and screenshots every page in light + dark.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tools', 'snapshots', phase);
fs.mkdirSync(outDir, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', '8901'], { cwd: root, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const failures = [];
try {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    for (const [name, url] of pages) {
      for (const theme of ['light', 'dark']) {
        const page = await ctx.newPage();
        await page.addInitScript(t => localStorage.setItem('vail_theme', t), theme);
        const res = await page.goto(`http://127.0.0.1:8901${url}`, { waitUntil: 'load', timeout: 20000 }).catch(() => null);
        if (!res || res.status() >= 400) {
          const status = res ? res.status() : 'nav-failed';
          console.error(`SKIP ${name} ${theme} ${status}`);
          failures.push([name, theme, status]);
          await page.close();
          continue;
        }
        // chat's #app-preloader fades out then self-removes on a racy timer —
        // wait for it to be gone so chat screenshots are deterministic.
        // (state:'hidden' also resolves when the element never existed, so
        // this is a no-op on every other page.)
        await page.waitForSelector('#app-preloader', { state: 'hidden', timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(outDir, `${name}-${theme}.png`) });
        await page.close();
        console.log(`shot ${name}-${theme}`);
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}

if (failures.length) {
  console.error(`\n!!! ${failures.length} FAILED SHOT(S) — snapshots missing/invalid, do NOT trust a diff against them:`);
  for (const [name, theme, status] of failures) console.error(`  ${name} ${theme} -> ${status}`);
  process.exitCode = 1;
}
