import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';
import vm from 'node:vm';

const html = readFileSync(new URL('./AI/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');

const { acceptMediaTransaction, nodeFs } = await import('./tools/lumen-media-transaction.mjs');
for (const failure of ['write', 'rename']) {
  const transactionRoot = await mkdtemp('C:\\Users\\okemo\\AppData\\Local\\Temp\\opencode\\lumen-transaction-test-');
  try {
    const stagedDir = join(transactionRoot, 'staged');
    const deployedDir = join(transactionRoot, 'deployed');
    const configPath = join(transactionRoot, 'lumen-assets.json');
    const names = ['poster.webp', 'journey.mp4'];
    await mkdir(stagedDir);
    await mkdir(deployedDir);
    await writeFile(join(stagedDir, names[0]), 'new poster');
    await writeFile(join(stagedDir, names[1]), 'new video');
    await writeFile(join(deployedDir, names[0]), 'reviewed poster');
    await writeFile(join(deployedDir, names[1]), 'reviewed video');
    const originalConfig = Buffer.from('{\n  "reviewedMedia": { "files": { "poster.webp": "old-poster-hash", "journey.mp4": "old-video-hash" } }\n}\n');
    const nextConfig = { reviewedMedia: { files: { 'poster.webp': 'new-poster-hash', 'journey.mp4': 'new-video-hash' } } };
    await writeFile(configPath, originalConfig);
    let postPromotionValidated = false;
    const fs = {
      ...nodeFs,
      writeFile: async (path, data) => {
        if (failure === 'write' && path === `${configPath}.tmp`) throw new Error('simulated config temp write failure');
        return nodeFs.writeFile(path, data);
      },
      rename: async (from, to) => {
        if (failure === 'rename' && from === `${configPath}.tmp` && to === configPath) throw new Error('simulated final config rename failure');
        return nodeFs.rename(from, to);
      },
    };

    await assert.rejects(
      acceptMediaTransaction({
        mediaNames: names,
        stagedDir,
        deployedDir,
        configPath,
        nextConfig,
        fs,
        validate: async (directory) => {
          if (directory === deployedDir) {
            assert.equal(await readFile(join(deployedDir, names[0]), 'utf8'), 'new poster');
            assert.equal(await readFile(join(deployedDir, names[1]), 'utf8'), 'new video');
            postPromotionValidated = true;
          }
        },
      }),
      new RegExp(`simulated .*config .*${failure} failure`),
    );
    assert.ok(postPromotionValidated, `${failure} failure occurs after media promotion and validation`);
    assert.equal(await readFile(join(deployedDir, names[0]), 'utf8'), 'reviewed poster', `${failure} failure restores reviewed poster`);
    assert.equal(await readFile(join(deployedDir, names[1]), 'utf8'), 'reviewed video', `${failure} failure restores reviewed video`);
    assert.deepEqual(await readFile(configPath), originalConfig, `${failure} failure preserves original config bytes`);
  } finally {
    await rm(transactionRoot, { recursive: true, force: true });
  }
}

const requiredAssetFiles = [
  './tools/lumen-assets.json',
  './tools/lumen-assets.mjs',
  './tools/lumen-render.py',
  './tools/lumen-media-transaction.mjs',
  './docs/assets/lumen-hero-provenance.md',
  './AI/vendor/three.module.min.js',
  './AI/vendor/three.core.min.js',
  './AI/vendor/three-LICENSE.txt',
  './AI/assets/lumen/manifest.json',
  './AI/js/lumen-timeline.json',
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
  const runtimeDirectory = name.startsWith('three.') ? './AI/vendor/' : './AI/assets/lumen/';
  const bytes = readFileSync(new URL(`${runtimeDirectory}${name}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${name} deployed bytes match manifest SHA-256`);
}

const renderSource = readFileSync(new URL('./tools/lumen-render.py', import.meta.url), 'utf8');
assert.match(renderSource, /lumen-timeline\.json/, 'Blender consumes the checked-in shared timeline');
assert.match(renderSource, /Procedural granular solar photosphere/);
assert.match(renderSource, /Restrained solar corona/);
assert.match(renderSource, /Distant star field points/);
assert.match(renderSource, /Rayleigh-like atmosphere rim/);
assert.match(renderSource, /Earth surface: day plus night-side cities/);
assert.match(renderSource, /DOT_PRODUCT[\s\S]*dark[\s\S]*Emission Strength/, 'city emission is masked by light-facing normal');
assert.match(renderSource, /-Vector\(light_direction\).*to_track_quat/, 'lamp rays oppose the shared surface-to-Sun vector');
assert.doesNotMatch(renderSource, /primitive_ico_sphere_add/, 'stars are not nearby low-poly spheres');

for (const name of ['moon-albedo-mobile.webp', 'moon-albedo-desktop.webp', 'moon-normal-mobile.webp', 'moon-normal-desktop.webp']) {
  assert.deepEqual(runtimeAssets.files[name].sources, ['moonNear', 'moonFar'], `${name} records both lunar inputs`);
}
for (const name of Object.keys(mediaBudgets)) {
  assert.deepEqual(runtimeAssets.files[name].sources, sourceAssets.sources.map(({ id }) => id), `${name} records every NASA input`);
}

assert.equal(runtimeAssets.media.fps, 30, 'fallback video is 30 FPS');
assert.equal(runtimeAssets.media.duration, 8, 'fallback video is eight seconds');
assert.deepEqual(runtimeAssets.media.desktop, { width: 1600, height: 900 }, 'desktop fallback dimensions are exact');
assert.deepEqual(runtimeAssets.media.mobile, { width: 900, height: 1200 }, 'mobile fallback dimensions are exact');

const timeline = JSON.parse(readFileSync(new URL('./AI/js/lumen-timeline.json', import.meta.url), 'utf8'));
assert.equal(timeline.fps, 30, 'shared timeline runs at 30 FPS');
assert.equal(timeline.durationMs, 8000, 'shared timeline is eight seconds');
assert.deepEqual(timeline.phases.map(({ name, startMs, endMs }) => [name, startMs, endMs]), [
  ['solar', 0, 2000],
  ['terra', 2000, 5000],
  ['luna', 5000, 6500],
  ['reveal', 6500, 8000],
]);
assert.deepEqual(timeline.light.direction, [-0.72, -0.35, -0.6], 'one light direction drives Earth, Moon, and city masking');

const sceneSource = readFileSync(new URL('./AI/js/lumen-scene.js', import.meta.url), 'utf8');
const controllerPath = new URL('./AI/js/lumen-hero.js', import.meta.url);
assert.ok(existsSync(controllerPath), 'Lumen controller exists');
const controllerSource = readFileSync(controllerPath, 'utf8');
const sceneImports = [...sceneSource.matchAll(/^import\s+[\s\S]*?from\s+['"]([^'"]+)['"];?$/gm)].map((match) => match[1]);
assert.deepEqual(sceneImports, ['../vendor/three.module.min.js'], 'scene imports only the local Three.js build');
assert.doesNotMatch(sceneSource, /https?:\/\//, 'scene contains no network URLs');
assert.match(sceneSource, /fetch\(new URL\(['"]\.\/lumen-timeline\.json['"],\s*import\.meta\.url\)/, 'scene consumes the checked-in shared timeline');
assert.match(sceneSource, /window\.createLumenScene\s*=\s*createLumenScene/, 'scene explicitly publishes its browser global');
assert.match(sceneSource, /export\s*\{[^}]*createLumenScene[^}]*\}/, 'scene also exports its factory');
for (const component of ['Earth surface', 'Earth cloud shell', 'Earth atmosphere', 'Moon surface', 'Procedural solar limb', 'Seeded distant stars']) {
  assert.ok(sceneSource.includes(component), `scene creates ${component}`);
}
assert.match(sceneSource, /MeshStandardMaterial[\s\S]*earthDay[\s\S]*earthNight/, 'Earth uses separate day and night textures');
assert.match(sceneSource, /earthNight[\s\S]*dot\([\s\S]*lightDirection[\s\S]*smoothstep/, 'night lights are physically masked to the dark side');
assert.match(sceneSource, /earthClouds[\s\S]*transparent:\s*true/, 'Earth clouds remain a separate transparent shell');
assert.match(sceneSource, /moonNormal[\s\S]*roughness:/, 'Moon is rough and normal mapped');
assert.match(sceneSource, /webglcontextlost/, 'scene listens for WebGL context loss');
assert.match(sceneSource, /preventDefault\(\)[\s\S]*active\s*=\s*false[\s\S]*onContextLost/, 'context loss is prevented, paused, and reported');
assert.match(sceneSource, /setPixelRatio\(Math\.min\(quality\.pixelRatio,\s*1\.5\)\)/, 'renderer caps the quality profile pixel ratio');
assert.match(sceneSource, /ACESFilmicToneMapping/, 'scene uses ACES filmic tone mapping');
assert.match(sceneSource, /SRGBColorSpace/, 'scene uses sRGB output');
assert.match(sceneSource, /function dispose\(\)/, 'scene defines disposal');
for (const resource of ['geometry', 'material', 'texture', 'renderer']) {
  assert.match(sceneSource, new RegExp(`${resource}\\.dispose\\(\\)`), `scene disposes ${resource} resources`);
}
assert.doesNotMatch(sceneSource, /EffectComposer|Bloom|Lensflare|OrbitControls|Cannon|Ammo|anime/, 'scene has no postprocessing, controls, physics, or animation library');

const originalWarnings = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (args[0]?.code !== 'MODULE_TYPELESS_PACKAGE_JSON') originalWarnings.call(process, warning, ...args);
};
const threeModule = await import('./AI/vendor/three.module.min.js');
process.emitWarning = originalWarnings;
assert.equal(typeof threeModule.WebGLRenderer, 'function', 'the complete local Three.js module graph imports');
globalThis.window = {};
const { createLumenSceneWithDependencies, patchEarthShader } = await import('./AI/js/lumen-scene.js');
delete globalThis.window;

{
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <defaultnormal_vertex>',
    fragmentShader: '#include <common>\n#include <opaque_fragment>',
  };
  patchEarthShader(shader, { id: 'night' }, { id: 'light' });
  assert.match(shader.vertexShader, /transformedNormal[\s\S]*viewMatrix/, 'Earth shader derives world normal from Three inverse-transpose normal result');
  assert.doesNotMatch(shader.vertexShader, /mat3\(modelMatrix\)\s*\*\s*objectNormal/, 'Earth shader does not use a scale-unsafe world normal transform');
  assert.equal(shader.uniforms.earthNight.value.id, 'night', 'Earth shader binds its night texture');
  assert.equal(shader.uniforms.lightDirection.value.id, 'light', 'Earth shader binds the shared world-space light direction');
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function sceneHarness(texturePromises = []) {
  const listeners = new Map();
  const canvas = {
    removed: 0,
    setAttribute() {},
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    remove() { this.removed += 1; },
  };
  const renderer = {
    domElement: canvas,
    capabilities: { getMaxAnisotropy: () => 4 },
    renders: 0,
    disposed: 0,
    setPixelRatio() {},
    setSize() {},
    render() { this.renders += 1; },
    dispose() { this.disposed += 1; },
  };
  const mount = { appendChild() {} };
  let textureIndex = 0;
  const dependencies = {
    createRenderer: () => renderer,
    loadTimeline: async () => timeline,
    loadTexture: () => texturePromises[textureIndex++] || Promise.resolve({ dispose() {} }),
    buildScene: ({ renderer: activeRenderer, resources }) => ({
      render: () => activeRenderer.render(),
      resize: () => activeRenderer.setSize(),
      resources,
    }),
  };
  return { canvas, dependencies, listeners, mount, renderer };
}

{
  const harness = sceneHarness();
  const sceneBoundary = await createLumenSceneWithDependencies({
    mount: harness.mount,
    quality: { textureTier: 'mobile', pixelRatio: 1, antialias: false },
    assets: Object.fromEntries(textureFamilies.map((name) => [name, { mobile: name, desktop: name }])),
  }, harness.dependencies);
  assert.equal(harness.listeners.has('webglcontextlost'), true, 'context loss is registered during initialization');
  assert.equal(typeof globalThis.requestAnimationFrame, 'undefined', 'Node test has no RAF scheduler');
  sceneBoundary.render({ phase: 'solar', progress: 0, label: 'SOLAR', copyVisible: false, elapsedMs: 0 }, 0);
  assert.equal(harness.renderer.renders, 1, 'render draws exactly once without scheduling RAF');
  sceneBoundary.pause();
  sceneBoundary.render({ phase: 'solar', progress: 0.05, label: 'SOLAR', copyVisible: false, elapsedMs: 100 }, 100);
  assert.equal(harness.renderer.renders, 1, 'pause gates controller-driven draws');
  sceneBoundary.resume();
  sceneBoundary.render({ phase: 'solar', progress: 0.05, label: 'SOLAR', copyVisible: false, elapsedMs: 100 }, 0);
  assert.equal(harness.renderer.renders, 2, 'resume permits the next controller-driven draw');
  const contextEvent = { prevented: 0, preventDefault() { this.prevented += 1; } };
  harness.listeners.get('webglcontextlost')(contextEvent);
  assert.equal(contextEvent.prevented, 1, 'context loss remains handled after initialization');
  assert.equal(harness.renderer.disposed, 1, 'context loss after initialization disposes resources without an unhandled initialization rejection');
  sceneBoundary.dispose();
  sceneBoundary.dispose();
  assert.equal(harness.renderer.disposed, 1, 'dispose is idempotent');
  assert.equal(harness.canvas.removed, 1, 'dispose removes the canvas once');
}

{
  const loads = textureFamilies.map(() => deferred());
  const harness = sceneHarness(loads.map(({ promise }) => promise));
  const abortController = new AbortController();
  const creation = createLumenSceneWithDependencies({
    mount: harness.mount,
    quality: { textureTier: 'mobile', pixelRatio: 1, antialias: false },
    assets: Object.fromEntries(textureFamilies.map((name) => [name, { mobile: name, desktop: name }])),
    signal: abortController.signal,
  }, harness.dependencies);
  assert.equal(harness.listeners.has('webglcontextlost'), true, 'context loss listener exists before textures settle');
  abortController.abort();
  await assert.rejects(creation, { name: 'AbortError' });
  const lateTextures = loads.map(() => ({ disposed: 0, dispose() { this.disposed += 1; } }));
  loads.forEach((load, index) => load.resolve(lateTextures[index]));
  await Promise.all(loads.map(({ promise }) => promise));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(lateTextures.map(({ disposed }) => disposed), [1, 1, 1, 1, 1, 1], 'late sibling texture resolutions are disposed after abort');
  assert.equal(harness.renderer.disposed, 1, 'abort disposes the renderer');
  assert.equal(harness.canvas.removed, 1, 'abort removes the canvas');
}

{
  const firstLoad = deferred();
  const harness = sceneHarness([firstLoad.promise, ...textureFamilies.slice(1).map(() => new Promise(() => {}))]);
  let losses = 0;
  const creation = createLumenSceneWithDependencies({
    mount: harness.mount,
    quality: { textureTier: 'mobile', pixelRatio: 1, antialias: false },
    assets: Object.fromEntries(textureFamilies.map((name) => [name, { mobile: name, desktop: name }])),
    onContextLost: () => { losses += 1; },
  }, harness.dependencies);
  const event = { prevented: 0, preventDefault() { this.prevented += 1; } };
  harness.listeners.get('webglcontextlost')(event);
  harness.listeners.get('webglcontextlost')?.(event);
  await assert.rejects(creation, /WebGL context lost/);
  firstLoad.resolve({ disposed: 0, dispose() { this.disposed += 1; } });
  assert.equal(event.prevented, 1, 'context loss is handled once');
  assert.equal(losses, 1, 'context loss callback fires once through initialization');
  assert.equal(harness.renderer.disposed, 1, 'context loss during initialization cleans the renderer');
}

for (const [family, variants] of Object.entries(sourceAssets.textures)) {
  for (const [tier, runtimePath] of Object.entries(variants)) {
    const metadata = await sharp(readFileSync(new URL(`./AI/${runtimePath}`, import.meta.url))).metadata();
    const width = tier === 'mobile' ? 1024 : 2048;
    assert.deepEqual([metadata.width, metadata.height], [width, width / 2], `${family}.${tier} has exact equirectangular dimensions`);
    assert.equal(metadata.hasAlpha, family === 'earthClouds', `${family}.${tier} alpha contract`);
  }
}

const ffprobePath = process.env.FFPROBE_PATH || 'C:\\Users\\okemo\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Shared_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build-shared\\bin\\ffprobe.exe';
assert.equal(createHash('sha256').update(readFileSync(ffprobePath)).digest('hex'), sourceAssets.reviewedMedia.toolchain.ffprobeSha256, 'FFprobe executable matches pinned reviewed toolchain');
for (const tier of ['mobile', 'desktop']) {
  const expected = runtimeAssets.media[tier];
  const probe = JSON.parse(execFileSync(ffprobePath, [
    '-v', 'error', '-count_frames', '-show_entries',
    'format=duration:stream=index,codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,nb_read_frames',
    '-of', 'json', fileURLToPath(new URL(`./AI/assets/lumen/journey-${tier}.mp4`, import.meta.url)),
  ], { encoding: 'utf8' }));
  assert.equal(probe.streams.length, 1, `${tier} fallback has one stream and no audio`);
  const stream = probe.streams[0];
  assert.equal(stream.codec_type, 'video', `${tier} fallback stream is video`);
  assert.equal(stream.codec_name, 'h264', `${tier} fallback uses H.264`);
  assert.equal(stream.pix_fmt, 'yuv420p', `${tier} fallback uses yuv420p`);
  assert.deepEqual([stream.width, stream.height], [expected.width, expected.height], `${tier} fallback dimensions`);
  assert.equal(stream.avg_frame_rate, '30/1', `${tier} fallback frame rate`);
  assert.equal(Number(stream.nb_read_frames), 240, `${tier} fallback contains 240 frames`);
  assert.ok(Math.abs(Number(probe.format.duration) - 8) < 0.01, `${tier} fallback duration is eight seconds`);
  const mp4 = readFileSync(new URL(`./AI/assets/lumen/journey-${tier}.mp4`, import.meta.url));
  assert.ok(mp4.indexOf(Buffer.from('moov')) < mp4.indexOf(Buffer.from('mdat')), `${tier} fallback has fast-start metadata`);
}

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
assert.doesNotMatch(cards[0], /<video[^>]+\ssrc=/, 'Lumen fallback video has no eager src');
assert.match(cards[0], /assets\/lumen\/poster-mobile\.webp/);
assert.match(cards[0], /assets\/lumen\/poster-desktop\.webp/);
assert.match(cards[0], /assets\/lumen\/journey-mobile\.mp4/);
assert.match(cards[0], /assets\/lumen\/journey-desktop\.mp4/);
assert.match(cards[0], /id="lumen-location"[^>]*aria-hidden="true"/);
assert.match(cards[0], /id="lumen-playback"[^>]*hidden[^>]*>\s*Skip intro\s*</);
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
assert.match(controllerSource, /window\.LumenHero\s*=/, 'controller publishes the LumenHero API');
assert.match(controllerSource, /var base = ['"]assets\/lumen\/['"]/, 'controller resolves scene textures within the AI app');
assert.match(controllerSource, /fallBack\(['"]runtime['"],\s*attempt\)/, 'runtime render failures use the shared fallback');

const carouselSource = html.slice(html.indexOf("const scroller = document.getElementById('hero-scroll')"), html.indexOf('<!-- Based AI: Core Pillars'));
assert.match(carouselSource, /var lumenCard = cards\[0\];/, 'carousel names the Lumen card at index 0');
assert.match(carouselSource, /var labsVideoCard = cards\[1\];/, 'carousel names the Labs21 video card at index 1');
assert.match(carouselSource, /var productVideoCard = cards\[2\];/, 'carousel names the product video card at index 2');
assert.match(carouselSource, /cards\[i\]\.offsetLeft\s*-\s*scroller\.offsetLeft/, 'carousel scrolls to each card offset including gaps');
assert.doesNotMatch(carouselSource, /i\s*\*\s*scroller\.clientWidth/, 'carousel has no two-card width multiplication assumption');
assert.doesNotMatch(carouselSource, /var card\d?\s*=\s*cards\[[012]\]/, 'card-specific initializers use named card references');
assert.doesNotMatch(carouselSource, /cards\[[12]\]\.querySelector/, 'video initialization does not reach through positional card indices');

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
