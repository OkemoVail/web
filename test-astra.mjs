import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const AstraHelpers = require('./search/astra-helpers.js');
const html = readFileSync(new URL('./search/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('./search/astra.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');
const liquidPlugin = readFileSync(new URL('./liquid-design/source/liquid-design-plugin.js', import.meta.url), 'utf8');

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
  assert.match(js, /function ensureThinking\(\)/);
  assert.match(js, /const t = ensureThinking\(\)/);
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

test('result rows expose one inline summary disclosure while titles remain direct links', () => {
  assert.doesNotMatch(html, /id="summary-popup"|summary-scrim|summary-panel/);
  assert.match(js, /li\.className = 'result'/);
  assert.match(js, /summaryButton\.className = 'summary-hit'/);
  assert.match(js, /summaryButton\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(js, /summaryButton\.setAttribute\('aria-controls', summary\.id\)/);
  assert.match(js, /summary\.className = 'result-summary'/);
  assert.match(js, /summary\.setAttribute\('role', 'region'\)/);
  assert.match(js, /summaryStatus\.setAttribute\('role', 'status'\)/);
  assert.match(js, /summaryVisit\.target = '_blank'/);
  assert.match(js, /a\.target = '_blank'/);
  assert.match(js, /summaryButton\.addEventListener\('click', \(\) => toggleWebsiteSummary\(li, r\)\)/);
  assert.doesNotMatch(js, /openWebsiteSummary|closeWebsiteSummary|summaryResult/);
  assert.match(css, /\.summary-hit\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/);
  assert.match(css, /\.result \.r-title\s*\{[^}]*position:\s*relative[^}]*z-index:\s*2/);
});

test('inline summaries have loading, generated, retry, and visit states', () => {
  assert.match(js, /summaryStatus\.textContent = 'reading the fine print…'/);
  assert.match(js, /summaryBody\.textContent = data\.summary \|\| r\.description/);
  assert.match(js, /summaryRetry\.hidden = false/);
  assert.match(js, /summaryRetry\.addEventListener\('click'/);
  assert.match(js, /document\.createTextNode\('Visit website'\)/);
  assert.match(js, /\/api\/summary\?url=/);
});

test('site briefs disclose beta reliability and animate the tour demonstration once', () => {
  assert.match(js, /summaryBeta\.className = 'result-summary-beta'/);
  assert.match(js, /summaryBeta\.textContent = 'BETA'/);
  assert.match(js, /summaryCaveat\.className = 'result-summary-caveat'/);
  assert.match(js, /Some websites block reading or return incomplete summaries\./);
  assert.match(js, /li\.classList\.add\('tour-summary-demo'\)/);
  assert.match(js, /animationend[\s\S]*?classList\.remove\('tour-summary-demo'\)/);
  assert.match(css, /\.result-summary-beta\s*\{[^}]*background-color:/);
  assert.match(css, /@keyframes site-brief-demo/);
  assert.match(css, /\.result\.tour-summary-demo \.result-summary-inner\s*\{[^}]*animation:\s*site-brief-demo/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.result\.tour-summary-demo \.result-summary-inner[^}]*animation:\s*none/);
  assert.match(css, /html\.webdriver \[data-page="search"\] \.result\.tour-summary-demo \.result-summary-inner[^}]*animation:\s*none/);
});

test('inline summaries allow only one open row and reject stale responses', () => {
  assert.match(js, /let expandedSummary = null/);
  assert.match(js, /let summaryToken = 0/);
  assert.match(js, /function collapseWebsiteSummary\(/);
  assert.match(js, /if \(expandedSummary === li\)[\s\S]*collapseWebsiteSummary\(\)/);
  assert.match(js, /collapseWebsiteSummary\(\);[\s\S]*expandedSummary = li/);
  assert.match(js, /if \(summaryAbort\) summaryAbort\.abort\(\)/);
  assert.match(js, /signal: summaryAbort\.signal/);
  assert.match(js, /if \(token !== summaryToken \|\| expandedSummary !== li\) return/);
  assert.match(js, /async function runSearch\(q\)[\s\S]*?collapseWebsiteSummary\(\)/);
  assert.match(js, /else \{[\s\S]*?collapseWebsiteSummary\(\);[\s\S]*?\$\('ai-panel'\)\.hidden = true/);
});

test('website summaries replace modal, hover, and iframe preview behavior', () => {
  assert.doesNotMatch(html, /id="link-preview"|<iframe[^>]*Website preview|id="summary-popup"/);
  assert.doesNotMatch(js, /mouseenter|mouseleave|hoverTimer|openLinkPreview|isLikelyFrameBlocked/);
  assert.doesNotMatch(css, /\.r-hover-bar|\.link-preview|#summary-popup|\.summary-scrim|\.summary-panel/);
  assert.match(js, /\/api\/summary\?url=/);
});

test('inline summary reveal uses grid rows and motion-safe opacity and transform', () => {
  assert.match(css, /\.result-summary\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*0fr[^}]*transition:[^}]*grid-template-rows[^}]*opacity[^}]*transform/);
  assert.match(css, /\.result\.summary-open \.result-summary\s*\{[^}]*grid-template-rows:\s*1fr[^}]*opacity:\s*1[^}]*transform:\s*none/);
  assert.match(css, /\.result-summary-inner\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.result-summary[^}]*transition:\s*none/);
  assert.match(js, /navigator\.webdriver/);
  assert.doesNotMatch(js, /scrollHeight|getBoundingClientRect\(\)[\s\S]{0,120}summary/);
});

