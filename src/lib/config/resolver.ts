const fs = require('node:fs');
const path = require('node:path');

const { safeLoadYamlConfig, loadPageConfigFiles } = require('./loader.ts');
const { assignCategorySlugs } = require('./slugs.ts');
const { ConfigError } = require('../errors.ts');
const { createLogger, isVerbose } = require('../logging/logger.ts');

type AnyRecord = Record<string, unknown>;
type NavigationItemLike = AnyRecord & {
  id?: unknown;
  submenu?: unknown;
};
type PageConfigLike = AnyRecord & {
  categories?: unknown;
  template?: unknown;
};
type LoadedPageConfig = {
  configKey: string;
  config: unknown;
  filePath: string;
};

const log = createLogger('config');
const MENAV_EXTENSION_CONFIG_FILE = 'menav-config.json';
const BUILTIN_PAGE_TEMPLATES = new Set([
  'articles',
  'bookmarks',
  'content',
  'page',
  'projects',
  'search-results',
]);

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function resolveConfigDirectory(): string {
  const hasUserModularConfig = fs.existsSync('config/user');
  const hasDefaultModularConfig = fs.existsSync('config/_default');

  if (hasUserModularConfig) {
    if (!fs.existsSync('config/user/site.yml')) {
      throw new ConfigError('检测到 config/user/ 目录，但缺少 config/user/site.yml', [
        '由于配置采用"完全替换"策略，系统不会从 config/_default/ 补齐缺失配置',
        '解决方法：先完整复制 config/_default/ 到 config/user/，再按需修改',
        '参考文档: config/README.md',
      ]);
    }

    if (!fs.existsSync('config/user/pages')) {
      log.warn('检测到 config/user/pages/ 缺失，部分页面内容可能为空');
      log.warn('建议复制 config/_default/pages/ 到 config/user/pages/，再按需修改');
    }

    return 'config/user';
  }

  if (hasDefaultModularConfig) {
    return 'config/_default';
  }

  throw new ConfigError('未找到可用配置：缺少 config/user/ 或 config/_default/', [
    '本版本已不再支持旧版单文件配置（config.yml / config.yaml）',
    '解决方法：使用模块化配置目录（建议从 config/_default/ 复制到 config/user/ 再修改）',
    '参考文档: config/README.md',
  ]);
}

function loadModularConfig(dirPath: string): AnyRecord | null {
  if (!fs.existsSync(dirPath)) {
    return null;
  }

  const config: AnyRecord = {
    site: {},
    navigation: [],
    fonts: {},
    profile: {},
    social: [],
    categories: [],
  };

  const siteConfigPath = path.join(dirPath, 'site.yml');
  const hasSiteConfig = fs.existsSync(siteConfigPath);
  const siteConfig = safeLoadYamlConfig(siteConfigPath) as unknown | null;
  if (hasSiteConfig) {
    config.site = siteConfig;
  }

  if (isRecord(siteConfig)) {
    if (siteConfig.fonts) config.fonts = siteConfig.fonts;
    if (siteConfig.profile) config.profile = siteConfig.profile;
    if (siteConfig.social) config.social = siteConfig.social;
    if (siteConfig.icons) config.icons = siteConfig.icons;

    if (siteConfig.navigation) {
      config.navigation = siteConfig.navigation;
      if (isVerbose()) log.info('使用 site.yml 中的 navigation 配置');
    }
  }

  const pagesPath = path.join(dirPath, 'pages');
  loadPageConfigFiles(pagesPath).forEach((entry: LoadedPageConfig) => {
    config[entry.configKey] = entry.config;
  });

  return config;
}

function getSubmenuForNavItem(navItem: NavigationItemLike | null, config: AnyRecord | null): unknown[] | null {
  if (!navItem || !navItem.id || !config) {
    return null;
  }

  const pageConfig = config[String(navItem.id)] as PageConfigLike | undefined;
  if (pageConfig && Array.isArray(pageConfig.categories)) return pageConfig.categories;

  return null;
}

function makeJsonSafeForHtmlScript(jsonString: unknown): string {
  if (typeof jsonString !== 'string') {
    return '';
  }

  return jsonString.replace(/<\/script/gi, '<\\/script');
}

