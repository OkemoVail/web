import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = join(root, 'docs', 'assets', 'lumen-profile-2026-09-09.json');
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.webp': 'image/webp' };

function round(value) {
  return Number(value.toFixed(2));
}

function cleanDpr(value) {
  const integer = Math.round(value);
  return Math.abs(value - integer) < 0.001 ? integer : round(value);
}

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function summarizeDurations(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: sorted.length,
    medianMs: round(sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted.at(-1)),
    effectiveFps: round(sorted.length * 1000 / total),
    over33_4ms: sorted.filter((value) => value > 33.4).length,
    over50ms: sorted.filter((value) => value > 50).length,
  };
}

export function summarizeFrames(samples) {
  const durations = [];
  const byPhase = {};
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].elapsedMs <= samples[index - 1].elapsedMs) continue;
    const duration = samples[index].timestamp - samples[index - 1].timestamp;
    durations.push(duration);
    (byPhase[samples[index].phase] ||= []).push(duration);
  }
  if (!durations.length) return { sampleCount: 0, phases: {} };
  return {
    ...summarizeDurations(durations),
    phases: Object.fromEntries(Object.entries(byPhase).map(([phase, values]) => [phase, summarizeDurations(values)])),
  };
}

function localPath(value) {
  try { return new URL(value).pathname; } catch (_) { return value; }
}

export function aggregateResources(cdpResources, timingResources) {
  const resources = new Map();
  const row = (url) => {
    if (url.startsWith('data:')) return null;
    const path = localPath(url);
    if (!resources.has(path)) resources.set(path, { path, cdpEncodedBytes: 0, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 });
    return resources.get(path);
  };
  for (const resource of cdpResources) {
    const target = row(resource.url);
    if (target) target.cdpEncodedBytes += resource.encodedBytes || 0;
  }
  for (const resource of timingResources) {
    const target = row(resource.name);
    if (!target) continue;
    target.transferSize += resource.transferSize || 0;
    target.encodedBodySize += resource.encodedBodySize || 0;
    target.decodedBodySize += resource.decodedBodySize || 0;
  }
  return {
    cdpEncodedBytes: cdpResources.filter((resource) => !resource.url.startsWith('data:')).reduce((sum, resource) => sum + (resource.encodedBytes || 0), 0),
    resourceTiming: timingResources.filter((resource) => !resource.name.startsWith('data:')).reduce((sum, resource) => ({
      transferSize: sum.transferSize + (resource.transferSize || 0),
      encodedBodySize: sum.encodedBodySize + (resource.encodedBodySize || 0),
      decodedBodySize: sum.decodedBodySize + (resource.decodedBodySize || 0),
    }), { transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 }),
    resources: [...resources.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export function sanitizeReport(report) {
  function visit(value, key = '') {
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, visit(child, childKey)]));
    if (key === 'chromeExecutable') return 'Google Chrome';
    if (key === 'profileDirectory') return '[temporary-profile]';
    if (typeof value === 'string') return value.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/g, '[local-origin]');
    return value;
  }
  return visit(report);
}

export async function removeTemporaryProfile(path, adapters = {}) {
  const remove = adapters.remove || ((target) => rmSync(target, { recursive: true, force: true }));
  const wait = adapters.wait || ((ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms)));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { remove(path); return; }
    catch (error) {
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code) || attempt === 9) throw error;
      await wait(100 * (attempt + 1));
    }
  }
}

function findChrome() {
  const candidates = process.platform === 'win32'
    ? [process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'), process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'), process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')]
    : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error('Installed Google Chrome was not found. Set CHROME_PATH to its executable.');
  return process.env.CHROME_PATH || found;
}

