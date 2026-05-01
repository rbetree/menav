const { loadConfig, getSubmenuForNavItem } = require('../generator/config');
const { generateFontLinks, generateFontCss } = require('../generator/html/fonts');
const { preparePageData } = require('../generator/html/page-data');

function prepareNavigationData(config) {
  if (!config || !Array.isArray(config.navigation)) return [];

  return config.navigation.map((nav) => {
    const navItem = { ...nav };
    const submenu = getSubmenuForNavItem(navItem, config);
    if (submenu) navItem.submenu = submenu;
    return navItem;
  });
}

function preparePages(config) {
  const pages = [];

  if (config && Array.isArray(config.navigation)) {
    config.navigation.forEach((navItem, index) => {
      const pageId = navItem && navItem.id ? String(navItem.id).trim() : '';
      if (!pageId) return;

      const page = preparePageData(pageId, config);
      pages.push({
        id: pageId,
        isActive: index === 0,
        templateName: page.templateName,
        data: page.data,
      });
    });
  }

  pages.push({
    id: 'search-results',
    isActive: false,
    templateName: 'search-results',
    data: {
      ...(config || {}),
      pageId: 'search-results',
      currentPage: 'search-results',
      title: '搜索结果',
      subtitle: '在所有页面中找到的匹配项',
      navigation: prepareNavigationData(config),
      navigationData: prepareNavigationData(config),
    },
  });

  return pages;
}

function prepareSiteRenderData(config = loadConfig()) {
  const navigationData = prepareNavigationData(config);

  return {
    config,
    pages: preparePages(config),
    navigationData,
    fontLinks: generateFontLinks(config),
    fontCss: generateFontCss(config),
    currentYear: new Date().getFullYear(),
    configJSON: config.configJSON || '{}',
  };
}

module.exports = {
  prepareNavigationData,
  preparePages,
  prepareSiteRenderData,
};
