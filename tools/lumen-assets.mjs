import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { acceptMediaTransaction } from './lumen-media-transaction.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(join(root, 'tools/lumen-assets.json'), 'utf8'));
const configPath = join(root, 'tools/lumen-assets.json');
const cacheDir = 'C:\\Users\\okemo\\AppData\\Local\\Temp\\opencode\\lumen-sources';
const outputDir = join(root, 'AI/assets/lumen');
const stageDir = join(cacheDir, 'media-stage');
const mediaNames = ['poster-mobile.webp', 'poster-desktop.webp', 'journey-mobile.mp4', 'journey-desktop.mp4'];
const allowMedia = process.argv.includes('--media');
const acceptMedia = process.argv.includes('--accept-media');
const blenderPath = process.env.BLENDER_PATH || 'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe';
const ffmpegPath = process.env.FFMPEG_PATH || 'C:\\Users\\okemo\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Shared_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build-shared\\bin\\ffmpeg.exe';
const ffprobePath = process.env.FFPROBE_PATH || join(ffmpegPath, '..', 'ffprobe.exe');
const allSourceIds = config.sources.map(({ id }) => id);

await mkdir(cacheDir, { recursive: true });
await mkdir(outputDir, { recursive: true });
await mkdir(join(root, 'AI/vendor'), { recursive: true });

const digest = (data) => createHash('sha256').update(data).digest('hex');
const readDigest = async (path) => digest(await readFile(path));

function run(command, args, capture = false) {
  const child = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${command} exited with ${child.status}: ${child.stderr || ''}`);
  return child.stdout || '';
}

async function verifyTool(path, expectedHash, versionArgs, expectedVersion, capabilityArgs, capability) {
  const actualHash = await readDigest(path);
  if (actualHash !== expectedHash) throw new Error(`tool checksum mismatch for ${path}: ${actualHash}`);
  const version = run(path, versionArgs, true);
  if (!version.includes(expectedVersion)) throw new Error(`unexpected tool version for ${path}`);
  if (capabilityArgs && !run(path, capabilityArgs, true).includes(capability)) throw new Error(`${path} lacks ${capability}`);
}

async function fetchPinned(url, id, redirects = 0) {
  if (redirects > 5) throw new Error(`${id} exceeded the HTTPS redirect limit`);
  const response = await fetch(url, { redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error(`${id} returned a redirect without a location`);
    const next = new URL(location, url);
    if (next.protocol !== 'https:') throw new Error(`${id} redirected outside HTTPS`);
    return fetchPinned(next, id, redirects + 1);
  }
  return response;
}

async function download(source, destination) {
  try {
    const cached = await readFile(destination);
    if (digest(cached) === source.sha256) return cached;
  } catch {}
  const response = await fetchPinned(source.url, source.id);
  if (!response.ok) throw new Error(`${source.id} download failed: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const actual = digest(data);
  if (actual !== source.sha256) throw new Error(`${source.id} checksum mismatch: ${actual}`);
  await writeFile(destination, data);
  return data;
}

async function writeTexture(input, name, width, options = {}) {
  let image = sharp(input).resize(width, width / 2, { fit: 'fill', kernel: sharp.kernel.lanczos3 });
  if (options.cloudAlpha) {
    const alpha = await image.clone().greyscale().linear(1.35, -18).toBuffer();
    image = image.ensureAlpha().joinChannel(alpha);
  }
  await image.webp({ quality: options.quality || 82, alphaQuality: 88, smartSubsample: true }).toFile(join(outputDir, name));
}

async function normalMap(input, name, width, strength) {
  const { data, info } = await sharp(input).resize(width, width / 2, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(info.width * info.height * 3);
  const at = (x, y) => data[Math.max(0, Math.min(info.height - 1, y)) * info.width + ((x + info.width) % info.width)];
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength / 255;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength / 255;
    const length = Math.hypot(dx, dy, 1);
    const offset = (y * info.width + x) * 3;
    output[offset] = Math.round(127.5 * (1 - dx / length));
    output[offset + 1] = Math.round(127.5 * (1 + dy / length));
    output[offset + 2] = Math.round(127.5 * (1 + 1 / length));
  }
  await sharp(output, { raw: { width: info.width, height: info.height, channels: 3 } }).webp({ quality: 82 }).toFile(join(outputDir, name));
}

