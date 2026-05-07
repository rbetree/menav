import type { RuntimeDom, RuntimeSearchApi, RuntimeSearchEngines, RuntimeSearchIndexItem, RuntimeState } from '../../types';

const searchEngines = require('./search-engines.ts') as RuntimeSearchEngines;
const highlightSearchTerm = require('./highlight.ts') as (card: HTMLElement, searchTerm: string) => void;
const { SELECTORS, qs, qsa } = require('../../dom/selectors.ts') as typeof import('../../dom/selectors');

module.exports = function initSearch(state: RuntimeState, dom: RuntimeDom): RuntimeSearchApi {
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

  if (!state.searchIndex) {
    state.searchIndex = { initialized: false, items: [] };
  }
  if (!state.currentSearchEngine) {
    state.currentSearchEngine = 'local';
  }
  if (typeof state.isSearchActive !== 'boolean') {
    state.isSearchActive = false;
  }

  // 初始化搜索索引
  function initSearchIndex(): void {
    if (state.searchIndex.initialized) return;

    state.searchIndex.items = [];

    try {
      // 为每个页面创建索引
      if (!state.pages) {
        state.pages = qsa(SELECTORS.page);
      }

      state.pages.forEach((page: HTMLElement) => {
        if (page.id === 'search-results') return;

        const pageId = page.id;

        qsa(SELECTORS.siteCard, page).forEach((card: HTMLElement) => {
          try {
            // 排除“扩展写回影子结构”等不应参与搜索的卡片
            if (card.closest('[data-search-exclude="true"]')) return;

            // 兼容不同页面/卡片样式：优先取可见文本，其次回退到 data-*（确保 projects repo 卡片也能被搜索）
            const dataTitle = card.dataset?.name || card.getAttribute('data-name') || '';
            const dataDescription =
              card.dataset?.description || card.getAttribute('data-description') || '';

            const titleText =
              card.querySelector('h3')?.textContent ||
              card.querySelector('.repo-title')?.textContent ||
              dataTitle;
            const descriptionText =
              card.querySelector('p')?.textContent ||
              card.querySelector('.repo-desc')?.textContent ||
              dataDescription;

            const title = String(titleText || '').toLowerCase();
            const description = String(descriptionText || '').toLowerCase();
            const url = (card as HTMLAnchorElement).href || card.getAttribute('href') || '#';
            const icon =
              card.querySelector('i.icon-fallback')?.className ||
              card.querySelector('i')?.className ||
              '';

            // 将卡片信息添加到索引中
            state.searchIndex.items.push({
              pageId,
              title,
              description,
              url,
              icon,
              element: card,
              // 预先计算搜索文本，提高搜索效率
              searchText: (title + ' ' + description).toLowerCase(),
            });
          } catch (cardError) {
            console.error('Error processing card:', cardError);
          }
        });
      });

      state.searchIndex.initialized = true;
    } catch (error) {
      console.error('Error initializing search index:', error);
      state.searchIndex.initialized = true; // 防止反复尝试初始化
    }
  }

  // 搜索功能
  function performSearch(searchTerm: string): void {
    // 确保搜索索引已初始化
    if (!state.searchIndex.initialized) {
      initSearchIndex();
    }

    searchTerm = searchTerm.toLowerCase().trim();

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
      let hasResults = false;

      // 使用更高效的搜索算法
      const matchedItems = state.searchIndex.items.filter((item: RuntimeSearchIndexItem) => {
        return (
          item.searchText.includes(searchTerm) || PinyinMatch.match(item.searchText, searchTerm)
        );
      });

      // 按页面分组结果
      matchedItems.forEach((item: RuntimeSearchIndexItem) => {
        if (!searchResults.has(item.pageId)) {
          searchResults.set(item.pageId, []);
        }
        // 克隆元素以避免修改原始 DOM
        searchResults.get(item.pageId)?.push(item.element.cloneNode(true) as HTMLElement);
        hasResults = true;
      });

      // 使用 requestAnimationFrame 批量更新 DOM，减少重排重绘
      requestAnimationFrame(() => {
        try {
          // 清空并隐藏所有搜索区域
          searchSections.forEach((section: HTMLElement) => {
            try {
              const grid = section.querySelector('.sites-grid');
              if (grid) {
                grid.innerHTML = ''; // 使用 innerHTML 清空，比 removeChild 更高效
              }
              section.style.display = 'none';
            } catch (sectionError) {
              console.error('Error clearing search section');
            }
          });

          // 使用 DocumentFragment 批量添加 DOM 元素，减少重排
          searchResults.forEach((matches: HTMLElement[], pageId: string) => {
            const section = searchResultsPageElement.querySelector<HTMLElement>(`[data-section="${pageId}"]`);
            if (section) {
              try {
                const grid = section.querySelector('.sites-grid');
                if (grid) {
                  const fragment = document.createDocumentFragment();

                  matches.forEach((card: HTMLElement) => {
                    // 高亮匹配文本
                    highlightSearchTerm(card, searchTerm);
                    fragment.appendChild(card);
                  });

                  grid.appendChild(fragment);
                  section.style.display = 'block';
                }
              } catch (gridError) {
                console.error('Error updating search results grid');
              }
            }
          });

          // 更新搜索结果页面状态
          const subtitle = searchResultsPageElement.querySelector('.subtitle');
          if (subtitle) {
            subtitle.textContent = hasResults
              ? `在所有页面中找到 ${matchedItems.length} 个匹配项`
              : '未找到匹配的结果';
          }

          // 显示搜索结果页面
          if (state.currentPageId !== 'search-results') {
            state.currentPageId = 'search-results';
            if (!state.pages) state.pages = qsa(SELECTORS.page);
            state.pages.forEach((page: HTMLElement) => {
              page.classList.toggle('active', page.id === 'search-results');
            });
          }

          // 更新搜索状态样式
          searchBoxElement.classList.toggle('has-results', hasResults);
          searchBoxElement.classList.toggle('no-results', !hasResults);
        } catch (uiError) {
          console.error('Error updating search UI');
        }
      });
    } catch (searchError) {
      console.error('Error performing search');
    }
  }

  // 重置搜索状态
  function resetSearch(): void {
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

  // 搜索输入事件（使用防抖）
  const debounce = (fn: (value: string) => void, delay: number): ((value: string) => void) => {
    let timer: number | null = null;
    return (value: string) => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => {
        fn(value);
        timer = null;
      }, delay);
    };
  };

  const debouncedSearch = debounce(performSearch, 300);

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

      // 如果是当前选中的搜索引擎，添加激活状态
      if (option.getAttribute('data-engine') === state.currentSearchEngine) {
        option.classList.add('active');
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
    const savedEngine = localStorage.getItem('searchEngine');
    if (savedEngine && searchEngines[savedEngine]) {
      state.currentSearchEngine = savedEngine;
    }

    // 设置当前搜索引擎的激活状态及图标
    updateSearchEngineUI();

    // 初始化搜索引擎下拉菜单事件
    const toggleEngineDropdown = () => {
      if (!searchEngineDropdown) return;
      const next = !searchEngineDropdown.classList.contains('active');
      searchEngineDropdown.classList.toggle('active', next);
      if (searchBox) {
        searchBoxElement.classList.toggle('dropdown-open', next);
      }
      if (searchEngineToggle) {
        searchEngineToggle.setAttribute('aria-expanded', String(next));
      }
    };

    if (searchEngineToggle) {
      searchEngineToggle.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        toggleEngineDropdown();
      });

      // 键盘可访问性：Enter/Space 触发
      searchEngineToggle.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleEngineDropdown();
        }
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
          // 如果搜索引擎变更，且之前有活跃的本地搜索结果，重置搜索状态
          if (state.currentSearchEngine !== engine && state.isSearchActive) {
            resetSearch();
          }

          state.currentSearchEngine = engine;
          localStorage.setItem('searchEngine', engine);

          // 更新 UI 显示
          updateSearchEngineUI();

          // 关闭下拉菜单
          if (searchEngineDropdown) {
            searchEngineDropdown.classList.remove('active');
          }
          if (searchBox) {
            searchBoxElement.classList.remove('dropdown-open');
          }
        }
      });
    });

    // 点击页面其他位置关闭下拉菜单
    document.addEventListener('click', () => {
      if (!searchEngineDropdown) return;
      searchEngineDropdown.classList.remove('active');
      if (searchBox) {
        searchBoxElement.classList.remove('dropdown-open');
      }
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
};
