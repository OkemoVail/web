import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./AI/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');

const requiredAssetFiles = [
  './tools/lumen-assets.json',
  './tools/lumen-assets.mjs',
  './docs/assets/lumen-hero-provenance.md',
  './AI/vendor/three.module.min.js',
  './AI/vendor/three-LICENSE.txt',
  './AI/assets/lumen/manifest.json',
];
for (const path of requiredAssetFiles) {
  assert.ok(existsSync(new URL(path, import.meta.url)), `missing Lumen asset pipeline file: ${path}`);
}

const sourceAssets = JSON.parse(readFileSync(new URL('./tools/lumen-assets.json', import.meta.url), 'utf8'));
const runtimeAssets = JSON.parse(readFileSync(new URL('./AI/assets/lumen/manifest.json', import.meta.url), 'utf8'));
assert.ok(Array.isArray(sourceAssets.sources) && sourceAssets.sources.length >= 6, 'source manifest records NASA inputs');
for (const source of sourceAssets.sources) {
  assert.match(source.page, /^https:\/\//, `${source.id} source page uses HTTPS`);
  assert.match(source.url, /^https:\/\//, `${source.id} direct file uses HTTPS`);
  assert.match(source.sha256, /^[a-f0-9]{64}$/, `${source.id} pins a SHA-256 checksum`);
}

const textureFamilies = ['earthDay', 'earthNight', 'earthClouds', 'earthNormal', 'moonAlbedo', 'moonNormal'];
for (const family of textureFamilies) {
  for (const tier of ['mobile', 'desktop']) {
    const runtimePath = sourceAssets.textures[family][tier];
    assert.match(runtimePath, /^assets\/lumen\//, `${family}.${tier} is local to the AI app`);
    const outputName = runtimePath.slice('assets/lumen/'.length);
    assert.ok(runtimeAssets.files[outputName], `${family}.${tier} is in the runtime manifest`);
  }
}

const mediaBudgets = {
  'poster-mobile.webp': 180_000,
  'poster-desktop.webp': 350_000,
  'journey-mobile.mp4': 2_500_000,
  'journey-desktop.mp4': 5_000_000,
};
for (const variants of Object.values(sourceAssets.media)) {
  for (const runtimePath of Object.values(variants)) {
    assert.match(runtimePath, /^assets\/lumen\//, `${runtimePath} is local to the AI app`);
  }
}
for (const [name, budget] of Object.entries(mediaBudgets)) {
  const entry = runtimeAssets.files[name];
  assert.ok(entry, `${name} is in the runtime manifest`);
  assert.ok(existsSync(new URL(`./AI/assets/lumen/${name}`, import.meta.url)), `${name} exists`);
  assert.equal(entry.bytes, statSync(new URL(`./AI/assets/lumen/${name}`, import.meta.url)).size, `${name} byte count is current`);
  assert.ok(entry.bytes <= budget, `${name} remains within its byte budget`);
}

for (const [name, entry] of Object.entries(runtimeAssets.files)) {
  assert.match(entry.source, /^https:\/\//, `${name} has an HTTPS provenance source`);
  assert.match(entry.sha256, /^[a-f0-9]{64}$/, `${name} has a SHA-256 checksum`);
}

assert.equal(runtimeAssets.media.fps, 30, 'fallback video is 30 FPS');
assert.equal(runtimeAssets.media.duration, 8, 'fallback video is eight seconds');
assert.deepEqual(runtimeAssets.media.desktop, { width: 1600, height: 900 }, 'desktop fallback dimensions are exact');
assert.deepEqual(runtimeAssets.media.mobile, { width: 900, height: 1200 }, 'mobile fallback dimensions are exact');

function extractElement(source, openingMatch, tagName) {
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tagPattern.lastIndex = openingMatch.index;
  let depth = 0;
  let tag;

  while ((tag = tagPattern.exec(source))) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return source.slice(openingMatch.index, tagPattern.lastIndex);
  }

  assert.fail(`missing closing </${tagName}>`);
}

function extractCssBlock(source, startPattern, label) {
  const match = startPattern.exec(source);
  assert.ok(match, `missing ${label}`);
  const openBrace = source.indexOf('{', match.index);
  let depth = 0;

  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openBrace + 1, index);
  }

  assert.fail(`missing closing brace for ${label}`);
}

const divOpenings = [...html.matchAll(/<div\b[^>]*class="([^"]*)"[^>]*>/gi)];
const cardOpenings = divOpenings.filter((opening) => opening[1].split(/\s+/).includes('hero-card'));
const cards = cardOpenings.map((opening) => extractElement(html, opening, 'div'));
assert.equal(cards.length, 3, 'hero contains exactly three cards');

const expectedCards = [
  { index: 0, marker: /id="lumen-hero"/, label: 'Lumen' },
  { index: 1, marker: /src="video\/labs21-hero\.mp4"/, label: 'Labs21 video' },
  { index: 2, marker: /class="[^"]*\bhero-player\b/, label: 'product video' },
];
for (const expected of expectedCards) {
  assert.match(cards[expected.index], new RegExp(`data-card="${expected.index}"`), `${expected.label} is card ${expected.index}`);
  assert.match(cards[expected.index], expected.marker, `${expected.label} content is in card ${expected.index}`);
}

const lumenOpening = cardOpenings[0][0];
const initialMode = lumenOpening.match(/data-mode="([^"]+)"/)?.[1];
const initialState = lumenOpening.match(/data-state="([^"]+)"/)?.[1];
assert.equal(initialMode, 'poster', 'Lumen starts in poster mode');
assert.equal(initialState, 'loading', 'Lumen starts in loading state');
const modeHooks = [...`${lumenOpening}\n${css}`.matchAll(/data-mode(?:=|\^?=)"([^"]+)"/g)].map((match) => match[1]);
const stateHooks = [...`${lumenOpening}\n${css}`.matchAll(/data-state(?:=|\^?=)"([^"]+)"/g)].map((match) => match[1]);
for (const mode of modeHooks) {
  assert.ok(['poster', 'video', 'webgl'].includes(mode), `unsupported Lumen mode hook: ${mode}`);
}
for (const state of stateHooks) {
  assert.ok(['loading', 'playing', 'held', 'failed'].includes(state), `unsupported Lumen state hook: ${state}`);
}

