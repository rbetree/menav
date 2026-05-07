import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const path = require('node:path') as typeof import('node:path');

const { escapeHtml } = require(path.join(process.cwd(), 'src', 'lib', 'security', 'html.ts')) as {
  escapeHtml: (unsafe: unknown) => string;
};
const { extractDomain, formatDate } = require(
  path.join(process.cwd(), 'src', 'helpers', 'formatters.js')
) as {
  extractDomain: (url: unknown) => string;
  formatDate: (date: unknown, format?: string) => string;
};
const { faviconV2Url, faviconFallbackUrl, safeUrl } = require(
  path.join(process.cwd(), 'src', 'helpers', 'utils.js')
) as {
  faviconV2Url: (url: unknown, options: { data: { root: Record<string, unknown> } }) => string;
  faviconFallbackUrl: (
    url: unknown,
    options: { data: { root: Record<string, unknown> } }
  ) => string;
  safeUrl: (url: unknown, options: { data: { root: Record<string, unknown> } }) => string;
};

function attrs(attributes: Record<string, unknown>): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== false && value !== undefined && value !== null && value !== '')
    .map(([name, value]) => {
      if (value === true) return escapeHtml(name);
      return `${escapeHtml(name)}="${escapeHtml(value)}"`;
    })
    .join(' ');
}

function getSafeUrl(url: unknown, root: Record<string, unknown> | null | undefined): string {
  return safeUrl(url, { data: { root: root || {} } });
}

function getFaviconV2Url(url: unknown, root: Record<string, unknown> | null | undefined): string {
  return faviconV2Url(url, { data: { root: root || {} } });
}

function getFaviconFallbackUrl(
  url: unknown,
  root: Record<string, unknown> | null | undefined
): string {
  return faviconFallbackUrl(url, { data: { root: root || {} } });
}

function isHttpUrl(url: unknown): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export {
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
