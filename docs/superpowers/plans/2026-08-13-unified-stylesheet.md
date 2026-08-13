# Unified Stylesheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge all hand-written CSS (every page's inline `<style>` + `design-tokens.css` + `styles.css`) and all icon systems into one hand-editable stylesheet, `src/site.css`, with page-scoped sections — rendering unchanged, no build step, no icon CDNs.

**Architecture:** Per spec `docs/superpowers/specs/2026-08-13-unified-stylesheet-design.md`. One `src/site.css` (tokens → shared components → generated icon masks → alphabetized `[data-page="..."]`-scoped page sections). A migration script mechanically moves + scopes each page's CSS; Playwright screenshots (light+dark) before/after per page catch regressions. Font Awesome becomes CSS mask rules re-using the same `fa-*` class names (zero markup changes); feather-icons becomes a self-hosted UMD copy (`src/feather-local.js`), same `window.feather` API.

**Tech Stack:** vanilla CSS/HTML/JS, Node scripts (`postcss`, `postcss-selector-parser`), Playwright + pixelmatch for visual diffing, `@fortawesome/fontawesome-free` + `feather-icons` npm packages as icon *sources* (dev-time only).

**Spec:** `docs/superpowers/specs/2026-08-13-unified-stylesheet-design.md` — read it first.

---

## Background for the engineer

- The site is **no-build vanilla**: pages are opened directly / served statically. Tailwind exists twice: compiled `src/output.css` (root pages) and the runtime Play CDN (AI/word pages). **Both stay.** We only migrate hand-written CSS.
- `.dark` is toggled on `document.documentElement` (`<html>`), and `data-page` goes on `<body>` — so `.dark` is always an *ancestor* of the page hook. The scoping transform handles this.
- `chat.html`'s `<style id="dynamic-accent-styles">` block is rewritten at runtime by the accent picker. **It must stay inline.** The migration script skips any `<style>` block that has an `id`.
- CSS `url()`s resolve relative to the stylesheet's location: `src/site.css` → fonts at `../Fonts/`.
- Two JS files inject *static* CSS at runtime (no template variables): `AI/js/canvas.js:97-270` (`_injectCanvasLayoutCSS`) and `AI/js/chat-actions.js:406-425` (`_injectSourcesCSS`). Both move into the chat page section (Task 20); the IIFEs get deleted.
- `AI/thing.css` is dead (nothing links it). The devicons CDN link in `Themes/Themes.html` is dead (no `devicon-*` class is ever used).

## Task ordering note

Tasks 1–4 build tooling + the foundation + icons. Tasks 5–19 migrate pages smallest-first so the process is validated on low-risk pages before `chat.html` (Task 20, the big one). Task 21 cleans up.

---

### Task 1: Migration tooling — deps + `tools/migrate-page.mjs`

**Files:**
- Create: `tools/migrate-page.mjs`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install dev-time dependencies**

```bash
npm i -D postcss postcss-selector-parser @fortawesome/fontawesome-free feather-icons pixelmatch pngjs
```

Expected: `package.json` gains a `devDependencies` section with these six entries. (`playwright` and `jsdom` are already in `dependencies`.)

- [ ] **Step 2: Write the migration script**

Create `tools/migrate-page.mjs` with exactly this content:

