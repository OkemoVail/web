import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateResources, deriveObservations, removeTemporaryProfile, sanitizeReport, summarizeFrames } from './tools/lumen-profile.mjs';

test('summarizeFrames reports pacing only while the journey clock advances', () => {
  const summary = summarizeFrames([
    { timestamp: 100, elapsedMs: 0, phase: 'solar' },
    { timestamp: 116.7, elapsedMs: 16.7, phase: 'solar' },
    { timestamp: 150.1, elapsedMs: 50.1, phase: 'solar' },
    { timestamp: 200.2, elapsedMs: 100.2, phase: 'terra' },
  ]);

  assert.deepEqual(summary, {
    sampleCount: 3,
    medianMs: 33.4,
    p95Ms: 50.1,
    maxMs: 50.1,
    effectiveFps: 29.94,
    over33_4ms: 1,
    over50ms: 1,
    phases: {
      solar: { sampleCount: 2, medianMs: 25.05, p95Ms: 33.4, maxMs: 33.4, effectiveFps: 39.92, over33_4ms: 0, over50ms: 0 },
      terra: { sampleCount: 1, medianMs: 50.1, p95Ms: 50.1, maxMs: 50.1, effectiveFps: 19.96, over33_4ms: 1, over50ms: 1 },
    },
  });
});

test('aggregateResources keeps CDP transfer bytes separate from decoded ResourceTiming sizes', () => {
  assert.deepEqual(aggregateResources(
    [{ url: 'http://127.0.0.1/app.js', encodedBytes: 120 }, { url: 'http://127.0.0.1/a.webp', encodedBytes: 80 }, { url: 'data:image/svg+xml,private-inline-data', encodedBytes: 0 }],
    [{ name: 'http://127.0.0.1/app.js', transferSize: 100, encodedBodySize: 90, decodedBodySize: 300 }, { name: 'data:image/svg+xml,private-inline-data', transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 }],
  ), {
    cdpEncodedBytes: 200,
    resourceTiming: { transferSize: 100, encodedBodySize: 90, decodedBodySize: 300 },
    resources: [
      { originCategory: 'local', path: '/a.webp', cdpEncodedBytes: 80, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 },
      { originCategory: 'local', path: '/app.js', cdpEncodedBytes: 120, transferSize: 100, encodedBodySize: 90, decodedBodySize: 300 },
    ],
    pathAudit: { webglBytes: 0, videoBytes: 0 },
  });
});

test('sanitizeReport removes machine paths and loopback origins', () => {
  const sanitized = sanitizeReport({
    chromeExecutable: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    profileDirectory: 'C:\\Users\\person\\AppData\\Local\\Temp\\lumen-profile-secret',
    pageUrl: 'http://127.0.0.1:54321/AI/index.html',
    nested: { url: 'http://localhost:54321/AI/assets/lumen/poster.webp' },
  });

  assert.deepEqual(sanitized, {
    chromeExecutable: 'chrome.exe',
    profileDirectory: '[temporary-profile]',
    pageUrl: '[local-origin]/AI/index.html',
    nested: { url: '[local-origin]/AI/assets/lumen/poster.webp' },
  });
});

test('deriveObservations reports measured modes and path separation', () => {
  assert.deepEqual(deriveObservations([
    { name: 'desktop-cold-1', mode: 'webgl', network: { pathAudit: { webglBytes: 10, videoBytes: 0 } } },
    { name: 'mobile-cold-1', mode: 'video', network: { pathAudit: { webglBytes: 0, videoBytes: 20 } } },
  ]), [
    'Modes: desktop-cold-1=webgl; mobile-cold-1=video.',
    'Selected-path audit: all 2 trials avoided combined WebGL assets and Lumen fallback video.',
  ]);
});

test('aggregateResources distinguishes external and local resources with the same pathname', () => {
  const result = aggregateResources([
    { url: 'http://127.0.0.1:8000/css2?private=one', encodedBytes: 10 },
    { url: 'https://fonts.example/css2?private=two', encodedBytes: 20 },
  ], []);
  assert.deepEqual(result.resources, [
    { originCategory: 'external', path: '/css2', cdpEncodedBytes: 20, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 },
    { originCategory: 'local', path: '/css2', cdpEncodedBytes: 10, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 },
  ]);
});

test('removeTemporaryProfile retries transient Windows profile locks', async () => {
  let attempts = 0;
  await removeTemporaryProfile('temporary-profile', {
    remove() {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error('locked'), { code: 'EPERM' });
    },
    wait: async () => {},
  });
  assert.equal(attempts, 3);
});
