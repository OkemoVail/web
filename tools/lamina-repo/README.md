# Lamina catalog tools

These Node.js-only tools validate, sign, and verify Lamina's static package
catalogs. Catalogs use deterministic JSON wrapped in an exact-byte Ed25519
signature envelope. SHA-256 fingerprints identify repository public keys;
package and APK signer digests are also SHA-256.

## Security boundary

- Keep the two production PKCS#8 private keys outside Git and outside catalog
  definitions. Use separate protected GitHub environments for Bootstrap and
  Customizations.
- Compile the corresponding X.509 public-key DER values into Lamina Bootstrap.
  Never trust a key fetched from the same source it authenticates.
- Do not log private-key environment variables. The build command prints only
  the public-key fingerprint.
- Catalog download URLs must be version-specific HTTPS GitHub Release asset
  URLs. `releases/latest`, query strings, and other hosts are rejected.
- Verification checks the Ed25519 signature before parsing the catalog and then
  requires canonical serialization, schema validity, and a valid dependency
  graph.

## Catalog definition

The signed catalog contains `schema`, `sourceId`, `sourceRole`, `publishedAt`,
and `packages`. A package declares its stable ID, Android identity, integer
`versionCode`, display-only `versionName`, immutable asset URL, byte size,
payload and APK signer SHA-256 digests, compatibility bounds, requirements, and
conflicts. An `RRO` also declares `overlayTarget`; an `APPLICATION` cannot.

Requirements without `sourceId` are resolved inside the current catalog. A
requirement with an explicit different `sourceId` is cross-source and is
resolved by Lamina Bootstrap after both signed catalogs have been loaded.

## Test

```sh
npm run test:lamina-catalogs
```

Tests generate ephemeral Ed25519 keys in memory. They are not production keys.

## Build

Pass the private key using exactly one protected input:

```sh
node tools/lamina-repo/build-catalog.mjs \
  --input bootstrap/packages.json \
  --output bootstrap/index.json \
  --private-key-env LAMINA_BOOTSTRAP_ED25519_PKCS8
```

For an offline protected workstation, replace `--private-key-env NAME` with
`--private-key-file path`. Optional `--public-key-output path` and
`--fingerprint-output path` arguments write public metadata. Do not use those
options to overwrite already pinned production trust data without a deliberate
key-rotation process.

## Verify

Verification always receives an explicit pinned public key file:

```sh
node tools/lamina-repo/verify-catalog.mjs \
  --input bootstrap/index.json \
  --public-key-file bootstrap/public-key.txt
```

Every validation, parsing, canonicalization, key, or signature failure exits
nonzero.

## Production activation

The committed `bootstrap/packages.json` and `repo/packages.json` files are the
reviewed signing inputs. Until key provisioning, both source descriptors remain
`KEYS_PENDING` and all six trust artifacts (`index.json`, `public-key.txt`, and
`public-key.sha256` in each source) must remain absent.

To activate production:

1. Generate two independent Ed25519 keypairs on a protected workstation.
2. Put each private PKCS#8 PEM in its own protected GitHub environment:
   `lamina-bootstrap-production` or `lamina-repo-production`. Configure required
   reviewers and restrict deployment branches.
3. Derive each X.509 public-key DER Base64 value and lowercase SHA-256
   fingerprint with `build-catalog.mjs`. Compile those keys into the Bootstrap
   app as separate trust anchors.
4. Commit both public-key files, both fingerprints, both initial signed indexes,
   and both descriptor status changes in one reviewed activation commit. The
   repository contract rejects partial activation and cross-signing.
5. Thereafter, review changes to `packages.json` and manually dispatch
   `.github/workflows/publish-lamina-catalogs.yml`. Each signing job can access
   only its own environment secret. The publishing job re-verifies both outputs
   against committed trust anchors before committing them.

Do not run the production workflow before the activation commit exists: its
`cmp` checks intentionally fail when a committed trust anchor is absent or does
not match the protected private key.
