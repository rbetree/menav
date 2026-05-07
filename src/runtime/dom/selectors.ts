const SELECTORS = {
  metaVersion: 'meta[name="menav-version"]',
  configData: 'menav-config-data',
  searchInput: 'search',
  searchBox: '.search-box',
  searchResultsPage: 'search-results',
  searchSection: '.search-section',
  searchEngineToggle: '.search-engine-toggle',
  searchEngineIcon: '.search-engine-icon',
  searchEngineLabel: '.search-engine-label',
  searchEngineDropdown: '.search-engine-dropdown',
  searchEngineOption: '.search-engine-option',
  menuToggle: '.menu-toggle',
  searchToggle: '.search-toggle',
  sidebar: '.sidebar',
  searchContainer: '.search-container',
  overlay: '.overlay',
  sidebarToggle: '.sidebar-toggle',
  content: '.content',
  themeToggle: '.theme-toggle',
  page: '.page',
  pageWithId: '.page[id]',
  pageActive: '.page.active',
  category: '.category',
  categoryHeading: '.category h2',
  categoryLevelOne: '.category-level-1',
  navItem: '.nav-item',
  navItemWithPage: '.nav-item[data-page]',
  navItemActive: '.nav-item.active',
  navItemWrapper: '.nav-item-wrapper',
  submenu: '.submenu',
  submenuItem: '.submenu-item',
  submenuPanel: '.sidebar-submenu-panel',
  categoryToggle: 'category-toggle',
  nestedToggleHeader: '[data-toggle="category"], [data-toggle="group"]',
  nestedCollapsibleHeader:
    '.category > .category-header[data-toggle="category"], .group > .group-header[data-toggle="group"]',
  nestedCategoryHeader: ':scope > .category-header[data-toggle="category"]',
  nestedGroupHeader: ':scope > .group-header[data-toggle="group"]',
  nestedHeader:
    ':scope > .category-header, :scope > .subcategory-header, :scope > .group-header, :scope > .subgroup-header',
  nestedSubcategories: ':scope > .category-content > .subcategories-container > .category',
  nestedGroups: ':scope > .category-content > .groups-container > .group',
  nestedSubgroups: ':scope > .group-content > .subgroups-container > .group',
  nestedSites:
    ':scope > .category-content > .sites-grid > .site-card, :scope > .group-content > .sites-grid > .site-card',
  sitesContainer: '[data-container="sites"]',
  siteCard: '.site-card',
  siteTitle: 'h3',
  repoTitle: '.repo-title',
  siteDescription: 'p',
  repoDescription: '.repo-desc',
  dataTooltip: '[data-tooltip]',
} as const;

function qs<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector(selector) as T | null;
}

function qsa<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll(selector)) as T[];
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function dataTypeSelector(type: string): string {
  return `[data-type="${type}"]`;
}

function dataTypeAttrSelector(type: string, attr: string, value: string): string {
  return `[data-type="${type}"][${attr}="${value}"]`;
}

module.exports = {
  SELECTORS,
  qs,
  qsa,
  byId,
  dataTypeSelector,
  dataTypeAttrSelector,
};

export { SELECTORS, qs, qsa, byId, dataTypeSelector, dataTypeAttrSelector };
