import type { AppConfig } from '../../types/config';
import type { CategoryItem, PageEntry } from '../../types/page';
import type {
  SearchIndexItem,
  SearchIndexPayload,
  SearchIndexSourceKind,
} from '../../types/search';
import type { SiteItem } from '../../types/site';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const path = require('node:path') as typeof import('node:path');

const { extractDomain, getSafeUrl } = require(
  path.join(process.cwd(), 'src', 'lib', 'view-data', 'view-utils.ts')
) as {
  extractDomain: (url: unknown) => string;
  getSafeUrl: (url: unknown, root: Record<string, unknown> | null | undefined) => string;
};

const SEARCH_INDEX_SCHEMA_VERSION = 1;
const MENAV_SEARCH_INDEX_FILE = 'search-index.json';

type SearchIndexSource = {
  site: SiteItem;
  type?: SearchIndexSourceKind;
  style?: string;
  categoryId?: string;
  categoryName?: string;
  categoryPath?: string[];
};

function normalizeText(value: unknown): string {
  return String(value === null || value === undefined ? '' : value).trim();
}

function normalizeSearchText(...parts: unknown[]): string {
  return parts
    .map((part) => normalizeText(part).toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function collectCategorySources(
  category: CategoryItem | null | undefined,
  output: SearchIndexSource[],
  parentPath: string[] = []
): void {
  if (!category || typeof category !== 'object') return;

  const categoryName = normalizeText(category.name);
  const categoryId = normalizeText(category.slug) || categoryName;
  const categoryPath = categoryName ? [...parentPath, categoryName] : parentPath;

  if (Array.isArray(category.subcategories)) {
    category.subcategories.forEach((child) => collectCategorySources(child, output, categoryPath));
  }

  if (Array.isArray(category.groups)) {
    category.groups.forEach((child) => collectCategorySources(child, output, categoryPath));
  }

  if (Array.isArray(category.subgroups)) {
    category.subgroups.forEach((child) => collectCategorySources(child, output, categoryPath));
  }

  if (Array.isArray(category.sites)) {
    category.sites.forEach((site) => {
      if (site && typeof site === 'object') {
        output.push({ site, categoryId, categoryName, categoryPath });
      }
    });
  }
}

function collectPageSources(page: PageEntry): SearchIndexSource[] {
  const data = page.data || {};
  const sources: SearchIndexSource[] = [];

  if (page.templateName === 'articles' && Array.isArray(data.articlesItems)) {
    if (Array.isArray(data.articlesCategories) && data.articlesCategories.length > 0) {
      data.articlesCategories.forEach((category) => {
        const categoryName = normalizeText(category.name) || '最新文章';
        const categoryId = normalizeText(category.slug) || categoryName;
        const items = Array.isArray(category.items) ? category.items : [];
        items.forEach((site) => {
          if (site && typeof site === 'object') {
            sources.push({
              site,
              type: 'article',
              style: normalizeText(data.siteCardStyle),
              categoryId,
              categoryName,
              categoryPath: [categoryName],
            });
          }
        });
      });
      return sources;
    }

    data.articlesItems.forEach((site) => {
      if (site && typeof site === 'object') {
        const categoryName = '最新文章';
        sources.push({
          site,
          type: 'article',
          style: normalizeText(data.siteCardStyle),
          categoryId: categoryName,
          categoryName,
          categoryPath: [categoryName],
        });
      }
    });
    return sources;
  }

  if (Array.isArray(data.categories)) {
    data.categories.forEach((category) => collectCategorySources(category, sources));
  }

  const pageStyle = normalizeText(data.siteCardStyle);
  if (pageStyle) sources.forEach((source) => (source.style = pageStyle));

  return sources;
}

function createSearchIndexItem(
  pageId: string,
  source: SearchIndexSource,
  config: AppConfig
): SearchIndexItem | null {
  const site = source.site;
  const title = normalizeText(site.name);
  const rawUrl = normalizeText(site.url);
  if (!title || !rawUrl) return null;

  const description = normalizeText(site.description) || extractDomain(rawUrl);
  const icon = normalizeText(site.icon) || 'fas fa-link';
  const url = getSafeUrl(rawUrl, config);
  const type = source.type || (normalizeText(site.type) === 'article' ? 'article' : 'site');
  const style = normalizeText(source.style) || normalizeText(site.style) || '';
  const publishedAt = normalizeText(site.publishedAt);
  const articleSource = normalizeText(site.source);

  return {
    pageId,
    title,
    description,
    url,
    icon,
    type,
    ...(style ? { style } : {}),
    ...(source.categoryId ? { categoryId: source.categoryId } : {}),
    ...(source.categoryName ? { categoryName: source.categoryName } : {}),
    ...(source.categoryPath && source.categoryPath.length > 0
      ? { categoryPath: source.categoryPath }
      : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(articleSource ? { source: articleSource } : {}),
    ...(site.external !== undefined ? { external: Boolean(site.external) } : {}),
    searchText: normalizeSearchText(title, description),
  };
}

function buildSearchIndex(pages: PageEntry[], config: AppConfig): SearchIndexPayload {
  const items = pages.flatMap((page) => {
    if (!page || !page.id || page.id === 'search-results') return [];

    return collectPageSources(page)
      .map((source) => createSearchIndexItem(page.id, source, config))
      .filter((item: SearchIndexItem | null): item is SearchIndexItem => Boolean(item));
  });

  return {
    schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    items,
  };
}

export {
  MENAV_SEARCH_INDEX_FILE,
  SEARCH_INDEX_SCHEMA_VERSION,
  buildSearchIndex,
  collectCategorySources,
  collectPageSources,
};
export type { SearchIndexItem, SearchIndexPayload };
