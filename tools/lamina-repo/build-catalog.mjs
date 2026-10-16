#!/usr/bin/env node
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCatalog, verifyCatalog } from './catalog.mjs';

export function parseBuildArguments(args) {
  const options = new Map();
  const allowed = new Set([
    '--input',
    '--output',
    '--private-key-file',
    '--private-key-env',
    '--public-key-output',
    '--fingerprint-output',
  ]);
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
  for (const required of ['--input', '--output']) {
    if (!options.has(required)) throw new Error(`Missing required argument: ${required}`);
  }
  const keyOptions = ['--private-key-file', '--private-key-env'].filter((key) => options.has(key));
  if (keyOptions.length !== 1) {
    throw new Error('Supply exactly one of --private-key-file or --private-key-env');
  }
  return options;
}

function atomicWrite(path, contents) {
  const destination = resolve(path);
  const temporary = resolve(dirname(destination), `.${process.pid}-${Date.now()}.tmp`);
  writeFileSync(temporary, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  renameSync(temporary, destination);
}

export function main(args = process.argv.slice(2), environment = process.env) {
  const options = parseBuildArguments(args);
  const definition = JSON.parse(readFileSync(resolve(options.get('--input')), 'utf8'));
  let privateKeyPem;
  if (options.has('--private-key-file')) {
    privateKeyPem = readFileSync(resolve(options.get('--private-key-file')), 'utf8');
  } else {
    const variable = options.get('--private-key-env');
    privateKeyPem = environment[variable];
    if (!privateKeyPem) throw new Error(`Required private-key environment variable is unset: ${variable}`);
  }

  const built = buildCatalog(definition, privateKeyPem);
  verifyCatalog(built.envelope, built.publicKeyDerBase64);
  atomicWrite(options.get('--output'), `${JSON.stringify(built.envelope, null, 2)}\n`);
  if (options.has('--public-key-output')) {
    atomicWrite(options.get('--public-key-output'), `${built.publicKeyDerBase64}\n`);
  }
  if (options.has('--fingerprint-output')) {
    atomicWrite(options.get('--fingerprint-output'), `${built.fingerprint}\n`);
  }
  process.stdout.write(`Built and verified ${options.get('--output')} (${built.fingerprint})\n`);
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
