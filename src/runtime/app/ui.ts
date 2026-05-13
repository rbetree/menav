import type { RuntimeDom, RuntimeState, RuntimeUiApi } from '../types';

module.exports = function initUi(state: RuntimeState, dom: RuntimeDom): RuntimeUiApi {
  const {
    searchInput,
    searchBox,
    menuToggle,
    searchToggle,
    sidebar,
    searchContainer,
    overlay,
    sidebarToggle,
    content,
    themeToggle,
    themeIcon,
  } = dom;

  if (
    !searchInput ||
    !menuToggle ||
    !searchToggle ||
    !sidebar ||
    !searchContainer ||
    !overlay ||
    !content ||
    !themeToggle ||
    !themeIcon
  ) {
    return {
      isMobile: () => window.innerWidth <= 768,
      closeAllPanels: () => {},
      initTheme: () => {},
      initSidebarState: () => {},
    };
  }

  const searchInputElement = searchInput;
  const menuToggleElement = menuToggle;
  const searchToggleElement = searchToggle;
  const sidebarElement = sidebar;
  const searchContainerElement = searchContainer;
  const overlayElement = overlay;
  const contentElement = content;
  const themeToggleElement = themeToggle;
  const themeIconElement = themeIcon;

  const SUBMENU_PANEL_VISIBLE_CLASS = 'submenu-panel-visible';
  const SIDEBAR_LAYOUT_TRANSITION_MS = 300;
  let submenuPanelRevealTimer: number | null = null;

  // 移除预加载类，允许 CSS 过渡效果
  document.documentElement.classList.remove('preload');

  type LegacyMediaQueryList = Omit<MediaQueryList, 'addListener' | 'removeListener'> & {
    addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  };

  let systemThemeMql: LegacyMediaQueryList | null = null;
  let systemThemeListener: ((event: MediaQueryListEvent) => void) | null = null;

  function setTheme(isLight: boolean): void {
    const nextIsLight = Boolean(isLight);
    state.isLightTheme = nextIsLight;
    document.documentElement.classList.toggle('light-theme', nextIsLight);

    if (nextIsLight) {
      themeIconElement.classList.remove('fa-moon');
      themeIconElement.classList.add('fa-sun');
    } else {
      themeIconElement.classList.remove('fa-sun');
      themeIconElement.classList.add('fa-moon');
    }
  }

  function stopSystemThemeFollow(): void {
    if (systemThemeMql && systemThemeListener) {
      if (typeof systemThemeMql.removeEventListener === 'function') {
        systemThemeMql.removeEventListener('change', systemThemeListener);
      } else {
        systemThemeMql.removeListener?.(systemThemeListener);
      }
    }
    systemThemeMql = null;
    systemThemeListener = null;
  }

  function startSystemThemeFollow(): void {
    stopSystemThemeFollow();

    try {
      systemThemeMql = window.matchMedia('(prefers-color-scheme: light)') as LegacyMediaQueryList;
    } catch (e) {
      systemThemeMql = null;
    }
    if (!systemThemeMql) return;

    systemThemeListener = (event) => {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'light' || savedTheme === 'dark') {
        stopSystemThemeFollow();
        return;
      }
      setTheme(Boolean(event && event.matches));
    };

    if (typeof systemThemeMql.addEventListener === 'function') {
      systemThemeMql.addEventListener('change', systemThemeListener);
    } else {
      systemThemeMql.addListener?.(systemThemeListener);
    }
  }

  function getThemeMode(): string {
    const raw = document.documentElement.getAttribute('data-theme-mode');
    return raw ? String(raw).trim().toLowerCase() : 'dark';
  }

  // 应用预加载阶段确定的主题（localStorage / site.theme.mode）
  if (document.documentElement.classList.contains('theme-preload')) {
    document.documentElement.classList.remove('theme-preload');
    setTheme(true);
  } else {
    setTheme(false);
  }

  // 应用从 localStorage 读取的侧边栏状态（预加载阶段已写入 class）
  if (document.documentElement.classList.contains('sidebar-collapsed-preload')) {
    document.documentElement.classList.remove('sidebar-collapsed-preload');
    sidebarElement.classList.add('collapsed');
    contentElement.classList.add('expanded');
    state.isSidebarCollapsed = true;
  }

  // 即时移除 loading 类，确保侧边栏可见
  document.body.classList.remove('loading');
  document.body.classList.add('loaded');

  function isMobile(): boolean {
    return window.innerWidth <= 768;
  }

  function clearSubmenuPanelRevealTimer(): void {
    if (submenuPanelRevealTimer) {
      window.clearTimeout(submenuPanelRevealTimer);
      submenuPanelRevealTimer = null;
    }
  }

  function hideSubmenuPanelImmediately(): void {
    clearSubmenuPanelRevealTimer();
    sidebarElement.classList.remove(SUBMENU_PANEL_VISIBLE_CLASS);
  }

  function showSubmenuPanelImmediately(): void {
    clearSubmenuPanelRevealTimer();
    sidebarElement.classList.add(SUBMENU_PANEL_VISIBLE_CLASS);
  }

  function revealSubmenuPanelAfterSidebarTransition(): void {
    clearSubmenuPanelRevealTimer();
    submenuPanelRevealTimer = window.setTimeout(() => {
      if (!state.isSidebarCollapsed && !sidebarElement.classList.contains('collapsed')) {
        sidebarElement.classList.add(SUBMENU_PANEL_VISIBLE_CLASS);
      }
    }, SIDEBAR_LAYOUT_TRANSITION_MS);
  }

  // 侧边栏折叠功能
  function toggleSidebarCollapse(): void {
    // 仅在交互时启用布局相关动画，避免首屏闪烁
    document.documentElement.classList.add('with-anim');

    state.isSidebarCollapsed = !state.isSidebarCollapsed;

    if (state.isSidebarCollapsed) {
      // 收起时立即隐藏目录面板，避免在动画过程中残留。
      hideSubmenuPanelImmediately();
    }

    // 使用 requestAnimationFrame 确保平滑过渡
    requestAnimationFrame(() => {
      sidebarElement.classList.toggle('collapsed', state.isSidebarCollapsed);
      contentElement.classList.toggle('expanded', state.isSidebarCollapsed);

      // 保存折叠状态到 localStorage
      localStorage.setItem('sidebarCollapsed', state.isSidebarCollapsed ? 'true' : 'false');

      if (!state.isSidebarCollapsed) {
        // 展开后再淡入目录面板，避免和宽度动画抢节奏。
        revealSubmenuPanelAfterSidebarTransition();
      }
    });
  }

  // 初始化侧边栏折叠状态 - 已在页面加载前处理，此处仅完成图标状态初始化等次要任务
  function initSidebarState(): void {
    // 从 localStorage 获取侧边栏状态
    const savedState = localStorage.getItem('sidebarCollapsed');

    // 图标状态与折叠状态保持一致
    if (savedState === 'true' && !isMobile()) {
      state.isSidebarCollapsed = true;
      hideSubmenuPanelImmediately();
    } else {
      state.isSidebarCollapsed = false;
      showSubmenuPanelImmediately();
    }
  }

  // 主题切换功能
  function toggleTheme(): void {
    setTheme(!state.isLightTheme);

    // 用户手动切换后：写入 localStorage，并停止 system 跟随
    localStorage.setItem('theme', state.isLightTheme ? 'light' : 'dark');
    stopSystemThemeFollow();
  }

  // 初始化主题 - 已在页面加载前处理，此处仅完成图标状态初始化等次要任务
  function initTheme(): void {
    // 从 localStorage 获取主题偏好
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      stopSystemThemeFollow();
      setTheme(true);
      return;
    }
    if (savedTheme === 'dark') {
      stopSystemThemeFollow();
      setTheme(false);
      return;
    }

    // 未写入 localStorage：按 site.theme.mode 决定默认值
    const mode = getThemeMode();

    if (mode === 'light') {
      stopSystemThemeFollow();
      setTheme(true);
      return;
    }

    if (mode === 'system') {
      let shouldUseLight = false;
      try {
        shouldUseLight =
          window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      } catch (e) {
        shouldUseLight = false;
      }
      setTheme(shouldUseLight);
      startSystemThemeFollow();
      return;
    }

    // 默认 dark
    stopSystemThemeFollow();
    setTheme(false);
  }

  // 移动端菜单切换
  function toggleSidebar(): void {
    state.isSidebarOpen = !state.isSidebarOpen;
    sidebarElement.classList.toggle('active', state.isSidebarOpen);
    overlayElement.classList.toggle('active', state.isSidebarOpen);
  }

  // 移动端：搜索框常驻显示（CSS 控制），无需“搜索面板”开关；点击仅聚焦输入框
  function toggleSearch(): void {
    searchInputElement.focus();
  }

  // 关闭所有移动端面板
  function closeAllPanels(): void {
    if (state.isSidebarOpen) {
      toggleSidebar();
    }
  }

  // 侧边栏折叠按钮点击事件
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebarCollapse);
  }

  // 主题切换按钮点击事件
  themeToggleElement.addEventListener('click', toggleTheme);

  // 移动端事件监听
  menuToggleElement.addEventListener('click', toggleSidebar);
  searchToggleElement.addEventListener('click', toggleSearch);
  overlayElement.addEventListener('click', closeAllPanels);

  // 全局快捷键：Ctrl/Cmd + K 聚焦搜索
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const key = (e.key || '').toLowerCase();
    if (key !== 'k') return;
    if ((!e.ctrlKey && !e.metaKey) || e.altKey) return;

    const target = e.target as HTMLElement | null;
    const isTypingTarget =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if (isTypingTarget && target !== searchInputElement) return;

    e.preventDefault();

    searchInputElement.focus();
  });

  // 窗口大小改变时处理
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      sidebarElement.classList.remove('active');
      searchContainerElement.classList.remove('active');
      overlayElement.classList.remove('active');
      state.isSidebarOpen = false;
      if (state.isSidebarCollapsed) {
        hideSubmenuPanelImmediately();
      } else {
        showSubmenuPanelImmediately();
      }
    } else {
      // 在移动设备下，重置侧边栏折叠状态
      sidebarElement.classList.remove('collapsed');
      contentElement.classList.remove('expanded');
      showSubmenuPanelImmediately();
    }
  });

  // 仅用于静态检查：确保未用变量不被 lint 报错（未来可用于搜索 UI 状态）
  void searchBox;

  return {
    isMobile,
    closeAllPanels,
    initTheme,
    initSidebarState,
  };
};
