(function (root, factory) {
  const helpers = factory();
  if (typeof module === 'object' && module.exports) module.exports = helpers;
  if (root) root.AstraHelpers = helpers;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PALETTE_SIZE = 7;

  function hostnameFor(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      return new URL(raw.includes('://') ? raw : 'https://' + raw).hostname
        .toLowerCase()
        .replace(/^www\./, '');
    } catch (_) {
      return raw.toLowerCase().replace(/^www\./, '').split('/')[0];
    }
  }

  function domainIdentity(value) {
    const hostname = hostnameFor(value);
    const labels = hostname.split('.').filter(Boolean);
    const nameLabels = labels.length > 1 ? labels.slice(0, -1) : labels;
    const monogram = (nameLabels.length > 1
      ? nameLabels.slice(0, 2).map((label) => label[0]).join('')
      : (nameLabels[0] || '?').slice(0, 2)).toUpperCase();
    let hash = 0;
    for (const char of hostname) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    return { hostname, monogram, paletteIndex: hash % PALETTE_SIZE };
  }

  function normalizeTab(tab) {
    return tab === 'images' ? 'images' : 'all';
  }

  const FRAME_BLOCKED_DOMAINS = [
    'google.com', 'accounts.google.com', 'github.com', 'facebook.com', 'instagram.com',
    'twitter.com', 'x.com', 'linkedin.com', 'amazon.com', 'youtube.com', 'reddit.com',
    'paypal.com', 'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'netflix.com',
  ];

  function isLikelyFrameBlocked(value) {
    const hostname = hostnameFor(value);
    return FRAME_BLOCKED_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d));
  }

  function linkifyCitations(html, count) {
    return String(html || '').replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g, (match, group) => {
      const linked = group.split(',').map((value) => {
        const number = value.trim();
        return +number >= 1 && +number <= count
          ? '<a href="#result-' + number + '">' + number + '</a>'
          : number;
      });
      return '[' + linked.join(', ') + ']';
    });
  }

  function escapeText(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderAssistantHtml(text, count, markedApi) {
    const safeText = escapeText(text);
    const html = markedApi && typeof markedApi.parse === 'function'
      ? markedApi.parse(safeText)
      : safeText.replace(/\r?\n/g, '<br>');
    return linkifyCitations(html, count);
  }

  function formatPerspectivesCitations(citations, resultCount) {
    if (!Array.isArray(citations)) return '';
    const values = citations.filter((number) => Number.isInteger(number) && number >= 0);
    if (!values.length) return '';
    const hasBound = Number.isInteger(resultCount) && resultCount >= 0;
    const formatted = values.map((number) => {
      if (number < 1 || (hasBound && number > resultCount)) return String(number);
      return '<a href="#result-' + number + '" class="perspectives-cite-link" data-cite="' + number + '">' + number + '</a>';
    });
    return '<span class="perspectives-cites">[' + formatted.join(', ') + ']</span>';
  }

  function parsePerspectivesJSON(perspectives, resultCount) {
    if (!perspectives || typeof perspectives !== 'object' || Array.isArray(perspectives)) {
      return '<div class="perspectives-fallback">Perspectives analysis unavailable. Showing standard results.</div>';
    }

    const sections = [];
    const sourceMap = perspectives.source_map && typeof perspectives.source_map === 'object' && !Array.isArray(perspectives.source_map)
      ? perspectives.source_map
      : {};
    const sourceCounts = [
      ['ddg', 'DDG'],
      ['bing', 'Bing'],
      ['mojeek', 'Mojeek'],
    ].map(([key, label]) => {
      const count = Number.isFinite(sourceMap[key]) && sourceMap[key] >= 0 ? sourceMap[key] : 0;
      return { label, count };
    });
    const activeSources = sourceCounts.filter((source) => source.count > 0).length;
    const overlap = Number.isFinite(sourceMap.overlap_all_three) && sourceMap.overlap_all_three >= 0
      ? sourceMap.overlap_all_three
      : 0;

    sections.push(
      '<div class="perspectives-bar">' + activeSources + ' source engines &middot; ' +
      sourceCounts.map((source) => source.label + ' (' + source.count + ')').join(' &middot; ') +
      ' &middot; ' + overlap + ' shared across all three</div>'
    );

    if (Array.isArray(perspectives.consensus)) {
      const claims = perspectives.consensus.filter((item) => item && typeof item.claim === 'string' && item.claim.trim());
      sections.push('<details class="perspectives-section perspectives-consensus"' + (claims.length ? ' open' : '') + '>');
      sections.push('<summary class="perspectives-summary"><span class="perspectives-dot consensus-dot"></span>Consensus</summary>');
      if (claims.length) {
        sections.push('<ul class="perspectives-claims">');
        claims.forEach((item) => {
          sections.push('<li>' + escapeText(item.claim) + ' ' + formatPerspectivesCitations(item.citations, resultCount) + '</li>');
        });
        sections.push('</ul>');
      } else {
        sections.push('<p class="perspectives-empty">No clear consensus found across sources.</p>');
      }
      sections.push('</details>');
    }

    if (Array.isArray(perspectives.contradictions)) {
      const contradictions = perspectives.contradictions.filter((item) => (
        item && item.position_a && item.position_b &&
        typeof item.position_a.claim === 'string' && item.position_a.claim.trim() &&
        typeof item.position_b.claim === 'string' && item.position_b.claim.trim()
      ));
      sections.push('<details class="perspectives-section perspectives-contradictions"' + (contradictions.length ? ' open' : '') + '>');
      sections.push('<summary class="perspectives-summary"><span class="perspectives-dot contradictions-dot"></span>Contradictions</summary>');
      if (contradictions.length) {
        contradictions.forEach((item) => {
          sections.push(
            '<div class="perspectives-dual">' +
              '<div class="perspectives-pos position_a"><span class="perspectives-pos-label">Position A</span><p>' +
                escapeText(item.position_a.claim) + ' ' + formatPerspectivesCitations(item.position_a.citations, resultCount) +
              '</p></div>' +
              '<div class="perspectives-pos position_b"><span class="perspectives-pos-label">Position B</span><p>' +
                escapeText(item.position_b.claim) + ' ' + formatPerspectivesCitations(item.position_b.citations, resultCount) +
              '</p></div>' +
            '</div>'
          );
        });
      } else {
        sections.push('<p class="perspectives-empty">Sources overwhelmingly agree on this topic. No significant disagreements found.</p>');
      }
      sections.push('</details>');
    }

    if (Array.isArray(perspectives.outliers)) {
      const outliers = perspectives.outliers.filter((item) => item && typeof item.claim === 'string' && item.claim.trim());
      sections.push('<details class="perspectives-section perspectives-outliers"' + (outliers.length ? ' open' : '') + '>');
      sections.push('<summary class="perspectives-summary"><span class="perspectives-dot outliers-dot"></span>Outliers</summary>');
      if (outliers.length) {
        sections.push('<ul class="perspectives-claims">');
        outliers.forEach((item) => {
          const citations = Number.isInteger(item.citation) ? [item.citation] : [];
          sections.push('<li>' + escapeText(item.claim) + ' ' + formatPerspectivesCitations(citations, resultCount) + '</li>');
        });
        sections.push('</ul>');
      } else {
        sections.push('<p class="perspectives-empty">No uncorroborated outliers found.</p>');
      }
      sections.push('</details>');
    }

    sections.push('<details class="perspectives-section perspectives-sourcemap">');
    sections.push('<summary class="perspectives-summary"><span class="perspectives-dot sourcemap-dot"></span>Source Map</summary>');
    sections.push('<div class="perspectives-source-bars">');
    const maxCount = Math.max(...sourceCounts.map((source) => source.count), 1);
    sourceCounts.forEach((source) => {
      sections.push(
        '<div class="perspectives-source-row"><span class="perspectives-source-label">' +
        source.label + ' (' + source.count + ')</span><span class="perspectives-source-bar" style="width:' +
        Math.round((source.count / maxCount) * 100) + '%"></span></div>'
      );
    });
    if (overlap > 0) {
      sections.push('<p class="perspectives-overlap">' + overlap + ' shared across all three sources</p>');
    }
    if (sourceMap.domain_types && typeof sourceMap.domain_types === 'object' && !Array.isArray(sourceMap.domain_types)) {
      const domainTypes = Object.entries(sourceMap.domain_types)
        .filter(([, value]) => Number.isFinite(value) && value >= 0)
        .map(([key, value]) => escapeText(key.charAt(0).toUpperCase() + key.slice(1)) + ' ' + value + '%');
      if (domainTypes.length) sections.push('<p class="perspectives-domain-types">' + domainTypes.join(' &middot; ') + '</p>');
    }
    sections.push('</div></details>');

    return sections.join('');
  }

  return {
    domainIdentity,
    normalizeTab,
    linkifyCitations,
    renderAssistantHtml,
    isLikelyFrameBlocked,
    parsePerspectivesJSON,
  };
});
