import type { PageRegistryItem } from '../../types/page';

import { getSubmenuForNavItem, resolveTemplateNameForPage } from './page-template.ts';
import { buildRuntimeConfig, makeJsonSafeForHtmlScript } from './runtime-config.ts';
import { assignCategorySlugs } from './slugs.ts';

type AnyRecord = Record<string, unknown>;

type NavigationItemLike = AnyRecord & {
  id?: unknown;
  submenu?: unknown;
};

type PageConfigLike = AnyRecord & {
  categories?: unknown;
};

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function prepareRenderData(config: AnyRecord): AnyRecord {
  const renderData: AnyRecord = { ...config };

  renderData._meta = {
    generated_at: new Date(),
    version: process.env.npm_package_version || '1.0.0',
    generatedBy: 'MeNav',
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
  renderData.pageRegistry = [];

  if (Array.isArray(renderData.navigation)) {
    renderData.navigation.forEach((navItem: unknown, index: number) => {
      if (!isRecord(navItem)) return;
      const pageId = navItem.id ? String(navItem.id) : '';
      if (pageId) {
        (renderData.pageRegistry as PageRegistryItem[]).push({
          id: pageId,
          name: navItem.name ? String(navItem.name).trim() : pageId,
          template: resolveTemplateNameForPage(pageId, renderData),
          active: index === 0,
        });
      }
      const pageConfig = pageId ? (renderData[pageId] as PageConfigLike | undefined) : undefined;
      if (pageConfig && Array.isArray(pageConfig.categories)) {
        assignCategorySlugs(pageConfig.categories, new Map());
      }
    });
  }

  const runtimeConfig = buildRuntimeConfig(renderData);
  renderData.runtimeConfig = runtimeConfig;
  renderData.runtimeConfigJson = makeJsonSafeForHtmlScript(JSON.stringify(runtimeConfig));

  renderData.navigationData = renderData.navigation;

  if (Array.isArray(renderData.social)) {
    renderData.socialLinks = renderData.social;
  }

  return renderData;
}
