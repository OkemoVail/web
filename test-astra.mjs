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

test('parsePerspectivesJSON renders complete perspectives data and accurate source counts', () => {
  const perspectives = {
    consensus: [
      { claim: 'EVs produce fewer lifecycle emissions', citations: [1, 3, 5] },
      { claim: 'Battery production is carbon-intensive', citations: [2, 4] },
    ],
    contradictions: [{
      position_a: { claim: 'Lithium mining has severe impact', citations: [1, 3] },
      position_b: { claim: 'Mining impact is overstated', citations: [5, 7] },
    }],
    outliers: [{ claim: 'EV tires produce more particulates', citation: 8 }],
    source_map: {
      ddg: 14,
      bing: 11,
      mojeek: 9,
      overlap_all_three: 5,
      domain_types: { academic: 30, news: 25, commercial: 20, personal: 15 },
    },
  };

  const rendered = AstraHelpers.parsePerspectivesJSON(perspectives);

  assert.match(rendered, /perspectives-consensus/);
  assert.match(rendered, /EVs produce fewer lifecycle emissions/);
  assert.match(rendered, /\[<a[^>]*>1<\/a>, <a[^>]*>3<\/a>, <a[^>]*>5<\/a>\]/);
  assert.match(rendered, /perspectives-contradictions/);
  assert.match(rendered, /position_a/);
  assert.match(rendered, /position_b/);
  assert.match(rendered, /perspectives-outliers/);
  assert.match(rendered, /perspectives-sourcemap/);
  assert.match(rendered, /DDG \(14\)/);
  assert.match(rendered, /Bing \(11\)/);
  assert.match(rendered, /Mojeek \(9\)/);
  assert.match(rendered, /5 shared across all three/);
  assert.match(rendered, /Academic 30%/);
  assert.doesNotMatch(rendered, /unique results/);
});

test('parsePerspectivesJSON returns a fallback for null input', () => {
  assert.match(AstraHelpers.parsePerspectivesJSON(null), /perspectives-fallback/);
});

test('parsePerspectivesJSON handles empty sections and omits absent optional sections', () => {
  const empty = AstraHelpers.parsePerspectivesJSON({
    consensus: [], contradictions: [], outliers: [], source_map: {},
  });
  assert.match(empty, /Sources overwhelmingly agree/);
  assert.match(empty, /No uncorroborated outliers/);

  const consensusOnly = AstraHelpers.parsePerspectivesJSON({
    consensus: [{ claim: 'Only fact', citations: [1] }],
    source_map: { ddg: 10 },
  });
  assert.match(consensusOnly, /perspectives-consensus/);
  assert.match(consensusOnly, /\[<a[^>]*>1<\/a>\]/);
  assert.doesNotMatch(consensusOnly, /perspectives-contradictions/);
  assert.doesNotMatch(consensusOnly, /perspectives-outliers/);
});