```js
#!/usr/bin/env node
/**
 * tools/migrate-page.mjs <page.html> <data-page-name> [--dry]
 * tools/migrate-page.mjs --css <file.css> <data-page-name> [--dry]
 *
 * HTML mode: moves a page's inline (id-less) <style> blocks into src/site.css
 * as a section scoped to [data-page="<name>"], then rewrites the page:
 *   - deletes the moved <style> blocks
 *   - deletes the design-tokens.css / styles.css / font-awesome / devicons links
 *   - inserts ONE <link> to src/site.css at the position of the first removed
 *     <style> block (or where design-tokens.css was, if nothing was moved)
 *   - swaps a feather-icons CDN <script> for the local src/feather-local.js
 *   - adds data-page="<name>" to <body>
 * CSS mode: scopes a raw .css file into the page's section (used for CSS that
 * was injected by JS, after extracting it by hand into a temp file).
 *
 * Also: drops @font-face blocks (they live in site.css §1; warns if the family
 * is not Satoshi) and renames @keyframes that would collide with names already
 * present in src/site.css (renamed to "<page>-<name>", animation decls updated).
 */
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const cssMode = argv[0] === '--css';
const positional = argv.filter(a => a !== '--dry' && a !== '--css');
const [target, pageName] = cssMode ? positional : positional;
if (!target || !pageName) {
  console.error('usage: node tools/migrate-page.mjs <page.html>|<--css file.css> <data-page-name> [--dry]');
  process.exit(1);
}

const ROOT = process.cwd();
const SITE = path.resolve(ROOT, 'src/site.css');
const hook = `[data-page="${pageName}"]`;
const report = { movedBlocks: 0, keptBlocks: [], rulesScoped: 0, fontFacesDropped: [], renamedKeyframes: {}, links: [], warnings: [] };

function scopeOne(sel) {
  const s = sel.trim();
  if (/^:root\b/.test(s))      return s.replace(/^:root\b/, hook);
  if (/^html\.dark\b/.test(s)) return s.replace(/^html\.dark\b/, `html.dark ${hook}`);
  if (/^html\b/.test(s))       return s.replace(/^html\b/, `html ${hook}`);
  if (/^\.dark\b/.test(s))     return s.replace(/^\.dark\b/, `.dark ${hook}`);
  if (/^body\b/.test(s))       return s.replace(/^body\b/, hook);
  return `${hook} ${s}`;
}

function scopeCss(css, existingCss) {
  const ast = postcss.parse(css, { from: target });

  ast.walkAtRules('font-face', at => {
    const famNode = (at.nodes || []).find(n => n.prop === 'font-family');
    const fam = famNode ? famNode.value.replace(/['"]/g, '') : '(unknown)';
    report.fontFacesDropped.push(fam);
    if (!/satoshi/i.test(fam)) report.warnings.push(`non-Satoshi @font-face dropped: ${fam} — REVIEW`);
    at.remove();
  });

  const existingKf = new Set([...existingCss.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]));
  ast.walkAtRules('keyframes', at => {
    const name = at.params.trim();
    if (existingKf.has(name)) {
      const nu = `${pageName}-${name}`;
      report.renamedKeyframes[name] = nu;
      at.params = nu;
      existingKf.add(nu);
    } else {
      existingKf.add(name);
    }
  });
  const renames = Object.entries(report.renamedKeyframes);
  if (renames.length) {
    ast.walkDecls(/^(animation|animation-name)$/, d => {
      for (const [oldK, nu] of renames) d.value = d.value.replace(new RegExp(`\\b${oldK}\\b`, 'g'), nu);
    });
  }

  ast.walkRules(rule => {
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
    const parts = [];
    selectorParser(sels => sels.each(s => parts.push(scopeOne(s.toString())))).processSync(rule.selector);
    rule.selector = parts.join(',\n');
    report.rulesScoped++;
  });

  return ast.toString();
}

function appendSection(css, label) {
  const existing = fs.existsSync(SITE) ? fs.readFileSync(SITE, 'utf8') : '';
  const scoped = scopeCss(css, existing);
  const banner = `\n/* ═══════════════════════════════════════════════════════════════════
   PAGE: ${label}  —  scoped to [data-page="${pageName}"]
   ═══════════════════════════════════════════════════════════════════ */\n`;
  if (!dry) fs.appendFileSync(SITE, banner + scoped + '\n');
}

if (cssMode) {
  const css = fs.readFileSync(path.resolve(ROOT, target), 'utf8');
  appendSection(css, `${pageName} (${path.basename(target)})`);
} else {
  const absHtml = path.resolve(ROOT, target);
  let html = fs.readFileSync(absHtml, 'utf8');

  // --- extract id-less <style> blocks
  const styleRe = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
  const moved = [];
  let m;
  while ((m = styleRe.exec(html))) {
    if (/\bid\s*=/.test(m[1])) { report.keptBlocks.push(m[1].trim()); continue; }
    moved.push({ full: m[0], css: m[2], index: m.index });
  }
  report.movedBlocks = moved.length;
  if (moved.length) appendSection(moved.map(b => b.css).join('\n\n'), pageName.toUpperCase());

  // --- figure out path prefix from the design-tokens link (keeps '/src/' vs '../src/' style)
  const dtMatch = html.match(/<link[^>]*href="([^"]*\/)?design-tokens\.css"[^>]*>\s*\n?/i);
  const prefix = dtMatch ? (dtMatch[1] || '') : null; // e.g. 'src/', '../src/', '/src/'
  if (!dtMatch) report.warnings.push('no design-tokens.css link found — inserting site.css link before </head>');
  const siteLink = `<link rel="stylesheet" href="${prefix || '/src/'}site.css">\n    `;

  let out = html;
  if (dtMatch) { out = out.replace(dtMatch[0], ''); report.links.push('design-tokens.css link removed'); }
  const stMatch = out.match(/<link[^>]*href="[^"]*\/styles\.css"[^>]*>\s*\n?/i);
  if (stMatch) { out = out.replace(stMatch[0], ''); report.links.push('styles.css link removed'); }

  const faBefore = (out.match(/font-awesome|fontawesome/gi) || []).length;
  out = out.replace(/<link[^>]*font-?awesome[^>]*>\s*(\n)?/gi, '');
  if (faBefore) report.links.push(`font-awesome link(s) removed: ${faBefore}`);
  const dvBefore = (out.match(/devicon/gi) || []).length;
  out = out.replace(/<link[^>]*devicon[^>]*>\s*(\n)?/gi, '');
  if (dvBefore) report.links.push('devicons link removed');

  const feRe = /<script[^>]*src="https:\/\/[^"]*feather[^"]*"[^>]*>\s*<\/script>\s*\n?/i;
  if (feRe.test(out)) {
    out = out.replace(feRe, `<script src="${prefix || '/src/'}feather-local.js"></script>\n`);
    report.links.push('feather CDN -> src/feather-local.js');
  }

  if (moved.length) {
    out = out.replace(moved[0].full, siteLink);           // link goes where the first block was
    for (let i = 1; i < moved.length; i++) out = out.replace(moved[i].full, '');
  } else {
    out = dtMatch ? out.replace(/<\/head>/i, `    ${siteLink}</head>`) : out;
  }

  if (!/data-page=/.test(out)) {
    if (!/<body(\s[^>]*)?>/i.test(out)) report.warnings.push('no <body> tag found — add data-page manually');
    else { out = out.replace(/<body(\s[^>]*)?>/i, `<body data-page="${pageName}"$1>`); report.links.push(`<body data-page="${pageName}">`); }
  }

  if (!dry) fs.writeFileSync(absHtml, out);
}

console.log((dry ? '--- DRY RUN ---\n' : '') + JSON.stringify(report, null, 2));
if (!cssMode && !dry) console.log(`migrated ${target} -> [data-page="${pageName}"]`);
```

- [ ] **Step 3: Smoke-test the script on a throwaway fixture**

```bash
mkdir -p /tmp/migtest && printf '%s\n' '<html><head><link rel="stylesheet" href="/src/design-tokens.css"><style>:root{--x:1} .dark .a{color:red} @keyframes fadeIn{from{opacity:0}} .b{animation:fadeIn 1s}</style></head><body class="p-4">hi</body></html>' > /tmp/migtest/fixture.html
node tools/migrate-page.mjs /tmp/migtest/fixture.html fixture --dry
```

