import type { CardViewModel } from '../../types/card';
import type { SiteModel } from '../../types/model';
import type {
  SearchIndexItem,
  SearchIndexPayload,
} from '../../types/search';

const SEARCH_INDEX_SCHEMA_VERSION = 1;
const MENAV_SEARCH_INDEX_FILE = 'search-index.json';

function createSearchIndexItem(card: CardViewModel): SearchIndexItem {
  return {
    pageId: card.pageId,
    title: card.title,
    description: card.description,
    url: card.safeUrl,
    icon: card.icon,
    type: card.type,
    ...(card.style ? { style: card.style } : {}),
    ...(card.faviconUrl ? { faviconUrl: card.faviconUrl } : {}),
    ...(card.forceIconMode ? { forceIconMode: card.forceIconMode } : {}),
    ...(card.categoryId ? { categoryId: card.categoryId } : {}),
    ...(card.categoryName ? { categoryName: card.categoryName } : {}),
    ...(card.categoryPath && card.categoryPath.length > 0 ? { categoryPath: card.categoryPath } : {}),
    ...(card.publishedAt ? { publishedAt: card.publishedAt } : {}),
    ...(card.source ? { source: card.source } : {}),
    ...(card.language ? { language: card.language } : {}),
    ...(card.languageColor ? { languageColor: card.languageColor } : {}),
    ...(card.stars !== undefined ? { stars: card.stars } : {}),
    ...(card.forks !== undefined ? { forks: card.forks } : {}),
    ...(card.issues !== undefined ? { issues: card.issues } : {}),
    ...(card.external !== undefined ? { external: card.external } : {}),
    searchText: card.searchText,
  };
}

function buildSearchIndex(model: SiteModel): SearchIndexPayload {
  const sources = model.searchSources;
  const items = sources.map((source) => createSearchIndexItem(source));

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
};
export type { SearchIndexItem, SearchIndexPayload };
