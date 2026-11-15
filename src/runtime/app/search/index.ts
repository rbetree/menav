import type {
  RuntimeDom,
  RuntimeSearchApi,
  RuntimeSearchEngines,
  RuntimeSearchIndexItem,
  RuntimeState,
} from '../../types';

const searchEngines = require('./search-engines.ts') as RuntimeSearchEngines;
const debounce = require('./debounce.ts') as (
  fn: (value: string) => void,
  delay: number
) => ((value: string) => void) & { cancel: () => void };
const { createCardFromIndexItem } = require('./cards.ts') as {
  createCardFromIndexItem: (item: RuntimeSearchIndexItem) => HTMLElement;
};
const { showSearchResults } = require('./results-ui.ts') as {
  showSearchResults: (options: {
    state: RuntimeState;
    searchTerm: string;
    matchedItems: RuntimeSearchIndexItem[];
    searchResults: Map<string, HTMLElement[]>;
    searchSections: HTMLElement[];
    searchResultsPageElement: HTMLElement;
    searchBoxElement: HTMLElement;
  }) => void;
};
const { loadBuildSearchIndex } = require('./search-index-loader.ts') as {
  loadBuildSearchIndex: (state: RuntimeState) => Promise<void>;
};
const { SELECTORS, qs, qsa } =
  require('../../dom/selectors.ts') as typeof import('../../dom/selectors');
const { safeGetItem, safeSetItem } = require('../storage.ts') as typeof import('../storage');

// 卡片逐条创建，结果过多会拖慢渲染；超出部分不进入结果页
const SEARCH_RESULT_LIMIT = 200;

