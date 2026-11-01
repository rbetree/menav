type MutableRecord = Record<string, unknown>;
type SiteLike = MutableRecord & {
  name?: unknown;
  url?: unknown;
  description?: unknown;
  icon?: unknown;
  external?: unknown;
};
type CategoryLike = MutableRecord & {
  name?: unknown;
  sites?: unknown;
};
type NodeWithChildren = MutableRecord & {
  sites?: unknown;
  items?: unknown;
  subcategories?: unknown;
  groups?: unknown;
  subgroups?: unknown;
};

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function ensureConfigDefaults(config: MutableRecord | null | undefined): MutableRecord {
  const result: MutableRecord = { ...(config || {}) };

  result.site = isRecord(result.site) ? result.site : {};
  result.navigation = Array.isArray(result.navigation) ? result.navigation : [];
  // 校验只验证不转换：导航 id 可能带前后空白，统一 trim，避免运行时 ?page= 断链与子菜单丢失
  const navigationItems = Array.isArray(result.navigation) ? result.navigation : [];
  result.navigation = navigationItems.map((item) => {
    if (isRecord(item) && typeof item.id === 'string') {
      return { ...item, id: item.id.trim() };
    }
    return item;
  });
  // 同步 site 内嵌导航引用，避免 site.navigation 保留未 trim 的 id（防止模板误读断链）
  if (isRecord(result.site)) {
    (result.site as MutableRecord).navigation = result.navigation;
  }
  result.pages = isRecord(result.pages) ? result.pages : {};

  result.fonts = isRecord(result.fonts) ? result.fonts : {};
  const fonts = result.fonts as MutableRecord;
  fonts.source = fonts.source || 'css';
  fonts.family = fonts.family || 'LXGW WenKai';
  fonts.weight = fonts.weight || 'normal';
  fonts.cssUrl = fonts.cssUrl || 'https://fontsapi.zeoseven.com/292/main/result.css';

  result.profile = isRecord(result.profile) ? result.profile : {};
  result.social = Array.isArray(result.social) ? result.social : [];

  result.icons = isRecord(result.icons) ? result.icons : {};
  const icons = result.icons as MutableRecord;
  icons.mode = icons.mode || 'favicon';
  icons.region = icons.region || 'com';

  const site = result.site as MutableRecord;
  site.title = site.title || 'MeNav导航';
  site.description = site.description || '个人网络导航站';
  site.author = site.author || 'MeNav User';
  site.logo_text = site.logo_text || '导航站';
  site.favicon = site.favicon || 'menav.svg';
  site.logo = site.logo || null;
  site.footer = site.footer || '';
  // 主题 schema 仅允许 mode: dark|light|system，默认 dark（与 config/_default/site.yml 及文档一致）
  site.theme = site.theme || { mode: 'dark' };

  const profile = result.profile as MutableRecord;
  profile.title = profile.title || '欢迎使用';
  profile.subtitle = profile.subtitle || 'MeNav个人导航系统';

  function processSiteDefaults(siteItem: SiteLike): void {
    siteItem.name = siteItem.name || '未命名站点';
    siteItem.url = siteItem.url || '#';
    siteItem.description = siteItem.description || '';
    siteItem.icon = siteItem.icon || 'fas fa-link';
    siteItem.external = typeof siteItem.external === 'boolean' ? siteItem.external : true;
  }

  function processNodeSitesRecursively(node: unknown): void {
    if (!isRecord(node)) return;

    const typedNode = node as NodeWithChildren;

    for (const key of ['sites', 'items'] as const) {
      if (!Array.isArray(typedNode[key])) continue;
      typedNode[key].forEach((siteItem: unknown) => {
        if (isRecord(siteItem)) processSiteDefaults(siteItem as SiteLike);
      });
    }

    if (Array.isArray(typedNode.subcategories))
      typedNode.subcategories.forEach(processNodeSitesRecursively);
    if (Array.isArray(typedNode.groups)) typedNode.groups.forEach(processNodeSitesRecursively);
    if (Array.isArray(typedNode.subgroups))
      typedNode.subgroups.forEach(processNodeSitesRecursively);
  }

  function processCategoryDefaults(category: CategoryLike): void {
    category.name = category.name || '未命名分类';
    category.sites = Array.isArray(category.sites) ? category.sites : [];
    processNodeSitesRecursively(category);
  }

  Object.keys(result.pages as MutableRecord).forEach((key: string) => {
    const pageConfig = (result.pages as MutableRecord)[key];
    if (!isRecord(pageConfig)) return;

    if (Array.isArray(pageConfig.categories)) {
      pageConfig.categories.forEach((category: unknown) => {
        if (isRecord(category)) processCategoryDefaults(category as CategoryLike);
      });
    }

    if (Array.isArray(pageConfig.sites)) {
      pageConfig.sites.forEach((siteItem: unknown) => {
        if (isRecord(siteItem)) processSiteDefaults(siteItem as SiteLike);
      });
    }
  });

  return result;
}
