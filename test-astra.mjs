import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const AstraHelpers = require('./search/astra-helpers.js');
const html = readFileSync(new URL('./search/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('./search/astra.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('not ok - ' + name);
    throw error;
  }
}

test('domainIdentity normalizes hostnames and creates deterministic identity data', () => {
  const first = AstraHelpers.domainIdentity('https://WWW.Example.COM/some/path');
  const second = AstraHelpers.domainIdentity('example.com');

  assert.deepEqual(first, second);
  assert.equal(first.hostname, 'example.com');
  assert.equal(first.monogram, 'EX');
  assert.equal(first.paletteIndex, 2);
});

test('domainIdentity derives letters from separate hostname labels', () => {
  assert.deepEqual(AstraHelpers.domainIdentity('https://docs.nodejs.org/api/'), {
    hostname: 'docs.nodejs.org',
    monogram: 'DN',
    paletteIndex: 4,
  });
});

test('normalizeTab accepts only the images route', () => {
  assert.equal(AstraHelpers.normalizeTab('images'), 'images');
  assert.equal(AstraHelpers.normalizeTab('all'), 'all');
  assert.equal(AstraHelpers.normalizeTab('IMAGES'), 'all');
  assert.equal(AstraHelpers.normalizeTab(null), 'all');
});

test('linkifyCitations links individual and grouped in-range citations', () => {
  assert.equal(
    AstraHelpers.linkifyCitations('See [1], then [2, 3].', 3),
    'See [<a href="#result-1">1</a>], then [<a href="#result-2">2</a>, <a href="#result-3">3</a>].'
  );
});

test('linkifyCitations leaves out-of-range values unlinked inside groups', () => {
  assert.equal(
    AstraHelpers.linkifyCitations('Mixed [0, 2, 9] and [12].', 3),
    'Mixed [0, <a href="#result-2">2</a>, 9] and [12].'
  );
});

test('renderAssistantHtml uses marked when its parser is available', () => {
  const fakeMarked = { parse: (text) => '<p>' + text + '</p>' };
  assert.equal(
    AstraHelpers.renderAssistantHtml('**safe** [1]', 1, fakeMarked),
    '<p>**safe** [<a href="#result-1">1</a>]</p>'
  );
});

test('renderAssistantHtml safely falls back to plain text when marked is absent', () => {
  assert.equal(
    AstraHelpers.renderAssistantHtml('<img src=x onerror=alert(1)>\nsource [1]', 1),
    '&lt;img src=x onerror=alert(1)&gt;<br>source [<a href="#result-1">1</a>]'
  );
});

test('search inputs and suggestion popups expose a combobox/listbox contract', () => {
  for (const prefix of ['hero', 'results']) {
    assert.match(html, new RegExp(`id="${prefix}-input"[^>]*role="combobox"[^>]*aria-autocomplete="list"[^>]*aria-controls="${prefix}-suggest"[^>]*aria-expanded="false"`));
    assert.match(html, new RegExp(`id="${prefix}-suggest"[^>]*role="listbox"`));
  }
  assert.match(js, /setAttribute\('aria-expanded', box\.hidden \? 'false' : 'true'\)/);
  assert.match(js, /b\.role = 'option'/);
  assert.match(js, /setAttribute\('aria-activedescendant', active >= 0 \? box\.children\[active\]\.id : ''\)/);
  assert.match(js, /e\.key === 'Home'/);
  assert.match(js, /e\.key === 'End'/);
});

