module.exports = function initUi(state, dom) {
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

  const SUBMENU_PANEL_VISIBLE_CLASS = 'submenu-panel-visible';
  const SIDEBAR_LAYOUT_TRANSITION_MS = 300;
  let submenuPanelRevealTimer = null;

  // 移除预加载类，允许 CSS 过渡效果
  document.documentElement.classList.remove('preload');

  let systemThemeMql = null;
  let systemThemeListener = null;

  function setTheme(isLight) {
    const nextIsLight = Boolean(isLight);
    state.isLightTheme = nextIsLight;
    document.body.classList.toggle('light-theme', nextIsLight);

    if (nextIsLight) {
      themeIcon.classList.remove('fa-moon');
      themeIcon.classList.add('fa-sun');
    } else {
      themeIcon.classList.remove('fa-sun');
      themeIcon.classList.add('fa-moon');
    }
  }

  function stopSystemThemeFollow() {
    if (systemThemeMql && systemThemeListener) {
      if (typeof systemThemeMql.removeEventListener === 'function') {
        systemThemeMql.removeEventListener('change', systemThemeListener);
      } else if (typeof systemThemeMql.removeListener === 'function') {
        systemThemeMql.removeListener(systemThemeListener);
      }
    }
    systemThemeMql = null;
    systemThemeListener = null;
  }

  function startSystemThemeFollow() {
    stopSystemThemeFollow();

    try {
      systemThemeMql = window.matchMedia('(prefers-color-scheme: light)');
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
    } else if (typeof systemThemeMql.addListener === 'function') {
      systemThemeMql.addListener(systemThemeListener);
    }
  }

  function getThemeMode() {
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
    sidebar.classList.add('collapsed');
    content.classList.add('expanded');
    state.isSidebarCollapsed = true;
  }

  // 即时移除 loading 类，确保侧边栏可见
  document.body.classList.remove('loading');
  document.body.classList.add('loaded');

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function clearSubmenuPanelRevealTimer() {
    if (submenuPanelRevealTimer) {
      window.clearTimeout(submenuPanelRevealTimer);
      submenuPanelRevealTimer = null;
    }
  }

  function hideSubmenuPanelImmediately() {
    clearSubmenuPanelRevealTimer();
    sidebar.classList.remove(SUBMENU_PANEL_VISIBLE_CLASS);
  }

  function showSubmenuPanelImmediately() {
    clearSubmenuPanelRevealTimer();
    sidebar.classList.add(SUBMENU_PANEL_VISIBLE_CLASS);
  }

  function revealSubmenuPanelAfterSidebarTransition() {
    clearSubmenuPanelRevealTimer();
    submenuPanelRevealTimer = window.setTimeout(() => {
      if (!state.isSidebarCollapsed && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add(SUBMENU_PANEL_VISIBLE_CLASS);
      }
    }, SIDEBAR_LAYOUT_TRANSITION_MS);
  }

  // 侧边栏折叠功能
  function toggleSidebarCollapse() {
    // 仅在交互时启用布局相关动画，避免首屏闪烁
    document.documentElement.classList.add('with-anim');

    state.isSidebarCollapsed = !state.isSidebarCollapsed;

    if (state.isSidebarCollapsed) {
      // 收起时立即隐藏目录面板，避免在动画过程中残留。
      hideSubmenuPanelImmediately();
    }

    // 使用 requestAnimationFrame 确保平滑过渡
    requestAnimationFrame(() => {
      sidebar.classList.toggle('collapsed', state.isSidebarCollapsed);
      content.classList.toggle('expanded', state.isSidebarCollapsed);

      // 保存折叠状态到 localStorage
      localStorage.setItem('sidebarCollapsed', state.isSidebarCollapsed ? 'true' : 'false');

      if (!state.isSidebarCollapsed) {
        // 展开后再淡入目录面板，避免和宽度动画抢节奏。
        revealSubmenuPanelAfterSidebarTransition();
      }
    });
  }

  // 初始化侧边栏折叠状态 - 已在页面加载前处理，此处仅完成图标状态初始化等次要任务
  function initSidebarState() {
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
  function toggleTheme() {
    setTheme(!state.isLightTheme);

    // 用户手动切换后：写入 localStorage，并停止 system 跟随
    localStorage.setItem('theme', state.isLightTheme ? 'light' : 'dark');
    stopSystemThemeFollow();
  }

  // 初始化主题 - 已在页面加载前处理，此处仅完成图标状态初始化等次要任务
  function initTheme() {
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
  function toggleSidebar() {
    state.isSidebarOpen = !state.isSidebarOpen;
    sidebar.classList.toggle('active', state.isSidebarOpen);
    overlay.classList.toggle('active', state.isSidebarOpen);
  }

  // 移动端：搜索框常驻显示（CSS 控制），无需“搜索面板”开关；点击仅聚焦输入框
  function toggleSearch() {
    searchInput && searchInput.focus();
  }

  // 关闭所有移动端面板
  function closeAllPanels() {
    if (state.isSidebarOpen) {
      toggleSidebar();
    }
  }

  // 侧边栏折叠按钮点击事件
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebarCollapse);
  }

  // 主题切换按钮点击事件
  themeToggle.addEventListener('click', toggleTheme);

  // 移动端事件监听
  menuToggle.addEventListener('click', toggleSidebar);
  searchToggle.addEventListener('click', toggleSearch);
  overlay.addEventListener('click', closeAllPanels);

  // 全局快捷键：Ctrl/Cmd + K 聚焦搜索
  document.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    if (key !== 'k') return;
    if ((!e.ctrlKey && !e.metaKey) || e.altKey) return;

    const target = e.target;
    const isTypingTarget =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if (isTypingTarget && target !== searchInput) return;

    e.preventDefault();

    searchInput && searchInput.focus();
  });

  // 窗口大小改变时处理
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      sidebar.classList.remove('active');
      searchContainer.classList.remove('active');
      overlay.classList.remove('active');
      state.isSidebarOpen = false;
      if (state.isSidebarCollapsed) {
        hideSubmenuPanelImmediately();
      } else {
        showSubmenuPanelImmediately();
      }
    } else {
      // 在移动设备下，重置侧边栏折叠状态
      sidebar.classList.remove('collapsed');
      content.classList.remove('expanded');
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
