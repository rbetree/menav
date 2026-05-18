type AnyRecord = Record<string, unknown>;

type NavigationItemLike = AnyRecord & {
  id?: unknown;
};

type PageConfigLike = AnyRecord & {
  categories?: unknown;
  template?: unknown;
};

const BUILTIN_PAGE_TEMPLATES = new Set([
  'articles',
  'bookmarks',
  'content',
  'page',
  'projects',
  'search-results',
]);

export function getSubmenuForNavItem(
  navItem: NavigationItemLike | null,
  config: AnyRecord | null
): unknown[] | null {
  if (!navItem || !navItem.id || !config) {
    return null;
  }

  const pages = config.pages && typeof config.pages === 'object' ? (config.pages as AnyRecord) : config;
  const pageConfig = pages[String(navItem.id)] as PageConfigLike | undefined;
  if (pageConfig && Array.isArray(pageConfig.categories)) return pageConfig.categories;

  return null;
}

export function resolveTemplateNameForPage(pageId: unknown, config: AnyRecord | null): string {
  if (!pageId) return 'page';

  const pageConfig =
    config && config.pages && typeof config.pages === 'object'
      ? ((config.pages as AnyRecord)[String(pageId)] as PageConfigLike | undefined)
      : config && config[String(pageId)]
        ? (config[String(pageId)] as PageConfigLike)
        : null;
  const explicit = pageConfig && pageConfig.template ? String(pageConfig.template).trim() : '';
  if (explicit) return BUILTIN_PAGE_TEMPLATES.has(explicit) ? explicit : 'page';

  if (BUILTIN_PAGE_TEMPLATES.has(String(pageId))) return String(pageId);

  return 'page';
}
