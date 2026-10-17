import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { validateCatalog, verifyCatalog } from './tools/lamina-repo/catalog.mjs';

function text(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function descriptor(path) {
  return JSON.parse(text(path));
}

test('leaves the custom domain to Cloudflare Pages', () => {
  assert.equal(existsSync(new URL('./CNAME', import.meta.url)), false,
    'a GitHub Pages CNAME could interfere with the existing Pages configuration');
});

test('disables Cloudflare Pages SPA fallback for missing catalogs', () => {
  const notFound = text('./404.html');
  assert.match(notFound, /<!doctype html>/i);
  assert.match(notFound, /not found/i);
});

test('publishes distinct canonical source descriptors', () => {
  const bootstrap = descriptor('./bootstrap/repository.json');
  const customizations = descriptor('./repo/repository.json');

  assert.deepEqual(
    {
      schema: bootstrap.schema,
      id: bootstrap.id,
      role: bootstrap.role,
      canonicalUrl: bootstrap.canonicalUrl,
      indexUrl: bootstrap.indexUrl,
    },
    {
      schema: 1,
      id: 'lamina-bootstrap',
      role: 'BOOTSTRAP_PROFILE',
      canonicalUrl: 'https://repo.okemovail.com/bootstrap/',
      indexUrl: 'https://repo.okemovail.com/bootstrap/index.json',
    },
  );
  assert.deepEqual(
    {
      schema: customizations.schema,
      id: customizations.id,
      role: customizations.role,
      canonicalUrl: customizations.canonicalUrl,
      indexUrl: customizations.indexUrl,
    },
    {
      schema: 1,
      id: 'lamina-customizations',
      role: 'CUSTOMIZATIONS',
      canonicalUrl: 'https://repo.okemovail.com/repo/',
      indexUrl: 'https://repo.okemovail.com/repo/index.json',
    },
  );
  assert.notEqual(bootstrap.id, customizations.id);
  assert.notEqual(bootstrap.role, customizations.role);
});

test('keeps both official sources coherently pending or independently signed', () => {
  const sources = [
    { directory: 'bootstrap', id: 'lamina-bootstrap', role: 'BOOTSTRAP_PROFILE' },
    { directory: 'repo', id: 'lamina-customizations', role: 'CUSTOMIZATIONS' },
  ];
  const activeSources = [];

  for (const source of sources) {
    const definition = descriptor(`./${source.directory}/packages.json`);
    assert.equal(definition.sourceId, source.id);
    assert.equal(definition.sourceRole, source.role);
    assert.doesNotThrow(() => validateCatalog(definition));

    const trustPaths = [
      `./${source.directory}/index.json`,
      `./${source.directory}/public-key.txt`,
      `./${source.directory}/public-key.sha256`,
    ];
    const present = trustPaths.map((path) => existsSync(new URL(path, import.meta.url)));
    assert.ok(present.every(Boolean) || present.every((value) => !value),
      `${source.directory} trust artifacts must be all present or all absent`);

    const repository = descriptor(`./${source.directory}/repository.json`);
    if (!present[0]) {
      assert.equal(repository.status, 'KEYS_PENDING');
      continue;
    }

    assert.equal(repository.status, 'ACTIVE');
    const publicKey = text(`./${source.directory}/public-key.txt`).trim();
    const publicKeyBytes = Buffer.from(publicKey, 'base64');
    const fingerprint = text(`./${source.directory}/public-key.sha256`).trim();
    assert.equal(createHash('sha256').update(publicKeyBytes).digest('hex'), fingerprint);
    const catalog = verifyCatalog(
      descriptor(`./${source.directory}/index.json`),
      publicKey,
    );
    assert.deepEqual(catalog, definition);
    activeSources.push({ ...source, publicKey });
  }

  assert.ok(activeSources.length === 0 || activeSources.length === sources.length,
    'official sources must activate together');
  if (activeSources.length === 2) {
    assert.notEqual(activeSources[0].publicKey, activeSources[1].publicKey);
    const bootstrapEnvelope = descriptor('./bootstrap/index.json');
    const repoEnvelope = descriptor('./repo/index.json');
    assert.throws(
      () => verifyCatalog(bootstrapEnvelope, activeSources[1].publicKey),
      /signature verification failed/i,
    );
    assert.throws(
      () => verifyCatalog(repoEnvelope, activeSources[0].publicKey),
      /signature verification failed/i,
    );
  }
});

test('publishes catalogs only through a protected manual workflow', () => {
  const workflow = text('./.github/workflows/publish-lamina-catalogs.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.equal((workflow.match(/if:\s*github\.ref == 'refs\/heads\/main'/g) ?? []).length, 3);
  assert.match(workflow, /environment:\s*lamina-bootstrap-production/);
  assert.match(workflow, /environment:\s*lamina-repo-production/);
  assert.match(workflow, /LAMINA_BOOTSTRAP_ED25519_PKCS8/);
  assert.match(workflow, /LAMINA_REPO_ED25519_PKCS8/);
  assert.doesNotMatch(workflow, /pull_request_target|workflow_run/);
  const actionReferences = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)]
    .map((match) => match[1]);
  assert.ok(actionReferences.length > 0);
  for (const reference of actionReferences) {
    assert.match(reference, /^[^/\s]+\/[^@\s]+@[0-9a-f]{40}$/,
      `action must be pinned to a full commit SHA: ${reference}`);
  }
  assert.equal((workflow.match(/contents: write/g) ?? []).length, 1);
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 2);
});

test('explains each source role and links its descriptor', () => {
  const bootstrap = text('./bootstrap/index.html');
  const customizations = text('./repo/index.html');

  assert.match(bootstrap, /Bootstrap Profile/i);
  assert.match(bootstrap, /Lamina Config/i);
  assert.match(bootstrap, /href="\.\/repository\.json"/);
  assert.match(customizations, /Customizations/i);
  assert.match(customizations, /themes, clocks, status-bar layouts, and overlays/i);
  assert.match(customizations, /href="\.\/repository\.json"/);
});