assert.match(cards[0], /id="lumen-stage"/);
assert.match(cards[0], /id="lumen-poster"[^>]*aria-hidden="true"/);
assert.match(cards[0], /id="lumen-fallback"[^>]*muted[^>]*playsinline[^>]*aria-hidden="true"/s);
assert.match(cards[0], /assets\/lumen\/poster-mobile\.webp/);
assert.match(cards[0], /assets\/lumen\/poster-desktop\.webp/);
assert.match(cards[0], /assets\/lumen\/journey-mobile\.mp4/);
assert.match(cards[0], /assets\/lumen\/journey-desktop\.mp4/);
assert.match(cards[0], /id="lumen-location"[^>]*aria-hidden="true"/);
assert.match(cards[0], /id="lumen-playback"[^>]*>\s*Skip intro\s*</);
assert.match(cards[0], /href="chat\.html"[^>]*>[^<]*Start here/s);
assert.match(cards[0], /Lumen 1\.9/);
assert.match(cards[0], /solar limb, Earth, and Moon/i);
assert.match(cards[1], /poster="video\/labs21-hero-poster\.jpg"/);
assert.match(cards[1], /class="hero-replay"/);
assert.doesNotMatch(cards[1], /id="hero-player"/);
assert.match(cards[2], /data-src-desktop="video\/comp1\.mp4"/);
assert.match(cards[2], /data-src-mobile="video\/comp1-mobile\.mp4"/);
for (const controlId of ['hero-player', 'hp-play', 'hp-seek', 'hp-time', 'hp-mute', 'hp-replay']) {
  assert.match(cards[2], new RegExp(`id="${controlId}"`), `${controlId} remains on product card`);
}
assert.doesNotMatch(html, /aria-live="assertive"/);
assert.match(css, /\[data-page="ai-home"\] \.lumen-copy/s);

const playbackCss = extractCssBlock(
  css,
  /\[data-page="ai-home"\] #lumen-playback\s*\{/,
  'Lumen playback rule',
);
assert.match(playbackCss, /z-index:\s*var\(--z-chrome\)/, 'Lumen playback uses the chrome layer');

const reducedMotionOpenings = [...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g)];
const reducedMotionCss = reducedMotionOpenings
  .map((opening) => extractCssBlock(css.slice(opening.index), /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/, 'reduced-motion media rule'))
  .find((block) => block.includes('.lumen-copy')) || '';
assert.ok(reducedMotionCss, 'missing Lumen reduced-motion media rule');
assert.match(reducedMotionCss, /\.lumen-fallback[\s\S]*\.lumen-stage[\s\S]*\.lumen-copy[\s\S]*transition:\s*none;/, 'reduced motion removes Lumen transitions');
assert.match(reducedMotionCss, /#lumen-hero\[data-state="held"\] \.lumen-stage canvas\s*\{[^}]*animation:\s*none;/s, 'reduced motion stops held-state scene motion');

const scriptSources = [...html.matchAll(/<script\s+src="([^"]+)"[^>]*><\/script>/g)].map((match) => match[1]);
const dependencyOrder = [
  'js/lumen-hero-policy.js',
  'js/lumen-hero.js',
  '../src/motion.js',
  '../src/nav.js',
];
assert.deepEqual(scriptSources.slice(-dependencyOrder.length), dependencyOrder, 'Lumen policy, controller, motion, and nav load in dependency order');

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
