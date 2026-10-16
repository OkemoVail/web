#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyCatalog } from './catalog.mjs';

export function parseVerifyArguments(args) {
  const options = new Map();
  const allowed = new Set(['--input', '--public-key-file']);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || value === undefined) {
      throw new Error('Arguments must be supplied as --name value pairs');
    }
    if (!allowed.has(name)) throw new Error(`Unknown argument: ${name}`);
    if (options.has(name)) throw new Error(`Duplicate argument: ${name}`);
    options.set(name, value);
  }
  for (const required of ['--input', '--public-key-file']) {
    if (!options.has(required)) throw new Error(`Missing required argument: ${required}`);
  }
  return options;
}

export function main(args = process.argv.slice(2)) {
  const options = parseVerifyArguments(args);
  const envelope = JSON.parse(readFileSync(resolve(options.get('--input')), 'utf8'));
  const publicKeyDerBase64 = readFileSync(
    resolve(options.get('--public-key-file')),
    'utf8',
  ).trim();
  const catalog = verifyCatalog(envelope, publicKeyDerBase64);
  process.stdout.write(
    `Verified ${catalog.sourceId}: ${catalog.packages.length} package(s), published ${catalog.publishedAt}\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