test('parsePerspectivesJSON escapes claims and source-map domain labels', () => {
  const rendered = AstraHelpers.parsePerspectivesJSON({
    consensus: [{ claim: '<img src=x onerror=alert(1)>', citations: [1] }],
    source_map: { domain_types: { '<script>alert(2)</script>': 10 } },
  });

  assert.match(rendered, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(rendered, /&lt;script&gt;alert\(2\)&lt;\/script&gt; 10%/);
  assert.doesNotMatch(rendered, /<img|<script/);
});

test('parsePerspectivesJSON leaves citations outside the supplied result count unlinked', () => {
  const rendered = AstraHelpers.parsePerspectivesJSON({
    consensus: [{ claim: 'Bounded citations', citations: [0, 1, 3, 4] }],
    source_map: {},
  }, 3);

  assert.match(rendered, /\[0, <a[^>]*href="#result-1"[^>]*>1<\/a>, <a[^>]*href="#result-3"[^>]*>3<\/a>, 4\]/);
  assert.doesNotMatch(rendered, /href="#result-(?:0|4)"/);
});

test('parsePerspectivesJSON omits malformed nested data without throwing', () => {
  assert.doesNotThrow(() => AstraHelpers.parsePerspectivesJSON({
    consensus: [null, {}, { claim: 42 }, { claim: 'Valid consensus', citations: 'bad' }],
    contradictions: [
      null,
      {},
      { position_a: { claim: 'Only one side', citations: [1] } },
      { position_a: { claim: 'Valid A' }, position_b: { claim: 'Valid B', citations: [2] } },
    ],
    outliers: 'not-an-array',
    source_map: { ddg: 'many', domain_types: null },
  }, 2));

  const rendered = AstraHelpers.parsePerspectivesJSON({
    consensus: [null, {}, { claim: 'Valid consensus', citations: 'bad' }],
    contradictions: [
      { position_a: { claim: 'Only one side' } },
      { position_a: { claim: 'Valid A' }, position_b: { claim: 'Valid B' } },
    ],
    outliers: [null, { claim: '' }, { claim: 'Valid outlier', citation: 'bad' }],
    source_map: [],
  }, 2);
  assert.match(rendered, /Valid consensus/);
  assert.match(rendered, /Valid A/);
  assert.match(rendered, /Valid B/);
  assert.match(rendered, /Valid outlier/);
  assert.doesNotMatch(rendered, /Only one side|undefined|NaN/);
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

test('isLikelyFrameBlocked flags curated domains and their subdomains, not arbitrary sites', () => {
  assert.equal(AstraHelpers.isLikelyFrameBlocked('https://www.google.com/search?q=x'), true);
  assert.equal(AstraHelpers.isLikelyFrameBlocked('github.com'), true);
  assert.equal(AstraHelpers.isLikelyFrameBlocked('https://example.com/some/blog/post'), false);
});

test('link preview dock exists and gates iframe embedding through isLikelyFrameBlocked', () => {
  assert.match(html, /id="link-preview"[^>]*class="link-preview"/);
  assert.match(js, /AstraHelpers\.isLikelyFrameBlocked\(r\.url\)/);
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

test('AI panel mode toggle exposes an accessible two-option radiogroup', () => {
  assert.match(html, /id="ai-mode-toggle"[^>]*role="radiogroup"[^>]*aria-label="AI panel mode"/);
  assert.match(html, /id="ai-mode-answer"[^>]*role="radio"[^>]*aria-checked="true"/);
  assert.match(html, /id="ai-mode-perspectives"[^>]*role="radio"[^>]*aria-checked="false"/);
  assert.match(js, /\$\('ai-mode-toggle'\)\.addEventListener\('keydown'/);
  assert.match(js, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
});

test('AI panel mode persists safely and defaults invalid storage to answer', () => {
  assert.match(js, /function getAiPanelMode\(\)[\s\S]*?localStorage\.getItem\('astra_perspectives_mode'\)[\s\S]*?return mode === 'perspectives' \? mode : 'answer'/);
  assert.match(js, /function setAiPanelMode\(mode\)[\s\S]*?localStorage\.setItem\('astra_perspectives_mode', mode\)/);
  assert.match(js, /catch \(_\) \{\}/);
});

test('standard search runs once then dispatches the saved AI panel mode', () => {
  assert.match(js, /lastStandardResults = results/);
  assert.match(js, /if \(aiOn\) \{\s*if \(getAiPanelMode\(\) === 'perspectives'\) runPerspectives\(q\);\s*else askAstra\(q, results\);\s*\}/);
  assert.doesNotMatch(js, /setAiPanelMode\('perspectives'\)[\s\S]{0,300}runSearch\(q\)/);
});

test('Perspectives fetch renders its exact source rows and bounds citations to them', () => {
  assert.match(js, /\/api\/perspectives\?q=' \+ encodeURIComponent\(q\) \+ '&n=30'/);
  assert.match(js, /ngrok-skip-browser-warning/);
  assert.match(js, /bypass-tunnel-reminder/);
  assert.match(js, /const results = data\.results\.map\(\(r\) => \(\{[\s\S]*?url: r\.url,[\s\S]*?title: r\.title,[\s\S]*?domain: r\.domain,[\s\S]*?sources: r\.sources,[\s\S]*?description: r\.description \|\| r\.snippet \|\| '',[\s\S]*?\}\)\)/);
  assert.match(js, /lastResults = results/);
  assert.match(js, /renderResults\(results, 0, false\)/);
  assert.match(js, /AstraHelpers\.parsePerspectivesJSON\(data\.perspectives, results\.length\)/);
  assert.match(js, /if \(scrollObserver\) scrollObserver\.disconnect\(\)/);
});

test('Perspective result rows construct compact badges for known source engines', () => {
  assert.match(js, /if \(Array\.isArray\(r\.sources\) && r\.sources\.length\)/);
  assert.match(js, /duckduckgo:\s*'DDG'/);
  assert.match(js, /ddg:\s*'DDG'/);
  assert.match(js, /bing:\s*'Bing'/);
  assert.match(js, /mojeek:\s*'Mojeek'/);
  assert.match(js, /sourceTags\.className = 'r-source-tags'/);
  assert.match(js, /sourceTag\.className = 'r-source-tag'/);
  assert.match(js, /sourceTag\.textContent = label/);
  assert.doesNotMatch(js, /r-source-tags[^\n]*innerHTML|r-source-tag[^\n]*innerHTML/);
});

test('Perspectives styles stay search-scoped and keep resting surfaces flat', () => {
  const perspectiveRules = css.match(/[^{}]+\{[^{}]*\}/g).filter((rule) => /\.(?:ai-mode-(?:toggle|btn)|perspectives-[\w-]+|r-source-tags?)(?![\w-])/.test(rule));
  assert(perspectiveRules.length > 0, 'Perspectives selectors should exist in site.css');
  perspectiveRules.forEach((rule) => {
    const selector = rule.slice(0, rule.indexOf('{'));
    selector.split(',').forEach((part) => assert.match(part, /\[data-page="search"\]/));
    if (!selector.includes(':focus-visible')) {
      const shadow = rule.match(/box-shadow:\s*([^;}]+)/);
      if (shadow) assert.equal(shadow[1].trim(), 'none');
    }
    assert.doesNotMatch(rule, /backdrop-filter|filter:\s*blur|linear-gradient|conic-gradient/);
  });
  assert.match(css, /\[data-page="search"\] \.perspectives-section\s*\{[^}]*border:\s*1px solid[^}]*box-shadow:\s*none/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-toggle\s*\{(?=[^}]*background-color:\s*var\(--bg-elevated\))(?=[^}]*border:\s*1px solid)[^}]*\}/);
});

test('Perspectives mode controls expose flat interaction, focus, and mobile touch contracts', () => {
  assert.match(css, /\[data-page="search"\] \.ai-mode-btn:hover\s*\{[^}]*background-color:/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-btn:active\s*\{[^}]*transform:\s*scale\(0\.97\)[^}]*transition:[^}]*var\(--dur-1\)[^}]*var\(--ease-soft\)/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-btn:focus-visible\s*\{[^}]*outline:\s*none[^}]*box-shadow:\s*0 0 0 3px color-mix/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-btn\.on\s*\{[^}]*background-color:\s*var\(--accent\)[^}]*color:\s*#fff/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\[data-page="search"\] \.ai-mode-btn\s*\{[^}]*min-height:\s*44px/);
});

