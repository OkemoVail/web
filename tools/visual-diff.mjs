#!/usr/bin/env node
// tools/visual-diff.mjs [pageNameFilter]
// Pixel-diffs tools/snapshots/before vs after. Prints %diff; flags > 2%.
// This is a REVIEW AID, not a gate — inspect any flagged pair by eye.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const filter = process.argv[2];
const before = 'tools/snapshots/before', after = 'tools/snapshots/after';
const files = fs.readdirSync(before).filter(f => f.endsWith('.png') && (!filter || f.startsWith(filter)));
let flagged = 0;
for (const f of files) {
  const aPath = path.join(after, f);
  if (!fs.existsSync(aPath)) { console.log(`MISSING after/${f}`); flagged++; continue; }
  const a = PNG.sync.read(fs.readFileSync(path.join(before, f)));
  const b = PNG.sync.read(fs.readFileSync(aPath));
  if (a.width !== b.width || a.height !== b.height) { console.log(`SIZE DIFF ${f}: ${a.width}x${a.height} vs ${b.width}x${b.height} — REVIEW`); flagged++; continue; }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.12 });
  const pct = (100 * n / (a.width * a.height)).toFixed(3);
  const flag = pct > 2 ? '  <-- REVIEW' : '';
  if (pct > 2) flagged++;
  console.log(`${f}: ${pct}% differ${flag}`);
  if (pct > 2) fs.writeFileSync(`tools/snapshots/diff-${f}`, PNG.sync.write(diff));
}
console.log(flagged ? `\n${flagged} pair(s) flagged — open tools/snapshots/diff-*.png and both originals` : '\nall pairs within threshold');
