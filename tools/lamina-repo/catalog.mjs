import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';

const DIGEST = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const ANDROID_PACKAGE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const SOURCE_ROLES = new Set(['BOOTSTRAP_PROFILE', 'CUSTOMIZATIONS']);
const PACKAGE_TYPES = new Set(['APPLICATION', 'RRO']);

function fail(message) {
  throw new TypeError(`Invalid Lamina catalog: ${message}`);
}

function isRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

function requireRecord(value, path) {
  if (!isRecord(value)) fail(`${path} must be an object`);
}

function requireExactKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key} is not supported`);
  }
}

function requireString(value, path) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(`${path} must be a non-empty trimmed string`);
  }
}

function requireIdentifier(value, path) {
  requireString(value, path);
  if (!IDENTIFIER.test(value)) fail(`${path} is not a valid stable identifier`);
}

function requireAndroidPackage(value, path) {
  requireString(value, path);
  if (!ANDROID_PACKAGE.test(value)) fail(`${path} is not a valid Android package name`);
}

function requirePositiveInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${path} must be a positive safe integer`);
  }
}

function requireDigest(value, path) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    fail(`${path} must be a lowercase SHA-256 digest`);
  }
}

function requireStringArray(value, path, validator = requireIdentifier) {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    validator(value[index], `${path}[${index}]`);
    if (seen.has(value[index])) fail(`${path} contains duplicate value ${value[index]}`);
    seen.add(value[index]);
  }
}

function requireImmutableReleaseUrl(value, path) {
  requireString(value, path);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${path} must be a valid HTTPS URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    fail(`${path} must use HTTPS without credentials`);
  }
  if (url.hostname !== 'github.com' || url.port || url.search || url.hash) {
    fail(`${path} must be an immutable GitHub Release asset URL`);
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (
    segments.length < 6
    || segments[2] !== 'releases'
    || segments[3] !== 'download'
    || segments[4].toLowerCase() === 'latest'
    || segments.slice(0, 5).some((segment) => segment.length === 0)
    || segments.slice(5).join('/').length === 0
  ) {
    fail(`${path} must be an immutable GitHub Release asset URL`);
  }
}

function validateCompatibility(value, path) {
  requireRecord(value, path);
  requireExactKeys(value, new Set(['profiles', 'minSdk', 'maxSdk']), path);
  requireStringArray(value.profiles, `${path}.profiles`, requireString);
  if (value.profiles.length === 0) fail(`${path}.profiles must not be empty`);
  requirePositiveInteger(value.minSdk, `${path}.minSdk`);
  requirePositiveInteger(value.maxSdk, `${path}.maxSdk`);
  if (value.maxSdk < value.minSdk) fail(`${path}.maxSdk must be at least minSdk`);
}

function validateDependency(value, path) {
  requireRecord(value, path);
  requireExactKeys(value, new Set(['id', 'sourceId', 'minVersionCode']), path);
  requireIdentifier(value.id, `${path}.id`);
  if (value.sourceId !== undefined) requireIdentifier(value.sourceId, `${path}.sourceId`);
  requirePositiveInteger(value.minVersionCode, `${path}.minVersionCode`);
}

function validatePackage(value, path) {
  requireRecord(value, path);
  requireExactKeys(value, new Set([
    'id',
    'name',
    'type',
    'androidPackage',
    'versionCode',
    'versionName',
    'downloadUrl',
    'size',
    'sha256',
    'signerSha256',
    'compatibility',
    'requires',
    'conflicts',
    'overlayTarget',
  ]), path);

  requireIdentifier(value.id, `${path}.id`);
  requireString(value.name, `${path}.name`);
  if (!PACKAGE_TYPES.has(value.type)) fail(`${path}.type must be APPLICATION or RRO`);
  requireAndroidPackage(value.androidPackage, `${path}.androidPackage`);
  requirePositiveInteger(value.versionCode, `${path}.versionCode`);
  requireString(value.versionName, `${path}.versionName`);
  requireImmutableReleaseUrl(value.downloadUrl, `${path}.downloadUrl`);
  requirePositiveInteger(value.size, `${path}.size`);
  requireDigest(value.sha256, `${path}.sha256`);
  requireDigest(value.signerSha256, `${path}.signerSha256`);
  validateCompatibility(value.compatibility, `${path}.compatibility`);

  if (!Array.isArray(value.requires)) fail(`${path}.requires must be an array`);
  const requiredIds = new Set();
  value.requires.forEach((dependency, index) => {
    validateDependency(dependency, `${path}.requires[${index}]`);
    const identity = `${dependency.sourceId ?? ''}\0${dependency.id}`;
    if (requiredIds.has(identity)) fail(`${path}.requires contains a duplicate dependency`);
    requiredIds.add(identity);
  });

  requireStringArray(value.conflicts, `${path}.conflicts`);
  const allRequiredPackageIds = new Set(value.requires.map(({ id }) => id));
  for (const conflict of value.conflicts) {
    if (allRequiredPackageIds.has(conflict)) {
      fail(`${path} both requires and conflicts with ${conflict}`);
    }
  }

  if (value.type === 'RRO') {
    requireAndroidPackage(value.overlayTarget, `${path}.overlayTarget`);
  } else if (value.overlayTarget !== undefined) {
    fail(`${path} APPLICATION must not declare overlayTarget`);
  }
}

