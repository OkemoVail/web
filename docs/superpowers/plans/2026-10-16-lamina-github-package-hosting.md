# Lamina GitHub Package Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish secure static homes for Lamina's Bootstrap Profile and customization sources at `repo.okemovail.com/bootstrap/` and `repo.okemovail.com/repo/` without disturbing the existing website.

**Architecture:** `OkemoVail/web` remains a static GitHub Pages site and gains two isolated source directories plus a custom-domain declaration. Contract tests validate the host-facing metadata now; signed machine catalogs are introduced only after separate production Ed25519 keys are provisioned.

**Tech Stack:** GitHub Pages, Cloudflare DNS, static HTML/JSON, Node.js built-in test runner and crypto, GitHub Actions, GitHub Releases

**Spec:** `docs/superpowers/specs/2026-10-16-lamina-github-package-hosting-design.md`

## Global Constraints

- Public paths are exactly `/bootstrap/` and `/repo/` under `https://repo.okemovail.com`.
- GitHub is the only content host; Cloudflare supplies DNS only.
- Existing website routes and assets must remain unchanged.
- `/bootstrap/` and `/repo/` use independent Ed25519 production keys.
- Never commit an Android keystore, repository private key, token, or password.
- Never publish `index.json` with a test key, placeholder signature, or unsigned payload.
- Package binaries use immutable GitHub Release URLs rather than mutable `latest` URLs.

## Review Focus

- A missing or altered `CNAME` must fail the hosting contract instead of silently publishing on the wrong host.
- Source identifiers or roles swapped between paths must fail the contract.
- An accidental unsigned `index.json` must fail until production-key verification is wired in.
- Absolute links must remain valid at both the GitHub project URL and custom-domain URL during rollout.
- DNS setup must not replace an existing GitHub Pages custom domain without explicit verification.

---

### Task 1: Static source homes and host contract

**Files:**
- Create: `test-lamina-repositories.mjs`
- Create: `CNAME`
- Create: `.nojekyll`
- Create: `bootstrap/index.html`
- Create: `bootstrap/repository.json`
- Create: `repo/index.html`
- Create: `repo/repository.json`
- Modify: `package.json`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the public URL and source-role decisions in the spec.
- Produces: static source landing pages and descriptors; `npm run test:lamina-repositories`.

- [ ] **Step 1: Write the failing hosting contract**

Add Node tests that read the real files and assert:

- `CNAME` is exactly `repo.okemovail.com`.
- both descriptors use schema `1`, distinct IDs, distinct roles, and HTTPS canonical URLs.
- Bootstrap's descriptor resolves to `/bootstrap/index.json`; Customizations resolves to `/repo/index.json`.
- no `index.json` exists before production signature verification is implemented.
- both landing pages link to their descriptor and clearly state their role.

- [ ] **Step 2: Run the contract and verify RED**

Run: `node --test test-lamina-repositories.mjs`

Expected: FAIL because `CNAME`, source descriptors, and landing pages do not exist.

- [ ] **Step 3: Add the minimal static hosting files**

Create the custom-domain declaration, disable Jekyll processing, and add the two source homes. Descriptors expose identity and canonical endpoint locations but no trust-on-first-use public key. Landing pages remain small, accessible, and independent from the site's application JavaScript.

- [ ] **Step 4: Add the package script and repository note**

Add `test:lamina-repositories` to `package.json`. Record the package-source paths and the rule against placeholder indexes in `CLAUDE.md`.

- [ ] **Step 5: Run the contract and verify GREEN**

Run: `npm run test:lamina-repositories`

Expected: all hosting-contract tests pass.

- [ ] **Step 6: Commit**

```bash
git add CNAME .nojekyll bootstrap repo package.json package-lock.json CLAUDE.md test-lamina-repositories.mjs docs/superpowers
git commit -m "feat: add Lamina package source homes"
```

### Task 2: Production catalog generator and validator

**Files:**
- Create: `tools/lamina-repo/catalog.mjs`
- Create: `tools/lamina-repo/build-catalog.mjs`
- Create: `tools/lamina-repo/verify-catalog.mjs`
- Create: `tools/lamina-repo/test-catalog.mjs`
- Create: `tools/lamina-repo/README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: source package-definition JSON plus a PKCS#8 Ed25519 private key supplied only through an environment variable or protected file path.
- Produces: `buildCatalog(definition, privateKeyPem) -> { envelope, publicKeyDerBase64, fingerprint }` and `verifyCatalog(envelope, publicKeyDerBase64) -> catalog`.

- [ ] **Step 1: Write failing catalog tests**

Use ephemeral Ed25519 keys and literal fixtures to test valid signing, tamper rejection, duplicate IDs, malformed SHA-256, non-HTTPS or mutable download URLs, invalid dependency references, dependency cycles, conflicting requirements, package-type fields, and signer-digest requirements.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tools/lamina-repo/test-catalog.mjs`

