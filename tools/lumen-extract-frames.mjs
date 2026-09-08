import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'tools', 'snapshots', 'after');
const ffmpeg = process.env.FFMPEG_PATH || 'C:\\Users\\okemo\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Shared_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build-shared\\bin\\ffmpeg.exe';
const frames = [['solar', 500], ['terra', 3500], ['luna', 5750], ['held', 7900]];
const manifest = {
  command: 'ffmpeg -v info -y -i <video> -ss <seconds> -frames:v 1 -vf showinfo -f image2 -c:v png <snapshot>',
  ffmpegVersion: execFileSync(ffmpeg, ['-version'], { encoding: 'utf8' }).split(/\r?\n/)[0],
  frames: frames.map(([phase, timestampMs]) => ({ phase, timestampMs })),
  outputs: [],
};

mkdirSync(output, { recursive: true });
for (const tier of ['mobile', 'desktop']) {
  const video = resolve(root, 'AI', 'assets', 'lumen', `journey-${tier}.mp4`);
  for (const [phase, timestampMs] of frames) {
    const destination = resolve(output, `lumen-${tier}-${phase}-${timestampMs}ms.png`);
    const extraction = spawnSync(ffmpeg, [
      '-v', 'info', '-y', '-i', video, '-ss', (timestampMs / 1000).toFixed(3),
      '-frames:v', '1', '-vf', 'showinfo', '-f', 'image2', '-c:v', 'png', destination,
    ], { encoding: 'utf8' });
    if (extraction.status !== 0) throw new Error(extraction.stderr || `FFmpeg exited ${extraction.status}`);
    const decodedTimestamp = [...extraction.stderr.matchAll(/pts_time:([\d.]+)/g)].at(-1);
    if (!decodedTimestamp) throw new Error(`FFmpeg did not report a decoded timestamp for ${destination}`);
    const image = sharp(destination);
    const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
    manifest.outputs.push({
      tier,
      phase,
      timestampMs,
      sourceFrameTimestampMs: Math.round(Number(decodedTimestamp[1]) * 1000),
      width: metadata.width,
      height: metadata.height,
      entropy: stats.entropy,
      file: `lumen-${tier}-${phase}-${timestampMs}ms.png`,
    });
  }
}
writeFileSync(resolve(output, 'lumen-frame-extraction.json'), `${JSON.stringify(manifest, null, 2)}\n`);