function validateDependencyGraph(catalog, byId) {
  const edges = new Map();
  for (const item of catalog.packages) {
    const sameSource = item.requires.filter(
      ({ sourceId }) => sourceId === undefined || sourceId === catalog.sourceId,
    );
    for (const dependency of sameSource) {
      const target = byId.get(dependency.id);
      if (!target) {
        fail(`${item.id} has unknown same-source dependency ${dependency.id}`);
      }
      if (target.versionCode < dependency.minVersionCode) {
        fail(`${item.id} requires unavailable version ${dependency.minVersionCode} of ${dependency.id}`);
      }
    }
    edges.set(item.id, sameSource.map(({ id }) => id));
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail(`dependency cycle includes ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of edges.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of edges.keys()) visit(id);
}

export function validateCatalog(catalog) {
  requireRecord(catalog, 'catalog');
  requireExactKeys(
    catalog,
    new Set(['schema', 'sourceId', 'sourceRole', 'publishedAt', 'packages']),
    'catalog',
  );
  if (catalog.schema !== 1) fail('catalog.schema must be 1');
  requireIdentifier(catalog.sourceId, 'catalog.sourceId');
  if (!SOURCE_ROLES.has(catalog.sourceRole)) {
    fail('catalog.sourceRole must be BOOTSTRAP_PROFILE or CUSTOMIZATIONS');
  }
  requireString(catalog.publishedAt, 'catalog.publishedAt');
  const date = new Date(catalog.publishedAt);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== catalog.publishedAt) {
    fail('catalog.publishedAt must be an exact UTC ISO-8601 timestamp');
  }
  if (!Array.isArray(catalog.packages)) fail('catalog.packages must be an array');

  const byId = new Map();
  const byAndroidPackage = new Map();
  catalog.packages.forEach((item, index) => {
    validatePackage(item, `catalog.packages[${index}]`);
    if (byId.has(item.id)) fail(`duplicate package ID ${item.id}`);
    if (byAndroidPackage.has(item.androidPackage)) {
      fail(`duplicate Android package ${item.androidPackage}`);
    }
    byId.set(item.id, item);
    byAndroidPackage.set(item.androidPackage, item);
  });
  validateDependencyGraph(catalog, byId);
  return catalog;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
    return result;
  }
  return value;
}

export function serializeCatalog(catalog) {
  validateCatalog(catalog);
  return `${JSON.stringify(canonicalize(catalog))}\n`;
}

function decodeBase64(value, path) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    fail(`${path} must be canonical Base64`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) fail(`${path} must be canonical Base64`);
  return decoded;
}

function parsePrivateKey(privateKeyPem) {
  if (typeof privateKeyPem !== 'string' || privateKeyPem.trim().length === 0) {
    fail('privateKeyPem must be a non-empty string');
  }
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    fail('privateKeyPem must be a valid PKCS#8 Ed25519 private key');
  }
  if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519') {
    fail('privateKeyPem must be a PKCS#8 Ed25519 private key');
  }
  return privateKey;
}

function parsePublicKey(publicKeyDerBase64) {
  const der = decodeBase64(publicKeyDerBase64, 'publicKeyDerBase64');
  let publicKey;
  try {
    publicKey = createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    fail('publicKeyDerBase64 must contain an X.509 Ed25519 public key');
  }
  if (publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') {
    fail('publicKeyDerBase64 must contain an X.509 Ed25519 public key');
  }
  return { der, publicKey };
}

export function buildCatalog(definition, privateKeyPem) {
  const privateKey = parsePrivateKey(privateKeyPem);
  const payloadBytes = Buffer.from(serializeCatalog(definition), 'utf8');
  const publicKey = createPublicKey(privateKey);
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
  return {
    envelope: {
      schema: 1,
      algorithm: 'Ed25519',
      payload: payloadBytes.toString('base64'),
      signature: sign(null, payloadBytes, privateKey).toString('base64'),
    },
    publicKeyDerBase64: publicKeyDer.toString('base64'),
    fingerprint: createHash('sha256').update(publicKeyDer).digest('hex'),
  };
}

export function verifyCatalog(envelope, publicKeyDerBase64) {
  requireRecord(envelope, 'envelope');
  requireExactKeys(
    envelope,
    new Set(['schema', 'algorithm', 'payload', 'signature']),
    'envelope',
  );
  if (envelope.schema !== 1) fail('envelope.schema must be 1');
  if (envelope.algorithm !== 'Ed25519') fail('envelope.algorithm must be Ed25519');
  const payloadBytes = decodeBase64(envelope.payload, 'envelope.payload');
  const signatureBytes = decodeBase64(envelope.signature, 'envelope.signature');
  const { publicKey } = parsePublicKey(publicKeyDerBase64);
  if (!verify(null, payloadBytes, publicKey, signatureBytes)) {
    fail('catalog signature verification failed');
  }

  let catalog;
  try {
    catalog = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    fail('signed payload must be UTF-8 JSON');
  }
  validateCatalog(catalog);
  if (Buffer.from(serializeCatalog(catalog), 'utf8').compare(payloadBytes) !== 0) {
    fail('signed payload is not in canonical catalog form');
  }
  return catalog;
}
