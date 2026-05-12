import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const config = require('./config/index.ts') as Record<string, unknown>;
const pageData = require('./view-data/page-data.ts') as Record<string, unknown>;
const renderData = require('./view-data/render-data.ts') as Record<string, unknown>;
const articlesCache = require('./cache/articles.ts') as Record<string, unknown>;
const projectsCache = require('./cache/projects.ts') as Record<string, unknown>;
const markdown = require('./content/markdown.ts') as Record<string, unknown>;
const fonts = require('./html/fonts.ts') as Record<string, unknown>;
const errors = require('./errors.ts') as Record<string, unknown>;
const github = require('./github/contributions.ts') as Record<string, unknown>;
const logger = require('./logging/logger.ts') as Record<string, unknown>;
const securityHtml = require('./security/html.ts') as Record<string, unknown>;
const pageMeta = require('./site-data/page-meta.ts') as Record<string, unknown>;
const searchIndex = require('./search-index/index.ts') as Record<string, unknown>;
const sites = require('./site-data/sites.ts') as Record<string, unknown>;

const {
  MENAV_EXTENSION_CONFIG_FILE,
  assignCategorySlugs,
  buildExtensionConfig,
  ensureConfigDefaults,
  getConfigValidationErrors,
  getSubmenuForNavItem,
  loadConfig,
  loadModularConfig,
  prepareRenderData,
  resolveConfigDirectory,
  resolveTemplateNameForPage,
  validateConfig,
} = config;

const { preparePageData } = pageData;
const { prepareNavigationData, preparePages, prepareSiteRenderData } = renderData;

const { buildArticlesCategoriesByPageCategories, tryLoadArticlesFeedCache } = articlesCache;
const {
  applyRepoMetaToCategories,
  buildProjectsMeta,
  tryLoadProjectsHeatmapCache,
  tryLoadProjectsRepoCache,
} = projectsCache;

const { renderMarkdownToHtml, sanitizeLinkHref } = markdown;
const { generateFontCss, generateFontLinks } = fonts;
const { BuildError, ConfigError, FileError, TemplateError, handleError, wrapAsyncError } = errors;
const { fetchGithubContributionsHtml } = github;
const { createLogger, formatMeta, formatPrefix, isVerbose, startTimer } = logger;
const { escapeHtml } = securityHtml;
const { getPageConfigUpdatedAtMeta, resolvePageConfigFilePath } = pageMeta;
const { MENAV_SEARCH_INDEX_FILE, SEARCH_INDEX_SCHEMA_VERSION, buildSearchIndex } = searchIndex;
const { collectSitesRecursively, normalizeUrlKey } = sites;

export {
  MENAV_EXTENSION_CONFIG_FILE,
  MENAV_SEARCH_INDEX_FILE,
  assignCategorySlugs,
  applyRepoMetaToCategories,
  buildArticlesCategoriesByPageCategories,
  buildExtensionConfig,
  buildProjectsMeta,
  buildSearchIndex,
  BuildError,
  collectSitesRecursively,
  ConfigError,
  createLogger,
  ensureConfigDefaults,
  escapeHtml,
  fetchGithubContributionsHtml,
  FileError,
  formatMeta,
  formatPrefix,
  generateFontCss,
  generateFontLinks,
  getConfigValidationErrors,
  getPageConfigUpdatedAtMeta,
  getSubmenuForNavItem,
  handleError,
  isVerbose,
  loadConfig,
  loadModularConfig,
  normalizeUrlKey,
  prepareNavigationData,
  preparePageData,
  preparePages,
  prepareRenderData,
  prepareSiteRenderData,
  renderMarkdownToHtml,
  resolveConfigDirectory,
  resolvePageConfigFilePath,
  resolveTemplateNameForPage,
  sanitizeLinkHref,
  SEARCH_INDEX_SCHEMA_VERSION,
  startTimer,
  TemplateError,
  tryLoadArticlesFeedCache,
  tryLoadProjectsHeatmapCache,
  tryLoadProjectsRepoCache,
  validateConfig,
  wrapAsyncError,
};
