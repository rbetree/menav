import type { SearchIndexItem } from '../types/search';

export type RuntimeElement = HTMLElement & {
  dataset: DOMStringMap;
  parentElement: HTMLElement | null;
};

export type RuntimeElementList<T extends Element = HTMLElement> = T[];

export type RuntimeSearchIndexItem = SearchIndexItem & {
  element?: HTMLElement;
};

export type RuntimeState = {
  homePageId: string;
  currentPageId: string;
  isInitialLoad: boolean;
  isSidebarOpen: boolean;
  isLightTheme: boolean;
  isSidebarCollapsed: boolean;
  pages: RuntimeElementList<HTMLElement> | null;
  currentSearchEngine: string;
  isSearchActive: boolean;
  searchIndex: {
    initialized: boolean;
    loading?: boolean;
    source?: 'build' | 'dom';
    items: RuntimeSearchIndexItem[];
  };
};

export type RuntimeDom = {
  searchInput: HTMLInputElement | null;
  searchBox: HTMLElement | null;
  searchResultsPage: HTMLElement | null;
  searchSections: RuntimeElementList<HTMLElement>;
  searchEngineToggle: HTMLElement | null;
  searchEngineToggleIcon: HTMLElement | null;
  searchEngineToggleLabel: HTMLElement | null;
  searchEngineDropdown: HTMLElement | null;
  searchEngineOptions: RuntimeElementList<HTMLElement>;
  menuToggle: HTMLElement | null;
  searchToggle: HTMLElement | null;
  sidebar: HTMLElement | null;
  searchContainer: HTMLElement | null;
  overlay: HTMLElement | null;
  sidebarToggle: HTMLElement | null;
  content: HTMLElement | null;
  themeToggle: HTMLElement | null;
  themeIcon: HTMLElement | null;
};

export type RuntimeRouterApi = {
  ui: RuntimeUiApi;
  search: RuntimeSearchApi;
};

export type RuntimeRoutingApi = {
  showPage: (pageId: string, skipSearchReset?: boolean) => void;
};

export type RuntimeSearchEngine = {
  name: string;
  shortName?: string;
  icon?: string;
  iconSvg?: string;
  url?: string | null;
};

export type RuntimeSearchEngines = Record<string, RuntimeSearchEngine>;

export type NestedStructureSite = {
  name?: string;
  url?: string;
  icon?: string;
  description?: string;
};

export type NestedStructureNode = {
  name?: string;
  type?: string;
  level?: string;
  isCollapsed: boolean;
  subcategories?: NestedStructureNode[];
  groups?: NestedStructureNode[];
  subgroups?: NestedStructureNode[];
  sites?: NestedStructureSite[];
};

export type MenavIconConfig = {
  mode?: unknown;
  region?: unknown;
};

export type MenavConfigData = Record<string, unknown> & {
  homePageId?: unknown;
  navigation?: Array<{ id?: unknown }>;
  pageTemplates?: Record<string, unknown>;
  site?: {
    security?: {
      allowedSchemes?: unknown;
    };
    icons?: MenavIconConfig;
  };
  icons?: MenavIconConfig;
};

export type MenavConfig = {
  data?: MenavConfigData;
  icons?: MenavIconConfig;
  version?: unknown;
};

export type RuntimeUiApi = {
  isMobile: () => boolean;
  closeAllPanels: () => void;
  initTheme: () => void;
  initSidebarState: () => void;
};

export type RuntimeSearchApi = {
  initSearchIndex: () => void;
  initSearchEngine: () => void;
  resetSearch: () => void;
  performSearch: (searchTerm: string) => void;
};

export type RuntimeEvents = {
  listeners: Record<string, Array<(data: unknown) => void>>;
  on: (event: string, callback: (data: unknown) => void) => RuntimeEvents;
  emit: (event: string, data?: unknown) => RuntimeEvents;
  off: (event: string, callback?: (data: unknown) => void) => RuntimeEvents;
};

export type MeNavApi = {
  version?: string;
  getConfig?: (options?: { clone?: boolean }) => MenavConfig | null;
  getAllElements?: (type: string) => Array<{ id: string | null; type: string; element: Element }>;
  addElement?: (
    type: string,
    parentId: string,
    data: Record<string, unknown>
  ) => Element | boolean | null;
  updateElement?: (type: string, id: string, newData: Record<string, unknown>) => boolean;
  removeElement?: (type: string, id: string) => boolean;
  events?: RuntimeEvents;
  _getElementId?: (element: HTMLElement) => string | null;
  _findElement?: (type: string, id: string) => HTMLElement | null;
  expandAll?: () => void;
  collapseAll?: () => void;
  toggleCategories?: () => void;
  toggleCategory?: (
    categoryName: string,
    subcategoryName?: string | null,
    groupName?: string | null,
    subgroupName?: string | null
  ) => void;
  getNestedStructure?: () => NestedStructureNode[];
};

declare global {
  interface Window {
    MeNav?: MeNavApi;
    PinyinMatch?: {
      match?: (input: string, pattern: string) => unknown;
    };
  }

  const PinyinMatch: {
    match: (input: string, pattern: string) => unknown;
  };
}