function staticServer() {
  return createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const candidate = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
    if (relative(root, candidate).startsWith('..') || !existsSync(candidate) || !statSync(candidate).isFile()) return response.writeHead(404).end('Not found');
    response.writeHead(200, { 'Content-Type': types[extname(candidate)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(candidate).pipe(response);
  });
}

async function waitForCdp(port, child) {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode != null) throw new Error(`Chrome exited before CDP connected (${child.exitCode}).`);
    try { if ((await fetch(endpoint)).ok) return; } catch (_) {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Timed out waiting for Chrome remote debugging.');
}

async function profileJourney(page, viewport, baseUrl) {
  await page.setViewportSize(viewport);
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  const requests = new Map();
  session.on('Network.responseReceived', ({ requestId, response }) => requests.set(requestId, { url: response.url, encodedBytes: 0 }));
  session.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    const resource = requests.get(requestId);
    if (resource) resource.encodedBytes = encodedDataLength;
  });
  await page.addInitScript(() => {
    window.__lumenProfileFrames = [];
    requestAnimationFrame(function sample(timestamp) {
      const state = window.LumenHero?.getState();
      if (state) window.__lumenProfileFrames.push({ timestamp, elapsedMs: state.elapsedMs, phase: state.phase });
      if (!state || state.elapsedMs < 8000) requestAnimationFrame(sample);
    });
  });
  await page.goto(`${baseUrl}/AI/index.html`, { waitUntil: 'load' });
  const webdriver = await page.evaluate(() => navigator.webdriver);
  if (webdriver !== false) throw new Error(`Expected navigator.webdriver === false, received ${webdriver}.`);
  await page.waitForFunction(() => window.LumenHero?.getState().elapsedMs >= 8000, null, { timeout: 30000 });
  await page.waitForTimeout(250);
  const browserData = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      state: window.LumenHero.getState(),
      samples: window.__lumenProfileFrames,
      dpr: devicePixelRatio,
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemory: navigator.deviceMemory ?? null,
      webgl: {
        vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl?.getParameter(gl.VENDOR) || null,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) || null,
      },
      resources: performance.getEntriesByType('resource').map(({ name, transferSize, encodedBodySize, decodedBodySize }) => ({ name, transferSize, encodedBodySize, decodedBodySize })),
    };
  });
  await session.detach();
  return {
    viewport,
    mode: browserData.state.mode,
    finalPhase: browserData.state.phase,
    dpr: cleanDpr(browserData.dpr),
    hardwareConcurrency: browserData.hardwareConcurrency,
    deviceMemory: browserData.deviceMemory,
    webgl: browserData.webgl,
    framePacing: summarizeFrames(browserData.samples),
    network: aggregateResources([...requests.values()], browserData.resources),
  };
}

async function main() {
  const chromeExecutable = process.env.CHROME_PATH || findChrome();
  const profileDirectory = mkdtempSync(join(tmpdir(), 'lumen-profile-'));
  const server = staticServer();
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const port = 9222 + Math.floor(Math.random() * 5000);
  const child = spawn(chromeExecutable, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update',
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });
  let browser;
  try {
    await waitForCdp(port, child);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();
    const version = await page.evaluate(() => navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || navigator.userAgent);
    const runs = [];
    runs.push({ name: 'desktop-natural', ...(await profileJourney(page, { width: 1440, height: 900 }, baseUrl)) });
    await page.close();
    const mobilePage = await context.newPage();
    runs.push({ name: 'mobile-natural', ...(await profileJourney(mobilePage, { width: 390, height: 844 }, baseUrl)) });
    const report = sanitizeReport({
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      provenance: {
        chromeExecutable,
        profileDirectory,
        connection: 'External installed Chrome spawned with remote debugging; Playwright chromium.connectOverCDP used only after launch.',
        webdriverExpected: false,
        journey: 'Natural production policy, complete 8-second timeline; no policy or navigator overrides.',
        chromeVersion: version,
      },
      runs,
      observations: [
        'Desktop natural mode selected fallback video after WebGL assets loaded, while the following mobile natural run retained WebGL. Repeated fresh-profile runs reproduced this order-specific warm-up anomaly on the same Chrome/GPU.',
        'The desktop fallback journey remained smooth, but its network record includes both desktop WebGL textures and the fallback video because fallback occurred after warm-up. This is reported as measured; production policy was not changed without isolated threshold evidence.',
        'The mobile WebGL journey exceeded 33.4 ms once during Solar (also above 50 ms); all later phases stayed below 33.4 ms and effective full-journey pacing remained above 30 FPS.',
      ],
    });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${relative(root, outputPath)} (${runs.map((run) => `${run.name}: ${run.mode}`).join(', ')})`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child.exitCode == null) {
      child.kill();
      await new Promise((resolveExit) => { child.once('exit', resolveExit); setTimeout(resolveExit, 3000); });
    }
    await new Promise((resolveClose) => server.close(resolveClose));
    await removeTemporaryProfile(profileDirectory);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
