import type { CardType, CardViewModel } from '../../types/card';
import type { RenderContext } from '../../types/render';
import type { SiteItem } from '../../types/site';
import { extractDomain, getSafeUrl } from '../view-data/view-utils.ts';

function normalizeText(value: unknown): string {
  return String(value === null || value === undefined ? '' : value).trim();
}

function normalizeNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeSearchText(...parts: unknown[]): string {
  return parts
    .map((part) => normalizeText(part).toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function toCardViewModel(options: {
  pageId: string;
  site: SiteItem;
  renderContext: RenderContext;
  type?: CardType;
  style?: string;
  categoryId?: string;
  categoryName?: string;
  categoryPath?: string[];
}): CardViewModel | null {
  const { pageId, site, renderContext } = options;
  const title = normalizeText(site.name);
  const url = normalizeText(site.url);
  if (!pageId || !title || !url) return null;

  const description = normalizeText(site.description) || extractDomain(url);
  const icon = normalizeText(site.icon) || 'fas fa-link';
  const type: CardType = options.type || (normalizeText(site.type) === 'article' ? 'article' : 'site');
  const style = normalizeText(options.style) || normalizeText(site.style);
  const faviconUrl = normalizeText(site.faviconUrl);
  const forceIconMode = normalizeText(site.forceIconMode);
  const publishedAt = normalizeText(site.publishedAt);
  const source = normalizeText(site.source);
  const language = normalizeText(site.language);
  const languageColor = normalizeText(site.languageColor);
  const stars = normalizeNumber(site.stars);
  const forks = normalizeNumber(site.forks);
  const issues = normalizeNumber(site.issues);

  return {
    pageId,
    title,
    description,
    url,
    safeUrl: getSafeUrl(url, renderContext.allowedSchemes),
    icon,
    type,
    ...(style ? { style } : {}),
    ...(faviconUrl ? { faviconUrl } : {}),
    ...(forceIconMode ? { forceIconMode } : {}),
    ...(site.external !== undefined ? { external: Boolean(site.external) } : {}),
    ...(options.categoryId ? { categoryId: options.categoryId } : {}),
    ...(options.categoryName ? { categoryName: options.categoryName } : {}),
    ...(options.categoryPath && options.categoryPath.length > 0
      ? { categoryPath: options.categoryPath }
      : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(source ? { source } : {}),
    ...(language ? { language } : {}),
    ...(languageColor ? { languageColor } : {}),
    ...(stars !== undefined ? { stars } : {}),
    ...(forks !== undefined ? { forks } : {}),
    ...(issues !== undefined ? { issues } : {}),
    searchText: normalizeSearchText(title, description),
  };
}

export { normalizeSearchText, normalizeText, toCardViewModel };