async function moonEquirect(nearInput, farInput, width) {
  const size = Math.min(width / 2, 1024);
  const near = await sharp(nearInput).resize(size, size).removeAlpha().raw().toBuffer();
  const far = await sharp(farInput).resize(size, size).removeAlpha().raw().toBuffer();
  const height = width / 2;
  const output = Buffer.alloc(width * height * 3);
  const sample = (image, u, v) => {
    const x = Math.max(0, Math.min(size - 1, Math.round(u * (size - 1))));
    const y = Math.max(0, Math.min(size - 1, Math.round(v * (size - 1))));
    return image.subarray((y * size + x) * 3, (y * size + x) * 3 + 3);
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const latitude = Math.PI / 2 - Math.PI * (y + 0.5) / height;
    const longitude = 2 * Math.PI * (x + 0.5) / width - Math.PI;
    const front = Math.cos(longitude) >= 0;
    const projectedX = Math.cos(latitude) * Math.sin(longitude);
    const pixel = sample(front ? near : far, 0.5 + (front ? projectedX : -projectedX) * 0.48, 0.5 - Math.sin(latitude) * 0.48);
    pixel.copy(output, (y * width + x) * 3);
  }
  return { data: output, raw: { width, height, channels: 3 } };
}

function probeMedia(path, expected) {
  const probe = JSON.parse(run(ffprobePath, ['-v', 'error', '-count_frames', '-show_entries', 'format=duration:stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,nb_read_frames', '-of', 'json', path], true));
  if (probe.streams.length !== 1) throw new Error(`${path} must contain exactly one stream`);
  const stream = probe.streams[0];
  if (stream.codec_type !== 'video' || stream.codec_name !== 'h264' || stream.pix_fmt !== 'yuv420p') throw new Error(`${path} codec contract failed`);
  if (stream.width !== expected.width || stream.height !== expected.height || stream.avg_frame_rate !== '30/1' || Number(stream.nb_read_frames) !== 240) throw new Error(`${path} timeline contract failed`);
  if (Math.abs(Number(probe.format.duration) - 8) >= 0.01) throw new Error(`${path} duration contract failed`);
  const bytes = Buffer.from(requireFastStart(path));
  if (bytes.indexOf(Buffer.from('moov')) > bytes.indexOf(Buffer.from('mdat'))) throw new Error(`${path} is not fast-start`);
}

