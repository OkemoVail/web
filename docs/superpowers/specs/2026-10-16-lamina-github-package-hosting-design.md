# Lamina GitHub Package Hosting Design

## Goal

Host Lamina's two official package sources entirely from `OkemoVail/web` via
GitHub Pages, under these public URLs:

- `https://repo.okemovail.com/bootstrap/`
- `https://repo.okemovail.com/repo/`

GitHub remains the only content host. Cloudflare remains the authoritative DNS
provider for `okemovail.com`, but it must not become an application backend or
source of package metadata.

## Existing deployment

`OkemoVail/web` is already a public static website and has GitHub Pages enabled
at `https://okemovail.github.io/web/`. The main `https://okemovail.com/` site is
fronted by Cloudflare and currently serves the same content. The repository has
no committed `CNAME` and no Pages Actions workflow.

The package-hosting change must not alter the existing homepage, routes, or
assets. It adds two isolated static directories and the GitHub Pages custom
domain declaration.

## Public URL layout

```text
repo.okemovail.com/
├── bootstrap/
│   ├── index.html
│   ├── repository.json
│   ├── index.json          # added only when signed with the production key
│   ├── icons/
│   └── depictions/
└── repo/
    ├── index.html
    ├── repository.json
    ├── index.json          # added only when signed with the production key
    ├── icons/
    ├── screenshots/
    └── depictions/
```

`/bootstrap/` distributes Lamina Config, compatibility profiles, hooks, and
required infrastructure. `/repo/` distributes optional customizations such as
RRO APKs, themes, clocks, status-bar layouts, and launcher layouts.

The machine-readable endpoints are:

- `https://repo.okemovail.com/bootstrap/index.json`
- `https://repo.okemovail.com/repo/index.json`

Package binaries remain immutable GitHub Release assets. Catalog entries use
version-specific release URLs rather than mutable `latest` URLs.

## Domain mapping

The repository root contains `CNAME` with exactly `repo.okemovail.com`.
Cloudflare DNS contains a `CNAME` record named `repo` targeting
`okemovail.github.io`. The record should be DNS-only while GitHub provisions and
verifies HTTPS. It may remain DNS-only; GitHub Pages already provides HTTPS and
CDN delivery.

GitHub Pages must use `repo.okemovail.com` as this repository's custom domain.
The existing `okemovail.com` deployment must be verified before applying that
setting. If `okemovail.com` is itself configured as this repository's GitHub
Pages custom domain despite the absent `CNAME`, stop rather than replace it;
use a dedicated Pages repository instead.

## Trust model

The two sources have independent Ed25519 keypairs. A compromise of the optional
customization key must not authorize Bootstrap Profile packages.

Production private keys are never committed. They are stored as secrets in two
separate protected GitHub environments. Publishing requires manual environment
approval. Public X.509 Ed25519 keys and SHA-256 fingerprints are committed and
compiled into Lamina Bootstrap.

Every catalog is an envelope containing the exact UTF-8 catalog bytes as Base64
and an Ed25519 signature of those bytes. Each package entry contains at least:

- stable package ID
- package type (`APPLICATION` or `RRO` in the first release)
- Android package name
- integer `versionCode` and display `versionName`
- immutable HTTPS download URL
- byte size and lowercase SHA-256
- APK signing-certificate SHA-256
- supported device/profile constraints
- `requires` package IDs with minimum version codes
- `conflicts` package IDs

RRO entries additionally contain the expected Android overlay target. Bootstrap
must verify the repository signature, payload hash, APK identity, APK signer,
and type-specific metadata before a transaction reaches root execution.

## Initial publication rule

Human-readable `/bootstrap/` and `/repo/` pages may be published before package
keys exist. A machine-readable `index.json` must not be published with a sample
key, placeholder signature, empty signature, or unsigned payload. The endpoint
is added only after production keys are provisioned and the generated envelope
passes the repository validator.

## Deployment

GitHub Pages continues to publish the repository as static content. A contract
test validates the custom-domain declaration and the two source descriptors.
Later release workflows in `OkemoVail/Lamina` build and sign APKs, while a
protected publication workflow updates and signs catalogs in `OkemoVail/web`.

The publishing workflow must pin third-party Actions to full commit SHAs, use
least-privilege permissions, and generate artifact attestations for release
APKs. GitHub Pages and Releases are transport layers only; Lamina's signatures
and APK identity checks remain authoritative.

## Non-goals

- No API server, database, Cloudflare Worker, or dynamic package endpoint.
- No APK history stored in the Git branch.
- No APT or Debian repository compatibility.
- No shared signing key between `/bootstrap/` and `/repo/`.
- No automatic activation of optional customizations after installation.