Expected output (dry run — nothing written): `movedBlocks: 1`, `rulesScoped: 3`, no warnings, `links` lists the design-tokens removal and `<body data-page="fixture">`. **Note:** the script appends to `src/site.css` even in dry mode only if `!dry` — verify `git status` shows no changes after the dry run. (If `src/site.css` does not exist yet that's fine; dry mode never writes.)

---

### Task 2: Visual snapshot tooling + baseline capture

**Files:**
- Create: `tools/snapshot.mjs`
- Create: `tools/visual-diff.mjs`
- Create: `tools/snapshots/before/*.png` (32 files, generated)

- [ ] **Step 1: Install the Chromium browser for Playwright**

```bash
npx playwright install chromium
```

Expected: "Chromium … downloaded" (or already installed). If this fails (no network / disk), **fall back**: skip all snapshot steps in later tasks and do the manual smoke checklist (Task 21, Step 3) per page instead. Note the fallback in the task commit message.

- [ ] **Step 2: Write `tools/snapshot.mjs`**

```js
#!/usr/bin/env node
// tools/snapshot.mjs <before|after> [pageNameFilter]
// Serves the repo root statically and screenshots every page in light + dark.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const phase = process.argv[2];
const filter = process.argv[3];
if (!['before', 'after'].includes(phase)) { console.error('usage: node tools/snapshot.mjs <before|after> [page]'); process.exit(1); }

const PAGES = [
  ['home', '/index.html'], ['whitename', '/whitename.html'], ['design', '/design.html'],
  ['design-lab', '/design-lab.html'], ['themes', '/Themes/Themes.html'], ['word', '/word/index.html'],
  ['search', '/search/index.html'], ['ai-home', '/AI/index.html'], ['chat', '/AI/chat.html'],
  ['manage', '/AI/manage.html'], ['editor', '/AI/editor.html'], ['research', '/AI/research.html'],
  ['tos', '/AI/tos.html'], ['privacy', '/AI/privacy.html'], ['goals', '/AI/goals.html'],
  ['version', '/AI/version.html'],
];
const pages = filter ? PAGES.filter(([n]) => n === filter) : PAGES;
if (!pages.length) { console.error('unknown page filter: ' + filter); process.exit(1); }

const outDir = path.resolve('tools/snapshots', phase);
fs.mkdirSync(outDir, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', '8901'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const [name, url] of pages) {
    for (const theme of ['light', 'dark']) {
      const page = await ctx.newPage();
      await page.addInitScript(t => localStorage.setItem('vail_theme', t), theme);
      await page.goto(`http://127.0.0.1:8901${url}`, { waitUntil: 'load', timeout: 20000 }).catch(e => console.error('NAV WARN', name, e.message));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(outDir, `${name}-${theme}.png`) });
      await page.close();
      console.log(`shot ${name}-${theme}`);
    }
  }
} finally {
  await browser.close();
  server.kill();
}
```

- [ ] **Step 3: Write `tools/visual-diff.mjs`**

```js
#!/usr/bin/env node
// tools/visual-diff.mjs [pageNameFilter]
// Pixel-diffs tools/snapshots/before vs after. Prints %diff; flags > 2%.
// This is a REVIEW AID, not a gate — inspect any flagged pair by eye.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const filter = process.argv[2];
const before = 'tools/snapshots/before', after = 'tools/snapshots/after';
const files = fs.readdirSync(before).filter(f => f.endsWith('.png') && (!filter || f.startsWith(filter)));
let flagged = 0;
for (const f of files) {
  const aPath = path.join(after, f);
  if (!fs.existsSync(aPath)) { console.log(`MISSING after/${f}`); flagged++; continue; }
  const a = PNG.sync.read(fs.readFileSync(path.join(before, f)));
  const b = PNG.sync.read(fs.readFileSync(aPath));
  if (a.width !== b.width || a.height !== b.height) { console.log(`SIZE DIFF ${f}: ${a.width}x${a.height} vs ${b.width}x${b.height} — REVIEW`); flagged++; continue; }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.12 });
  const pct = (100 * n / (a.width * a.height)).toFixed(3);
  const flag = pct > 2 ? '  <-- REVIEW' : '';
  if (pct > 2) flagged++;
  console.log(`${f}: ${pct}% differ${flag}`);
  if (pct > 2) fs.writeFileSync(`tools/snapshots/diff-${f}`, PNG.sync.write(diff));
}
console.log(flagged ? `\n${flagged} pair(s) flagged — open tools/snapshots/diff-*.png and both originals` : '\nall pairs within threshold');
```

- [ ] **Step 4: Capture the baseline (pre-migration) screenshots**

```bash
node tools/snapshot.mjs before
```

Expected: 32 lines of `shot <page>-<theme>`, 32 PNGs in `tools/snapshots/before/`. Spot-check 2–3 PNGs open correctly (`open tools/snapshots/before/chat-light.png`).

- [ ] **Step 5: Commit**

```bash
git add tools/ package.json package-lock.json
git commit -m "build: css migration + visual-diff tooling and pre-migration baseline"
```

---

### Task 3: Foundation — create `src/site.css`

**Files:**
- Create: `src/site.css`

`src/site.css` is created as: hand-written header/TOC + §1 fonts + the **verbatim** contents of `src/design-tokens.css` (which becomes §2 tokens + §3 shared components) + empty §4 icon markers. Do NOT delete `src/design-tokens.css` yet (un-migrated pages still link it).

- [ ] **Step 1: Create the file**

Create `src/site.css` with this exact header, then append the full verbatim contents of `src/design-tokens.css` where marked:

```css
/* ═══════════════════════════════════════════════════════════════════════════
   OKEMO — UNIFIED SITE STYLESHEET (src/site.css)
   The single place to edit every hand-written style on the site.
   Tailwind (compiled output.css / Play CDN) still handles layout utilities —
   this file owns everything else.

   TABLE OF CONTENTS
     §1  FONTS             — @font-face declarations (site-wide, declared once)
     §2  DESIGN TOKENS     — colors, accent system, light/dark, --chrome-* recipe
     §3  SHARED COMPONENTS — .skuo buttons, .ui-*, .card, inputs, .ov-nav, .discord
     §4  ICONS             — Font Awesome mask icons (GENERATED by tools/build-icons.mjs)
     §5+ PAGE SECTIONS     — one per page, scoped [data-page="..."], alphabetized:
                             ai-home · chat · design · design-lab · editor · goals ·
                             home · manage · privacy · research · search · themes ·
                             tos · version · whitename · word

   RULES
   - Page-local styles go in that page's section, scoped [data-page="<name>"].
   - Something every page needs graduates to §3 (or §2 if it's a token).
   - Never edit between the §4 GENERATED markers by hand — edit
     tools/build-icons.mjs and re-run it.
   - .dark lives on <html>; data-page on <body>. Page-section dark overrides
     look like:  .dark [data-page="chat"] .thing { ... }
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══ §1 FONTS ═══════════════════════════════════════════════════════════ */

