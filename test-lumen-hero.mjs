import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(
  readFileSync(new URL('./AI/js/lumen-hero-policy.js', import.meta.url), 'utf8'),
  context,
);
const policy = context.window.LumenHeroPolicy;

assert.equal(policy.chooseMode({ reduceMotion: true }), 'poster');
assert.equal(policy.chooseMode({ automated: true }), 'poster');
assert.equal(policy.chooseMode({ saveData: true, webgl: true }), 'video');
assert.equal(policy.chooseMode({ webgl: false }), 'video');
assert.equal(policy.chooseMode({ webgl: true, deviceMemory: 2, hardwareConcurrency: 4 }), 'video');
assert.equal(policy.chooseMode({ webgl: true, deviceMemory: 8, hardwareConcurrency: 8, warmupFps: 55 }), 'webgl');
assert.equal(policy.chooseMode({ webgl: true }), 'webgl');

const mobileQuality = policy.chooseQuality({ width: 390, dpr: 3 });
assert.equal(mobileQuality.textureTier, 'mobile');
assert.equal(mobileQuality.pixelRatio, 1);
assert.equal(mobileQuality.antialias, false);

const desktopQuality = policy.chooseQuality({ width: 1440, dpr: 2 });
assert.equal(desktopQuality.textureTier, 'desktop');
assert.equal(desktopQuality.pixelRatio, 1.5);
assert.equal(desktopQuality.antialias, true);

const omittedQualityHints = policy.chooseQuality({});
const nullQualityHints = policy.chooseQuality({ width: null, dpr: null, deviceMemory: null, warmupFps: null });
assert.equal(omittedQualityHints.textureTier, 'desktop');
assert.equal(omittedQualityHints.pixelRatio, 1);
assert.equal(omittedQualityHints.antialias, true);
assert.equal(nullQualityHints.textureTier, 'desktop');
assert.equal(nullQualityHints.pixelRatio, 1);
assert.equal(nullQualityHints.antialias, true);

const timelineCases = [
  { ms: -1, phase: 'solar', progress: 0, label: 'SOLAR', copyVisible: false },
  { ms: 0, phase: 'solar', progress: 0, label: 'SOLAR', copyVisible: false },
  { ms: 1999, phase: 'solar', progress: 1999 / 2000, label: 'SOLAR', copyVisible: false },
  { ms: 2000, phase: 'terra', progress: 0, label: 'TERRA', copyVisible: false },
  { ms: 4999, phase: 'terra', progress: 2999 / 3000, label: 'TERRA', copyVisible: false },
  { ms: 5000, phase: 'luna', progress: 0, label: 'LUNA', copyVisible: false },
  { ms: 6499, phase: 'luna', progress: 1499 / 1500, label: 'LUNA', copyVisible: false },
  { ms: 6500, phase: 'reveal', progress: 0, label: '', copyVisible: true },
  { ms: 7999, phase: 'reveal', progress: 1499 / 1500, label: '', copyVisible: true },
  { ms: 8000, phase: 'held', progress: 1, label: '', copyVisible: true },
];

for (const expected of timelineCases) {
  const actual = policy.timelineAt(expected.ms);
  assert.equal(actual.phase, expected.phase, `phase at ${expected.ms}ms`);
  assert.equal(actual.progress, expected.progress, `progress at ${expected.ms}ms`);
  assert.equal(actual.label, expected.label, `label at ${expected.ms}ms`);
  assert.equal(actual.copyVisible, expected.copyVisible, `copy visibility at ${expected.ms}ms`);
}

console.log('Lumen hero policy assertions passed.');
