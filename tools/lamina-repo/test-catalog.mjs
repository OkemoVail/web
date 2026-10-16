import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildCatalog,
  serializeCatalog,
  validateCatalog,
  verifyCatalog,
} from './catalog.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function keys() {
  const { privateKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

function application(overrides = {}) {
  return {
    id: 'com.okemo.lamina.config',
    name: 'Lamina Config',
    type: 'APPLICATION',
    androidPackage: 'com.okemo.statusbarcontrol',
    versionCode: 42,
    versionName: '1.4.2',
    downloadUrl: 'https://github.com/OkemoVail/Lamina/releases/download/config-v1.4.2/lamina-config.apk',
    size: 123456,
    sha256: SHA_A,
    signerSha256: SHA_B,
    compatibility: {
      profiles: ['pixel-9-pro-stock'],
      minSdk: 35,
      maxSdk: 36,
    },
    requires: [],
    conflicts: [],
    ...overrides,
  };
}

function overlay(overrides = {}) {
  return application({
    id: 'com.okemo.lamina.overlay.clean-clock',
    name: 'Clean Clock',
    type: 'RRO',
    androidPackage: 'com.okemo.lamina.overlay.cleanclock',
    versionCode: 7,
    versionName: '1.1.0',
    downloadUrl: 'https://github.com/OkemoVail/Lamina/releases/download/clean-clock-v1.1.0/clean-clock.apk',
    overlayTarget: 'com.android.systemui',
    requires: [{ id: 'com.okemo.lamina.config', minVersionCode: 40 }],
    ...overrides,
  });
}

function definition(packages = [application(), overlay()]) {
  return {
    schema: 1,
    sourceId: 'lamina-bootstrap',
    sourceRole: 'BOOTSTRAP_PROFILE',
    publishedAt: '2026-10-16T12:00:00.000Z',
    packages,
  };
}

function clone(value) {
  return structuredClone(value);
}

function temporaryDirectory() {
  const preferred = process.env.RUNNER_TEMP
    ?? process.env.OPENCODE_TMPDIR
    ?? join(tmpdir(), 'opencode');
  mkdirSync(preferred, { recursive: true });
  return mkdtempSync(join(preferred, 'lamina-catalog-'));
}

test('builds and verifies an exact-byte Ed25519 catalog envelope', () => {
  const catalog = definition();
  const { privateKeyPem } = keys();
  const built = buildCatalog(catalog, privateKeyPem);

  assert.deepEqual(Object.keys(built.envelope), [
    'schema',
    'algorithm',
    'payload',
    'signature',
  ]);
  assert.equal(built.envelope.schema, 1);
  assert.equal(built.envelope.algorithm, 'Ed25519');
  assert.equal(
    Buffer.from(built.envelope.payload, 'base64').toString('utf8'),
    serializeCatalog(catalog),
  );
  assert.match(built.publicKeyDerBase64, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.match(built.fingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    verifyCatalog(built.envelope, built.publicKeyDerBase64),
    catalog,
  );
});

test('rejects a catalog payload changed after signing', () => {
  const { privateKeyPem } = keys();
  const built = buildCatalog(definition(), privateKeyPem);
  const tampered = clone(built.envelope);
  const payload = Buffer.from(tampered.payload, 'base64');
  payload[payload.length - 2] ^= 1;
  tampered.payload = payload.toString('base64');

  assert.throws(
    () => verifyCatalog(tampered, built.publicKeyDerBase64),
    /signature/i,
  );
});

test('rejects duplicate package IDs', () => {
  const duplicate = application({ versionCode: 43 });
  assert.throws(
    () => validateCatalog(definition([application(), duplicate])),
    /duplicate package id/i,
  );
});

test('rejects malformed package and signer SHA-256 digests', () => {
  assert.throws(
    () => validateCatalog(definition([application({ sha256: 'ABC123' })])),
    /sha256/i,
  );
  assert.throws(
    () => validateCatalog(definition([application({ signerSha256: '' })])),
    /signerSha256/i,
  );
});

test('rejects non-HTTPS and mutable release download URLs', () => {
  assert.throws(
    () => validateCatalog(definition([application({
      downloadUrl: 'http://github.com/OkemoVail/Lamina/releases/download/config-v1.4.2/lamina-config.apk',
    })])),
    /HTTPS/i,
  );
  assert.throws(
    () => validateCatalog(definition([application({
      downloadUrl: 'https://github.com/OkemoVail/Lamina/releases/latest/download/lamina-config.apk',
    })])),
    /immutable GitHub Release/i,
  );
});

test('rejects an unresolved same-source dependency', () => {
  const item = application({
    requires: [{ id: 'com.okemo.lamina.missing', minVersionCode: 1 }],
  });
  assert.throws(
    () => validateCatalog(definition([item])),
    /unknown same-source dependency/i,
  );
});

test('allows a dependency explicitly assigned to another source', () => {
  const item = application({
    requires: [{
      id: 'com.okemo.lamina.runtime',
      sourceId: 'lamina-bootstrap',
      minVersionCode: 3,
    }],
  });
  const catalog = definition([item]);
  catalog.sourceId = 'lamina-customizations';
  catalog.sourceRole = 'CUSTOMIZATIONS';
  assert.doesNotThrow(() => validateCatalog(catalog));
});

test('rejects same-source dependency cycles', () => {
  const first = application({
    id: 'com.okemo.lamina.first',
    androidPackage: 'com.okemo.lamina.first',
    requires: [{ id: 'com.okemo.lamina.second', minVersionCode: 1 }],
  });
  const second = application({
    id: 'com.okemo.lamina.second',
    androidPackage: 'com.okemo.lamina.second',
    requires: [{ id: 'com.okemo.lamina.first', minVersionCode: 1 }],
  });
  assert.throws(
    () => validateCatalog(definition([first, second])),
    /dependency cycle/i,
  );
});

test('rejects a package that both requires and conflicts with another package', () => {
  const item = overlay({ conflicts: ['com.okemo.lamina.config'] });
  assert.throws(
    () => validateCatalog(definition([application(), item])),
    /both requires and conflicts/i,
  );
});

test('enforces package-type-specific fields', () => {
  const rroWithoutTarget = overlay();
  delete rroWithoutTarget.overlayTarget;
  assert.throws(
    () => validateCatalog(definition([rroWithoutTarget])),
    /overlayTarget/i,
  );

  assert.throws(
    () => validateCatalog(definition([application({ overlayTarget: 'com.android.systemui' })])),
    /APPLICATION.*overlayTarget/i,
  );

  assert.throws(
    () => validateCatalog(definition([application({ type: 'ARCHIVE' })])),
    /type/i,
  );
});

test('requires canonical package fields and compatibility constraints', () => {
  assert.throws(
    () => validateCatalog(definition([application({ versionCode: 0 })])),
    /versionCode/i,
  );
  assert.throws(
    () => validateCatalog(definition([application({ compatibility: { profiles: [] } })])),
    /profiles/i,
  );
  assert.throws(
    () => validateCatalog(definition([application({ androidPackage: 'Not a package' })])),
    /androidPackage/i,
  );
});

test('rejects the wrong public key and malformed envelopes', () => {
  const first = keys();
  const second = keys();
  const built = buildCatalog(definition(), first.privateKeyPem);
  const secondBuilt = buildCatalog(definition(), second.privateKeyPem);

  assert.throws(
    () => verifyCatalog(built.envelope, secondBuilt.publicKeyDerBase64),
    /signature/i,
  );
  assert.throws(
    () => verifyCatalog({ ...built.envelope, algorithm: 'Ed448' }, built.publicKeyDerBase64),
    /algorithm/i,
  );
});

test('build CLI refuses a missing secret without creating an index', (t) => {
  const directory = temporaryDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const input = join(directory, 'packages.json');
  const output = join(directory, 'index.json');
  writeFileSync(input, `${JSON.stringify(definition())}\n`, 'utf8');

  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('./build-catalog.mjs', import.meta.url)),
    '--input', input,
    '--output', output,
    '--private-key-env', 'DELIBERATELY_MISSING_LAMINA_KEY',
  ], {
    encoding: 'utf8',
    env: { ...process.env, DELIBERATELY_MISSING_LAMINA_KEY: '' },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /environment variable is unset/i);
  assert.equal(existsSync(output), false);
});