@font-face {
  font-family: 'Satoshi';
  src: url('../Fonts/Satoshi-Variable.ttf') format('truetype');
  font-weight: 300 900;
  font-display: swap;
  font-style: normal;
}

@font-face {
  font-family: 'Satoshi';
  src: url('../Fonts/Satoshi-VariableItalic.ttf') format('truetype');
  font-weight: 300 900;
  font-display: swap;
  font-style: italic;
}

/* ═══ §2 DESIGN TOKENS · §3 SHARED COMPONENTS ════════════════════════════
   (formerly src/design-tokens.css — verbatim)
   ════════════════════════════════════════════════════════════════════════ */
```

Then append the **entire verbatim contents** of `src/design-tokens.css` (all 732 lines, unchanged), then append:

```css

/* §4 ICONS — generated by tools/build-icons.mjs: begin */
/* §4 ICONS — generated: end */
```

- [ ] **Step 2: Sanity-check**

```bash
wc -l src/site.css          # expect ~790 lines (60 header + 732 tokens + markers)
grep -c "@font-face" src/site.css   # expect 2
```

- [ ] **Step 3: Commit**

```bash
git add src/site.css
git commit -m "feat: scaffold src/site.css (fonts + tokens/shared from design-tokens.css)"
```

---

### Task 4: Icons — `tools/build-icons.mjs`, generate §4 + `src/feather-local.js`

**Files:**
- Create: `tools/build-icons.mjs`
- Modify: `src/site.css` (§4 between the generated markers)
- Create: `src/feather-local.js` (copied official UMD build)

- [ ] **Step 1: Write `tools/build-icons.mjs`**

```js
#!/usr/bin/env node
// tools/build-icons.mjs
// 1. Scans markup/JS for Font Awesome usage, resolves each icon against
//    node_modules/@fortawesome/fontawesome-free/svgs/<style>/<name>.svg,
//    and (re)generates the §4 block in src/site.css as mask-image rules
//    re-using the SAME class names (fa-solid fa-x etc.) => zero markup changes.
// 2. Copies the official feather-icons UMD build to src/feather-local.js.
import fs from 'node:fs';
import path from 'node:path';

const SCAN = [
  'index.html','whitename.html','design.html','design-lab.html','Themes/Themes.html',
  'word/index.html','search/index.html','AI/chat.html','AI/index.html','AI/manage.html',
  'AI/editor.html','AI/research.html','AI/tos.html','AI/privacy.html','AI/goals.html',
  'AI/version.html','AI/updatenotes.js','src/nav.js',
  ...fs.readdirSync('AI/js').filter(f => f.endsWith('.js')).map(f => 'AI/js/' + f),
].filter(p => fs.existsSync(p));

const STYLE_RE = /^fa-(solid|regular|brands)$/;
const UTILITY = new Set(['xs','sm','lg','xl','fw','spin','pulse','inverse','beat','fade','bounce','flip','shake',
  'flip-horizontal','flip-vertical','rotate-90','rotate-180','rotate-270','1x','2x','3x','4x','5x']);
const pairs = new Map(); // icon name -> style

for (const f of SCAN) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/g)) {
    const tokens = (m[1] || m[2]).split(/\s+/).filter(Boolean);
    const style = (tokens.find(t => STYLE_RE.test(t)) || 'solid').replace('fa-', '');
    for (const t of tokens) {
      const mm = /^fa-([a-z0-9-]+)$/.exec(t);
      if (!mm || STYLE_RE.test(t) || UTILITY.has(mm[1])) continue;
      if (pairs.has(mm[1]) && pairs.get(mm[1]) !== style)
        console.warn(`WARN style conflict fa-${mm[1]}: ${pairs.get(mm[1])} vs ${style} (first wins)`);
      else pairs.set(mm[1], style);
    }
  }
  // safety net: fa-name appearing outside class attributes (rare JS building)
  for (const m of txt.matchAll(/\bfa-([a-z0-9-]+)\b/g)) {
    const n = m[1];
    if (!pairs.has(n) && !UTILITY.has(n) && !['solid','regular','brands'].includes(n)) {
      pairs.set(n, 'solid');
      console.warn(`WARN unpaired fa-${n} in ${f} — defaulting to solid`);
    }
  }
}

const FA_DIR = 'node_modules/@fortawesome/fontawesome-free/svgs';
const rules = [], missing = [];
for (const [name, style] of [...pairs].sort()) {
  let svg = null;
  for (const st of [style, 'solid', 'regular', 'brands']) {
    const p = `${FA_DIR}/${st}/${name}.svg`;
    if (fs.existsSync(p)) { svg = fs.readFileSync(p, 'utf8'); break; }
  }
  if (!svg) { missing.push(name); continue; }
  const uri = 'data:image/svg+xml,' + encodeURIComponent(svg.replace('<svg', '<svg fill="black"'));
  rules.push(`.fa-${name} {\n  display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em;\n  background: currentColor;\n  -webkit-mask: url("${uri}") center / contain no-repeat;\n          mask: url("${uri}") center / contain no-repeat;\n}`);
}
if (missing.length) { console.error('MISSING ICONS: ' + missing.join(', ')); process.exit(1); }

const block = `/* ${rules.length} Font Awesome mask icons (from @fortawesome/fontawesome-free) */\n`
  + rules.join('\n\n')
  + `\n\n/* FA utilities actually used on the site */\n.fa-spin { animation: fa-spin 2s infinite linear; }\n@keyframes fa-spin { to { transform: rotate(360deg); } }\n`;

