import type { PageRegistryItem } from '../../types/page';
import type {
  MenavConfig,
  RuntimeDom,
  RuntimeRouterApi,
  RuntimeRoutingApi,
  RuntimeState,
} from '../types';

const nested = require('./nested.ts') as {
  initializeNestedCategories: () => void;
  toggleCategories: () => void;
};
const { getRuntimeConfig } = require('../runtime-config.ts') as typeof import('../runtime-config');
const { buildRoutePath, parseRouteFromHref } =
  require('./router-url.ts') as typeof import('./router-url');
const { SELECTORS, byId, qs, qsa } =
  require('../dom/selectors.ts') as typeof import('../dom/selectors');

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

  // 初始化：app/index.ts 已在 DOMContentLoaded 调用 initRouting，DOM 已就绪；
  // 不再等待 window.load（避免依赖 FontAwesome CDN 等外链资源，导致深链/导航交互延迟）；
  // 依赖布局测量的滚动已在滚动逻辑内用 setTimeout 延迟
  {
    // 获取可能在 HTML 生成后才存在的 DOM 元素
    const categories = qsa(SELECTORS.category);
    const navItems = qsa(SELECTORS.navItem);
    const navItemWrappers = qsa(SELECTORS.navItemWrapper);
    const submenuItems = qsa(SELECTORS.submenuItem);
    state.pages = qsa(SELECTORS.page);

    // 方案 A：用 ?page=<id> 作为页面深链接（兼容 GitHub Pages 静态托管）
    const normalizeText = (value: unknown): string =>
      String(value === null || value === undefined ? '' : value).trim();

    const pageRegistry: PageRegistryItem[] = (() => {
      try {
        const config: MenavConfig | null = getRuntimeConfig();
        const registry =
          config && config.data && Array.isArray(config.data.pageRegistry)
            ? config.data.pageRegistry
            : [];
        return registry
          .map((entry): PageRegistryItem | null => {
            if (!entry || typeof entry !== 'object') return null;
            const id = normalizeText(entry.id);
            if (!id) return null;
            return {
              id,
              name: normalizeText(entry.name) || id,
              template: normalizeText(entry.template) || 'page',
              active: Boolean(entry.active),
            };
          })
          .filter((entry): entry is PageRegistryItem => Boolean(entry));
      } catch (error) {
        return [];
      }
    })();
    const pageRegistryIds = new Set(pageRegistry.map((entry) => entry.id));

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

    const updateSubmenuScrollState = (list: HTMLElement): void => {
      const maxScroll = list.scrollHeight - list.clientHeight;
      list.classList.toggle('is-scroll-at-end', list.scrollTop >= maxScroll - 1);

      if (!submenuPanel) return;

      const trackHeight = list.clientHeight;
      if (maxScroll <= 0 || trackHeight <= 0) {
        submenuPanel.style.setProperty('--submenu-thumb-height', '0px');
        return;
      }

      const thumbHeight = Math.min(
        trackHeight,
        Math.max(24, (trackHeight * trackHeight) / list.scrollHeight)
      );
      const thumbTop = (list.scrollTop / maxScroll) * (trackHeight - thumbHeight);
      // 指示条从标题下方开始，偏移量相对面板顶边
      const listOffsetTop =
        list.getBoundingClientRect().top - submenuPanel.getBoundingClientRect().top;

      submenuPanel.style.setProperty('--submenu-thumb-height', `${thumbHeight}px`);
      submenuPanel.style.setProperty('--submenu-thumb-top', `${listOffsetTop + thumbTop}px`);
    };

    if (submenuPanel) {
      // scroll 不冒泡，用捕获阶段统一处理面板内列表的滚动状态
      submenuPanel.addEventListener(
        'scroll',
        (event) => {
          const target = event.target;
          if (target instanceof HTMLElement && target.classList.contains('submenu')) {
            updateSubmenuScrollState(target);
          }
        },
        { passive: true, capture: true }
      );

      window.addEventListener('resize', () => {
        const list = submenuPanel.querySelector('.submenu');
        if (list instanceof HTMLElement) updateSubmenuScrollState(list);
      });
    }

    const clearSubmenuPanel = () => {
      if (!submenuPanel) return;

      const pageId = normalizeText(submenuPanelPageId);
      if (pageId) {
        const entry = submenuByPageId.get(pageId);
        if (entry && entry.wrapper && entry.submenu) {
          // 标题先放回 submenu，否则会被下面的清空操作一并移除
          const header = submenuPanel.querySelector(':scope > .submenu-header');
          if (header) entry.submenu.insertBefore(header, entry.submenu.firstChild);
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

      // 标题留在滚动区外，滚动条只覆盖分类列表
      const header = entry.submenu.querySelector('.submenu-header');
      if (header) submenuPanel.insertBefore(header, entry.submenu);

      submenuPanelPageId = id;
      updateSubmenuScrollState(entry.submenu);
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
      if (pageRegistryIds.size > 0 && !pageRegistryIds.has(id)) return false;
      const el = byId(id);
      return Boolean(el && el.classList && el.classList.contains('page'));
    };

    const getRouteFromLocation = () =>
      parseRouteFromHref(window.location.href, {
        pageRegistry,
        homePageId: state.homePageId,
        fallbackPageId: 'home',
      });

    const setUrlState = (next: UrlStatePatch, options: UrlStateOptions = {}): void => {
      const { replace = true } = options;
      try {
        const nextUrl = buildRoutePath(window.location.href, next);
        const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (nextUrl === currentUrl) return;
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

    const scrollToCategoryInPage = (
      pageId: unknown,
      options: ScrollCategoryOptions = {}
    ): boolean => {
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

    const applyRouteFromLocation = (options: { replaceInvalid?: boolean } = {}): void => {
      const route = getRouteFromLocation();
      const pageId = isValidPageId(route.pageId)
        ? route.pageId
        : isValidPageId(state.homePageId)
          ? state.homePageId
          : 'home';

      setActiveNavByPageId(pageId);
      showPage(pageId);

      // 缺少 page 参数或输入不存在的 page id 时，统一规范化为推荐 URL：/?page=<id>
      if (options.replaceInvalid && (!route.rawPageId || route.shouldReplaceUrl)) {
        setUrlState({ pageId, hash: route.hash || null }, { replace: true });
      }

      // 深链接：支持 ?page=<id>#<categorySlug>
      if (route.hash) {
        setTimeout(async () => {
          // 初始化已提前到 DOMContentLoaded，字体（含 FontAwesome @font-face）可能未就绪，
          // 等待字体加载完成后再测量滚动位置，避免布局测量偏差
          try {
            await document.fonts.ready;
          } catch (error) {
            // 忽略字体等待失败，继续滚动
          }
          const found = scrollToCategoryInPage(pageId, {
            categoryId: route.hash,
            categoryName: route.hash,
          });

          // hash 存在但未命中时，不做强制修正，避免误伤其他用途的 hash
          if (!found) return;
        }, 50);
      }
    };

    // 立即执行初始化，不再使用 requestAnimationFrame 延迟
    applyRouteFromLocation({ replaceInvalid: true });

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
          setUrlState({ pageId, hash: '' }, { replace: false });
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

          const wasSamePage = normalizeText(state.currentPageId) === normalizeText(pageId);
          // 提前计算目标 hash（写入仍以 scroll 命中为前提，此处仅用于同页重复点击的短路判断）
          const nextHash = normalizeText(categoryId) || normalizeText(categoryName);
          // 同页重复点击同一子菜单：当前 URL 已指向 (pageId, nextHash)。
          // 用与 setUrlState 内部一致的判据（buildRoutePath 结果 === 当前 URL 含 hash）识别并短路，
          // 避免"先清空 hash 再重写 hash"重复 push 完全相同的 ?page=X#cat 条目（Back 需按 N 次）。
          const isRepeatedSameTarget =
            wasSamePage &&
            Boolean(nextHash) &&
            buildRoutePath(window.location.href, { pageId, hash: nextHash }) ===
              `${window.location.pathname}${window.location.search}${window.location.hash}`;

          // 显示对应页面
          showPage(pageId);
          // 先同步 page 参数并清空旧 hash，避免跨页残留；后续若找到分类再写入新的 hash。
          // 同页时 replace 当前条目避免产生"同页无 hash"的冗余历史；跨页时 pushState 进入新页。
          if (!isRepeatedSameTarget) {
            setUrlState({ pageId, hash: '' }, { replace: wasSamePage });
          }

          // 等待页面切换完成后滚动到对应分类
          setTimeout(() => {
            const found = scrollToCategoryInPage(pageId, { categoryId, categoryName });
            if (!found) return;

            // 由于对子菜单 click 做了 preventDefault，这里手动同步 hash（不触发浏览器默认跳转）
            if (nextHash && !isRepeatedSameTarget) {
              setUrlState({ pageId, hash: nextHash }, { replace: !wasSamePage });
            }
          }, 25); // 延迟时间

          // 在移动端视图下点击子菜单项后自动收起侧边栏
          if (ui.isMobile() && state.isSidebarOpen) {
            ui.closeAllPanels();
          }
        }
      });
    });

    window.addEventListener('popstate', () => {
      applyRouteFromLocation();
    });

    // 初始化嵌套分类功能
    nested.initializeNestedCategories();

    // 初始化分类切换按钮
    const categoryToggleBtn = byId(SELECTORS.categoryToggle);
    if (categoryToggleBtn) {
      categoryToggleBtn.addEventListener('click', function () {
        nested.toggleCategories();
      });
    } else {
      console.error('Category toggle button not found');
    }
  }

  return { showPage };
};
