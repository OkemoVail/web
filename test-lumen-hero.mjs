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
assert.equal(omittedQualityHints.textureTier, nullQualityHints.textureTier);
assert.equal(omittedQualityHints.pixelRatio, nullQualityHints.pixelRatio);
assert.equal(omittedQualityHints.antialias, nullQualityHints.antialias);

assert.equal(policy.timelineAt(0).phase, 'solar');
assert.equal(policy.timelineAt(2000).phase, 'terra');
assert.equal(policy.timelineAt(5000).phase, 'luna');
assert.equal(policy.timelineAt(6500).phase, 'reveal');
assert.equal(policy.timelineAt(8000).phase, 'held');
assert.equal(policy.timelineAt(6500).copyVisible, true);

console.log('Lumen hero policy assertions passed.');