const SITE = 'src/site.css';
const css = fs.readFileSync(SITE, 'utf8');
const BEGIN = '/* §4 ICONS — generated by tools/build-icons.mjs: begin */';
const END = '/* §4 ICONS — generated: end */';
if (!css.includes(BEGIN) || !css.includes(END)) { console.error('§4 markers missing in src/site.css'); process.exit(1); }
fs.writeFileSync(SITE, css.replace(new RegExp(BEGIN + '[\\s\\S]*?' + END), BEGIN + '\n' + block + END));

fs.copyFileSync('node_modules/feather-icons/dist/feather.min.js', 'src/feather-local.js');
console.log(`§4: ${rules.length} icons written; src/feather-local.js written (${(fs.statSync('src/feather-local.js').size/1024).toFixed(0)}kb)`);
```

- [ ] **Step 2: Run it**

```bash
node tools/build-icons.mjs
```

Expected: `§4: ~53 icons written; src/feather-local.js written (~75kb)`. No MISSING, no unexplained WARNs. (Style conflicts for `fa-circle-check`/`fa-clipboard` between regular and solid are possible — if a WARN appears, check which style the markup actually pairs with the icon; the script keeps the first-seen pair, so confirm the rendered page in that page's migration task.)

- [ ] **Step 3: Verify the generated rules**

```bash
grep -c '^\.fa-' src/site.css     # expect ~53
grep -c 'feather' src/feather-local.js | head -1   # >0, file is the official UMD
node -e "const s=require('fs').readFileSync('src/site.css','utf8'); const m=s.match(/\.fa-xmark \{[\s\S]*?\}/); console.log(m[0].slice(0,160))"
```

Expected: a mask rule with a `data:image/svg+xml,...` URI.

- [ ] **Step 4: Commit**

```bash
git add tools/build-icons.mjs src/site.css src/feather-local.js
git commit -m "feat: generated FA mask-icon section + self-hosted feather-icons"
```

---

### Task 5: Migrate `AI/tos.html` (canonical page procedure)

**Files:**
- Modify: `AI/tos.html`
- Modify: `src/site.css` (appends the tos section)

This is the canonical procedure every later page task follows. **Read the dry-run report carefully** — it tells you exactly what will change.

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs AI/tos.html tos --dry
```

Expected report: `movedBlocks: 2`, `keptBlocks: []`, `rulesScoped` ~10–20, `fontFacesDropped: ["Satoshi","Satoshi"]` (the page's duplicate faces are dropped — they're in §1 now), `links`: design-tokens removed + `<body data-page="tos">`. No warnings.

- [ ] **Step 2: Real run + inspect the diff**

```bash
node tools/migrate-page.mjs AI/tos.html tos
git diff AI/tos.html
```

Expected diff: two `<style>` blocks gone; design-tokens `<link>` replaced by a single `<link rel="stylesheet" href="../src/site.css">` at the first block's old position; `<body>` gained `data-page="tos"`. Nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" AI/tos.html          # expect 0
grep -c "site.css" AI/tos.html        # expect 1
grep -c "design-tokens" AI/tos.html   # expect 0
grep -c 'data-page="tos"' AI/tos.html # expect 1
grep -c '\[data-page="tos"\]' src/site.css  # expect >= rulesScoped
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after tos
node tools/visual-diff.mjs tos
```

Expected: both pairs `< 2%`. If flagged: `open tools/snapshots/before/tos-light.png tools/snapshots/after/tos-light.png tools/snapshots/diff-tos-light.png` and find the cause before proceeding.

- [ ] **Step 5: Commit**

```bash
git add AI/tos.html src/site.css
git commit -m "refactor(css): migrate tos page styles into src/site.css"
```

---

### Task 6: Migrate `AI/privacy.html`

**Files:** Modify: `AI/privacy.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs AI/privacy.html privacy --dry
```

Expected: `movedBlocks: 2`, `fontFacesDropped: ["Satoshi","Satoshi"]`, no warnings.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs AI/privacy.html privacy
git diff AI/privacy.html
```

Expected: both `<style>` blocks gone; one `<link rel="stylesheet" href="../src/site.css">` at the first block's old position; `data-page="privacy"` on `<body>`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" AI/privacy.html            # expect 0
grep -c 'data-page="privacy"' AI/privacy.html # expect 1
grep -c "design-tokens" AI/privacy.html     # expect 0
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after privacy && node tools/visual-diff.mjs privacy
```

Expected: `< 2%` per pair; investigate any flag before continuing.

- [ ] **Step 5: Commit**

```bash
git add AI/privacy.html src/site.css
git commit -m "refactor(css): migrate privacy page styles into src/site.css"
```

---

### Task 7: Migrate `AI/manage.html`

**Files:** Modify: `AI/manage.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs AI/manage.html manage --dry
```

Expected: `movedBlocks: 1`, `fontFacesDropped: ["Satoshi","Satoshi"]`, links include `font-awesome link(s) removed: 1`. No warnings.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs AI/manage.html manage
git diff AI/manage.html
```

Expected: `<style>` block gone; design-tokens + FA links gone; `../src/site.css` link at the block's old position; `data-page="manage"` on `<body>`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" AI/manage.html            # expect 0
grep -c 'data-page="manage"' AI/manage.html # expect 1
grep -c "design-tokens\|font-awesome" AI/manage.html  # expect 0
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after manage && node tools/visual-diff.mjs manage
```

Expected: `< 2%`. Eyeball the after shots: the page's 4 FA icons now render from §4 masks — present and correctly sized.

- [ ] **Step 5: Commit**

```bash
git add AI/manage.html src/site.css
git commit -m "refactor(css): migrate manage page styles into src/site.css"
```

---

### Task 8: Migrate `AI/goals.html`

**Files:** Modify: `AI/goals.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs AI/goals.html goals --dry
```

Expected: `movedBlocks: 2`, Satoshi faces dropped, no warnings.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs AI/goals.html goals
git diff AI/goals.html
```

