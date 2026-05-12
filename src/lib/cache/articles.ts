import type { CategoryItem } from '../../types/page';
import type { SiteItem } from '../../types/site';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

const { collectSitesRecursively, normalizeUrlKey } = require(
  path.join(process.cwd(), 'src', 'lib', 'site-data', 'sites.ts')
) as {
  collectSitesRecursively: (node: unknown, output: unknown[]) => void;
  normalizeUrlKey: (input: unknown) => string;
};
const { createLogger } = require(
  path.join(process.cwd(), 'src', 'lib', 'logging', 'logger.ts')
) as {
  createLogger: (scope: string) => {
    warn: (message: string, meta?: Record<string, unknown>) => void;
  };
};

type RenderConfigLike = {
  site?: {
    rss?: {
      cacheDir?: unknown;
    };
  };
};

type CacheArticleInput = {
  title?: unknown;
  url?: unknown;
  icon?: unknown;
  summary?: unknown;
  publishedAt?: unknown;
  source?: unknown;
  sourceUrl?: unknown;
};

type ArticlesFeedCachePayload = {
  pageId?: unknown;
  generatedAt?: unknown;
  stats?: {
    totalArticles?: unknown;
  };
  articles?: CacheArticleInput[];
};

type ArticleItem = SiteItem & {
  name: string;
  url: string;
  icon: string;
  description: string;
  publishedAt: string;
  source: string;
  sourceUrl: string;
  external: true;
};

type ArticlesFeedCache = {
  items: ArticleItem[];
  meta: {
    pageId: unknown;
    generatedAt: unknown;
    total: unknown;
  };
};

type ArticleCategory = {
  name: string;
  icon: string;
  items: ArticleItem[];
};

const log = createLogger('cache:articles');

function getArticlesCacheDir(config: RenderConfigLike | null | undefined): string {
  const cacheDirFromEnv = process.env.RSS_CACHE_DIR ? String(process.env.RSS_CACHE_DIR) : '';
  const cacheDirFromConfig = config?.site?.rss?.cacheDir ? String(config.site.rss.cacheDir) : '';
  return cacheDirFromEnv || cacheDirFromConfig || 'dev';
}

function normalizeArticleItem(article: CacheArticleInput | null | undefined): ArticleItem | null {
  const title = article?.title ? String(article.title) : '';
  const url = article?.url ? String(article.url) : '';
  if (!title || !url) return null;

  return {
    name: title,
    url,
    icon: article?.icon ? String(article.icon) : 'fas fa-pen',
    description: article?.summary ? String(article.summary) : '',
    publishedAt: article?.publishedAt ? String(article.publishedAt) : '',
    source: article?.source ? String(article.source) : '',
    sourceUrl: article?.sourceUrl ? String(article.sourceUrl) : '',
    external: true,
  };
}

function tryLoadArticlesFeedCache(
  pageId: string,
  config: RenderConfigLike | null | undefined
): ArticlesFeedCache | null {
  if (!pageId) return null;

  const cacheDir = getArticlesCacheDir(config);
  const cacheBaseDir = path.isAbsolute(cacheDir) ? cacheDir : path.join(process.cwd(), cacheDir);
  const cachePath = path.join(cacheBaseDir, `${pageId}.feed-cache.json`);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as ArticlesFeedCachePayload | null;
    if (!parsed || typeof parsed !== 'object') return null;

    const articles = Array.isArray(parsed.articles) ? parsed.articles : [];
    const items = articles
      .map((article: CacheArticleInput) => normalizeArticleItem(article))
      .filter((item: ArticleItem | null): item is ArticleItem => Boolean(item));

    return {
      items,
      meta: {
        pageId: parsed.pageId || pageId,
        generatedAt: parsed.generatedAt || '',
        total:
          parsed.stats && Number.isFinite(parsed.stats.totalArticles)
            ? parsed.stats.totalArticles
            : items.length,
      },
    };
  } catch {
    log.warn('articles 缓存读取失败，将回退 Phase 1', { path: cachePath });
    return null;
  }
}

function buildArticlesCategoriesByPageCategories(
  categories: CategoryItem[] | null | undefined,
  articlesItems: ArticleItem[] | null | undefined
): ArticleCategory[] {
  const safeItems = Array.isArray(articlesItems) ? articlesItems : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  if (safeCategories.length === 0) {
    return [
      {
        name: '最新文章',
        icon: 'fas fa-rss',
        items: safeItems,
      },
    ];
  }

  const categoryIndex = safeCategories.map((category: CategoryItem) => {
    const sites: unknown[] = [];
    collectSitesRecursively(category, sites);

    const siteUrlKeys = new Set<string>();
    const siteNameKeys = new Set<string>();
    sites.forEach((site: unknown) => {
      const siteRecord =
        site && typeof site === 'object' ? (site as Record<string, unknown>) : null;
      const urlKey = normalizeUrlKey(siteRecord?.url ? String(siteRecord.url) : '');
      if (urlKey) siteUrlKeys.add(urlKey);
      const nameKey = siteRecord?.name ? String(siteRecord.name).trim().toLowerCase() : '';
      if (nameKey) siteNameKeys.add(nameKey);
    });

    return { category, siteUrlKeys, siteNameKeys };
  });

  const buckets = categoryIndex.map((): ArticleItem[] => []);
  const uncategorized: ArticleItem[] = [];

  safeItems.forEach((item: ArticleItem) => {
    const sourceUrlKey = normalizeUrlKey(item?.sourceUrl ? String(item.sourceUrl) : '');
    const sourceNameKey = item?.source ? String(item.source).trim().toLowerCase() : '';

    let matchedIndex = -1;
    if (sourceUrlKey) {
      matchedIndex = categoryIndex.findIndex((idx) => idx.siteUrlKeys.has(sourceUrlKey));
    }
    if (matchedIndex < 0 && sourceNameKey) {
      matchedIndex = categoryIndex.findIndex((idx) => idx.siteNameKeys.has(sourceNameKey));
    }

    if (matchedIndex < 0) {
      uncategorized.push(item);
      return;
    }

    buckets[matchedIndex].push(item);
  });

  const displayCategories = categoryIndex.map((idx, index) => ({
    name: idx.category?.name ? String(idx.category.name) : '未命名分类',
    icon: idx.category?.icon ? String(idx.category.icon) : 'fas fa-rss',
    items: buckets[index],
  }));

  if (uncategorized.length > 0) {
    displayCategories.push({
      name: '其他',
      icon: 'fas fa-ellipsis-h',
      items: uncategorized,
    });
  }

  return displayCategories;
}

export { tryLoadArticlesFeedCache, buildArticlesCategoriesByPageCategories };
