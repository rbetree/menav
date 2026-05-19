import type { RuntimeSearchIndexItem, RuntimeState } from '../../types';

const highlightSearchTerm = require('./highlight.ts') as (
  card: HTMLElement,
  searchTerm: string
) => void;
const { SELECTORS, qsa } = require('../../dom/selectors.ts') as typeof import('../../dom/selectors');

type SearchResultsUiOptions = {
  state: RuntimeState;
  searchTerm: string;
  matchedItems: RuntimeSearchIndexItem[];
  searchResults: Map<string, HTMLElement[]>;
  searchSections: HTMLElement[];
  searchResultsPageElement: HTMLElement;
  searchBoxElement: HTMLElement;
};

function showSearchResults(options: SearchResultsUiOptions): void {
  const {
    state,
    searchTerm,
    matchedItems,
    searchResults,
    searchSections,
    searchResultsPageElement,
    searchBoxElement,
  } = options;
  const hasResults = matchedItems.length > 0;

  requestAnimationFrame(() => {
    try {
      searchSections.forEach((section: HTMLElement) => {
        try {
          const grid = section.querySelector('.sites-grid');
          if (grid) {
            grid.innerHTML = '';
          }
          section.style.display = 'none';
        } catch (sectionError) {
          console.error('Error clearing search section');
        }
      });

      searchResults.forEach((matches: HTMLElement[], pageId: string) => {
        const section = searchResultsPageElement.querySelector<HTMLElement>(
          `[data-section="${pageId}"]`
        );
        if (section) {
          try {
            const grid = section.querySelector('.sites-grid');
            if (grid) {
              const fragment = document.createDocumentFragment();

              matches.forEach((card: HTMLElement) => {
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

      const subtitle = searchResultsPageElement.querySelector('.subtitle');
      if (subtitle) {
        const emptyMessage = state.searchIndex.loading
          ? '搜索索引加载中，请稍后再试'
          : state.searchIndex.error
            ? '搜索索引加载失败，请重新运行构建或刷新页面'
            : '未找到匹配的结果';
        subtitle.textContent = hasResults
          ? `在所有页面中找到 ${matchedItems.length} 个匹配项`
          : emptyMessage;
      }

      if (state.currentPageId !== 'search-results') {
        state.currentPageId = 'search-results';
        if (!state.pages) state.pages = qsa(SELECTORS.page);
        state.pages.forEach((page: HTMLElement) => {
          page.classList.toggle('active', page.id === 'search-results');
        });
      }

      searchBoxElement.classList.toggle('has-results', hasResults);
      searchBoxElement.classList.toggle('no-results', !hasResults);
    } catch (uiError) {
      console.error('Error updating search UI');
    }
  });
}

module.exports = {
  showSearchResults,
};

