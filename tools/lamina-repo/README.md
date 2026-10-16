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
