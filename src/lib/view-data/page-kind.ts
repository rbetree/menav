import type { AppConfig } from '../../types/config';
import type { CategoryItem, PageData } from '../../types/page';
import type { SiteItem } from '../../types/site';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

const { tryLoadArticlesFeedCache, buildArticlesCategoriesByPageCategories } = require(
  path.join(process.cwd(), 'src', 'lib', 'cache', 'articles.ts')
) as {
  tryLoadArticlesFeedCache: (
    pageId: string,
    config: AppConfig
  ) => {
    items: SiteItem[];
    meta: Record<string, unknown>;
  } | null;
  buildArticlesCategoriesByPageCategories: (
    categories: CategoryItem[] | undefined,
    articlesItems: SiteItem[]
  ) => CategoryItem[];
};
const {
  tryLoadProjectsRepoCache,
  tryLoadProjectsHeatmapCache,
  applyRepoMetaToCategories,
  buildProjectsMeta,
} = require(path.join(process.cwd(), 'src', 'lib', 'cache', 'projects.ts')) as {
  tryLoadProjectsRepoCache: (
    pageId: string,
    config: AppConfig
  ) => {
    map: Map<string, unknown>;
    meta: Record<string, unknown>;
  } | null;
  tryLoadProjectsHeatmapCache: (
    pageId: string,
    config: AppConfig
  ) => {
    username: string;
    html: string;
    meta: Record<string, unknown>;
  } | null;
  applyRepoMetaToCategories: (
    categories: CategoryItem[],
    repoMetaMap: Map<string, unknown>
  ) => void;
  buildProjectsMeta: (config: AppConfig) => PageData['projectsMeta'] | null;
};
const { getPageConfigUpdatedAtMeta } = require(
  path.join(process.cwd(), 'src', 'lib', 'site-data', 'page-meta.ts')
) as {
  getPageConfigUpdatedAtMeta: (
    pageId: string
  ) => { updatedAt: string; updatedAtSource: 'git' | 'mtime' } | null;
};
const { ConfigError } = require(path.join(process.cwd(), 'src', 'lib', 'errors.ts')) as {
  ConfigError: new (message: string, suggestions?: string[]) => Error;
};
const { renderMarkdownToHtml } = require(
  path.join(process.cwd(), 'src', 'lib', 'content', 'markdown.ts')
) as {
  renderMarkdownToHtml: (markdownText: string, opts?: { allowedSchemes?: unknown }) => string;
};

function applyProjectsData(data: PageData, pageId: string, config: AppConfig): void {
  data.siteCardStyle = 'repo';
  data.projectsMeta = buildProjectsMeta(config) || undefined;

  const heatmapCache = tryLoadProjectsHeatmapCache(pageId, config);
  if (data.projectsMeta && data.projectsMeta.heatmap && heatmapCache) {
    data.projectsMeta.heatmap.html = heatmapCache.html;
    data.projectsMeta.heatmap.generatedAt = heatmapCache.meta.generatedAt;
    data.projectsMeta.heatmap.sourceUrl = heatmapCache.meta.sourceUrl;
  }

  if (Array.isArray(data.categories)) {
    const repoCache = tryLoadProjectsRepoCache(pageId, config);
    if (repoCache && repoCache.map) {
      applyRepoMetaToCategories(data.categories, repoCache.map);
    }
  }
}

function applyArticlesData(data: PageData, pageId: string, config: AppConfig): void {
  const cache = tryLoadArticlesFeedCache(pageId, config);
  data.articlesItems = cache && Array.isArray(cache.items) ? cache.items : [];
  data.articlesMeta = cache ? cache.meta : null;
  data.articlesCategories = data.articlesItems.length
    ? buildArticlesCategoriesByPageCategories(data.categories, data.articlesItems)
    : [];
}

function applyBookmarksData(data: PageData, pageId: string): void {
  const updatedAtMeta = getPageConfigUpdatedAtMeta(pageId);
  if (updatedAtMeta) {
    data.pageMeta = { ...updatedAtMeta };
  }
}

function applyContentData(data: PageData, pageId: string, config: AppConfig): void {
  const content =
    data && data.content && typeof data.content === 'object'
      ? (data.content as { file?: unknown })
      : null;
  const file = content && content.file ? String(content.file).trim() : '';
  if (!file) {
    throw new ConfigError(`内容页缺少 content.file：${pageId}`, [
      `请在 config/*/pages/${pageId}.yml 中配置：`,
      'template: content',
      'content:',
      '  file: path/to/file.md',
    ]);
  }

  const normalized = file.replace(/\\/g, '/');
  const absPath = path.isAbsolute(normalized)
    ? path.normalize(normalized)
    : path.join(process.cwd(), normalized.replace(/^\//, ''));
  if (!fs.existsSync(absPath)) {
    throw new ConfigError(`内容页 markdown 文件不存在：${pageId}`, [
      `检查路径是否正确：${file}`,
      '提示：路径相对于仓库根目录（process.cwd()）解析',
    ]);
  }

  const markdownText = fs.readFileSync(absPath, 'utf8');
  const allowedSchemes = Array.isArray(config.site?.security?.allowedSchemes)
    ? config.site.security.allowedSchemes
    : null;

  data.contentFile = normalized;
  data.contentHtml = renderMarkdownToHtml(markdownText, { allowedSchemes });
}

function convertTopLevelSitesToCategory(
  data: PageData,
  pageId: string,
  templateName: string
): void {
  const isFriendsPage = pageId === 'friends' || templateName === 'friends';
  const isArticlesPage = pageId === 'articles' || templateName === 'articles';

  if (
    (isFriendsPage || isArticlesPage) &&
    (!Array.isArray(data.categories) || data.categories.length === 0) &&
    Array.isArray(data.sites) &&
    data.sites.length > 0
  ) {
    const implicitName = isFriendsPage ? '全部友链' : '全部来源';
    data.categories = [
      {
        name: implicitName,
        icon: 'fas fa-link',
        sites: data.sites,
      },
    ];
  }
}

function applyPageKindData(data: PageData, pageId: string, templateName: string, config: AppConfig) {
  if (templateName === 'projects') {
    applyProjectsData(data, pageId, config);
  }

  convertTopLevelSitesToCategory(data, pageId, templateName);

  if (templateName === 'articles') {
    applyArticlesData(data, pageId, config);
  }

  if (templateName === 'bookmarks') {
    applyBookmarksData(data, pageId);
  }

  if (templateName === 'content') {
    applyContentData(data, pageId, config);
  }
}

export { applyPageKindData };