Expected: FAIL because the catalog module does not exist.

- [ ] **Step 3: Implement the schema validator and exact-byte envelope signing**

Use only Node built-ins. Validate before signing and after signature verification. Serialize the catalog deterministically, sign the exact UTF-8 bytes, and keep display metadata outside the trust decision only when explicitly documented.

- [ ] **Step 4: Implement build and verify CLIs**

The build CLI refuses output when no production private key is supplied. The verify CLI accepts an envelope path and explicit public key, returns nonzero on every validation or signature error, and never fetches keys from the source being verified.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test tools/lamina-repo/test-catalog.mjs`

Expected: all catalog tests pass with no warnings.

- [ ] **Step 6: Commit**

```bash
git add tools/lamina-repo package.json package-lock.json
git commit -m "feat: add signed Lamina catalog tooling"
```

### Task 3: Protected GitHub publication workflow

**Files:**
- Create: `.github/workflows/publish-lamina-catalogs.yml`
- Create: `bootstrap/packages.json`
- Create: `repo/packages.json`
- Modify: `test-lamina-repositories.mjs`
- Modify: `tools/lamina-repo/README.md`

**Interfaces:**
- Consumes: protected environment secrets `LAMINA_BOOTSTRAP_ED25519_PKCS8` and `LAMINA_REPO_ED25519_PKCS8` plus reviewed package definitions.
- Produces: verified `bootstrap/index.json` and `repo/index.json` committed or deployed as Pages content.

- [ ] **Step 1: Extend tests to reject an unsigned or wrong-key index**

Add production-path verification that requires each published index to verify with the corresponding committed public key and rejects cross-signing with the other source key.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test:lamina-repositories`

Expected: FAIL because production public keys, package definitions, and signed indexes are absent.

- [ ] **Step 3: Provision independent production keys outside Git**

Create two Ed25519 keypairs. Store private PKCS#8 values in separate protected GitHub environments with required approval. Commit only X.509 public-key Base64 values and SHA-256 fingerprints.

- [ ] **Step 4: Add the least-privilege publication workflow**

Pin every third-party Action to a full commit SHA. Grant only `contents: write` to the publication job, use environment approval, build both envelopes, verify them again, and reject changed package definitions that point to mutable or non-GitHub HTTPS assets.

- [ ] **Step 5: Generate and verify initial signed catalogs**

Run: `npm run build:lamina-catalogs && npm run test:lamina-repositories`

Expected: both independently signed catalogs verify and all contracts pass.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows bootstrap repo test-lamina-repositories.mjs tools/lamina-repo/README.md package.json package-lock.json
git commit -m "ci: publish signed Lamina catalogs"
```

### Task 4: GitHub Pages and DNS activation

**Files:**
- Modify only if required: repository settings and Cloudflare DNS; no application source changes.

**Interfaces:**
- Consumes: the committed static source homes and `CNAME`.
- Produces: live HTTPS routes under `repo.okemovail.com`.

- [ ] **Step 1: Verify the existing Pages custom-domain setting**

Confirm `OkemoVail/web` is not currently claiming `okemovail.com` in GitHub Pages settings. If it is, stop and create a dedicated Pages repository rather than replacing the domain.

- [ ] **Step 2: Configure DNS**

Create `CNAME repo -> okemovail.github.io` in Cloudflare with proxying disabled during certificate provisioning.

- [ ] **Step 3: Configure Pages**

Set the custom domain to `repo.okemovail.com`, wait for DNS verification, and enable Enforce HTTPS.

- [ ] **Step 4: Verify live behavior**

Run HTTPS requests for `/bootstrap/`, `/bootstrap/repository.json`, `/repo/`, and `/repo/repository.json`; confirm status 200, correct bodies, no redirects to `okemovail.com`, and no mixed content.

- [ ] **Step 5: Verify existing-site behavior**

Check `https://okemovail.com/` and representative existing routes to confirm the package-domain activation did not alter the main website.

- [ ] **Step 6: Commit activation notes if operational documentation changed**

```bash
git add tools/lamina-repo/README.md CLAUDE.md
git commit -m "docs: record Lamina repository deployment"
```