function resolveTemplateNameForPage(pageId: unknown, config: AnyRecord | null): string {
  if (!pageId) return 'page';

  const pageConfig = config && config[String(pageId)] ? (config[String(pageId)] as PageConfigLike) : null;
  const explicit = pageConfig && pageConfig.template ? String(pageConfig.template).trim() : '';
  if (explicit) return BUILTIN_PAGE_TEMPLATES.has(explicit) ? explicit : 'page';

  if (BUILTIN_PAGE_TEMPLATES.has(String(pageId))) return String(pageId);

  return 'page';
}

function buildExtensionConfig(renderData: AnyRecord | null): AnyRecord {
  const meta = renderData && isRecord(renderData._meta) ? renderData._meta : null;
  const version =
    meta && meta.version && String(meta.version).trim()
      ? String(meta.version).trim()
      : process.env.npm_package_version || '1.0.0';

  const pageTemplates: Record<string, string> = {};
  if (renderData && Array.isArray(renderData.navigation)) {
    renderData.navigation.forEach((navItem: unknown) => {
      if (!isRecord(navItem)) return;
      const pageId = navItem.id ? String(navItem.id).trim() : '';
      if (!pageId) return;
      pageTemplates[pageId] = resolveTemplateNameForPage(pageId, renderData);
    });
  }

  const site = renderData && isRecord(renderData.site) ? renderData.site : null;
  const security = site && isRecord(site.security) ? site.security : null;
  const allowedSchemes = security && Array.isArray(security.allowedSchemes) ? security.allowedSchemes : null;

  return {
    version,
    timestamp: new Date().toISOString(),
    icons: renderData && renderData.icons ? renderData.icons : undefined,
    data: {
      homePageId: renderData && renderData.homePageId ? renderData.homePageId : null,
      pageTemplates,
      site: allowedSchemes ? { security: { allowedSchemes } } : undefined,
    },
  };
}

function prepareRenderData(config: AnyRecord): AnyRecord {
  const renderData: AnyRecord = { ...config };

  renderData._meta = {
    generated_at: new Date(),
    version: process.env.npm_package_version || '1.0.0',
    generator: 'MeNav',
  };

  if (!Array.isArray(renderData.navigation)) {
    renderData.navigation = [];
  }

  if (Array.isArray(renderData.navigation)) {
    renderData.navigation = renderData.navigation.map((item: unknown, index: number) => {
      const base = isRecord(item) ? item : {};
      const navItem: NavigationItemLike = {
        ...base,
        isActive: index === 0,
        id: base.id || `nav-${index}`,
        active: index === 0,
      };

      const submenu = getSubmenuForNavItem(navItem, renderData);
      if (submenu) {
        navItem.submenu = submenu;
      }

      return navItem;
    });
  }

  renderData.homePageId =
    Array.isArray(renderData.navigation) && renderData.navigation[0]
      ? (renderData.navigation[0] as NavigationItemLike).id
      : null;

  if (Array.isArray(renderData.navigation)) {
    renderData.navigation.forEach((navItem: unknown) => {
      if (!isRecord(navItem)) return;
      const pageId = navItem.id ? String(navItem.id) : '';
      const pageConfig = pageId ? (renderData[pageId] as PageConfigLike | undefined) : undefined;
      if (pageConfig && Array.isArray(pageConfig.categories)) {
        assignCategorySlugs(pageConfig.categories, new Map());
      }
    });
  }

  const extensionConfig = buildExtensionConfig(renderData);
  renderData.extensionConfig = extensionConfig;
  renderData.extensionConfigUrl = `./${MENAV_EXTENSION_CONFIG_FILE}`;
  renderData.configJSON = makeJsonSafeForHtmlScript(
    JSON.stringify({
      ...extensionConfig,
      configUrl: renderData.extensionConfigUrl,
    })
  );

  renderData.navigationData = renderData.navigation;

  if (Array.isArray(renderData.social)) {
    renderData.socialLinks = renderData.social;
  }

  return renderData;
}

module.exports = {
  MENAV_EXTENSION_CONFIG_FILE,
  resolveConfigDirectory,
  loadModularConfig,
  getSubmenuForNavItem,
  resolveTemplateNameForPage,
  buildExtensionConfig,
  prepareRenderData,
};