test('build and verify CLIs use an explicit pinned public key', (t) => {
  const directory = temporaryDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const input = join(directory, 'packages.json');
  const output = join(directory, 'index.json');
  const privateKeyPath = join(directory, 'private.pem');
  const publicKeyPath = join(directory, 'public-key.txt');
  const wrongPublicKeyPath = join(directory, 'wrong-public-key.txt');
  const { privateKeyPem } = keys();
  const wrong = buildCatalog(definition(), keys().privateKeyPem);
  writeFileSync(input, `${JSON.stringify(definition())}\n`, 'utf8');
  writeFileSync(privateKeyPath, privateKeyPem, { encoding: 'utf8', mode: 0o600 });
  writeFileSync(wrongPublicKeyPath, `${wrong.publicKeyDerBase64}\n`, 'utf8');

  const buildResult = spawnSync(process.execPath, [
    fileURLToPath(new URL('./build-catalog.mjs', import.meta.url)),
    '--input', input,
    '--output', output,
    '--private-key-file', privateKeyPath,
    '--public-key-output', publicKeyPath,
  ], { encoding: 'utf8' });
  assert.equal(buildResult.status, 0, buildResult.stderr);
  assert.doesNotThrow(() => JSON.parse(readFileSync(output, 'utf8')));

  const verifyResult = spawnSync(process.execPath, [
    fileURLToPath(new URL('./verify-catalog.mjs', import.meta.url)),
    '--input', output,
    '--public-key-file', publicKeyPath,
  ], { encoding: 'utf8' });
  assert.equal(verifyResult.status, 0, verifyResult.stderr);
  assert.match(verifyResult.stdout, /Verified lamina-bootstrap: 2 package/);

  const wrongKeyResult = spawnSync(process.execPath, [
    fileURLToPath(new URL('./verify-catalog.mjs', import.meta.url)),
    '--input', output,
    '--public-key-file', wrongPublicKeyPath,
  ], { encoding: 'utf8' });
  assert.notEqual(wrongKeyResult.status, 0);
  assert.match(wrongKeyResult.stderr, /signature verification failed/i);
});

test('CLIs reject unknown arguments instead of silently ignoring typos', async () => {
  const { parseBuildArguments } = await import('./build-catalog.mjs');
  const { parseVerifyArguments } = await import('./verify-catalog.mjs');
  assert.throws(
    () => parseBuildArguments([
      '--input', 'packages.json',
      '--output', 'index.json',
      '--private-key-env', 'KEY',
      '--typo', 'ignored',
    ]),
    /unknown argument/i,
  );
  assert.throws(
    () => parseVerifyArguments([
      '--input', 'index.json',
      '--public-key-file', 'key.txt',
      '--typo', 'ignored',
    ]),
    /unknown argument/i,
  );
});
