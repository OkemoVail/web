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
 *
 * Assumptions: kept-<style>-block detection is by id attribute only (a block
 * with an id is never moved); <style> inside HTML comments is NOT detected
 * (none exist in the repo); <style> inside <script> template literals IS
 * detected and skipped with a warning.
 */
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const cssMode = argv[0] === '--css';
const positional = argv.filter(a => a !== '--dry' && a !== '--css');
const [target, pageName] = positional;
if (!target || !pageName) {
  console.error('usage: node tools/migrate-page.mjs <page.html>|<--css file.css> <data-page-name> [--dry]');
  process.exit(1);
}
if (!fs.existsSync(path.resolve(process.cwd(), target))) {
  console.error(`error: file not found: ${target}\n  (resolved against cwd ${process.cwd()} — run from the repo root or pass a correct path)`);
  process.exit(1);
}

const ROOT = process.cwd();
const SITE = path.resolve(ROOT, 'src/site.css');
const hook = `[data-page="${pageName}"]`;
const report = { movedBlocks: 0, keptBlocks: [], rulesScoped: 0, fontFacesDropped: [], renamedKeyframes: {}, links: [], warnings: [] };

function scopeOne(sel) {
  const s = sel.trim();
  const rootHook = `html:has(> body[data-page="${pageName}"])`;
  if (s === ':root')     return rootHook;
  if (s === 'html')      return rootHook;
  if (s === 'html.dark') return `html.dark:has(> body[data-page="${pageName}"])`;
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
      for (const [oldK, nu] of renames) {
        const esc = oldK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        d.value = d.value.replace(new RegExp(`(?<![\\w-])${esc}(?![\\w-])`, 'g'), nu);
      }
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

  // --- extract id-less <style> blocks (skipping lookalikes inside <script>)
  const scriptRanges = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)]
    .map(sm => [sm.index, sm.index + sm[0].length]);
  const styleRe = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
  const moved = [];
  let m;
  while ((m = styleRe.exec(html))) {
    if (scriptRanges.some(([a, b]) => m.index >= a && m.index < b)) {
      report.warnings.push(`style-like block inside <script> skipped at index ${m.index} — review manually`);
      continue;
    }
    if (/\bid\s*=/.test(m[1])) { report.keptBlocks.push(m[1].trim()); continue; }
    moved.push({ full: m[0], css: m[2], index: m.index });
  }
  report.movedBlocks = moved.length;
  if (moved.length) appendSection(moved.map(b => b.css).join('\n\n'), pageName.toUpperCase());

  // --- figure out path prefix from the design-tokens link (keeps '/src/' vs '../src/' style)
  const dtMatch = html.match(/<link[^>]*href="([^"]*\/)?design-tokens\.css"[^>]*>\s*\n?/i);
  const prefix = dtMatch ? (dtMatch[1] || '') : '/src/'; // e.g. 'src/', '../src/', '/src/'
  if (!dtMatch) report.warnings.push('no design-tokens.css link found — inserting site.css link before </head>');
  const siteLink = `<link rel="stylesheet" href="${prefix}site.css">\n    `;

  let out = html;
  if (dtMatch) { out = out.replace(dtMatch[0], ''); report.links.push('design-tokens.css link removed'); }
  const stMatch = out.match(/<link[^>]*href="[^"]*\/styles\.css"[^>]*>\s*\n?/i);
  if (stMatch) { out = out.replace(stMatch[0], ''); report.links.push('styles.css link removed'); }

  const faBefore = (out.match(/font-awesome|fontawesome/gi) || []).length;
  out = out.replace(/<link[^>]*font-?awesome[^>]*>\s*(\n)?/gi, '');
  if (faBefore) report.links.push(`font-awesome link(s) removed: ${faBefore}`);
  out = out.replace(/<noscript>\s*<\/noscript>\s*(\n)?/gi, '');
  const dvBefore = (out.match(/devicon/gi) || []).length;
  out = out.replace(/<link[^>]*devicon[^>]*>\s*(\n)?/gi, '');
  if (dvBefore) report.links.push('devicons link removed');

  const feRe = /<script[^>]*src="https:\/\/[^"]*feather[^"]*"[^>]*>\s*<\/script>\s*\n?/i;
  if (feRe.test(out)) {
    out = out.replace(feRe, `<script src="${prefix}feather-local.js"></script>\n`);
    report.links.push(`feather CDN -> ${prefix}feather-local.js`);
  }

  if (/site\.css/.test(out)) {
    report.warnings.push('already links site.css — re-run?');
  } else if (moved.length) {
    out = out.replace(moved[0].full, siteLink);           // link goes where the first block was
    for (let i = 1; i < moved.length; i++) out = out.replace(moved[i].full, '');
  } else {
    out = out.replace(/<\/head>/i, `    ${siteLink}</head>`);
  }

  if (!/data-page=/.test(out)) {
    if (!/<body(\s[^>]*)?>/i.test(out)) report.warnings.push('no <body> tag found — add data-page manually');
    else { out = out.replace(/<body(\s[^>]*)?>/i, `<body data-page="${pageName}"$1>`); report.links.push(`<body data-page="${pageName}">`); }
  }

  if (!dry) fs.writeFileSync(absHtml, out);
}

console.log((dry ? '--- DRY RUN ---\n' : '') + JSON.stringify(report, null, 2));
if (!cssMode && !dry) console.log(`migrated ${target} -> [data-page="${pageName}"]`);