function initSearch(state: RuntimeState, dom: RuntimeDom): RuntimeSearchApi {
  const {
    searchInput,
    searchBox,
    searchResultsPage,
    searchSections,
    searchEngineToggle,
    searchEngineToggleIcon,
    searchEngineToggleLabel,
    searchEngineDropdown,
    searchEngineOptions,
  } = dom;

  if (!searchInput || !searchBox || !searchResultsPage) {
    return {
      initSearchIndex: () => {},
      initSearchEngine: () => {},
      resetSearch: () => {},
      performSearch: () => {},
    };
  }

  const searchInputElement = searchInput;
  const searchBoxElement = searchBox;
  const searchResultsPageElement = searchResultsPage;
  // 索引加载期间保留最后一次查询，加载完成后自动重跑，避免首次搜索漏结果
  let pendingSearchTerm = '';

  if (!state.searchIndex) {
    state.searchIndex = { initialized: false, items: [] };
  }
  if (!state.currentSearchEngine) {
    state.currentSearchEngine = 'local';
  }
  if (typeof state.isSearchActive !== 'boolean') {
    state.isSearchActive = false;
  }
  // 初始化搜索索引：只使用构建期 search-index.json，不再从页面卡片生成索引。
  function initSearchIndex(): void {
    if (state.searchIndex.initialized || state.searchIndex.loading) return;
    void loadBuildSearchIndex(state).then(() => {
      const term = pendingSearchTerm;
      pendingSearchTerm = '';
      if (term) performSearch(term);
    });
  }

  // 搜索功能
  function performSearch(searchTerm: string): void {
    searchTerm = searchTerm.toLowerCase().trim();

    // 索引加载期间先记住查询，加载完成后由 initSearchIndex 重跑
    if (!state.searchIndex.initialized) {
      pendingSearchTerm = searchTerm;
      initSearchIndex();
    }

    // 如果搜索框为空，重置所有内容
    if (!searchTerm) {
      resetSearch();
      return;
    }

    if (!state.isSearchActive) {
      state.isSearchActive = true;
    }

    try {
      // 使用搜索索引进行搜索
      const searchResults = new Map<string, HTMLElement[]>();
      // 使用更高效的搜索算法
      const matchedItems = state.searchIndex.items
        .filter((item: RuntimeSearchIndexItem) => {
          const text = item.searchText || `${item.title} ${item.description}`.toLowerCase();
          const hasPinyinMatch =
            typeof PinyinMatch !== 'undefined' &&
            PinyinMatch &&
            typeof PinyinMatch.match === 'function' &&
            PinyinMatch.match(text, searchTerm);
          return text.includes(searchTerm) || Boolean(hasPinyinMatch);
        })
        .slice(0, SEARCH_RESULT_LIMIT);

      // 按页面分组结果
      matchedItems.forEach((item: RuntimeSearchIndexItem) => {
        if (!searchResults.has(item.pageId)) {
          searchResults.set(item.pageId, []);
        }
        // 构建期索引用数据动态生成结果卡片，不再依赖原页面 DOM 克隆。
        const card = createCardFromIndexItem(item);
        searchResults.get(item.pageId)?.push(card);
      });

      showSearchResults({
        state,
        searchTerm,
        matchedItems,
        searchResults,
        searchSections,
        searchResultsPageElement,
        searchBoxElement,
      });
    } catch (searchError) {
      console.error('Error performing search');
    }
  }

  const debouncedSearch = debounce(performSearch, 300);

  // 重置搜索状态
  function resetSearch(): void {
    // 取消挂起的防抖搜索：页面切换/清空输入时，避免挂起任务稍后仍触发本地搜索覆盖当前页面
    debouncedSearch.cancel();
    pendingSearchTerm = '';
    if (!state.isSearchActive) return;

    state.isSearchActive = false;

    try {
      requestAnimationFrame(() => {
        try {
          // 清空搜索结果
          searchSections.forEach((section: HTMLElement) => {
            try {
              const grid = section.querySelector('.sites-grid');
              if (grid) {
                while (grid.firstChild) {
                  grid.removeChild(grid.firstChild);
                }
              }
              section.style.display = 'none';
            } catch (sectionError) {
              console.error('Error clearing search section');
            }
          });

          // 移除搜索状态样式
          searchBoxElement.classList.remove('has-results', 'no-results');

          // 恢复到当前激活的页面
          const currentActiveNav = qs(SELECTORS.navItemActive);
          if (currentActiveNav) {
            const targetPageId = currentActiveNav.getAttribute('data-page');

            if (targetPageId && state.currentPageId !== targetPageId) {
              state.currentPageId = targetPageId;
              if (!state.pages) state.pages = qsa(SELECTORS.page);
              state.pages.forEach((page: HTMLElement) => {
                page.classList.toggle('active', page.id === targetPageId);
              });
            }
          } else {
            // 如果没有激活的导航项，默认显示首页
            state.currentPageId = state.homePageId;
            if (!state.pages) state.pages = qsa(SELECTORS.page);
            state.pages.forEach((page: HTMLElement) => {
              page.classList.toggle('active', page.id === state.homePageId);
            });
          }
        } catch (resetError) {
          console.error('Error resetting search UI');
        }
      });
    } catch (error) {
      console.error('Error in resetSearch');
    }
  }

  searchInputElement.addEventListener('input', (e: Event) => {
    // 只有在选择了本地搜索时，才在输入时实时显示本地搜索结果
    if (state.currentSearchEngine === 'local') {
      debouncedSearch((e.target as HTMLInputElement).value);
    } else {
      // 对于非本地搜索，重置之前的本地搜索结果（如果有）
      if (state.isSearchActive) {
        resetSearch();
      }
    }
  });

  // 更新搜索引擎 UI 显示
  function updateSearchEngineUI(): void {
    // 移除所有选项的激活状态
    searchEngineOptions.forEach((option: HTMLElement) => {
      option.classList.remove('active');
      option.removeAttribute('aria-current');

      // 如果是当前选中的搜索引擎，添加激活状态
      if (option.getAttribute('data-engine') === state.currentSearchEngine) {
        option.classList.add('active');
        option.setAttribute('aria-current', 'true');
      }
    });

    // 更新搜索引擎按钮（方案 B：前缀按钮显示当前引擎）
    const engine = searchEngines[state.currentSearchEngine];
    if (!engine) return;
    const displayName = engine.shortName || engine.name.replace(/搜索$/, '');

    if (searchEngineToggleIcon) {
      if (engine.iconSvg) {
        searchEngineToggleIcon.className = 'search-engine-icon search-engine-icon-svg';
        searchEngineToggleIcon.innerHTML = engine.iconSvg;
      } else {
        searchEngineToggleIcon.innerHTML = '';
        searchEngineToggleIcon.className = `search-engine-icon ${engine.icon}`;
      }
    }
    if (searchEngineToggleLabel) {
      searchEngineToggleLabel.textContent = displayName;
    }
    if (searchEngineToggle) {
      searchEngineToggle.setAttribute('aria-label', `当前搜索引擎：${engine.name}，点击切换`);
    }
  }

  // 初始化搜索引擎设置
  function initSearchEngine(): void {
    // 从本地存储获取上次选择的搜索引擎
    const savedEngine = safeGetItem('searchEngine');
    if (savedEngine && searchEngines[savedEngine]) {
      state.currentSearchEngine = savedEngine;
    }

    // 设置当前搜索引擎的激活状态及图标
    updateSearchEngineUI();

    // 初始化搜索引擎下拉菜单事件
    const setEngineDropdownOpen = (isOpen: boolean, focusToggle = false): void => {
      if (searchEngineDropdown) {
        searchEngineDropdown.classList.toggle('active', isOpen);
      }
      if (searchBox) {
        searchBoxElement.classList.toggle('dropdown-open', isOpen);
      }
      if (searchEngineToggle) {
        searchEngineToggle.setAttribute('aria-expanded', String(isOpen));
      }
      if (!isOpen && focusToggle && searchEngineToggle) {
        searchEngineToggle.focus();
      }
    };

    const toggleEngineDropdown = (): void => {
      if (!searchEngineDropdown) return;
      setEngineDropdownOpen(!searchEngineDropdown.classList.contains('active'));
    };

    if (searchEngineToggle) {
      searchEngineToggle.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        toggleEngineDropdown();
      });

      // 键盘可访问性：Enter/Space 触发，ArrowDown 直接进入菜单
      searchEngineToggle.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleEngineDropdown();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setEngineDropdownOpen(true);
          searchEngineOptions[0]?.focus();
        }
      });
    }

    // 菜单内方向键移动焦点；Escape 关闭并把焦点交还按钮
    if (searchEngineDropdown) {
      searchEngineDropdown.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setEngineDropdownOpen(false, true);
          return;
        }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

        const options = searchEngineOptions;
        if (options.length === 0) return;

        e.preventDefault();
        const currentIndex = options.indexOf(document.activeElement as HTMLElement);
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const nextIndex =
          currentIndex < 0
            ? step > 0
              ? 0
              : options.length - 1
            : (currentIndex + step + options.length) % options.length;
        options[nextIndex].focus();
      });
    }

    // 点击搜索引擎选项
    searchEngineOptions.forEach((option: HTMLElement) => {
      // 初始化激活状态
      if (option.getAttribute('data-engine') === state.currentSearchEngine) {
        option.classList.add('active');
      }

      option.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();

        // 获取选中的搜索引擎
        const engine = option.getAttribute('data-engine');

        // 更新当前搜索引擎
        if (engine && searchEngines[engine]) {
          // 引擎变更时取消挂起的本地搜索，避免切换后仍触发 performSearch
          if (state.currentSearchEngine !== engine) {
            debouncedSearch.cancel();
          }
          // 如果搜索引擎变更，且之前有活跃的本地搜索结果，重置搜索状态
          if (state.currentSearchEngine !== engine && state.isSearchActive) {
            resetSearch();
          }

          state.currentSearchEngine = engine;
          safeSetItem('searchEngine', engine);

          // 更新 UI 显示
          updateSearchEngineUI();

          // 关闭下拉菜单并把焦点交还按钮
          setEngineDropdownOpen(false, true);
        }
      });
    });

    // 点击页面其他位置关闭下拉菜单
    document.addEventListener('click', () => {
      setEngineDropdownOpen(false);
    });

    // 焦点可能在按钮上而非菜单内，Escape 也需关闭
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (!searchEngineDropdown || !searchEngineDropdown.classList.contains('active')) return;
      setEngineDropdownOpen(false, true);
    });
  }

  // 执行搜索（根据选择的搜索引擎）
  function executeSearch(searchTerm: string): void {
    if (!searchTerm.trim()) return;

    // 根据当前搜索引擎执行搜索
    if (state.currentSearchEngine === 'local') {
      // 执行本地搜索
      performSearch(searchTerm);
    } else {
      // 使用外部搜索引擎
      const engine = searchEngines[state.currentSearchEngine];
      if (engine && engine.url) {
        // 打开新窗口进行搜索
        window.open(engine.url + encodeURIComponent(searchTerm), '_blank');
      }
    }
  }

  // 搜索框事件处理
  searchInputElement.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // 取消挂起的本地搜索，避免 Escape 后仍触发 performSearch
      debouncedSearch.cancel();
      searchInputElement.value = '';
      resetSearch();
    } else if (e.key === 'Enter') {
      executeSearch(searchInputElement.value);
    }
  });

  // 阻止搜索框的回车默认行为
  searchInputElement.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  });

  return {
    initSearchIndex,
    initSearchEngine,
    resetSearch,
    performSearch,
  };
}

module.exports = initSearch;
