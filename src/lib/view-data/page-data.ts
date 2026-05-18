import type { AppConfig, NavigationItem } from '../../types/config';
import type { PageData } from '../../types/page';
import {
  assignCategorySlugs,
  getSubmenuForNavItem,
  resolveTemplateNameForPage,
} from '../config/index.ts';
import { createLogger, isVerbose } from '../logging/logger.ts';
import { applyPageKindData } from './page-kind.ts';

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

  applyPageKindData(data, pageId, templateName, config);

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
