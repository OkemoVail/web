// Renders the Earthrise fallback video and posters from the live WebGL scene.
// Needs a static server on 127.0.0.1:8765 at the repo root and
// tools/lumen-probe.html. Usage: node tools/lumen-render-earthrise.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'AI', 'assets', 'lumen');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const targets = [
  { tier: 'desktop', width: 1600, height: 900 },
  { tier: 'mobile', width: 900, height: 1200 },
];
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
for (const { tier, width, height } of targets) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`http://127.0.0.1:8765/tools/lumen-probe.html?tier=${tier}`);
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  const dir = mkdtempSync(join(tmpdir(), 'lumen-'));
  for (let i = 0; i <= 240; i++) {
    await page.evaluate((ms) => window.renderAt(ms), Math.min(8000, (i * 1000) / 30));
    await page.screenshot({ path: join(dir, `f${String(i).padStart(4, '0')}.png`) });
  }
  await new Promise((done, fail) => {
    const p = spawn(ffmpeg, ['-y', '-v', 'error', '-framerate', '30', '-i', join(dir, 'f%04d.png'), '-frames:v', '240',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart',
      join(out, `journey-${tier}.mp4`)], { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? done() : fail(new Error(`ffmpeg ${code}`))));
  });
  await sharp(join(dir, 'f0240.png')).webp({ quality: 82 }).toFile(join(out, `poster-${tier}.webp`));
  rmSync(dir, { recursive: true, force: true });
  await page.close();
  console.log('rendered', tier);
}
await browser.close();
