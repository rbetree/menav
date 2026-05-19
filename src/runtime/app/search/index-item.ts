import type { RuntimeSearchIndexItem } from '../../types';

const { normalizeText } = require('./dom.ts') as {
  normalizeText: (value: unknown) => string;
};

function normalizeIndexItem(raw: unknown): RuntimeSearchIndexItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const pageId = normalizeText(item.pageId);
  const title = normalizeText(item.title);
  const url = normalizeText(item.url) || '#';
  if (!pageId || !title) return null;

  const description = normalizeText(item.description);
  const searchText = normalizeText(item.searchText || `${title} ${description}`).toLowerCase();
  const type = normalizeText(item.type) === 'article' ? 'article' : 'site';
  const categoryPath = Array.isArray(item.categoryPath)
    ? item.categoryPath.map((part) => normalizeText(part)).filter(Boolean)
    : undefined;

  return {
    pageId,
    title,
    description,
    url,
    icon: normalizeText(item.icon) || 'fas fa-link',
    type,
    style: normalizeText(item.style),
    faviconUrl: normalizeText(item.faviconUrl),
    forceIconMode: normalizeText(item.forceIconMode),
    categoryId: normalizeText(item.categoryId),
    categoryName: normalizeText(item.categoryName),
    categoryPath,
    publishedAt: normalizeText(item.publishedAt),
    source: normalizeText(item.source),
    language: normalizeText(item.language),
    languageColor: normalizeText(item.languageColor),
    stars: Number.isFinite(item.stars) ? Number(item.stars) : undefined,
    forks: Number.isFinite(item.forks) ? Number(item.forks) : undefined,
    issues: Number.isFinite(item.issues) ? Number(item.issues) : undefined,
    external: typeof item.external === 'boolean' ? item.external : undefined,
    searchText,
  };
}

module.exports = {
  normalizeIndexItem,
};