Expected: `<style>` blocks gone; `../src/site.css` link at the first block's old position; `data-page="goals"`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" AI/goals.html            # expect 0
grep -c 'data-page="goals"' AI/goals.html # expect 1
grep -c "design-tokens" AI/goals.html     # expect 0
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after goals && node tools/visual-diff.mjs goals
```

Expected: `< 2%`.

- [ ] **Step 5: Commit**

```bash
git add AI/goals.html src/site.css
git commit -m "refactor(css): migrate goals page styles into src/site.css"
```

---

### Task 9: Migrate `design.html`

**Files:** Modify: `design.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs design.html design --dry
```

Expected: `movedBlocks: 1`, `fontFacesDropped: []` (this page has no inline @font-face), no warnings.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs design.html design
git diff design.html
```

Expected: `<style>` block gone; `<link rel="stylesheet" href="src/site.css">` at the block's old position — this page keeps `<link href="src/output.css">` (compiled Tailwind); verify `site.css` lands **after** `output.css`. `data-page="design"`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" design.html            # expect 0
grep -c 'data-page="design"' design.html # expect 1
grep -n "output.css\|site.css" design.html   # output.css first, then site.css
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after design && node tools/visual-diff.mjs design
```

Expected: `< 2%`. This is the design-system showcase — eyeball buttons/badges/inputs carefully.

- [ ] **Step 5: Commit**

```bash
git add design.html src/site.css
git commit -m "refactor(css): migrate design page styles into src/site.css"
```

---

### Task 10: Migrate `AI/version.html`

**Files:** Modify: `AI/version.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs AI/version.html version --dry
```

Expected: `movedBlocks: 2`, Satoshi faces dropped, no warnings. (The JetBrains Mono Google-Fonts `<link>` stays — fonts are out of scope.)

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs AI/version.html version
git diff AI/version.html
```

Expected: `<style>` blocks gone; `../src/site.css` link in place; `data-page="version"`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" AI/version.html            # expect 0
grep -c 'data-page="version"' AI/version.html # expect 1
grep -c "design-tokens" AI/version.html     # expect 0
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after version && node tools/visual-diff.mjs version
```

Expected: `< 2%`.

- [ ] **Step 5: Commit**

```bash
git add AI/version.html src/site.css
git commit -m "refactor(css): migrate version page styles into src/site.css"
```

---

### Task 11: Migrate `AI/research.html`

**Files:** Modify: `AI/research.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs AI/research.html research --dry
```

Expected: `movedBlocks: 2`, Satoshi faces dropped, no warnings.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs AI/research.html research
git diff AI/research.html
```

Expected: `<style>` blocks gone; `../src/site.css` link in place; `data-page="research"`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" AI/research.html            # expect 0
grep -c 'data-page="research"' AI/research.html # expect 1
grep -c "design-tokens" AI/research.html     # expect 0
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after research && node tools/visual-diff.mjs research
```

Expected: `< 2%`.

- [ ] **Step 5: Commit**

```bash
git add AI/research.html src/site.css
git commit -m "refactor(css): migrate research page styles into src/site.css"
```

---

### Task 12: Migrate `design-lab.html`

**Files:** Modify: `design-lab.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs design-lab.html design-lab --dry
```

Expected: `movedBlocks: 1`, no faces dropped, no warnings. Dev-scratch page — migrate for link compatibility, spend no cleanup effort.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs design-lab.html design-lab
git diff design-lab.html
```

Expected: `<style>` block gone; `src/site.css` link in place (after `output.css`); `data-page="design-lab"`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" design-lab.html            # expect 0
grep -c 'data-page="design-lab"' design-lab.html # expect 1
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after design-lab && node tools/visual-diff.mjs design-lab
```

Expected: `< 2%`.

- [ ] **Step 5: Commit**

```bash
git add design-lab.html src/site.css
git commit -m "refactor(css): migrate design-lab page styles into src/site.css"
```

---

### Task 13: Migrate `search/index.html`

**Files:** Modify: `search/index.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs search/index.html search --dry
```

Expected: `movedBlocks: 1`, no faces dropped, no warnings.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs search/index.html search
git diff search/index.html
```

Expected: `<style>` block gone; `../src/site.css` link in place; `data-page="search"`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" search/index.html            # expect 0
grep -c 'data-page="search"' search/index.html # expect 1
grep -c "design-tokens" search/index.html     # expect 0
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after search && node tools/visual-diff.mjs search
```

Expected: `< 2%`. (If the Saga answer panel contains dynamic text at shot time, a flagged diff confined to the panel region is acceptable — confirm by eye that layout/chrome match.)

- [ ] **Step 5: Commit**

```bash
git add search/index.html src/site.css
git commit -m "refactor(css): migrate search page styles into src/site.css"
```

---

### Task 14: Migrate `AI/editor.html`

**Files:** Modify: `AI/editor.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs AI/editor.html editor --dry
```

Expected: `movedBlocks: 2`, Satoshi faces dropped, no warnings.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs AI/editor.html editor
git diff AI/editor.html
```

Expected: `<style>` blocks gone; `../src/site.css` link in place; `data-page="editor"`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" AI/editor.html            # expect 0
grep -c 'data-page="editor"' AI/editor.html # expect 1
grep -c "design-tokens" AI/editor.html     # expect 0
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after editor && node tools/visual-diff.mjs editor
```

Expected: `< 2%`.

- [ ] **Step 5: Commit**

```bash
git add AI/editor.html src/site.css
git commit -m "refactor(css): migrate editor page styles into src/site.css"
```

---

### Task 15: Migrate `index.html` (home)

**Files:** Modify: `index.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs index.html home --dry
```

Expected: `movedBlocks: 1`, Satoshi faces dropped, no warnings.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs index.html home
git diff index.html
```

