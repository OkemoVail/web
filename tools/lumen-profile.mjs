import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, release, type } from 'node:os';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4', '.webp': 'image/webp' };
const trials = [
  { name: 'desktop-cold-1', tier: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile-cold-1', tier: 'mobile', viewport: { width: 390, height: 844 } },
  { name: 'mobile-cold-2-reversed', tier: 'mobile', viewport: { width: 390, height: 844 } },
  { name: 'desktop-cold-2-reversed', tier: 'desktop', viewport: { width: 1440, height: 900 } },
];

function round(value) { return Number(value.toFixed(2)); }
function cleanDpr(value) { const integer = Math.round(value); return Math.abs(value - integer) < 0.001 ? integer : round(value); }
function percentile(sorted, fraction) { return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]; }

function summarizeDurations(values) {
  if (!values.length) return { sampleCount: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: sorted.length,
    medianMs: round(sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2),
    p95Ms: round(percentile(sorted, 0.95)), maxMs: round(sorted.at(-1)), effectiveFps: round(sorted.length * 1000 / total),
    over33_4ms: sorted.filter((value) => value > 33.4).length, over50ms: sorted.filter((value) => value > 50).length,
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
  return { ...summarizeDurations(durations), phases: Object.fromEntries(Object.entries(byPhase).map(([phase, values]) => [phase, summarizeDurations(values)])) };
}

function resourceIdentity(value) {
  const url = new URL(value);
  if (url.protocol === 'data:') return null;
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  return { key: `${local ? 'local' : 'external'}:${url.pathname}`, originCategory: local ? 'local' : 'external', path: url.pathname };
}

export function aggregateResources(cdpResources, timingResources) {
  const resources = new Map();
  const row = (url) => {
    const identity = resourceIdentity(url);
    if (!identity) return null;
    if (!resources.has(identity.key)) resources.set(identity.key, { originCategory: identity.originCategory, path: identity.path, cdpEncodedBytes: 0, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 });
    return resources.get(identity.key);
  };
  for (const resource of cdpResources) { const target = row(resource.url); if (target) target.cdpEncodedBytes += resource.encodedBytes || 0; }
  for (const resource of timingResources) {
    const target = row(resource.name); if (!target) continue;
    target.transferSize += resource.transferSize || 0; target.encodedBodySize += resource.encodedBodySize || 0; target.decodedBodySize += resource.decodedBodySize || 0;
  }
  const list = [...resources.values()].sort((a, b) => `${a.originCategory}:${a.path}`.localeCompare(`${b.originCategory}:${b.path}`));
  const timing = list.reduce((sum, resource) => ({ transferSize: sum.transferSize + resource.transferSize, encodedBodySize: sum.encodedBodySize + resource.encodedBodySize, decodedBodySize: sum.decodedBodySize + resource.decodedBodySize }), { transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 });
  const isWebgl = ({ path }) => /\/AI\/(?:vendor\/three|js\/lumen-scene|assets\/lumen\/(?:earth-|moon-))/.test(path);
  const isVideo = ({ path }) => /\/AI\/assets\/lumen\/journey-(?:mobile|desktop)\.mp4$/.test(path);
  return {
    cdpEncodedBytes: list.reduce((sum, resource) => sum + resource.cdpEncodedBytes, 0), resourceTiming: timing, resources: list,
    pathAudit: { webglBytes: list.filter(isWebgl).reduce((sum, resource) => sum + resource.cdpEncodedBytes, 0), videoBytes: list.filter(isVideo).reduce((sum, resource) => sum + resource.cdpEncodedBytes, 0) },
  };
}

export function sanitizeReport(report) {
  function visit(value, key = '') {
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, visit(child, childKey)]));
    if (key === 'chromeExecutable') return basename(value);
    if (key === 'profileDirectory') return '[temporary-profile]';
    if (typeof value === 'string') return value.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/g, '[local-origin]');
    return value;
  }
  return visit(report);
}

export function deriveObservations(runs) {
  const modes = `Modes: ${runs.map((run) => `${run.name}=${run.mode}`).join('; ')}.`;
  const separated = runs.filter((run) => !(run.network.pathAudit.webglBytes && run.network.pathAudit.videoBytes)).length;
  return [modes, `Selected-path audit: ${separated === runs.length ? 'all' : separated} ${runs.length} trials avoided combined WebGL assets and Lumen fallback video.`];
}

