const {
  getSubmenuForNavItem,
  assignCategorySlugs,
  resolveTemplateNameForPage,
} = require('../../lib/config/index.ts');
const {
  tryLoadArticlesFeedCache,
  buildArticlesCategoriesByPageCategories,
} = require('../cache/articles');
const {
  tryLoadProjectsRepoCache,
  tryLoadProjectsHeatmapCache,
  applyRepoMetaToCategories,
  buildProjectsMeta,
} = require('../cache/projects');
const { getPageConfigUpdatedAtMeta } = require('../utils/pageMeta');
const { createLogger, isVerbose } = require('../utils/logger');
const { ConfigError } = require('../utils/errors');
const { renderMarkdownToHtml } = require('./markdown');

const log = createLogger('render');

function prepareNavigationData(pageId, config) {
  if (!Array.isArray(config.navigation)) {
    log.warn('config.navigation 不是数组，已降级为空数组');
    return [];
  }

  return config.navigation.map((nav) => {
    const navItem = {
      ...nav,
      isActive: nav.id === pageId,
      active: nav.id === pageId,
    };

    const submenu = getSubmenuForNavItem(navItem, config);
    if (submenu) {
      navItem.submenu = submenu;
    }

    return navItem;
  });
}

function resolveTemplateName(pageId, data) {
  return resolveTemplateNameForPage(pageId, { [pageId]: data });
}

function applyProjectsData(data, pageId, config) {
  data.siteCardStyle = 'repo';
  data.projectsMeta = buildProjectsMeta(config);

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

function applyArticlesData(data, pageId, config) {
  const cache = tryLoadArticlesFeedCache(pageId, config);
  data.articlesItems = cache && Array.isArray(cache.items) ? cache.items : [];
  data.articlesMeta = cache ? cache.meta : null;
  data.articlesCategories = data.articlesItems.length
    ? buildArticlesCategoriesByPageCategories(data.categories, data.articlesItems)
    : [];
}

function applyBookmarksData(data, pageId) {
  const updatedAtMeta = getPageConfigUpdatedAtMeta(pageId);
  if (updatedAtMeta) {
    data.pageMeta = { ...updatedAtMeta };
  }
}

function applyContentData(data, pageId, config) {
  const content = data && data.content && typeof data.content === 'object' ? data.content : null;
  const file = content && content.file ? String(content.file).trim() : '';
  if (!file) {
    throw new ConfigError(`内容页缺少 content.file：${pageId}`, [
      `请在 config/*/pages/${pageId}.yml 中配置：`,
      'template: content',
      'content:',
      '  file: path/to/file.md',
    ]);
  }

  // 本期仅支持读取本地 markdown 文件
  const fs = require('node:fs');
  const path = require('node:path');

  // 允许用户以相对 repo root 的路径引用（推荐约定：content/*.md）
  // 同时允许绝对路径（便于本地调试/临时文件），但不会自动复制资源到 dist。
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
  const allowedSchemes =
    config &&
    config.site &&
    config.site.security &&
    Array.isArray(config.site.security.allowedSchemes)
      ? config.site.security.allowedSchemes
      : null;

  data.contentFile = normalized;
  data.contentHtml = renderMarkdownToHtml(markdownText, { allowedSchemes });
}

function convertTopLevelSitesToCategory(data, pageId, templateName) {
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

function applyHomePageTitles(data, pageId, config) {
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

function preparePageData(pageId, config) {
  const data = {
    ...(config || {}),
    currentPage: pageId,
    pageId,
  };

  data.navigation = prepareNavigationData(pageId, config);
  data.socialLinks = Array.isArray(config.social) ? config.social : [];
  data.navigationData = data.navigation;

  if (config[pageId]) {
    Object.assign(data, config[pageId]);
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

  if (config[pageId] && config[pageId].template) {
    if (isVerbose()) log.info(`页面 ${pageId} 使用指定模板`, { template: templateName });
  }

  return { data, templateName };
}

module.exports = {
  preparePageData,
};
