import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const path = require('node:path') as typeof import('node:path');

const { escapeHtml } = require(path.join(process.cwd(), 'src', 'lib', 'security', 'html.ts')) as {
  escapeHtml: (unsafe: unknown) => string;
};

type FontConfigInput = {
  fonts?: {
    source?: unknown;
    family?: unknown;
    weight?: unknown;
    cssUrl?: unknown;
    href?: unknown;
    preload?: unknown;
  };
};

type NormalizedFontsConfig = {
  source: 'css' | 'google' | 'system';
  family: string;
  weight: string;
  cssUrl: string;
  preload: boolean;
};

function makeCssSafeForHtmlStyleTag(cssText: unknown): string {
  if (typeof cssText !== 'string') {
    return '';
  }

  return cssText.replace(/<\/style/gi, '<\\/style');
}

function normalizeFontWeight(input: unknown): string {
  if (input === undefined || input === null) return 'normal';

  if (typeof input === 'number' && Number.isFinite(input)) {
    return String(input);
  }

  const raw = String(input).trim();
  if (!raw) return 'normal';

  if (/^(normal|bold|bolder|lighter)$/i.test(raw)) return raw.toLowerCase();
  if (/^[1-9]00$/.test(raw)) return raw;

  return raw;
}

function normalizeFontFamilyForCss(input: unknown): string {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const generics = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'ui-rounded',
    'emoji',
    'math',
    'fangsong',
  ]);

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const unquoted = part.replace(/^["']|["']$/g, '').trim();
      if (!unquoted) return '';
      if (generics.has(unquoted)) return unquoted;

      const needsQuotes = /\s/.test(unquoted);
      if (!needsQuotes) return unquoted;

      return `"${unquoted.replace(/"/g, '\\"')}"`;
    })
    .filter(Boolean)
    .join(', ');
}

function normalizeFontSource(input: unknown): 'css' | 'google' | 'system' {
  const raw = String(input || '')
    .trim()
    .toLowerCase();
  if (raw === 'css' || raw === 'google' || raw === 'system') return raw;
  return 'system';
}

function getNormalizedFontsConfig(
  config: FontConfigInput | null | undefined
): NormalizedFontsConfig {
  const fonts = config?.fonts && typeof config.fonts === 'object' ? config.fonts : {};

  return {
    source: normalizeFontSource(fonts.source),
    family: normalizeFontFamilyForCss(fonts.family),
    weight: normalizeFontWeight(fonts.weight),
    cssUrl: String(fonts.cssUrl || fonts.href || '').trim(),
    preload: Boolean(fonts.preload),
  };
}

function tryGetUrlOrigin(input: unknown): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
}

function buildStylesheetLinkTag(href: string, preload: boolean): string {
  const safeHref = escapeHtml(href);
  if (!preload) return `<link rel="stylesheet" href="${safeHref}">`;

  return [
    `<link rel="preload" href="${safeHref}" as="style" onload="this.onload=null;this.rel='stylesheet'">`,
    `<noscript><link rel="stylesheet" href="${safeHref}"></noscript>`,
  ].join('\n');
}

function generateFontLinks(config: FontConfigInput | null | undefined): string {
  const fonts = getNormalizedFontsConfig(config);
  const links: string[] = [];

  if (fonts.source === 'css' && fonts.cssUrl) {
    const origin = tryGetUrlOrigin(fonts.cssUrl);
    if (origin) {
      links.push(`<link rel="preconnect" href="${escapeHtml(origin)}" crossorigin>`);
    }
    links.push(buildStylesheetLinkTag(fonts.cssUrl, fonts.preload));
  }

  if (fonts.source === 'google' && fonts.family) {
    links.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
    links.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');

    const familyNoQuotes = fonts.family.replace(/[\"']/g, '').split(',')[0].trim();
    const weight = /^[1-9]00$/.test(fonts.weight) ? fonts.weight : '400';
    const familyParam = encodeURIComponent(familyNoQuotes).replace(/%20/g, '+');
    links.push(
      buildStylesheetLinkTag(
        `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${weight}&display=swap`,
        fonts.preload
      )
    );
  }

  return links.join('\n');
}

function generateFontCss(config: FontConfigInput | null | undefined): string {
  const fonts = getNormalizedFontsConfig(config);
  const family = fonts.family || 'system-ui, sans-serif';
  const weight = fonts.weight || 'normal';

  const css = `:root {\n  --font-body: ${family};\n  --font-weight-body: ${weight};\n}\n`;
  return makeCssSafeForHtmlStyleTag(css);
}

export { generateFontLinks, generateFontCss };