function requireFastStart(path) {
  const read = spawnSync(process.execPath, ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(path)}))`], { encoding: null });
  if (read.status !== 0) throw new Error(`cannot read ${path}`);
  return read.stdout;
}

async function renderMedia() {
  const toolchain = config.reviewedMedia.toolchain;
  await verifyTool(blenderPath, toolchain.blenderSha256, ['--version'], toolchain.blenderVersion);
  await verifyTool(ffmpegPath, toolchain.ffmpegSha256, ['-version'], toolchain.ffmpegVersion, ['-hide_banner', '-encoders'], 'libx264');
  if (await readDigest(ffprobePath) !== toolchain.ffprobeSha256) throw new Error('ffprobe checksum mismatch');
  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });
  for (const target of [{ tier: 'desktop', width: 1600, height: 900, crf: '27' }, { tier: 'mobile', width: 900, height: 1200, crf: '28' }]) {
    const frames = join(stageDir, `frames-${target.tier}`);
    await mkdir(frames, { recursive: true });
    run(blenderPath, ['--background', '--python', join(root, 'tools/lumen-render.py'), '--', '--root', root, '--output', frames, '--width', String(target.width), '--height', String(target.height)]);
    const renderedFrames = (await readdir(frames)).filter((name) => /^\d{4}\.png$/.test(name));
    if (renderedFrames.length !== 240) throw new Error(`Blender produced ${renderedFrames.length} of 240 ${target.tier} frames`);
    const video = join(stageDir, `journey-${target.tier}.mp4`);
    run(ffmpegPath, ['-y', '-framerate', '30', '-start_number', '1', '-i', join(frames, '%04d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', target.crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', video]);
    await sharp(join(frames, '0240.png')).webp({ quality: 84, smartSubsample: true }).toFile(join(stageDir, `poster-${target.tier}.webp`));
    probeMedia(video, target);
  }
  for (const name of mediaNames) {
    const hash = await readDigest(join(stageDir, name));
    if (!acceptMedia && config.reviewedMedia.files[name] !== hash) throw new Error(`${name} staged hash ${hash} is not approved; visually review then run --media --accept-media and pin it`);
    if (acceptMedia) config.reviewedMedia.files[name] = hash;
  }
  await acceptMediaTransaction({
    mediaNames,
    stagedDir: stageDir,
    deployedDir: outputDir,
    configPath,
    nextConfig: config,
    validate: async (directory) => {
      for (const target of [{ tier: 'desktop', width: 1600, height: 900 }, { tier: 'mobile', width: 900, height: 1200 }]) {
        const videoName = directory === outputDir ? `journey-${target.tier}.mp4` : `journey-${target.tier}.mp4.new`;
        probeMedia(join(directory, videoName), target);
        const posterName = directory === outputDir ? `poster-${target.tier}.webp` : `poster-${target.tier}.webp.new`;
        const metadata = await sharp(join(directory, posterName)).metadata();
        if (metadata.width !== target.width || metadata.height !== target.height) throw new Error(`${posterName} dimensions failed`);
      }
    },
  });
}

const sources = Object.fromEntries(config.sources.map((source) => [source.id, source]));
const inputs = {};
for (const source of config.sources) {
  const destination = join(cacheDir, `${source.id}${extname(new URL(source.url).pathname) || '.source'}`);
  inputs[source.id] = await download(source, destination);
}
for (const [tier, width] of Object.entries({ mobile: 1024, desktop: 2048 })) {
  await writeTexture(inputs.earthDay, `earth-day-${tier}.webp`, width);
  await writeTexture(inputs.earthNight, `earth-night-${tier}.webp`, width, { quality: 80 });
  await writeTexture(inputs.earthClouds, `earth-clouds-${tier}.webp`, width, { cloudAlpha: true, quality: 78 });
  await normalMap(inputs.earthElevation, `earth-normal-${tier}.webp`, width, 0.55);
  const moon = await moonEquirect(inputs.moonNear, inputs.moonFar, width);
  const moonBuffer = await sharp(moon.data, { raw: moon.raw }).webp({ quality: 84 }).toBuffer();
  await writeFile(join(outputDir, `moon-albedo-${tier}.webp`), moonBuffer);
  await normalMap(moonBuffer, `moon-normal-${tier}.webp`, width, 0.7);
}
await copyFile(join(root, 'node_modules/three/build/three.module.min.js'), join(root, 'AI/vendor/three.module.min.js'));
await copyFile(join(root, 'node_modules/three/build/three.core.min.js'), join(root, 'AI/vendor/three.core.min.js'));
await copyFile(join(root, 'node_modules/three/LICENSE'), join(root, 'AI/vendor/three-LICENSE.txt'));
if (allowMedia) await renderMedia();

const outputSources = {
  'earth-day': ['earthDay'], 'earth-night': ['earthNight'], 'earth-clouds': ['earthClouds'], 'earth-normal': ['earthElevation'],
  'moon-albedo': ['moonNear', 'moonFar'], 'moon-normal': ['moonNear', 'moonFar'],
};
const files = {};
for (const [family, sourceIds] of Object.entries(outputSources)) for (const tier of ['mobile', 'desktop']) {
  const name = `${family}-${tier}.webp`;
  const data = await readFile(join(outputDir, name));
  files[name] = { bytes: data.length, sha256: digest(data), sources: sourceIds, source: sources[sourceIds[0]].page };
}
for (const name of ['three.module.min.js', 'three.core.min.js']) {
  const data = await readFile(join(root, 'AI/vendor', name));
  files[name] = { bytes: data.length, sha256: digest(data), source: 'https://www.npmjs.com/package/three' };
}
for (const name of mediaNames) {
  const data = await readFile(join(outputDir, name));
  const hash = digest(data);
  if (config.reviewedMedia.files[name] !== hash) throw new Error(`${name} differs from its immutable reviewed hash: ${hash}`);
  files[name] = { bytes: data.length, sha256: hash, sources: allSourceIds, source: config.sources[0].page, immutable: true };
}
await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify({ files, media: { fps: 30, duration: 8, desktop: { width: 1600, height: 900 }, mobile: { width: 900, height: 1200 }, toolchain: config.reviewedMedia.toolchain } }, null, 2)}\n`);
for (const [name, entry] of Object.entries(files)) console.log(`${name} ${entry.bytes} ${entry.sha256}`);