export async function removeTemporaryProfile(path, adapters = {}) {
  const remove = adapters.remove || ((target) => rmSync(target, { recursive: true, force: true }));
  const wait = adapters.wait || ((ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms)));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { remove(path); return; } catch (error) { if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code) || attempt === 9) throw error; await wait(100 * (attempt + 1)); }
  }
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = process.platform === 'win32' ? [process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'), process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'), process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')] : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error('Installed Google Chrome was not found. Set CHROME_PATH.');
  return found;
}

function staticServer() {
  return createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const candidate = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
    if (relative(root, candidate).startsWith('..') || !existsSync(candidate) || !statSync(candidate).isFile()) return response.writeHead(404).end('Not found');
    response.writeHead(200, { 'Content-Type': types[extname(candidate)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); createReadStream(candidate).pipe(response);
  });
}

async function waitForCdp(port, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode != null) throw new Error(`Chrome exited before CDP connected (${child.exitCode}).`);
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return; } catch (_) {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Timed out waiting for Chrome remote debugging.');
}

async function runTrial(trial, chromeExecutable, baseUrl) {
  const profileDirectory = mkdtempSync(join(tmpdir(), 'lumen-profile-'));
  const port = 9222 + Math.floor(Math.random() * 20000);
  const { spawn } = await import('node:child_process');
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profileDirectory}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', `--window-size=${trial.viewport.width},${trial.viewport.height}`, 'about:blank'];
  const child = spawn(chromeExecutable, args, { stdio: 'ignore' });
  let browser;
  try {
    await waitForCdp(port, child); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0]; const page = context.pages()[0] || await context.newPage(); await page.setViewportSize(trial.viewport);
    const session = await context.newCDPSession(page); await session.send('Network.enable');
    const requests = new Map(); const pending = new Set();
    session.on('Network.responseReceived', ({ requestId, response }) => { requests.set(requestId, { url: response.url, encodedBytes: 0 }); pending.add(requestId); });
    session.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => { const resource = requests.get(requestId); if (resource) resource.encodedBytes = encodedDataLength; pending.delete(requestId); });
    session.on('Network.loadingFailed', ({ requestId }) => pending.delete(requestId));
    await page.addInitScript(() => {
      window.__lumenProfile = { raf: [], renders: [], video: [] };
      for (const constructorName of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
        const prototype = window[constructorName]?.prototype; if (!prototype) continue;
        for (const methodName of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          const native = prototype[methodName]; if (!native) continue;
          prototype[methodName] = function (...args) { window.__lumenProfile.renders.push(performance.now()); return native.apply(this, args); };
        }
      }
      requestAnimationFrame(function sample(timestamp) { const state = window.LumenHero?.getState(); if (state) window.__lumenProfile.raf.push({ timestamp, elapsedMs: state.elapsedMs, phase: state.phase }); if (!state || state.elapsedMs < 8000) requestAnimationFrame(sample); });
      addEventListener('DOMContentLoaded', () => { const video = document.querySelector('#lumen-fallback'); if (!video?.requestVideoFrameCallback) return; const sample = (now, metadata) => { window.__lumenProfile.video.push({ now, mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames }); if (window.LumenHero?.getState().elapsedMs < 8000) video.requestVideoFrameCallback(sample); }; video.requestVideoFrameCallback(sample); });
    });
    await page.goto(`${baseUrl}/AI/index.html`, { waitUntil: 'load' });
    if (await page.evaluate(() => navigator.webdriver) !== false) throw new Error('navigator.webdriver was not false.');
    await page.waitForFunction(() => window.LumenHero?.getState().elapsedMs >= 8000, null, { timeout: 30000 });
    await page.waitForFunction(() => performance.getEntriesByType('resource').every((entry) => entry.responseEnd > 0), null, { timeout: 10000 });
    for (let attempt = 0; pending.size && attempt < 100; attempt += 1) await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    const relevantPending = [...pending].filter((requestId) => /\/AI\/(?:assets\/lumen|js\/lumen|vendor\/three)/.test(requests.get(requestId)?.url || ''));
    if (relevantPending.length) throw new Error(`${trial.name}: relevant network requests did not complete: ${relevantPending.map((requestId) => requests.get(requestId)?.url || requestId).join(', ')}`);
    const data = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return { state: window.LumenHero.getState(), profile: window.__lumenProfile, dpr: devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency ?? null, deviceMemory: navigator.deviceMemory ?? null, webgl: { vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl?.getParameter(gl.VENDOR) || null, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) || null }, resources: performance.getEntriesByType('resource').map(({ name, transferSize, encodedBodySize, decodedBodySize }) => ({ name, transferSize, encodedBodySize, decodedBodySize })), chromeVersion: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || null };
    });
    const videoIntervals = data.profile.video.slice(1).map((sample, index) => (sample.mediaTime - data.profile.video[index].mediaTime) * 1000).filter((value) => value > 0);
    const renderTimes = data.profile.renders.filter((time, index, values) => index === 0 || time - values[index - 1] > 5);
    const renderIntervals = renderTimes.slice(1).map((time, index) => time - renderTimes[index]);
    const network = aggregateResources([...requests.values()], data.resources);
    if (network.pathAudit.webglBytes && network.pathAudit.videoBytes) throw new Error(`${trial.name}: selected paths downloaded both WebGL and video bytes.`);
    return { name: trial.name, tier: trial.tier, viewport: trial.viewport, mode: data.state.mode, finalPhase: data.state.phase, dpr: cleanDpr(data.dpr), hardwareConcurrency: data.hardwareConcurrency, deviceMemory: data.deviceMemory, webgl: data.webgl, chromeVersion: data.chromeVersion, controllerRafPacing: summarizeFrames(data.profile.raf), videoPresentationCadence: data.state.mode === 'video' ? summarizeDurations(videoIntervals) : null, webglRenderLoopCadence: data.state.mode === 'webgl' ? { ...summarizeDurations(renderIntervals), qualification: 'Actual WebGL draw-call groups; render-loop cadence, not GPU presentation.' } : null, network };
  } finally {
    if (browser) await browser.close().catch(() => {}); if (child.exitCode == null) { child.kill(); await new Promise((resolveExit) => { child.once('exit', resolveExit); setTimeout(resolveExit, 3000); }); } await removeTemporaryProfile(profileDirectory);
  }
}

