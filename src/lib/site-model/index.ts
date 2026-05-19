import type { NavigationItem, ResolvedConfig } from '../../types/config';
import type { CategoryItem, PageData, PageEntry, PageRegistryItem } from '../../types/page';
import type { CardViewModel } from '../../types/card';
import type {
  MenavRuntimeConfig,
  SiteExternalData,
  SiteModel,
  SiteModelInput,
  SiteModelMeta,
} from '../../types/model';
import type { SiteItem } from '../../types/site';
import { applyRepoMetaToCategories } from '../cache/projects.ts';
import { getSubmenuForNavItem, resolveTemplateNameForPage } from '../config/page-template.ts';
import { makeJsonSafeForHtmlScript } from '../config/runtime-config.ts';
import { assignCategorySlugs } from '../config/slugs.ts';
import { buildArticlesCategoriesByPageCategories, buildProjectsMeta } from './external-data.ts';
import { normalizeText, toCardViewModel } from './card.ts';

function isResolvedConfig(input: SiteModelInput | ResolvedConfig): input is ResolvedConfig {
  return Boolean(input && 'site' in input && 'navigation' in input && 'pages' in input);
}

function getInput(input: SiteModelInput | ResolvedConfig): SiteModelInput {
  return isResolvedConfig(input) ? { config: input } : input;
}


function prepareNavigationData(config: ResolvedConfig, activePageId?: string): NavigationItem[] {
  return config.navigation
    .filter((nav) => !nav.hidden)
    .map((nav) => {
      const navItem: NavigationItem = {
        ...nav,
        isActive: activePageId ? nav.id === activePageId : Boolean(nav.isActive),
        active: activePageId ? nav.id === activePageId : Boolean(nav.active),
      };
      const submenu = getSubmenuForNavItem(navItem, config);
      if (submenu) navItem.submenu = submenu as NavigationItem['submenu'];
      return navItem;
    });
}

function prepareNavigationDataFromPages(
  config: ResolvedConfig,
  pages: PageEntry[],
  activePageId?: string
): NavigationItem[] {
  const byId = new Map(pages.map((page) => [page.id, page.data]));
  return config.navigation
    .filter((nav) => !nav.hidden)
    .map((nav) => {
      const navItem: NavigationItem = {
        ...nav,
        isActive: activePageId ? nav.id === activePageId : Boolean(nav.isActive),
        active: activePageId ? nav.id === activePageId : Boolean(nav.active),
      };
      const page = byId.get(String(nav.id));
      if (page && Array.isArray(page.categories) && page.categories.length > 0) {
        navItem.submenu = page.categories as NavigationItem['submenu'];
      }
      return navItem;
    });
}

function resolveTemplateName(pageId: string, config: ResolvedConfig): string {
  return resolveTemplateNameForPage(pageId, config);
}

function clonePageConfig(page: unknown): PageData {
  if (!page || typeof page !== 'object') return {};
  return typeof structuredClone === 'function'
    ? structuredClone(page as PageData)
    : JSON.parse(JSON.stringify(page));
}

function applyHomePageTitles(data: PageData, pageId: string, config: ResolvedConfig): void {
  data.homePageId = config.homePageId;
  if (pageId === config.homePageId && config.profile) {
    if (config.profile.title !== undefined) data.title = config.profile.title;
    if (config.profile.subtitle !== undefined) data.subtitle = config.profile.subtitle;
  }
  data.isHome = pageId === config.homePageId;
}

function applyPageKindData(
  data: PageData,
  pageId: string,
  templateName: string,
  config: ResolvedConfig,
  externalData: SiteExternalData
): void {
  if (templateName === 'projects') {
    data.siteCardStyle = 'repo';
    data.projectsMeta = buildProjectsMeta(config) || undefined;
    const projectExternal = externalData.projects?.[pageId];
    if (data.projectsMeta?.heatmap && projectExternal?.heatmap) {
      data.projectsMeta.heatmap.html = projectExternal.heatmap.html;
      data.projectsMeta.heatmap.generatedAt = projectExternal.heatmap.meta?.generatedAt;
      data.projectsMeta.heatmap.sourceUrl = projectExternal.heatmap.meta?.sourceUrl;
    }
    if (Array.isArray(data.categories) && projectExternal?.repoMetaMap) {
      applyRepoMetaToCategories(data.categories, projectExternal.repoMetaMap);
    }
  }

  if (templateName === 'articles') {
    const articleExternal = externalData.articles?.[pageId];
    data.articlesItems = articleExternal && Array.isArray(articleExternal.items) ? articleExternal.items : [];
    data.articlesMeta = articleExternal ? articleExternal.meta || null : null;
    data.articlesCategories = data.articlesItems.length
      ? buildArticlesCategoriesByPageCategories(data.categories, data.articlesItems)
      : [];
  }

  if (templateName === 'bookmarks') {
    const meta = externalData.pageMeta?.[pageId];
    if (meta) data.pageMeta = { ...meta };
  }

  if (templateName === 'content') {
    const content = externalData.content?.[pageId];
    if (content) {
      data.contentFile = content.file;
      data.contentHtml = content.html;
    }
  }
}

function preparePageData(
  pageId: string,
  config: ResolvedConfig,
  externalData: SiteExternalData = {}
): { data: PageData; templateName: string } {
  const navItem = config.navigation.find((nav) => nav.id === pageId);
  const data: PageData = {
    currentPage: pageId,
    pageId,
    navigation: prepareNavigationData(config, pageId),
    navigationData: prepareNavigationData(config, pageId),
  };
  Object.assign(data, clonePageConfig(config.pages[pageId]));

  if (data.title === undefined && navItem && navItem.name !== undefined) data.title = navItem.name;
  if (data.subtitle === undefined) data.subtitle = '';
  if (!Array.isArray(data.categories)) data.categories = [];

  const templateName = resolveTemplateName(pageId, config);
  applyPageKindData(data, pageId, templateName, config, externalData);
  applyHomePageTitles(data, pageId, config);
  if (Array.isArray(data.categories) && data.categories.length > 0) {
    assignCategorySlugs(data.categories, new Map());
  }
  return { data, templateName };
}

