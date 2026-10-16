import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function text(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function descriptor(path) {
  return JSON.parse(text(path));
}

test('publishes the Lamina repository custom domain', () => {
  assert.equal(text('./CNAME').trim(), 'repo.okemovail.com');
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

test('does not publish machine catalogs before production signing is configured', () => {
  assert.equal(existsSync(new URL('./bootstrap/index.json', import.meta.url)), false);
  assert.equal(existsSync(new URL('./repo/index.json', import.meta.url)), false);
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