test('desktop result workspace puts web results first and AI in a sticky right column', () => {
  assert.match(html, /class="result-workspace"[\s\S]*class="result-primary"[\s\S]*id="ai-panel"/);
  assert.match(css, /@media \(min-width: 1000px\)[\s\S]*?\.result-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*640px\) minmax\(300px,\s*420px\)/);
  assert.match(css, /@media \(min-width: 1000px\)[\s\S]*?\.ai-panel\s*\{[^}]*position:\s*sticky[^}]*top:/);
});

test('first-time hero guide offers Sure, Next time, and No beneath hero actions', () => {
  assert.match(html, /class="hero-btns"[\s\S]*id="first-tour-prompt"[\s\S]*first time using Astra/);
  assert.match(html, /id="tour-sure"[^>]*>Sure</);
  assert.match(html, /id="tour-later"[^>]*>Next time</);
  assert.match(html, /id="tour-no"[^>]*>No</);
  assert.match(js, /const TOUR_COOKIE = 'astra_tour_seen'/);
  assert.match(js, /document\.cookie\.split\('; '/);
  assert.match(js, /max-age=31536000/);
});

test('first-time choices persist only Sure and No while Next time remains temporary', () => {
  assert.match(js, /\$\('tour-sure'\)\.addEventListener\('click', \(\) => \{[\s\S]*?setTourSeen\(\)[\s\S]*?startTour\(\)/);
  assert.match(js, /\$\('tour-no'\)\.addEventListener\('click', \(\) => \{[\s\S]*?setTourSeen\(\)[\s\S]*?hideTourPrompt\(\)/);
  assert.match(js, /\$\('tour-later'\)\.addEventListener\('click', hideTourPrompt\)/);
});

test('tour uses a random query and teaches search, AI modes, and result summaries', () => {
  assert.match(js, /const TOUR_QUERIES = \[/);
  assert.match(js, /pool\[Math\.floor\(Math\.random\(\) \* pool\.length\)\]/);
  assert.match(js, /go\(query, 'all'\)/);
  assert.match(js, /targetId: 'results-bar'/);
  assert.match(js, /targetId: 'ai-panel'/);
  assert.match(js, /targetId: 'result-1'/);
});

test('replayed tours exclude the current query so a fresh search always runs', () => {
  assert.match(js, /const currentQuery = readRoute\(\)\.q/);
  assert.match(js, /TOUR_QUERIES\.filter\(\(candidate\) => candidate !== currentQuery\)/);
  assert.match(js, /const pool = alternatives\.length \? alternatives : TOUR_QUERIES/);
  assert.match(js, /lastAllQuery = ''/);
  assert.match(js, /const query = pool\[Math\.floor\(Math\.random\(\) \* pool\.length\)\]/);
});

test('tour final step requires opening the real first-result preview', () => {
  assert.match(html, /id="tour-target-action"[^>]*type="button"[^>]*hidden/);
  const spotlightMarkup = html.match(/<div class="tour-spotlight"[^>]*>([\s\S]*?)<\/div>/);
  assert(spotlightMarkup, 'tour spotlight markup should exist');
  assert.doesNotMatch(spotlightMarkup[1], /<(?:button|a|input|select|textarea)\b|tabindex=/i);
  assert.match(html, /<div class="tour-spotlight"[^>]*aria-hidden="true"[^>]*><\/div>\s*<button[^>]*id="tour-target-action"/);
  assert.match(js, /requiresPreview:\s*true/);
  assert.match(js, /tour-next'\)\.disabled = !!step\.requiresPreview/);
  assert.match(js, /targetAction\.hidden = !step\.requiresPreview/);
  assert.match(js, /targetAction\.disabled = !step\.requiresPreview/);
  assert.match(js, /\$\('tour-target-action'\)\.addEventListener\('click', activateTourTarget\)/);
  assert.match(js, /if \(tourIndex === TOUR_STEPS\.length - 1 && li\.id === 'result-1'\)/);
  assert.match(js, /\$\('tour-next'\)\.disabled = false/);
  assert.match(js, /\$\('tour-copy'\)\.textContent = /);
  assert.match(js, /toggleWebsiteSummary\(li, r\)/);
  assert.match(css, /\.tour-target-action\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*1[^}]*pointer-events:\s*auto/);
  assert.match(js, /targetAction\.style\.left = spotlight\.style\.left/);
  assert.match(js, /targetAction\.style\.top = spotlight\.style\.top/);
  assert.match(js, /targetAction\.style\.width = spotlight\.style\.width/);
  assert.match(js, /targetAction\.style\.height = spotlight\.style\.height/);
});

test('hero exposes an accessible replay control directly above its footer', () => {
  assert.match(html, /class="skuo skuo-neutral tour-replay" id="tour-replay"[^>]*type="button"[^>]*aria-label="Replay Astra tour"[^>]*>Replay tour<\/button>\s*<footer class="foot">made of stardust/);
  assert.doesNotMatch(html, /id="result-list"[\s\S]{0,300}id="tour-replay"/);
  assert.match(js, /\$\('tour-replay'\)\.addEventListener\('click', startTour\)/);
  assert.match(js, /function updateTourReplay\(/);
  assert.match(js, /replay\.hidden = !visible/);
  assert.match(js, /const visible = tourReplayAvailable && !readRoute\(\)\.q && tourIndex < 0/);
  assert.match(js, /function finishTour\([\s\S]*?updateTourReplay\(\)/);
  assert.doesNotMatch(js, /function startTour\([\s\S]{0,180}hasTourSeen/);
  assert.match(css, /\.tour-replay\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*32px[^}]*left:\s*50%[^}]*transform:\s*translateX\(-50%\)/);
  assert.match(css, /\.tour-replay\s*\{[^}]*border-radius:\s*999px/);
  assert.doesNotMatch(css, /\.tour-replay\s*\{[^}]*margin:\s*auto/);
});

test('tour is accessible and gives mobile and desktop distinct positioning behavior', () => {
  assert.match(html, /id="tour-guide"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="tour-title"/);
  assert.match(js, /const mobile = window\.matchMedia\('\(max-width: 768px\)'\)\.matches/);
  assert.match(js, /if \(mobile\)[\s\S]*scrollIntoView/);
  assert.match(js, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.first-tour-copy\s*\{[^}]*text-align:\s*center/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.first-tour-actions\s*\{[^}]*justify-content:\s*center/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.tour-card\s*\{[^}]*max-height:\s*100dvh[^}]*overflow-y:\s*auto/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.tour-actions\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/);
});

test('site-brief actions are left aligned and use Font Awesome icons', () => {
  assert.match(css, /\.result-summary-actions\s*\{[^}]*justify-content:\s*flex-start/);
  assert.match(css, /\.result-summary-actions \.skuo\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/);
  assert.match(css, /\.result-summary-actions \.skuo\s*\{[^}]*gap:\s*6px/);
  assert.match(js, /summaryRetryIcon\.className = 'fa-solid fa-rotate-right'/);
  assert.match(js, /summaryVisitIcon\.className = 'fa-solid fa-arrow-up-right-from-square'/);
  assert.match(css, /\.fa-arrow-up-right-from-square\s*\{/);
  assert.match(js, /summaryRetry\.append\(summaryRetryIcon, document\.createTextNode\('try again'\)\)/);
  assert.match(js, /summaryVisit\.append\(document\.createTextNode\('Visit website'\), summaryVisitIcon\)/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.result-summary-inner\s*\{[^}]*padding-bottom:/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.result-summary-actions\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?\.result-summary-actions \.skuo\s*\{[^}]*width:\s*100%[^}]*justify-content:\s*center/);
});

test('Astra logos use the tail-free boat mark and the Images tab uses Font Awesome', () => {
  assert.match(html, /<h1 class="wordmark"><svg class="astra-boat"[^>]*aria-hidden="true"[^>]*><path d="M3 14h18l-3 5H6z"\/><path d="M11 4v10"\/><path d="M11 5l6 7h-6z"\/><\/svg> Okemo Astra<\/h1>/);
  assert.match(html, /<a class="r-logo"[^>]*><svg class="astra-boat"[^>]*aria-hidden="true"[^>]*><path d="M3 14h18l-3 5H6z"\/><path d="M11 4v10"\/><path d="M11 5l6 7h-6z"\/><\/svg> Astra<\/a>/);
  assert.match(html, /id="tab-images"[^>]*><i class="fa-solid fa-images" aria-hidden="true"><\/i> Images<\/button>/);
  assert.doesNotMatch(html, /class="wordmark">✦|class="r-logo"[^>]*>✦|id="tab-images"[^>]*>✦/);
  assert.match(css, /\.fa-images\s*\{/);
  assert.match(css, /\.astra-boat\s*\{[^}]*width:\s*1em[^}]*height:\s*1em[^}]*fill:\s*none[^}]*stroke:/);
  assert.doesNotMatch(html, /fa-ship|fa-ferry/);
});

test('tour has no mascot or eye-following behavior', () => {
  assert.doesNotMatch(html, /tour-mascot|tour-eye|tour-pupil/);
  assert.doesNotMatch(js, /tour-mascot|tour-eye|tour-pupil|trackTourEyes|lookMascotAt/);
  assert.doesNotMatch(css, /tour-mascot|tour-eye|tour-pupil/);
});

test('webdriver marks the page so inline summary reveals have no CSS transition', () => {
  assert.match(js, /document\.documentElement\.classList\.add\('webdriver'\)/);
  assert.match(css, /html\.webdriver \[data-page="search"\] \.result-summary\s*\{[^}]*transition:\s*none/);
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

test('AI panel mode switching never reruns or rebuilds web results', () => {
  const switchMode = js.slice(js.indexOf('function switchAiPanelMode'), js.indexOf('function showPerspectivesFallback'));
  const perspectives = js.slice(js.indexOf('async function runPerspectives'), js.indexOf('window.runPerspectives'));
  assert.doesNotMatch(switchMode, /runSearch\(|restoreStandardResults\(|renderResults\(/);
  assert.doesNotMatch(perspectives, /renderResults\(|lastResults\s*=|\$\('r-meta'\)\.textContent/);
  assert.match(switchMode, /if \(lastStandardQuery === q\) askAstra\(q, lastStandardResults\)/);
});

test('completed AI modes are cached per query and restored without another request', () => {
  assert.match(js, /const aiPanelCache = new Map\(\)/);
  assert.match(js, /function cacheAiPanel\(q, mode\)/);
  assert.match(js, /function restoreAiPanel\(q, mode\)/);
  assert.match(js, /if \(restoreAiPanel\(q, mode\)\) return/);
  assert.match(js, /aiPanelCache\.clear\(\)/);
  assert.match(js, /e\.target\.closest\('#perspectives-fallback-answer'\)[\s\S]*?switchAiPanelMode\('answer'\)/);
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
  const perspectiveRules = css.match(/[^{}]+\{[^{}]*\}/g).filter((rule) => /\.(?:ai-mode-btn|perspectives-[\w-]+|r-source-tags?)(?![\w-])/.test(rule));
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
  assert.match(css, /\[data-page="search"\] \.ai-mode-toggle\s*\{(?=[^}]*background-color:\s*var\(--bg-elevated\))(?=[^}]*border:\s*1px solid)[^}]*--liquid-design-fill:/);
});

test('Perspectives mode controls expose draggable highlight, focus, and mobile touch contracts', () => {
  assert.match(css, /\[data-page="search"\] \.ai-mode-btn:hover\s*\{[^}]*background-color:/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-btn:active\s*\{[^}]*transform:\s*scale\(0\.97\)[^}]*transition:[^}]*var\(--dur-1\)[^}]*var\(--ease-soft\)/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-btn:focus-visible\s*\{[^}]*outline:\s*none[^}]*box-shadow:\s*0 0 0 3px color-mix/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-highlight\s*\{[^}]*background-color:\s*var\(--accent\)[^}]*transform:\s*translateX\(0\)/);
  assert.match(css, /data-dragging[^}]*\.ai-mode-highlight\s*\{[^}]*transform:\s*translateX\(var\(--ai-mode-drag-x\)\)[^}]*transition:\s*none/);
  assert.match(js, /style\.setProperty\('--ai-mode-drag-x', left \+ 'px'\)/);
  assert.match(js, /style\.removeProperty\('--ai-mode-drag-x'\)/);
  assert.match(js, /if \(shouldCommit\) toggle\.dataset\.mode = next;\s*delete toggle\.dataset\.dragging/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-toggle\s*\{[^}]*width:\s*min\(100%, 260px\)/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-toggle\s*\{[^}]*height:\s*40px[^}]*box-sizing:\s*border-box/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-btn\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.ai-mode-toggle\[data-lgp-control="surface"\] > \.lgp-content\s*\{[^}]*display:\s*grid !important[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.doesNotMatch(html, /⚖ Perspectives/);
  assert.match(css, /\[data-page="search"\] \.ai-mode-btn\.on\s*\{[^}]*background-color:\s*transparent[^}]*color:\s*#fff/);
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
  assert.match(js, /if \(token !== perspectivesToken \|\| getAiPanelMode\(\) !== 'perspectives' \|\| readRoute\(\)\.q !== q \|\| readRoute\(\)\.tab !== 'all'\) return/);
  assert.match(js, /else \{\s*cancelPerspectives\(\);\s*\$\('ai-panel'\)\.hidden = true/);
});

test('citation targets receive an orientation highlight', () => {
  assert.match(js, /citation-target/);
});

test('mobile results header stacks the logo above the search bar', () => {
  const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.r-top\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.r-logo\s*\{[^}]*align-self:\s*center/);
});

test('search limits liquid glass to authored search and mode surfaces', () => {
  const css = readFileSync(new URL('./src/site.css', import.meta.url), 'utf8');
  assert.match(html, /id="hero-search"[^>]*>\s*<svg class="hero-action-icon"/);
  assert.match(html, /id="hero-search"[^>]*data-liquid-design[^>]*data-liquid-design-independent/);
  assert.match(html, /id="results-search"[^>]*data-liquid-design[^>]*data-liquid-design-independent/);
  assert.match(html, /class="skuo hero-action hero-action-cosmic" id="hero-cosmic"/);
  assert.doesNotMatch(html, /class="ai-ring"/);
  assert.match(html, /id="ai-mode-toggle"[^>]*data-liquid-design="surface"/);
  assert.match(css, /\.ai-mode-toggle\s*\{[^}]*border-radius:\s*999px[^}]*--liquid-design-fill:/);
  assert.doesNotMatch(css, /\.hero-btns \.hero-action\s*\{[^}]*--liquid-design-fill:/);
  assert.match(css, /\[data-page="search"\] :is\(button\.skuo, a\.skuo\)\s*\{[^}]*border-radius:\s*999px/);
  assert.match(js, /toggle\.setPointerCapture\(e\.pointerId\)/);
  assert.match(js, /switchAiPanelMode\(next\)/);
  assert.match(liquidPlugin, /data-glass-child[^\n]*el\.closest\('[^']*#hero-bar,#results-bar,#hero-search,#results-search,#ai-mode-toggle/);
  assert.doesNotMatch(css, /astra-aurora-drift|\.ai-ring/);
});

console.log('Astra helper tests passed');
