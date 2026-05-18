import type { AppConfig, NavigationItem } from '../../types/config';
import type { PageEntry } from '../../types/page';
import type { RenderContext } from '../../types/render';
import { getSubmenuForNavItem, loadConfig } from '../config/index.ts';
import { generateFontCss, generateFontLinks } from '../html/fonts.ts';
import { preparePageData } from './page-data.ts';
import { createRenderContext } from './render-context.ts';

type SiteRenderData = {
  config: AppConfig;
  pages: PageEntry[];
  navigationData: NavigationItem[];
  renderContext: RenderContext;
  fontLinks: string;
  fontCss: string;
  currentYear: number;
  runtimeConfigJson: string;
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
  const searchNavigationData = prepareNavigationData(config);

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
      pageId: 'search-results',
      currentPage: 'search-results',
      title: '搜索结果',
      subtitle: '在所有页面中找到的匹配项',
      navigation: searchNavigationData,
      navigationData: searchNavigationData,
      categories: [],
    },
  });

  return pages;
}

function prepareSiteRenderData(config: AppConfig = loadConfig()): SiteRenderData {
  const navigationData = prepareNavigationData(config);
  const renderContext = createRenderContext(config);

  return {
    config,
    pages: preparePages(config),
    navigationData,
    renderContext,
    fontLinks: generateFontLinks(config),
    fontCss: generateFontCss(config),
    currentYear: new Date().getFullYear(),
    runtimeConfigJson: config.runtimeConfigJson || '{}',
  };
}

export { prepareNavigationData, preparePages, prepareSiteRenderData };