test('results tabs expose tablist, tab, and tabpanel state with keyboard navigation', () => {
  assert.match(html, /id="r-tabs"[^>]*role="tablist"[^>]*aria-label="Search result views"/);
  assert.match(html, /id="tab-all"[^>]*role="tab"[^>]*aria-controls="result-list"/);
  assert.match(html, /id="tab-images"[^>]*role="tab"[^>]*aria-controls="image-grid"/);
  assert.match(html, /id="result-list"[^>]*role="tabpanel"[^>]*aria-labelledby="tab-all"/);
  assert.match(html, /id="image-grid"[^>]*role="tabpanel"[^>]*aria-labelledby="tab-images"/);
  assert.match(js, /setAttribute\('aria-selected', selected \? 'true' : 'false'\)/);
  assert.match(js, /tabEl\.tabIndex = selected \? 0 : -1/);
  assert.match(js, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
});

test('search and AI progress expose polite status and busy state', () => {
  assert.match(html, /id="r-meta"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="ai-thinking"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="ai-panel"[^>]*aria-busy="false"/);
  assert.match(html, /id="result-list"[^>]*aria-busy="false"/);
  assert.match(js, /\$\('ai-panel'\)\.setAttribute\('aria-busy', on \? 'true' : 'false'\)/);
  assert.match(js, /\$\('result-list'\)\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(html, /id="ai-error"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(js, /if \(!firstToken\) \{ firstToken = true; hideThinking\(\); \}/);
});

test('AI toggle and fullscreen control keep accessible labels and expanded state in sync', () => {
  assert.match(js, /t\.setAttribute\('aria-label', on \? 'Hide AI answer' : 'Show AI answer'\)/);
  assert.match(html, /id="ai-expand"[^>]*aria-expanded="false"[^>]*aria-controls="ai-panel"/);
  assert.match(js, /setAttribute\('aria-expanded', on \? 'true' : 'false'\)/);
  assert.match(js, /document\.title = on \? 'Astra Answer — Okemo Astra' : fullscreenTitle/);
});

test('fullscreen AI content stays centered without horizontal overflow', () => {
  assert.match(css, /\.ai-panel\.ai-fullscreen\s*\{[^}]*box-sizing:\s*border-box/);
  assert.match(css, /\.ai-panel\.ai-fullscreen > \*\s*\{[^}]*width:\s*min\(100%,\s*760px\)[^}]*box-sizing:\s*border-box/);
});

test('image preview and fullscreen AI use the shared modal accessibility controller', () => {
  assert.match(html, /id="ig-preview"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="igp-title"/);
  assert.match(js, /function openModalLayer\(dialog, initialFocus, restoreFocus\)/);
  assert.match(js, /function closeModalLayer\(dialog\)/);
  assert.match(js, /document\.body\.classList\.toggle\('modal-open'/);
  assert.match(js, /child\.inert = open/);
  assert.match(js, /if \(e\.key === 'Tab'\) trapModalFocus\(e\)/);
  assert.match(js, /if \(e\.key === 'Escape'\) closeTopModal\(\)/);
  assert.match(js, /panel\.setAttribute\('role', 'dialog'\)/);
  assert.match(js, /panel\.setAttribute\('aria-modal', 'true'\)/);
});

test('image preview supplies a meaningful image alternative', () => {
  assert.match(js, /img\.alt = r\.title \|\| 'Image from ' \+ crumbFor\(r\.url\)\.site/);
});

test('results use local identities and never request Google favicons', () => {
  assert.doesNotMatch(js, /google\.com\/s2\/favicons/);
  assert.match(js, /AstraHelpers\.domainIdentity\(r\.url\)/);
  assert.match(js, /r-monogram/);
});

test('long result URLs cannot widen the results page', () => {
  assert.match(css, /\.result > div\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
  assert.match(css, /\.r-crumb\s*\{[^}]*max-width:\s*100%[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/);
});

test('search supports skeletons, actionable empty state, and hybrid loading', () => {
  assert.match(js, /function renderResultSkeletons\(/);
  assert.match(js, /function renderEmptyResults\(/);
  assert.match(js, /Load more stars/);
  assert.match(js, /result-load-more/);
});

test('AI panel exposes provenance and grounding sources', () => {
  assert.match(html, /id="ai-provenance"/);
  assert.match(html, /id="ai-sources"/);
  assert.match(js, /function renderAiSources\(/);
  assert.match(js, /AstraHelpers\.renderAssistantHtml/);
});

test('citation targets receive an orientation highlight', () => {
  assert.match(js, /citation-target/);
});

test('mobile results header stacks the logo above the search bar', () => {
  const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.r-top\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.r-logo\s*\{[^}]*align-self:\s*center/);
});

test('cosmic button uses a drifting aurora border with reduced-motion fallback', () => {
  const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');
  assert.match(css, /\.ai-ring\s*\{[^}]*display:\s*inline-flex[^}]*line-height:\s*0[^}]*padding:\s*2px[^}]*linear-gradient\([^}]*#d97790[^}]*#f0a35e[^}]*#f6c177[^}]*#d97790[^}]*background-size:\s*300% 100%[^}]*animation:\s*astra-aurora-drift 8s var\(--ease-smooth\) infinite alternate/);
  assert.match(css, /@keyframes astra-aurora-drift\s*\{[^}]*background-position:\s*100% 50%/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.ai-ring[^}]*animation:\s*none/);
});

test('cosmic button press scales the gradient wrapper and inner button together', () => {
  const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');
  assert.match(css, /\.ai-ring\s*\{[^}]*transition:\s*transform var\(--dur-1\) var\(--ease-soft\)/);
  assert.match(css, /\.ai-ring:has\(\.skuo:active\)\s*\{[^}]*transform:\s*scale\(0\.97\)/);
  assert.match(css, /\.ai-ring \.skuo:active\s*\{[^}]*transform:\s*none/);
});

console.log('Astra helper tests passed');
