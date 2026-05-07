const { escapeHtml } = require('../lib/security/html.ts');
const { extractDomain, formatDate } = require('../helpers/formatters');
const { faviconV2Url, faviconFallbackUrl, safeUrl } = require('../helpers/utils');

function attrs(attributes) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== false && value !== undefined && value !== null && value !== '')
    .map(([name, value]) => {
      if (value === true) return escapeHtml(name);
      return `${escapeHtml(name)}="${escapeHtml(value)}"`;
    })
    .join(' ');
}

function getSafeUrl(url, root) {
  return safeUrl(url, { data: { root: root || {} } });
}

function getFaviconV2Url(url, root) {
  return faviconV2Url(url, { data: { root: root || {} } });
}

function getFaviconFallbackUrl(url, root) {
  return faviconFallbackUrl(url, { data: { root: root || {} } });
}

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

module.exports = {
  attrs,
  escapeHtml,
  extractDomain,
  formatDate,
  getSafeUrl,
  getFaviconV2Url,
  getFaviconFallbackUrl,
  hasItems,
  isHttpUrl,
};
