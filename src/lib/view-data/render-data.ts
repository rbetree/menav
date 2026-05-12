import type { AppConfig, NavigationItem } from '../../types/config';
import type { PageEntry } from '../../types/page';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const path = require('node:path') as typeof import('node:path');

const { loadConfig, getSubmenuForNavItem } = require(
  path.join(process.cwd(), 'src', 'lib', 'config', 'index.ts')
) as {
  loadConfig: () => AppConfig;
  getSubmenuForNavItem: (navItem: NavigationItem, config: AppConfig) => unknown[] | null;
};
const { generateFontLinks, generateFontCss } = require(
  path.join(process.cwd(), 'src', 'lib', 'html', 'fonts.ts')
) as {
  generateFontLinks: (config: AppConfig) => string;
  generateFontCss: (config: AppConfig) => string;
};
const { preparePageData } = require(
  path.join(process.cwd(), 'src', 'lib', 'view-data', 'page-data.ts')
) as {
  preparePageData: (
    pageId: string,
    config: AppConfig
  ) => { data: PageEntry['data']; templateName: string };
};

type SiteRenderData = {
  config: AppConfig;
  pages: PageEntry[];
  navigationData: NavigationItem[];
  fontLinks: string;
  fontCss: string;
  currentYear: number;
  configJSON: string;
};

function prepareNavigationData(config: AppConfig): NavigationItem[] {
  if (!config || !Array.isArray(config.navigation)) return [];

  return config.navigation.map((nav) => {
    const navItem: NavigationItem = { ...nav };
    const submenu = getSubmenuForNavItem(navItem, config);
    if (submenu) navItem.submenu = submenu as NavigationItem['submenu'];
    return navItem;
  });
}

function preparePages(config: AppConfig): PageEntry[] {
  const pages: PageEntry[] = [];

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

function prepareSiteRenderData(config: AppConfig = loadConfig()): SiteRenderData {
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

export { prepareNavigationData, preparePages, prepareSiteRenderData };
