import type { MenavConfig, RuntimeDom, RuntimeRoutingApi, RuntimeSearchApi, RuntimeState, RuntimeUiApi } from '../types';

const initUi = require('./ui.ts') as (state: RuntimeState, dom: RuntimeDom) => RuntimeUiApi;
const initSearch = require('./search/index.ts') as (state: RuntimeState, dom: RuntimeDom) => RuntimeSearchApi;
const initRouting = require('./router.ts') as (
  state: RuntimeState,
  dom: RuntimeDom,
  api: { ui: RuntimeUiApi; search: RuntimeSearchApi }
) => RuntimeRoutingApi;
const { SELECTORS, byId, qs, qsa } = require('../dom/selectors.ts') as typeof import('../dom/selectors');

function detectHomePageId(): string {
  // 首页不再固定为 "home"：以导航顺序第一项为准
  // 1) 优先从生成端注入的配置数据读取（保持与实际导航顺序一致）
  try {
    const config: MenavConfig | null =
      window.MeNav && typeof window.MeNav.getConfig === 'function'
        ? window.MeNav.getConfig()
        : null;
    const injectedHomePageId =
      config && config.data && config.data.homePageId ? String(config.data.homePageId).trim() : '';
    if (injectedHomePageId) return injectedHomePageId;
    const nav =
      config && config.data && Array.isArray(config.data.navigation)
        ? config.data.navigation
        : null;
    const firstId = nav && nav[0] && nav[0].id ? String(nav[0].id).trim() : '';
    if (firstId) return firstId;
  } catch (error) {
    // 忽略解析错误，继续使用 DOM 推断
  }

  // 2) 回退到 DOM：取首个导航项的 data-page
  const firstNavItem = qs(SELECTORS.navItemWithPage);
  if (firstNavItem) {
    const id = String(firstNavItem.getAttribute('data-page') || '').trim();
    if (id) return id;
  }

  // 3) 最后兜底：取首个页面容器 id
  const firstPage = qs(SELECTORS.pageWithId);
  if (firstPage && firstPage.id) return firstPage.id;

  return 'home';
}

document.addEventListener('DOMContentLoaded', () => {
  const homePageId = detectHomePageId();

  const state: RuntimeState = {
    homePageId,
    currentPageId: homePageId,
    isInitialLoad: true,
    isSidebarOpen: false,
    isLightTheme: false,
    isSidebarCollapsed: false,
    pages: null,
    currentSearchEngine: 'local',
    isSearchActive: false,
    searchIndex: {
      initialized: false,
      items: [],
    },
  };

  // 获取 DOM 元素 - 基本元素
  const searchInput = byId<HTMLInputElement>(SELECTORS.searchInput);
  const searchBox = qs(SELECTORS.searchBox);
  const searchResultsPage = byId<HTMLElement>(SELECTORS.searchResultsPage);
  const searchSections = searchResultsPage ? qsa(SELECTORS.searchSection, searchResultsPage) : [];

  // 搜索引擎相关元素
  const searchEngineToggle = qs(SELECTORS.searchEngineToggle);
  const searchEngineToggleIcon = searchEngineToggle
    ? qs(SELECTORS.searchEngineIcon, searchEngineToggle)
    : null;
  const searchEngineToggleLabel = searchEngineToggle
    ? qs(SELECTORS.searchEngineLabel, searchEngineToggle)
    : null;
  const searchEngineDropdown = qs(SELECTORS.searchEngineDropdown);
  const searchEngineOptions = qsa(SELECTORS.searchEngineOption);

  // 移动端元素
  const menuToggle = qs(SELECTORS.menuToggle);
  const searchToggle = qs(SELECTORS.searchToggle);
  const sidebar = qs(SELECTORS.sidebar);
  const searchContainer = qs(SELECTORS.searchContainer);
  const overlay = qs(SELECTORS.overlay);

  // 侧边栏折叠功能
  const sidebarToggle = qs(SELECTORS.sidebarToggle);
  const content = qs<HTMLElement>(SELECTORS.content);

  // 主题切换元素
  const themeToggle = qs(SELECTORS.themeToggle);
  const themeIcon = themeToggle ? qs('i', themeToggle) : null;

  const dom: RuntimeDom = {
    searchInput,
    searchBox,
    searchResultsPage,
    searchSections,
    searchEngineToggle,
    searchEngineToggleIcon,
    searchEngineToggleLabel,
    searchEngineDropdown,
    searchEngineOptions,
    menuToggle,
    searchToggle,
    sidebar,
    searchContainer,
    overlay,
    sidebarToggle,
    content,
    themeToggle,
    themeIcon,
  };

  const ui = initUi(state, dom);
  const search = initSearch(state, dom);

  initRouting(state, dom, { ui, search });
});