Expected: `<style>` block gone; `src/site.css` link in place; `data-page="home"`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" index.html            # expect 0
grep -c 'data-page="home"' index.html  # expect 1
grep -c "design-tokens" index.html     # expect 0
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after home && node tools/visual-diff.mjs home
```

Expected: `< 2%`. Watch the `.hero-search` pill and the 3D-book hero — pure CSS, must be unchanged.

- [ ] **Step 5: Commit**

```bash
git add index.html src/site.css
git commit -m "refactor(css): migrate home page styles into src/site.css"
```

---

### Task 16: Migrate `AI/index.html` (ai-home)

**Files:** Modify: `AI/index.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs AI/index.html ai-home --dry
```

Expected: `movedBlocks: 2`, Satoshi faces dropped, no warnings.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs AI/index.html ai-home
git diff AI/index.html
```

Expected: `<style>` blocks gone; `../src/site.css` link in place; `data-page="ai-home"`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" AI/index.html            # expect 0
grep -c 'data-page="ai-home"' AI/index.html # expect 1
grep -c "design-tokens" AI/index.html     # expect 0
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after ai-home && node tools/visual-diff.mjs ai-home
```

Expected: `< 2%`. The storybook hero leaf-turn is Web-Animations-API driven — confirm the book renders (its CSS 3D classes migrated).

- [ ] **Step 5: Commit**

```bash
git add AI/index.html src/site.css
git commit -m "refactor(css): migrate AI landing page styles into src/site.css"
```

---

### Task 17: Migrate `whitename.html`

**Files:** Modify: `whitename.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs whitename.html whitename --dry
```

Expected: `movedBlocks: 0` (no inline styles), links: design-tokens removed; site.css link inserted before `</head>`; `data-page="whitename"` added.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs whitename.html whitename
git diff whitename.html
```

Expected: `/src/design-tokens.css` link gone, `<link rel="stylesheet" href="/src/site.css">` before `</head>`, `data-page="whitename"` on `<body>`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "site.css" whitename.html        # expect 1
grep -c "design-tokens" whitename.html   # expect 0
grep -c 'data-page="whitename"' whitename.html # expect 1
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after whitename && node tools/visual-diff.mjs whitename
```

Expected: `< 2%`.

- [ ] **Step 5: Commit**

```bash
git add whitename.html
git commit -m "refactor(css): point whitename at src/site.css"
```

---

---

### Task 18: Migrate `Themes/Themes.html`

**Files:** Modify: `Themes/Themes.html`, `src/site.css`

- [ ] **Step 1: Move `src/styles.css` into the themes section**

`Themes.html` has no inline `<style>`; its page CSS lives in `src/styles.css` (186 lines). Use the script's CSS mode:

```bash
node tools/migrate-page.mjs --css src/styles.css themes
```

- [ ] **Step 2: Migrate the page shell**

```bash
node tools/migrate-page.mjs Themes/Themes.html themes --dry
node tools/migrate-page.mjs Themes/Themes.html themes
```

Expected report: `movedBlocks: 0`; links: design-tokens removed, `styles.css link removed`, `devicons link removed`; site.css link inserted before `</head>` (verify in the diff it lands **after** `output.css`).

- [ ] **Step 3: Verify + visual check + commit**

```bash
grep -c "styles.css\|design-tokens\|devicon" Themes/Themes.html   # expect 0
node tools/snapshot.mjs after themes && node tools/visual-diff.mjs themes
git add Themes/Themes.html src/site.css
git commit -m "refactor(css): migrate Themes page (incl. styles.css) into src/site.css"
```

---

### Task 19: Migrate `word/index.html`

**Files:** Modify: `word/index.html`, `src/site.css`

- [ ] **Step 1: Dry run**

```bash
node tools/migrate-page.mjs word/index.html word --dry
```

Expected: `movedBlocks: 2`, `rulesScoped` in the hundreds (852 lines of CSS), `fontFacesDropped: []` (word uses Google-Fonts JetBrains Mono, no inline Satoshi face), `font-awesome link(s) removed: 2` (this page uses the preload+onload FA pattern — both lines go). No warnings.

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs word/index.html word
git diff word/index.html
```

Expected: both `<style>` blocks gone; FA preload + stylesheet links gone; `../src/site.css` link at the first block's old position; `data-page="word"` on `<body>`; nothing else.

- [ ] **Step 3: Verify invariants**

```bash
grep -c "<style" word/index.html            # expect 0
grep -c 'data-page="word"' word/index.html  # expect 1
grep -c "design-tokens\|font-awesome" word/index.html  # expect 0
```

- [ ] **Step 4: Visual check**

```bash
node tools/snapshot.mjs after word && node tools/visual-diff.mjs word
```

Expected: `< 2%`. Eyeball the after shots: the toolbar FA icons (32 instances) now render from §4 masks — crisp and correctly sized (they size off `font-size` now).

- [ ] **Step 5: Commit**

```bash
git add word/index.html src/site.css
git commit -m "refactor(css): migrate word page styles into src/site.css"
```

---

### Task 20: Migrate `AI/chat.html` (the big one) + JS-injected CSS

**Files:**
- Modify: `AI/chat.html`
- Modify: `src/site.css` (appends the chat section — ~3,400 lines)
- Modify: `AI/js/canvas.js` (delete `_injectCanvasLayoutCSS`, lines 97–270)
- Modify: `AI/js/chat-actions.js` (delete `_injectSourcesCSS`, lines 406–425)

- [ ] **Step 1: Dry run — verify the dynamic-accent block is preserved**

```bash
node tools/migrate-page.mjs AI/chat.html chat --dry
```

Expected report: `movedBlocks: 3` (the @font-face block and the two big blocks), **`keptBlocks` contains `id="dynamic-accent-styles"`** — if it doesn't, STOP and fix the script's `id` detection before continuing. `fontFacesDropped: ["Satoshi","Satoshi"]`. `links`: design-tokens removed, `feather CDN -> ../src/feather-local.js`. Scan `renamedKeyframes` — any collisions with earlier page sections get `chat-` prefixed (expected for generic names like `fadeIn` if an earlier page defined one).

- [ ] **Step 2: Real run + inspect diff**

