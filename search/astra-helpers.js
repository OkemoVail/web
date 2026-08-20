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

  return { domainIdentity, normalizeTab, linkifyCitations, renderAssistantHtml };
});
