import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(join(root, 'tools/lumen-assets.json'), 'utf8'));
const cacheDir = 'C:\\Users\\okemo\\AppData\\Local\\Temp\\opencode\\lumen-sources';
const outputDir = join(root, 'AI/assets/lumen');
const mediaNames = ['poster-mobile.webp', 'poster-desktop.webp', 'journey-mobile.mp4', 'journey-desktop.mp4'];
const allowMedia = process.argv.includes('--media');
const blenderPath = process.env.BLENDER_PATH || 'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe';
const ffmpegPath = process.env.FFMPEG_PATH || 'C:\\Program Files\\Softdeluxe\\Free Download Manager\\ffmpeg.exe';

await mkdir(cacheDir, { recursive: true });
await mkdir(outputDir, { recursive: true });
await mkdir(join(root, 'AI/vendor'), { recursive: true });

function digest(data) {
  return createHash('sha256').update(data).digest('hex');
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
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength / 255;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength / 255;
      const length = Math.hypot(dx, dy, 1);
      const offset = (y * info.width + x) * 3;
      output[offset] = Math.round(127.5 * (1 - dx / length));
      output[offset + 1] = Math.round(127.5 * (1 + dy / length));
      output[offset + 2] = Math.round(127.5 * (1 + 1 / length));
    }
  }
  await sharp(output, { raw: { width: info.width, height: info.height, channels: 3 } }).webp({ quality: 82 }).toFile(join(outputDir, name));
}

async function moonEquirect(nearInput, farInput, width) {
  const size = Math.min(width / 2, 1024);
  const near = await sharp(nearInput).resize(size, size).removeAlpha().raw().toBuffer();
  const far = await sharp(farInput).resize(size, size).removeAlpha().raw().toBuffer();
  const output = Buffer.alloc(width * (width / 2) * 3);
  const sample = (image, u, v) => {
    const x = Math.max(0, Math.min(size - 1, Math.round(u * (size - 1))));
    const y = Math.max(0, Math.min(size - 1, Math.round(v * (size - 1))));
    const offset = (y * size + x) * 3;
    return [image[offset], image[offset + 1], image[offset + 2]];
  };
  const height = width / 2;
  for (let y = 0; y < height; y += 1) {
    const latitude = Math.PI / 2 - Math.PI * (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const longitude = 2 * Math.PI * (x + 0.5) / width - Math.PI;
      const front = Math.cos(longitude) >= 0;
      const projectedX = Math.cos(latitude) * Math.sin(longitude);
      const projectedY = Math.sin(latitude);
      const u = 0.5 + (front ? projectedX : -projectedX) * 0.48;
      const v = 0.5 - projectedY * 0.48;
      const pixel = sample(front ? near : far, u, v);
      const offset = (y * width + x) * 3;
      output[offset] = pixel[0];
      output[offset + 1] = pixel[1];
      output[offset + 2] = pixel[2];
    }
  }
  return { data: output, raw: { width, height, channels: 3 } };
}

function run(command, args) {
  const process = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if (process.error) throw process.error;
  if (process.status !== 0) throw new Error(`${command} exited with ${process.status}`);
}

async function renderMedia() {
  const renderRoot = join(cacheDir, 'render');
  const targets = [
    { tier: 'desktop', width: 1600, height: 900, bitrate: '4200k' },
    { tier: 'mobile', width: 900, height: 1200, bitrate: '2100k' },
  ];
  for (const target of targets) {
    const frames = join(renderRoot, target.tier);
    await rm(frames, { recursive: true, force: true });
    await mkdir(frames, { recursive: true });
    run(blenderPath, ['--background', '--python', join(root, 'tools/lumen-render.py'), '--', '--root', root, '--output', frames, '--width', String(target.width), '--height', String(target.height)]);
    run(ffmpegPath, ['-y', '-framerate', '30', '-start_number', '1', '-i', join(frames, '%04d.png'), '-c:v', 'h264_mf', '-b:v', target.bitrate, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(outputDir, `journey-${target.tier}.mp4`)]);
    await sharp(join(frames, '0240.png')).webp({ quality: 84, smartSubsample: true }).toFile(join(outputDir, `poster-${target.tier}.webp`));
  }
}

const sources = Object.fromEntries(config.sources.map((source) => [source.id, source]));
const inputs = {};
for (const source of config.sources) {
  const suffix = extname(new URL(source.url).pathname) || '.source';
  const destination = join(cacheDir, `${source.id}${suffix}`);
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
await copyFile(join(root, 'node_modules/three/LICENSE'), join(root, 'AI/vendor/three-LICENSE.txt'));

if (allowMedia) await renderMedia();

const sourceByOutput = {
  'earth-day': sources.earthDay.page,
  'earth-night': sources.earthNight.page,
  'earth-clouds': sources.earthClouds.page,
  'earth-normal': sources.earthElevation.page,
  'moon-albedo': sources.moonNear.page,
  'moon-normal': sources.moonFar.page,
};
const files = {};
for (const family of Object.keys(sourceByOutput)) {
  for (const tier of ['mobile', 'desktop']) {
    const name = `${family}-${tier}.webp`;
    const data = await readFile(join(outputDir, name));
    files[name] = { bytes: data.length, sha256: digest(data), source: sourceByOutput[family] };
  }
}

for (const name of mediaNames) {
  try {
    const data = await readFile(join(outputDir, name));
    files[name] = { bytes: data.length, sha256: digest(data), source: 'https://science.nasa.gov/resource/moon-mosaic/' };
  } catch {
    if (allowMedia) throw new Error(`--media requires reviewed render output: ${name}`);
  }
}

await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify({ files, media: { fps: 30, duration: 8, desktop: { width: 1600, height: 900 }, mobile: { width: 900, height: 1200 } } }, null, 2)}\n`);
for (const [name, entry] of Object.entries(files)) console.log(`${name} ${entry.bytes} ${entry.sha256}`);
console.log(`Media outputs are ${allowMedia ? 'required' : 'preserved when present'}.`);