test('Perspectives preserve semantic labels and subdued section tints without color-only meaning', () => {
  assert.match(html, /id="ai-head-label"/);
  assert.match(js, /sourceTag\.textContent = label/);
  assert.match(css, /\[data-page="search"\] \.perspectives-consensus\s*\{[^}]*background-color:\s*color-mix/);
  assert.match(css, /\[data-page="search"\] \.perspectives-contradictions\s*\{[^}]*background-color:\s*color-mix/);
  assert.match(css, /\[data-page="search"\] \.perspectives-outliers\s*\{[^}]*background-color:\s*color-mix/);
  assert.match(css, /\[data-page="search"\] \.perspectives-pos-label\s*\{[^}]*display:\s*block/);
});

test('Perspectives source bars are static and source badges wrap as neutral pills', () => {
  const perspectiveRules = css.match(/[^{}]+\{[^{}]*\}/g).filter((rule) => /\.perspectives-[\w-]+/.test(rule));
  perspectiveRules.forEach((rule) => assert.doesNotMatch(rule, /transition\s*:[^;}]*(?:^|\s)width\b/im));
  assert.match(css, /\[data-page="search"\] \.perspectives-source-row\s*\{[^}]*display:\s*grid/);
  assert.match(css, /\[data-page="search"\] \.perspectives-source-bar\s*\{[^}]*max-width:\s*100%[^}]*transition:\s*none/);
  assert.match(css, /\[data-page="search"\] \.r-source-tags\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\[data-page="search"\] \.r-source-tag\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*999px[^}]*background-color:\s*var\(--bg-elevated\)/);
});

test('Perspectives layout wraps safely, stacks contradictions, and disables skeleton motion', () => {
  assert.match(css, /\[data-page="search"\] \.ai-head\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-toggle\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\[data-page="search"\] \.perspectives-dual\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-page="search"\] \.perspectives-skel span[^}]*animation:\s*none/);
});

test('Perspectives reuses the delegated AI-body citation listener', () => {
  assert.equal((js.match(/\$\('ai-body'\)\.addEventListener\('click'/g) || []).length, 1);
  assert.doesNotMatch(js, /wirePerspectivesCitations/);
});

test('Perspectives requests are aborted and stale responses cannot repaint the panel', () => {
  assert.match(js, /let perspectivesAbort = null/);
  assert.match(js, /let perspectivesToken = 0/);
  assert.match(js, /perspectivesAbort\.abort\(\)/);
  assert.match(js, /signal: perspectivesAbort\.signal/);
  assert.match(js, /if \(token !== perspectivesToken \|\| getAiPanelMode\(\) !== 'perspectives' \|\| readRoute\(\)\.q !== q\) return/);
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