```bash
node tools/migrate-page.mjs AI/chat.html chat
git diff --stat AI/chat.html
```

Expected: ~3,400 lines removed, link + `data-page="chat"` added, feather script swapped, `#dynamic-accent-styles` untouched.

- [ ] **Step 3: Move the two JS-injected static style blocks into the chat section**

Extract each template literal body into a temp file, scope-append it, then delete the IIFE:

```bash
sed -n '101,268p' AI/js/canvas.js | sed '1s/^ *s\.textContent = `//; $s/`; *$//' > /tmp/canvas-layout.css
sed -n '409,424p' AI/js/chat-actions.js | sed '1s/^ *s\.textContent = `//; $s/`; *$//' > /tmp/sources-btn.css
```

Open both temp files and confirm they contain only CSS (adjust the line ranges by hand if the sed trimming left JS on the first/last line). Then:

```bash
node tools/migrate-page.mjs --css /tmp/canvas-layout.css chat
node tools/migrate-page.mjs --css /tmp/sources-btn.css chat
```

The second run renames `@keyframes fadeIn` → `chat-fadeIn` if the name already exists in the chat section (the report shows it).

Now delete the injections from JS. In `AI/js/canvas.js` delete the entire IIFE `// Inject 70/30 layout rules (no chat.html edit needed)` through `})();` (lines 96–270, ending after `document.head.appendChild(s);`). In `AI/js/chat-actions.js` delete the entire `_injectSourcesCSS` IIFE (lines 406–425).

- [ ] **Step 4: Verify invariants**

```bash
grep -c "<style" AI/chat.html                     # expect 1 (dynamic-accent-styles only)
grep -c 'id="dynamic-accent-styles"' AI/chat.html # expect 1
grep -c "feather-local.js" AI/chat.html           # expect 1
grep -c "feather-icons\|font-awesome" AI/chat.html  # expect 0 (katex/marked/tailwind CDNs remain, untouched)
grep -c "_injectCanvasLayoutCSS\|_injectSourcesCSS" AI/js/canvas.js AI/js/chat-actions.js  # expect 0 0
grep -c 'data-page="chat"' AI/chat.html           # expect 1
```

- [ ] **Step 5: Visual + functional check**

```bash
node tools/snapshot.mjs after chat && node tools/visual-diff.mjs chat
```

Then open `http://127.0.0.1:8901/AI/chat.html` (start any static server) by hand and verify: sidebar renders + history rows hover/press; send one message (needs the backend — if unreachable, confirm the input bar, book-flip indicator area, and error state render correctly); thought-block container styling; modals (settings, account) — FA/feather icons all render; accent picker still recolors the UI (dynamic-accent block intact); dark mode toggle.

- [ ] **Step 6: Commit**

```bash
git add AI/chat.html AI/js/canvas.js AI/js/chat-actions.js src/site.css
git commit -m "refactor(css): migrate chat page + JS-injected styles into src/site.css"
```

---

### Task 21: Cleanup, full sweep, docs

**Files:**
- Delete: `src/design-tokens.css`, `src/styles.css`, `AI/thing.css`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Delete the absorbed/dead files**

```bash
git rm src/design-tokens.css src/styles.css AI/thing.css
grep -rl "design-tokens\|styles\.css\|thing\.css" --include="*.html" .  # expect NO matches
```

- [ ] **Step 2: Full visual sweep**

```bash
node tools/snapshot.mjs after
node tools/visual-diff.mjs
```

Expected: every pair `< 2%` or eyeballed-and-explained (dynamic content like the Astra answer panel). Open any flagged diff PNGs.

- [ ] **Step 3: Manual smoke checklist (even if diffs are clean)**

Serve the repo (`python3 -m http.server 8901`) and open every page in light + dark: nav capsule, `.skuo` buttons (hover/press), badges/inputs, icons visible and correctly sized, chat thoroughly (sidebar, bubbles, thought blocks, book-flip animation, modals, accent picker, voice button).

- [ ] **Step 4: Update `CLAUDE.md`**

Make these edits (and only these):

1. In the intro/Build section, add one line: `All hand-written styles, themes, and FA icons live in the single stylesheet src/site.css — edit it there. Page-local rules go in that page's [data-page="..."] section; shared components in §3. src/feather-local.js is the self-hosted feather-icons build (chat only).`
2. In the "Skeuomorphic glossy buttons (site-wide)" section: replace `All 14 pages link src/design-tokens.css, which is the single shared stylesheet.` with `All pages link src/site.css (see §2–§3 there for tokens + shared components).`
3. In "Unified inputs, cards, and the showcase page" and "Universal adoption" sections: replace each mention of editing `src/design-tokens.css` with `src/site.css` (§2 tokens / §3 components / page sections).
4. In "Universal floating nav": change "`.ov-nav*` block in `src/design-tokens.css`" to "`.ov-nav*` block in `src/site.css` §3".
5. Add one line under the icons-relevant section: `Icons: Font Awesome glyphs are CSS mask rules in src/site.css §4 (generated by tools/build-icons.mjs — re-run it to add icons); feather-icons is self-hosted as src/feather-local.js. No icon CDNs remain.`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "refactor(css): retire design-tokens/styles/thing.css — src/site.css is the single stylesheet"
```

---

## Self-review notes (plan author)

- **Spec coverage:** single file + no build (T3), page scoping (script, all page tasks), fonts dedupe (T3 §1 + script drop), FA masks (T4), feather self-host (T4 + chat swap), styles.css/thing.css/devicons cleanup (T18, T21), dynamic-accent preserved (T20 S1), JS-injected static CSS (T20 S3), link order after Tailwind (script inserts at first-block position), CLAUDE.md (T21 S4), visual verification (T2 + per-page + T21).
- **Known soft spots:** screenshot diffs on pages with live/dynamic content (search AI panel, chat backend calls) are review aids, not gates. `fa-circle-check`/`fa-clipboard` style conflicts (regular vs solid) are WARNed by build-icons and eyeballed in that page's task.
