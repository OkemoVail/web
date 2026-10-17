# Lamina GitHub Package Hosting Design

## Goal

Host Lamina's two official package sources entirely from `OkemoVail/web` via
the existing Cloudflare Pages project, under these public URLs:

- `https://repo.okemovail.com/bootstrap/`
- `https://repo.okemovail.com/repo/`

The public GitHub repository remains the source of truth. Cloudflare Pages is
the static content host and authoritative DNS provider, but it does not become
an application backend or source of package metadata.

## Existing deployment

`OkemoVail/web` is already connected to Cloudflare Pages project `okemo` on
production branch `main`, published at `https://okemo.pages.dev`, and attached
to `https://okemovail.com/`. It deploys the repository root with no build
command. GitHub Pages is separately enabled at `https://okemovail.github.io/web/`
but is not the production origin and must not own the package custom domain.

The package-hosting change must not alter the existing homepage, routes, or
assets. It adds two isolated static directories. It does not commit a GitHub
Pages `CNAME` file.

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

Attach `repo.okemovail.com` as a second custom domain on Cloudflare Pages
project `okemo`. Cloudflare creates and manages the proxied DNS record and TLS
certificate. The repository must not contain `CNAME`; GitHub Pages custom-domain
configuration is unrelated and remains untouched.

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

Cloudflare Pages continues to publish the repository as static content. A
contract test prevents an unsafe GitHub Pages `CNAME` and validates the two
source descriptors.
Later release workflows in `OkemoVail/Lamina` build and sign APKs, while a
protected publication workflow updates and signs catalogs in `OkemoVail/web`.

The publishing workflow must pin third-party Actions to full commit SHAs, use
least-privilege permissions, and generate artifact attestations for release
APKs. Cloudflare Pages and GitHub Releases are transport layers only; Lamina's signatures
and APK identity checks remain authoritative.

## Non-goals

- No API server, database, Cloudflare Worker, or dynamic package endpoint.
- No APK history stored in the Git branch.
- No APT or Debian repository compatibility.
- No shared signing key between `/bootstrap/` and `/repo/`.
- No automatic activation of optional customizations after installation.
