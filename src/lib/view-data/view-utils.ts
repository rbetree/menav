import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const path = require('node:path') as typeof import('node:path');

const { escapeHtml } = require(path.join(process.cwd(), 'src', 'lib', 'security', 'html.ts')) as {
  escapeHtml: (unsafe: unknown) => string;
};

type ViewRoot = Record<string, unknown> & {
  icons?: { region?: unknown };
  site?: {
    security?: {
      allowedSchemes?: unknown;
    };
  };
};

function normalizeRoot(root: Record<string, unknown> | null | undefined): ViewRoot {
  return root && typeof root === 'object' ? (root as ViewRoot) : {};
}

function extractDomain(url: unknown): string {
  if (!url) return '';

  try {
    let domain = String(url).replace(/^[a-zA-Z]+:\/\//, '');
    domain = domain.split('/')[0].split('?')[0].split('#')[0];
    domain = domain.split(':')[0];
    return domain;
  } catch (error) {
    return String(url);
  }
}

function formatDate(date: unknown, format = 'YYYY-MM-DD'): string {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';

  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const hours = dateObj.getHours();
  const minutes = dateObj.getMinutes();
  const seconds = dateObj.getSeconds();

  return format
    .replace('YYYY', String(year))
    .replace('MM', String(month).padStart(2, '0'))
    .replace('DD', String(day).padStart(2, '0'))
    .replace('HH', String(hours).padStart(2, '0'))
    .replace('mm', String(minutes).padStart(2, '0'))
    .replace('ss', String(seconds).padStart(2, '0'));
}

function getIconRegion(root: Record<string, unknown> | null | undefined): string {
  const normalizedRoot = normalizeRoot(root);
  return normalizedRoot.icons?.region === 'cn' ? 'cn' : 'com';
}

function buildFaviconV2Url(url: unknown, domain: string): string {
  if (!url) return '';

  try {
    const encodedUrl = encodeURIComponent(String(url));
    return `https://${domain}/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodedUrl}&size=32&drop_404_icon=true`;
  } catch (error) {
    return '';
  }
}

function getFaviconV2Url(url: unknown, root: Record<string, unknown> | null | undefined): string {
  const region = getIconRegion(root);
  const domain = region === 'cn' ? 't3.gstatic.cn' : 't3.gstatic.com';
  return buildFaviconV2Url(url, domain);
}

function getFaviconFallbackUrl(
  url: unknown,
  root: Record<string, unknown> | null | undefined
): string {
  const region = getIconRegion(root);
  const domain = region === 'cn' ? 't3.gstatic.com' : 't3.gstatic.cn';
  return buildFaviconV2Url(url, domain);
}

function getAllowedSchemes(root: Record<string, unknown> | null | undefined): string[] {
  const normalizedRoot = normalizeRoot(root);
  const allowedFromConfig = normalizedRoot.site?.security?.allowedSchemes;

  if (Array.isArray(allowedFromConfig) && allowedFromConfig.length > 0) {
    return allowedFromConfig
      .map((scheme) =>
        String(scheme || '')
          .trim()
          .toLowerCase()
          .replace(/:$/, '')
      )
      .filter(Boolean);
  }

  return ['http', 'https', 'mailto', 'tel'];
}

function isRelativeUrl(url: string): boolean {
  return (
    url.startsWith('#') ||
    url.startsWith('/') ||
    url.startsWith('./') ||
    url.startsWith('../') ||
    url.startsWith('?')
  );
}

function getSafeUrl(url: unknown, root: Record<string, unknown> | null | undefined): string {
  const raw = String(url || '').trim();
  if (!raw) return '#';

  if (isRelativeUrl(raw)) return raw;

  if (raw.startsWith('//')) {
    console.warn(`[WARN] 已拦截不安全 URL（协议相对形式）：${raw}`);
    return '#';
  }

  try {
    const parsed = new URL(raw);
    const scheme = String(parsed.protocol || '')
      .toLowerCase()
      .replace(/:$/, '');
    if (getAllowedSchemes(root).includes(scheme)) return raw;
    console.warn(`[WARN] 已拦截不安全 URL scheme：${raw}`);
    return '#';
  } catch (error) {
    console.warn(`[WARN] 已拦截无法解析的 URL：${raw}`);
    return '#';
  }
}

function attrs(attributes: Record<string, unknown>): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== false && value !== undefined && value !== null && value !== '')
    .map(([name, value]) => {
      if (value === true) return escapeHtml(name);
      return `${escapeHtml(name)}="${escapeHtml(value)}"`;
    })
    .join(' ');
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
