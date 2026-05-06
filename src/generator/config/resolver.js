const { assignCategorySlugs } = require('./slugs');

const MENAV_EXTENSION_CONFIG_FILE = 'menav-config.json';
const BUILTIN_PAGE_TEMPLATES = new Set([
  'articles',
  'bookmarks',
  'content',
  'page',
  'projects',
  'search-results',
]);

function getSubmenuForNavItem(navItem, config) {
  if (!navItem || !navItem.id || !config) {
    return null;
  }

  if (config[navItem.id] && Array.isArray(config[navItem.id].categories))
    return config[navItem.id].categories;

  return null;
}

function makeJsonSafeForHtmlScript(jsonString) {
  if (typeof jsonString !== 'string') {
    return '';
  }

  return jsonString.replace(/<\/script/gi, '<\\/script');
}

function resolveTemplateNameForPage(pageId, config) {
  if (!pageId) return 'page';

  const pageConfig = config && config[pageId] ? config[pageId] : null;
  const explicit = pageConfig && pageConfig.template ? String(pageConfig.template).trim() : '';
  if (explicit) return BUILTIN_PAGE_TEMPLATES.has(explicit) ? explicit : 'page';

  if (BUILTIN_PAGE_TEMPLATES.has(pageId)) return pageId;

  return 'page';
}

function buildExtensionConfig(renderData) {
  const version =
    renderData &&
    renderData._meta &&
    renderData._meta.version &&
    String(renderData._meta.version).trim()
      ? String(renderData._meta.version).trim()
      : process.env.npm_package_version || '1.0.0';

  const pageTemplates = {};
  if (renderData && Array.isArray(renderData.navigation)) {
    renderData.navigation.forEach((navItem) => {
      const pageId = navItem && navItem.id ? String(navItem.id).trim() : '';
      if (!pageId) return;
      pageTemplates[pageId] = resolveTemplateNameForPage(pageId, renderData);
    });
  }

  const allowedSchemes =
    renderData &&
    renderData.site &&
    renderData.site.security &&
    Array.isArray(renderData.site.security.allowedSchemes)
      ? renderData.site.security.allowedSchemes
      : null;

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

function prepareRenderData(config) {
  const renderData = { ...config };

  renderData._meta = {
    generated_at: new Date(),
    version: process.env.npm_package_version || '1.0.0',
    generator: 'MeNav',
  };

  if (!Array.isArray(renderData.navigation)) {
    renderData.navigation = [];
  }

  if (Array.isArray(renderData.navigation)) {
    renderData.navigation = renderData.navigation.map((item, index) => {
      const navItem = {
        ...item,
        isActive: index === 0,
        id: item.id || `nav-${index}`,
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
    renderData.navigation && renderData.navigation[0] ? renderData.navigation[0].id : null;

  if (Array.isArray(renderData.navigation)) {
    renderData.navigation.forEach((navItem) => {
      const pageConfig = renderData[navItem.id];
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
  getSubmenuForNavItem,
  resolveTemplateNameForPage,
  buildExtensionConfig,
  prepareRenderData,
};
