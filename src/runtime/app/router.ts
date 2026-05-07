import type { MenavConfig, RuntimeDom, RuntimeRouterApi, RuntimeRoutingApi, RuntimeState } from '../types';

const nested = require('./nested.ts') as { initializeNestedCategories: () => void };
const { SELECTORS, byId, qs, qsa } = require('../dom/selectors.ts') as typeof import('../dom/selectors');

type UrlStatePatch = { pageId?: string; hash?: string | null };
type UrlStateOptions = { replace?: boolean };
type ScrollCategoryOptions = { categoryId?: string | null; categoryName?: string | null };
type SubmenuEntry = { wrapper: HTMLElement; submenu: HTMLElement };

module.exports = function initRouting(
  state: RuntimeState,
  dom: RuntimeDom,
  api: RuntimeRouterApi
): RuntimeRoutingApi {
  const { ui, search } = api;
  const { searchInput, content, sidebar } = dom;

  function showPage(pageId: string, skipSearchReset = false): void {
    if (state.currentPageId === pageId && !skipSearchReset && !state.isInitialLoad) return;

    state.currentPageId = pageId;

    // 使用 RAF 确保动画流畅
    requestAnimationFrame(() => {
      if (!state.pages) {
        state.pages = qsa(SELECTORS.page);
      }

      state.pages.forEach((page: HTMLElement) => {
        const shouldBeActive = page.id === pageId;
        if (shouldBeActive !== page.classList.contains('active')) {
          page.classList.toggle('active', shouldBeActive);
        }
      });

      // 通知：页面已切换（供按需组件初始化，如 github-calendar）
      // 注意：必须在 active class 切换之后触发，否则监听方可能认为页面仍不可见。
      try {
        document.dispatchEvent(
          new CustomEvent('menav:pageChanged', {
            detail: {
              pageId,
            },
          })
        );
      } catch (error) {
        // ignore
      }

      // 初始加载完成后设置标志
      if (state.isInitialLoad) {
        state.isInitialLoad = false;
        document.body.classList.add('loaded');
      }
    });

    // 重置滚动位置并更新进度条
    if (content) content.scrollTop = 0;

    // 只有在非搜索状态下才重置搜索
    if (!skipSearchReset) {
      if (searchInput) searchInput.value = '';
      search.resetSearch();
    }
  }

  // 初始化（在 window load 时执行）
  window.addEventListener('load', () => {
    // 获取可能在 HTML 生成后才存在的 DOM 元素
    const categories = qsa(SELECTORS.category);
    const navItems = qsa(SELECTORS.navItem);
    const navItemWrappers = qsa(SELECTORS.navItemWrapper);
    const submenuItems = qsa(SELECTORS.submenuItem);
    state.pages = qsa(SELECTORS.page);

    // 方案 A：用 ?page=<id> 作为页面深链接（兼容 GitHub Pages 静态托管）
    const normalizeText = (value: unknown): string =>
      String(value === null || value === undefined ? '' : value).trim();

    // 侧边栏子菜单面板：将“当前页面的分类列表”放到独立区域滚动，避免挤压“页面列表”
    const submenuPanel = qs(SELECTORS.submenuPanel);
    const submenuByPageId = new Map<string, SubmenuEntry>();
    let submenuPanelPageId = '';

    navItemWrappers.forEach((wrapper: HTMLElement) => {
      const nav = wrapper.querySelector('.nav-item') as HTMLElement | null;
      const pageId = nav ? normalizeText(nav.getAttribute('data-page')) : '';
      const submenu = wrapper.querySelector('.submenu') as HTMLElement | null;
      if (!pageId || !submenu) return;
      submenuByPageId.set(pageId, { wrapper, submenu });
    });

    const isSidebarCollapsed = () => Boolean(sidebar && sidebar.classList.contains('collapsed'));

    const clearSubmenuPanel = () => {
      if (!submenuPanel) return;

      const pageId = normalizeText(submenuPanelPageId);
      if (pageId) {
        const entry = submenuByPageId.get(pageId);
        if (entry && entry.wrapper && entry.submenu) {
          entry.wrapper.appendChild(entry.submenu);
        }
      }

      submenuPanel.textContent = '';
      submenuPanelPageId = '';
    };

    const renderSubmenuPanelForPage = (pageId: unknown): void => {
      if (!submenuPanel) return;

      const id = normalizeText(pageId);
      if (!id) {
        clearSubmenuPanel();
        return;
      }

      // 折叠态：子菜单使用 hover 弹出，不使用面板
      if (isSidebarCollapsed()) {
        clearSubmenuPanel();
        return;
      }

      const entry = submenuByPageId.get(id);
      if (!entry || !entry.wrapper || !entry.submenu) {
        clearSubmenuPanel();
        return;
      }

      // 仅当 wrapper 处于 expanded 时展示（与 UI 行为保持一致）
      if (!entry.wrapper.classList.contains('expanded')) {
        clearSubmenuPanel();
        return;
      }

      if (normalizeText(submenuPanelPageId) === id && submenuPanel.contains(entry.submenu)) {
        return;
      }

      clearSubmenuPanel();
      submenuPanel.appendChild(entry.submenu);
      submenuPanelPageId = id;
    };

    // 监听侧边栏折叠状态变化：折叠时归还子菜单；展开时渲染当前页子菜单
    if (sidebar && typeof MutationObserver === 'function') {
      const observer = new MutationObserver(() => {
        const activeNav = qs(SELECTORS.navItemActive);
        const activePageId = activeNav ? normalizeText(activeNav.getAttribute('data-page')) : '';
        renderSubmenuPanelForPage(activePageId);
      });

      observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }

    const isValidPageId = (pageId: unknown): boolean => {
      const id = normalizeText(pageId);
      if (!id) return false;
      const el = byId(id);
      return Boolean(el && el.classList && el.classList.contains('page'));
    };

    const getRawPageIdFromUrl = () => {
      try {
        const url = new URL(window.location.href);
        return normalizeText(url.searchParams.get('page'));
      } catch (error) {
        return '';
      }
    };

    const getPageIdFromUrl = () => {
      try {
        const url = new URL(window.location.href);
        const pageId = normalizeText(url.searchParams.get('page'));
        return isValidPageId(pageId) ? pageId : '';
      } catch (error) {
        return '';
      }
    };

    const setUrlState = (next: UrlStatePatch, options: UrlStateOptions = {}): void => {
      const { replace = true } = options;
      try {
        const url = new URL(window.location.href);

        if (next && typeof next.pageId === 'string') {
          const pageId = normalizeText(next.pageId);
          if (pageId) {
            url.searchParams.set('page', pageId);
          } else {
            url.searchParams.delete('page');
          }
        }

        if (next && Object.prototype.hasOwnProperty.call(next, 'hash')) {
          const hash = normalizeText(next.hash);
          url.hash = hash ? `#${hash}` : '';
        }

        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        const fn = replace ? history.replaceState : history.pushState;
        fn.call(history, null, '', nextUrl);
      } catch (error) {
        // 忽略 URL/History API 异常，避免影响主流程
      }
    };

    const setActiveNavByPageId = (pageId: unknown): void => {
      const id = normalizeText(pageId);
      let activeItem: HTMLElement | null = null;

      navItems.forEach((nav: HTMLElement) => {
        const isActive = nav.getAttribute('data-page') === id;
        nav.classList.toggle('active', isActive);
        if (isActive) activeItem = nav;
      });

      // 同步子菜单展开状态：只展开当前激活项
      navItemWrappers.forEach((wrapper: HTMLElement) => {
        const nav = wrapper.querySelector('.nav-item');
        if (!nav) return;
        const pageId = normalizeText(nav.getAttribute('data-page'));
        const hasSubmenu = pageId ? submenuByPageId.has(pageId) : false;
        const shouldExpand = hasSubmenu && nav === activeItem;
        wrapper.classList.toggle('expanded', shouldExpand);
      });

      renderSubmenuPanelForPage(id);
    };

    const escapeSelector = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const text = String(value);
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(text);
      // 回退：尽量避免打断选择器（不追求完全覆盖所有边界字符）
      return text.replace(/[^a-zA-Z0-9_\u00A0-\uFFFF-]/g, '\\$&');
    };

    const escapeAttrValue = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      return String(value).replace(/\\/g, '\\\\').replace(/\"/g, '\\"');
    };

    const getHashFromUrl = () => {
      const rawHash = window.location.hash ? String(window.location.hash).slice(1) : '';
      if (!rawHash) return '';
      try {
        return decodeURIComponent(rawHash).trim();
      } catch (error) {
        return rawHash.trim();
      }
    };

    const scrollToCategoryInPage = (pageId: unknown, options: ScrollCategoryOptions = {}): boolean => {
      const id = normalizeText(pageId);
      if (!id) return false;

      const targetPage = byId(id);
      if (!targetPage) return false;

      const categoryId = normalizeText(options.categoryId);
      const categoryName = normalizeText(options.categoryName);

      let targetCategory: HTMLElement | null = null;

      // 优先使用 slug/data-id 精准定位（解决重复命名始终命中第一个的问题）
      if (categoryId) {
        const escapedId = escapeSelector(categoryId);
        targetCategory =
          targetPage.querySelector(`#${escapedId}`) ||
          targetPage.querySelector(
            `[data-type="category"][data-id="${escapeAttrValue(categoryId)}"]`
          );
      }

      // 回退：旧逻辑按文本包含匹配（兼容旧页面/旧数据）
      if (!targetCategory && categoryName) {
        targetCategory =
          Array.from(qsa(SELECTORS.categoryHeading, targetPage)).find((heading: HTMLElement) =>
            heading.textContent.trim().includes(categoryName)
          ) || null;
      }

      if (!targetCategory) return false;

      // 优化的滚动实现：滚动到使目标分类位于视口 1/4 处（更靠近顶部位置）
      try {
        // 直接获取所需元素和属性，减少重复查询
        const contentElement = qs(SELECTORS.content);

        if (contentElement && contentElement.scrollHeight > contentElement.clientHeight) {
          // 获取目标元素相对于内容区域的位置
          const rect = targetCategory.getBoundingClientRect();
          const containerRect = contentElement.getBoundingClientRect();

          // 计算目标应该在视口中的位置（视口高度的 1/4 处）
          const desiredPosition = containerRect.height / 4;

          // 计算需要滚动的位置
          const scrollPosition =
            contentElement.scrollTop + rect.top - containerRect.top - desiredPosition;

          // 执行滚动
          contentElement.scrollTo({
            top: scrollPosition,
            behavior: 'smooth',
          });
        } else {
          // 回退到基本滚动方式
          targetCategory.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (error) {
        console.error('Error during scroll:', error);
        // 回退到基本滚动方式
        targetCategory.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      return true;
    };

    // 初始化主题
    ui.initTheme();

    // 初始化侧边栏状态
    ui.initSidebarState();

    // 初始化搜索引擎选择
    search.initSearchEngine();

    // 初始化 MeNav 对象版本信息
    try {
      const config: MenavConfig | null = window.MeNav?.getConfig?.() || null;
      const version = config && config.version ? String(config.version) : '';
      if (version && window.MeNav) {
        window.MeNav.version = version;
        console.log('MeNav API initialized with version:', version);
      }
    } catch (error) {
      console.error('Error initializing MeNav API:', error);
    }

    // 立即执行初始化，不再使用 requestAnimationFrame 延迟
    // 支持 ?page=<id> 直接打开对应页面；无效时回退到首页
    const rawPageIdFromUrl = getRawPageIdFromUrl();
    const validatedPageIdFromUrl = getPageIdFromUrl();
    const initialPageId =
      validatedPageIdFromUrl || (isValidPageId(state.homePageId) ? state.homePageId : 'home');

    setActiveNavByPageId(initialPageId);
    showPage(initialPageId);

    // 当输入了不存在的 page id 时，自动纠正 URL，避免“内容回退但地址栏仍错误”
    if (rawPageIdFromUrl && !validatedPageIdFromUrl) {
      setUrlState({ pageId: initialPageId }, { replace: true });
    }

    // 初始深链接：支持 ?page=<id>#<categorySlug>
    const initialHash = getHashFromUrl();
    if (initialHash) {
      setTimeout(() => {
        const found = scrollToCategoryInPage(initialPageId, {
          categoryId: initialHash,
          categoryName: initialHash,
        });

        // hash 存在但未命中时，不做强制修正，避免误伤其他用途的 hash
        if (!found) return;
      }, 50);
    }

    // 添加载入动画
    categories.forEach((category: HTMLElement, index: number) => {
      setTimeout(() => {
        category.style.opacity = '1';
      }, index * 100);
    });

    // 导航项点击效果
    navItems.forEach((item: HTMLElement) => {
      item.addEventListener('click', (e: MouseEvent) => {
        if (item.getAttribute('target') === '_blank') return;

        e.preventDefault();

        // 获取当前项的父级 wrapper
        const wrapper = item.closest('.nav-item-wrapper');
        const pageId = normalizeText(item.getAttribute('data-page'));
        const hasSubmenu = Boolean(wrapper && pageId && submenuByPageId.has(pageId));

        if (!pageId) return;

        // 处理子菜单展开/折叠
        if (hasSubmenu && item.classList.contains('active')) {
          // 当前页：保持子菜单展开状态，不做任何操作
          return;
        } else {
          // 切换页面：统一由 setActiveNavByPageId 管理 active/expanded
          setActiveNavByPageId(pageId);
        }

        const prevPageId = state.currentPageId;
        showPage(pageId);

        // 切换页面时同步 URL（清空旧 hash，避免跨页残留）
        if (normalizeText(prevPageId) !== normalizeText(pageId)) {
          setUrlState({ pageId, hash: '' }, { replace: true });
        }

        // 在移动端视图下点击导航项后自动收起侧边栏
        if (ui.isMobile() && state.isSidebarOpen && !hasSubmenu) {
          ui.closeAllPanels();
        }
      });
    });

    // 子菜单项点击效果
    submenuItems.forEach((item: HTMLElement) => {
      item.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault();

        // 获取页面 ID 和分类名称
        const pageId = item.getAttribute('data-page');
        const categoryName = item.getAttribute('data-category');
        const categoryId = item.getAttribute('data-category-id');

        if (pageId) {
          // 清除所有子菜单项的激活状态
          submenuItems.forEach((subItem: HTMLElement) => {
            subItem.classList.remove('active');
          });

          // 激活当前子菜单项
          item.classList.add('active');

          // 激活导航项并同步子菜单展开状态
          setActiveNavByPageId(pageId);

          // 显示对应页面
          showPage(pageId);
          // 先同步 page 参数并清空旧 hash，避免跨页残留；后续若找到分类再写入新的 hash
          setUrlState({ pageId, hash: '' }, { replace: true });

          // 等待页面切换完成后滚动到对应分类
          setTimeout(() => {
            const found = scrollToCategoryInPage(pageId, { categoryId, categoryName });
            if (!found) return;

            // 由于对子菜单 click 做了 preventDefault，这里手动同步 hash（不触发浏览器默认跳转）
            const nextHash = normalizeText(categoryId) || normalizeText(categoryName);
            if (nextHash) {
              setUrlState({ pageId, hash: nextHash }, { replace: true });
            }
          }, 25); // 延迟时间

          // 在移动端视图下点击子菜单项后自动收起侧边栏
          if (ui.isMobile() && state.isSidebarOpen) {
            ui.closeAllPanels();
          }
        }
      });
    });

    // 初始化嵌套分类功能
    nested.initializeNestedCategories();

    // 初始化分类切换按钮
    const categoryToggleBtn = byId(SELECTORS.categoryToggle);
    if (categoryToggleBtn) {
      categoryToggleBtn.addEventListener('click', function () {
        window.MeNav?.toggleCategories?.();
      });
    } else {
      console.error('Category toggle button not found');
    }

    // 初始化搜索索引（使用 requestIdleCallback 或 setTimeout 延迟初始化，避免影响页面加载）
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => search.initSearchIndex());
    } else {
      setTimeout(search.initSearchIndex, 1000);
    }
  });

  return { showPage };
};
