import type { AppConfig, NavigationItem } from '../../types/config';
import type { CategoryItem, PageData } from '../../types/page';
import type { SiteItem } from '../../types/site';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

const { getSubmenuForNavItem, assignCategorySlugs, resolveTemplateNameForPage } = require(
  path.join(process.cwd(), 'src', 'lib', 'config', 'index.ts')
) as {
  getSubmenuForNavItem: (navItem: NavigationItem, config: AppConfig) => unknown[] | null;
  assignCategorySlugs: (categories: CategoryItem[], usedSlugs: Map<string, number>) => void;
  resolveTemplateNameForPage: (pageId: string, config: Record<string, unknown>) => string;
};
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
const { createLogger, isVerbose } = require(
  path.join(process.cwd(), 'src', 'lib', 'logging', 'logger.ts')
) as {
  createLogger: (scope: string) => {
    warn: (message: string, meta?: Record<string, unknown>) => void;
    info: (message: string, meta?: Record<string, unknown>) => void;
  };
  isVerbose: () => boolean;
};
const { ConfigError } = require(path.join(process.cwd(), 'src', 'lib', 'errors.ts')) as {
  ConfigError: new (message: string, suggestions?: string[]) => Error;
};
const { renderMarkdownToHtml } = require(
  path.join(process.cwd(), 'src', 'lib', 'content', 'markdown.ts')
) as {
  renderMarkdownToHtml: (markdownText: string, opts?: { allowedSchemes?: unknown }) => string;
};

const log = createLogger('render');

type PageDataResult = {
  data: PageData;
  templateName: string;
};

type PageConfigRecord = PageData & {
  template?: string;
  content?: {
    file?: unknown;
    [key: string]: unknown;
  };
};

function getPageConfig(config: AppConfig, pageId: string): PageConfigRecord | null {
  const page = config[pageId];
  return page && typeof page === 'object' ? (page as PageConfigRecord) : null;
}

function prepareNavigationData(pageId: string, config: AppConfig): NavigationItem[] {
  if (!Array.isArray(config.navigation)) {
    log.warn('config.navigation 不是数组，已降级为空数组');
    return [];
  }

  return config.navigation.map((nav) => {
    const navItem: NavigationItem = {
      ...nav,
      isActive: nav.id === pageId,
      active: nav.id === pageId,
    };

    const submenu = getSubmenuForNavItem(navItem, config);
    if (submenu) {
      navItem.submenu = submenu as NavigationItem['submenu'];
    }

    return navItem;
  });
}

function resolveTemplateName(pageId: string, data: PageData): string {
  return resolveTemplateNameForPage(pageId, { [pageId]: data });
}

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

function applyHomePageTitles(data: PageData, pageId: string, config: AppConfig): void {
  const homePageId =
    config.homePageId ||
    (Array.isArray(config.navigation) && config.navigation[0] ? config.navigation[0].id : null) ||
    'home';

  data.homePageId = homePageId;

  if (pageId === homePageId && config.profile) {
    if (config.profile.title !== undefined) data.title = config.profile.title;
    if (config.profile.subtitle !== undefined) data.subtitle = config.profile.subtitle;
  }

  data.isHome = pageId === homePageId;
  data.homePageId = homePageId;
}

function preparePageData(pageId: string, config: AppConfig): PageDataResult {
  const data: PageData = {
    ...(config || {}),
    currentPage: pageId,
    pageId,
  };

  data.navigation = prepareNavigationData(pageId, config);
  data.socialLinks = Array.isArray(config.social) ? config.social : [];
  data.navigationData = data.navigation;

  const pageConfig = getPageConfig(config, pageId);
  if (pageConfig) {
    Object.assign(data, pageConfig);
  }

  if (data.title === undefined) {
    const navItem = Array.isArray(config.navigation)
      ? config.navigation.find((nav) => nav.id === pageId)
      : null;
    if (navItem && navItem.name !== undefined) data.title = navItem.name;
  }
  if (data.subtitle === undefined) data.subtitle = '';
  if (!Array.isArray(data.categories)) data.categories = [];

  const templateName = resolveTemplateName(pageId, data);

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

  applyHomePageTitles(data, pageId, config);

  if (Array.isArray(data.categories) && data.categories.length > 0) {
    assignCategorySlugs(data.categories, new Map());
  }

  if (pageConfig && pageConfig.template) {
    if (isVerbose()) log.info(`页面 ${pageId} 使用指定模板`, { template: templateName });
  }

  return { data, templateName };
}

export { preparePageData, prepareNavigationData };