function parseOutput() {
  const index = process.argv.indexOf('--output'); if (index < 0 || !process.argv[index + 1]) throw new Error('Pass --output <path>; existing evidence is never overwritten implicitly.');
  const output = resolve(root, process.argv[index + 1]); if (relative(root, output).startsWith('..')) throw new Error('Output must remain inside the repository.'); return output;
}

async function main() {
  const outputPath = parseOutput(); const chromeExecutable = findChrome(); const server = staticServer();
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); }); const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const runs = []; for (const trial of trials) { console.log(`Profiling ${trial.name}...`); runs.push(await runTrial(trial, chromeExecutable, baseUrl)); }
    const report = sanitizeReport({ schemaVersion: 2, capturedAt: new Date().toISOString(), provenance: { gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), operatingSystem: `${type()} ${release()} (${platform()})`, command: `node tools/lumen-profile.mjs --output ${relative(root, outputPath).replaceAll('\\', '/')}`, configuration: 'Natural production policy; four cold trials; each trial uses an independent Chrome process, context, and temporary profile.', chromeExecutable, chromeChannel: basename(chromeExecutable).toLowerCase().includes('canary') ? 'canary' : basename(chromeExecutable).toLowerCase().includes('beta') ? 'beta' : 'stable', trialCount: trials.length, trialOrder: trials.map(({ name }) => name), connection: 'Installed Chrome spawned directly with remote debugging; chromium.connectOverCDP used only for connection.', webdriverExpected: false }, runs, observations: deriveObservations(runs) });
    const { writeFile } = await import('node:fs/promises'); await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`); console.log(`Wrote ${relative(root, outputPath)}`);
  } finally { await new Promise((resolveClose) => server.close(resolveClose)); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