function assignCardsToCategory(
  pageId: string,
  category: CategoryItem,
  config: ResolvedConfig,
  style = '',
  parentPath: string[] = [],
  type?: 'site' | 'article'
): CardViewModel[] {
  const output: CardViewModel[] = [];
  const categoryName = normalizeText(category.name);
  const categoryId = normalizeText(category.slug) || categoryName;
  const categoryPath = categoryName ? [...parentPath, categoryName] : parentPath;
  const sites = Array.isArray(category.sites)
    ? category.sites
    : Array.isArray(category.items)
      ? category.items
      : [];

  if (Array.isArray(category.subcategories)) {
    category.subcategories.forEach((child) => {
      output.push(...assignCardsToCategory(pageId, child, config, style, categoryPath, type));
    });
  }
  if (Array.isArray(category.groups)) {
    category.groups.forEach((child) => {
      output.push(...assignCardsToCategory(pageId, child, config, style, categoryPath, type));
    });
  }
  if (Array.isArray(category.subgroups)) {
    category.subgroups.forEach((child) => {
      output.push(...assignCardsToCategory(pageId, child, config, style, categoryPath, type));
    });
  }
  if (sites.length > 0) {
    category.cards = sites
      .map((site) =>
        toCardViewModel({
          pageId,
          site: site as SiteItem,
          renderContext: config.renderContext,
          type,
          style,
          categoryId,
          categoryName,
          categoryPath,
        })
      )
      .filter((card): card is CardViewModel => Boolean(card));
    output.push(...category.cards);
  } else {
    category.cards = [];
  }

  return output;
}

function assignCardsToPage(page: PageEntry, config: ResolvedConfig): CardViewModel[] {
  const data = page.data || {};
  const style = normalizeText(data.siteCardStyle);

  if (page.id === 'search-results') return [];

  if (page.templateName === 'articles' && Array.isArray(data.articlesItems)) {
    const articlesCategories = Array.isArray(data.articlesCategories) ? data.articlesCategories : [];
    if (articlesCategories.length > 0) {
      const articleCards = articlesCategories.flatMap((category) =>
        assignCardsToCategory(page.id, category, config, style, [], 'article')
      );
      if (Array.isArray(data.categories)) {
        data.categories.forEach((category) => {
          assignCardsToCategory(page.id, category, config, style, [], undefined);
        });
      }
      return articleCards;
    }
  }

  if (!Array.isArray(data.categories)) return [];
  return data.categories.flatMap((category) =>
    assignCardsToCategory(page.id, category, config, style, [], undefined)
  );
}

function buildRuntimeConfig(
  config: ResolvedConfig,
  pageRegistry: PageRegistryItem[],
  pageTemplates: Record<string, string>,
  meta: SiteModelMeta
): MenavRuntimeConfig {
  const allowedSchemes = config.site?.security?.allowedSchemes;
  return {
    version: meta.version,
    timestamp: meta.generatedAt.toISOString(),
    icons: config.icons,
    data: {
      homePageId: config.homePageId || null,
      pageRegistry,
      pageTemplates,
      site: Array.isArray(allowedSchemes) ? { security: { allowedSchemes } } : undefined,
    },
  };
}

function buildSiteModel(input: SiteModelInput | ResolvedConfig): SiteModel {
  const normalized = getInput(input);
  const config = normalized.config;
  const externalData = normalized.externalData || {};
  const now = normalized.now || new Date();
  const meta: SiteModelMeta = {
    generatedAt: now,
    version: normalized.version || process.env.npm_package_version || '1.0.0',
    generatedBy: 'MeNav',
  };

  const pages: PageEntry[] = [];
  const pageRegistry: PageRegistryItem[] = [];
  const pageTemplates: Record<string, string> = {};

  config.navigation.forEach((navItem, index) => {
    const pageId = String(navItem.id).trim();
    const page = preparePageData(pageId, config, externalData);
    pages.push({
      id: pageId,
      isActive: index === 0,
      templateName: page.templateName,
      data: page.data,
    });
    pageRegistry.push({
      id: pageId,
      name: navItem.name ? String(navItem.name).trim() : pageId,
      template: page.templateName,
      active: index === 0,
    });
    pageTemplates[pageId] = page.templateName;
  });

  const navigationData = prepareNavigationDataFromPages(config, pages);
  pages.forEach((page) => {
    if (!page.data) return;
    page.data.navigation = prepareNavigationDataFromPages(config, pages, page.id);
    page.data.navigationData = page.data.navigation;
  });

  pages.push({
    id: 'search-results',
    isActive: false,
    templateName: 'search-results',
    data: {
      pageId: 'search-results',
      currentPage: 'search-results',
      title: '搜索结果',
      subtitle: '在所有页面中找到的匹配项',
      navigation: navigationData,
      navigationData,
      categories: [],
    },
  });

  const searchSources = pages.flatMap((page) => assignCardsToPage(page, config));
  const runtimeConfig = buildRuntimeConfig(config, pageRegistry, pageTemplates, meta);

  return {
    config,
    pages,
    navigationData,
    pageRegistry,
    pageTemplates,
    runtimeConfig,
    runtimeConfigJson: makeJsonSafeForHtmlScript(JSON.stringify(runtimeConfig)),
    searchSources,
    renderContext: config.renderContext,
    meta,
  };
}

export {
  buildSiteModel,
  prepareNavigationData,
  preparePageData,
};
