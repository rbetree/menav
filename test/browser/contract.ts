const assert = require('node:assert/strict');
const path = require('node:path');

const { chromium } = require('playwright');
const { startServer } = require('../../scripts/serve-dist.ts');
const { createLogger, startTimer } = require('../../src/lib/logging/logger.ts');

const log = createLogger('browser-contract');

async function waitForMenav(page) {
  await page.waitForFunction(() => Boolean(document.getElementById('menav-runtime-config')), null, {
    timeout: 5000,
  });
}

async function openPage(page, baseUrl, pathAndQuery = '/') {
  await page.goto(`${baseUrl}${pathAndQuery}`, { waitUntil: 'domcontentloaded' });
  await waitForMenav(page);
}

function parseRgba(input) {
  const match = String(input).match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i
  );
  if (!match) return null;

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] == null ? 1 : Number(match[4]),
  };
}

async function waitForRouteState(page, expected) {
  await page.waitForFunction(
    ({ pageId, hash }) => {
      const activePageId = document.querySelector('.page.active')?.id || '';
      const activeNavId =
        document.querySelector('.nav-item.active')?.getAttribute('data-page') || '';
      const currentHash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
      const pageMatches = activePageId === pageId && activeNavId === pageId;
      const hashMatches = typeof hash === 'string' ? currentHash === hash : true;

      return pageMatches && hashMatches;
    },
    expected,
    { timeout: 5000 }
  );
}

async function assertNoConsoleErrors(messages) {
  const errors = messages.filter((message) => message.type === 'error');
  assert.deepEqual(errors, [], `浏览器控制台不应输出 error：${JSON.stringify(errors)}`);
}

async function runRouteContract(page, baseUrl) {
  await openPage(page, baseUrl, '/');

  const categoryCardStyle = await page.evaluate(() => {
    const category = document.querySelector('.page.active .category');
    const style = category ? getComputedStyle(category) : null;
    return {
      backgroundImage: style?.backgroundImage || '',
      boxShadow: style?.boxShadow || '',
    };
  });
  assert.match(categoryCardStyle.backgroundImage, /linear-gradient/, '分类大卡片应保留渐变背景');
  assert.notEqual(categoryCardStyle.boxShadow, 'none', '分类大卡片应有阴影与页面背景区分');

  const routeState = await page.evaluate(() => {
    const navItems = Array.from(document.querySelectorAll('.nav-item[data-page]'));
    const pageIds = navItems.map((item) => item.getAttribute('data-page')).filter(Boolean);
    const firstPageId = pageIds[0] || '';
    const getTemplatePage = (pageId) =>
      document
        .querySelector(`template[data-page-template="${CSS.escape(pageId)}"]`)
        ?.content.querySelector('.page') || null;
    // 目标页必须仍在模板中，优先选择带分类折叠的页面用于后续断言
    const templatePageIds = pageIds.filter(
      (id) => id !== firstPageId && !document.getElementById(id) && getTemplatePage(id)
    );
    const targetPageId =
      templatePageIds.find((id) => getTemplatePage(id)?.querySelector('[data-toggle]')) ||
      templatePageIds[0] ||
      '';
    const targetPage = targetPageId ? getTemplatePage(targetPageId) : null;
    const targetSubmenu = targetPageId
      ? document.querySelector(
          `.submenu-item[data-page="${CSS.escape(targetPageId)}"][data-category-id]`
        )
      : null;
    const categoryId = targetSubmenu ? targetSubmenu.getAttribute('data-category-id') : '';

    return {
      pageIds,
      firstPageId,
      targetPageId,
      categoryId,
      targetInTemplate: Boolean(targetPage),
      targetInDocument: Boolean(targetPageId && document.getElementById(targetPageId)),
      templatePageId: targetPage ? targetPage.id : '',
      documentPageIds: [...document.querySelectorAll('.page[id]')].map((page) => page.id),
      searchTerm: targetPage?.querySelector('.site-card')?.getAttribute('data-name') || '',
    };
  });

  assert.ok(routeState.pageIds.length >= 2, '浏览器契约需要至少两个导航页');
  assert.ok(routeState.targetPageId, '浏览器契约需要至少一个模板化导航页');
  assert.equal(routeState.targetInTemplate, true, '初始非活动页应位于 template 中');
  assert.equal(routeState.targetInDocument, false, '初始非活动页不应出现在文档 DOM');
  assert.equal(routeState.templatePageId, routeState.targetPageId);
  assert.ok(
    routeState.documentPageIds.includes(routeState.firstPageId),
    '初始活动页应保持 eager 渲染'
  );
  assert.ok(routeState.documentPageIds.includes('search-results'), '搜索结果页应保持 eager 渲染');
  assert.ok(
    !routeState.documentPageIds.includes(routeState.targetPageId),
    '非活动模板页不应提前实例化'
  );

  const hoverCard = page.locator('.page.active .site-card').first();
  assert.ok((await hoverCard.count()) > 0, '浏览器契约需要至少一张站点卡片');
  await hoverCard.hover();
  await page.waitForTimeout(350);
  const hoverLayout = await hoverCard.evaluate((card) => {
    const inner = card.closest('.collapse-content-inner');
    return {
      cardTop: card.getBoundingClientRect().top,
      innerTop: inner ? inner.getBoundingClientRect().top : null,
      innerOverflow: inner ? getComputedStyle(inner).overflow : '',
    };
  });
  assert.ok(hoverLayout.innerTop !== null, '站点卡片应位于可折叠内容容器内');
  assert.ok(
    hoverLayout.cardTop >= hoverLayout.innerTop,
    '卡片悬停上移后不应被容器裁切：' + JSON.stringify(hoverLayout)
  );

  await page.evaluate((targetPageId) => {
    document.querySelector(`.nav-item[data-page="${CSS.escape(targetPageId)}"]`)?.click();
  }, routeState.targetPageId);
  await waitForRouteState(page, { pageId: routeState.targetPageId });

  const afterClick = await page.evaluate((targetPageId) => {
    const pageIds = [...document.querySelectorAll('.page[id]')].map((page) => page.id);
    const idCounts = new Map();
    document.querySelectorAll('[id]').forEach((node) => {
      idCounts.set(node.id, (idCounts.get(node.id) || 0) + 1);
    });

    return {
      activePageId: document.querySelector('.page.active')?.id || '',
      activeNavId: document.querySelector('.nav-item.active')?.getAttribute('data-page') || '',
      path: `${location.pathname}${location.search}${location.hash}`,
      targetInDocument: Boolean(document.getElementById(targetPageId)),
      targetPageCount: pageIds.filter((id) => id === targetPageId).length,
      duplicateIds: [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
    };
  }, routeState.targetPageId);
  assert.equal(afterClick.activePageId, routeState.targetPageId);
  assert.equal(afterClick.activeNavId, routeState.targetPageId);
  assert.match(afterClick.path, new RegExp(`[?&]page=${routeState.targetPageId}`));
  assert.equal(afterClick.targetInDocument, true, '点击后模板应克隆为真实页面');
  assert.equal(afterClick.targetPageCount, 1, '克隆后不应出现重复页面');
  assert.deepEqual(afterClick.duplicateIds, [], '克隆后文档中不应出现重复 id');

  const nestedState = await page.evaluate(async (targetPageId) => {
    const page = document.getElementById(targetPageId);
    const header = page?.querySelector('[data-toggle="category"], [data-toggle="group"]') || null;
    const container = header?.parentElement || null;
    const button = header?.querySelector('.category-toggle-btn, .group-toggle-btn') || null;
    const content =
      container?.querySelector(':scope > .category-content, :scope > .group-content') || null;
    if (!container || !button || !content) return { available: false };

    const beforeCollapsed = container.classList.contains('collapsed');
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const toggledCollapsed = container.classList.contains('collapsed');
    const ariaExpanded = button.getAttribute('aria-expanded');
    const inert = content.inert;
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      available: true,
      beforeCollapsed,
      toggledCollapsed,
      ariaExpanded,
      inert,
      restored: container.classList.contains('collapsed') === beforeCollapsed,
    };
  }, routeState.targetPageId);
  assert.equal(nestedState.available, true, '克隆页应包含可折叠分类');
  assert.notEqual(nestedState.toggledCollapsed, nestedState.beforeCollapsed);
  assert.equal(nestedState.ariaExpanded, String(!nestedState.toggledCollapsed));
  assert.equal(nestedState.inert, nestedState.toggledCollapsed);
  assert.equal(nestedState.restored, true);

  const batchToggleState = await page.evaluate(async (targetPageId) => {
    const page = document.getElementById(targetPageId);
    const toggle = document.getElementById('category-toggle');
    if (!page || !toggle) return { available: false };

    const containers = () =>
      [...page.querySelectorAll('.category, .group')].filter((element) =>
        Boolean(
          element.querySelector(
            ':scope > .category-header[data-toggle="category"], :scope > .group-header[data-toggle="group"]'
          )
        )
      );
    const total = containers().length;
    if (total === 0) return { available: false };

    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const firstCollapsed = containers().filter((element) =>
      element.classList.contains('collapsed')
    ).length;
    const firstAria = toggle.getAttribute('aria-expanded');
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const secondCollapsed = containers().filter((element) =>
      element.classList.contains('collapsed')
    ).length;

    return { available: true, total, firstCollapsed, firstAria, secondCollapsed };
  }, routeState.targetPageId);
  assert.equal(batchToggleState.available, true, '克隆页应支持批量展开/收起');
  assert.ok(
    batchToggleState.firstCollapsed === 0 ||
      batchToggleState.firstCollapsed === batchToggleState.total,
    '批量开关应统一当前页的折叠状态'
  );
  assert.equal(batchToggleState.firstAria, String(batchToggleState.firstCollapsed === 0));
  assert.ok(
    batchToggleState.secondCollapsed === 0 ||
      batchToggleState.secondCollapsed === batchToggleState.total,
    '再次批量开关应统一反转折叠状态'
  );

  if (routeState.categoryId) {
    await page.evaluate((targetPageId) => {
      document
        .querySelector(`.submenu-item[data-page="${CSS.escape(targetPageId)}"][data-category-id]`)
        ?.click();
    }, routeState.targetPageId);
    await waitForRouteState(page, {
      pageId: routeState.targetPageId,
      hash: routeState.categoryId,
    });

    const afterSubmenu = await page.evaluate(() => ({
      path: `${location.pathname}${location.search}${location.hash}`,
    }));
    assert.ok(
      afterSubmenu.path.includes(`#${encodeURIComponent(routeState.categoryId)}`),
      '分类点击应写入 hash 深链接'
    );
  }

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await waitForRouteState(page, {
    pageId: routeState.categoryId ? routeState.targetPageId : routeState.pageIds[0],
  });
  const afterBack = await page.evaluate(() => ({
    activePageId: document.querySelector('.page.active')?.id || '',
    path: `${location.pathname}${location.search}${location.hash}`,
  }));
  assert.equal(
    afterBack.activePageId,
    routeState.categoryId ? routeState.targetPageId : routeState.pageIds[0]
  );

  await page.goForward({ waitUntil: 'domcontentloaded' });
  await waitForRouteState(page, {
    pageId: routeState.targetPageId,
    hash: routeState.categoryId || undefined,
  });

  // 深链接刷新：目标页仍从模板克隆，且不会产生重复 DOM
  await openPage(page, baseUrl, `/?page=${encodeURIComponent(routeState.targetPageId)}`);
  await waitForRouteState(page, { pageId: routeState.targetPageId });
  const afterDeepLink = await page.evaluate((targetPageId) => {
    const pageIds = [...document.querySelectorAll('.page[id]')].map((page) => page.id);
    return {
      activePageId: document.querySelector('.page.active')?.id || '',
      activeNavId: document.querySelector('.nav-item.active')?.getAttribute('data-page') || '',
      inDocument: Boolean(document.getElementById(targetPageId)),
      pageCount: pageIds.filter((id) => id === targetPageId).length,
    };
  }, routeState.targetPageId);
  assert.equal(afterDeepLink.activePageId, routeState.targetPageId);
  assert.equal(afterDeepLink.activeNavId, routeState.targetPageId);
  assert.equal(afterDeepLink.inDocument, true, '深链接刷新后应克隆目标模板页');
  assert.equal(afterDeepLink.pageCount, 1, '深链接刷新后不应重复克隆');

  // 搜索重置需回到已克隆的模板页，state.pages 缓存失效后仍能正确切换
  await page.evaluate((term) => {
    const search = document.querySelector('#search');
    if (!search) return;
    search.value = term;
    search.dispatchEvent(new Event('input', { bubbles: true }));
  }, routeState.searchTerm || 'a');
  await page.waitForFunction(
    () => Boolean(document.querySelector('#search-results')?.classList.contains('active')),
    null,
    { timeout: 5000 }
  );
  await page.evaluate(() => {
    const search = document.querySelector('#search');
    if (!search) return;
    search.value = '';
    search.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
  });
  await waitForRouteState(page, { pageId: routeState.targetPageId });
  const afterSearchReset = await page.evaluate(
    (targetPageId) => ({
      activePageId: document.querySelector('.page.active')?.id || '',
      activePageCount: document.querySelectorAll('.page.active').length,
      inDocument: Boolean(document.getElementById(targetPageId)),
    }),
    routeState.targetPageId
  );
  assert.equal(afterSearchReset.activePageId, routeState.targetPageId);
  assert.equal(afterSearchReset.activePageCount, 1);
  assert.equal(afterSearchReset.inDocument, true);

  await openPage(page, baseUrl, '/?page=__missing__');
  const normalized = await page.evaluate(() => ({
    activePageId: document.querySelector('.page.active')?.id || '',
    path: `${location.pathname}${location.search}${location.hash}`,
  }));
  assert.equal(normalized.activePageId, routeState.pageIds[0]);
  assert.match(normalized.path, new RegExp(`[?&]page=${routeState.pageIds[0]}`));

  const response404 = await page.request.get(`${baseUrl}/missing-path`);
  assert.equal(response404.status(), 404);
}

async function runRuntimeConfigContract(page, baseUrl) {
  await openPage(page, baseUrl, '/');

  const runtimeConfigState = await page.evaluate(() => {
    const script = document.getElementById('menav-runtime-config');
    const parsed = script ? JSON.parse(script.textContent || '{}') : null;

    return {
      hasRuntimeConfig: Boolean(script),
      version: parsed?.version || '',
      hasIcons: Boolean(parsed?.icons && typeof parsed.icons === 'object'),
      homePageId: parsed?.data?.homePageId || '',
      pageRegistryCount: Array.isArray(parsed?.data?.pageRegistry)
        ? parsed.data.pageRegistry.length
        : 0,
      hasPageTemplates: Boolean(
        parsed?.data?.pageTemplates && typeof parsed.data.pageTemplates === 'object'
      ),
      leaksCategories: Object.prototype.hasOwnProperty.call(parsed?.data || {}, 'categories'),
      leaksSites: Object.prototype.hasOwnProperty.call(parsed?.data || {}, 'sites'),
    };
  });

  assert.equal(runtimeConfigState.hasRuntimeConfig, true);
  assert.ok(runtimeConfigState.version);
  assert.equal(runtimeConfigState.hasIcons, true);
  assert.ok(runtimeConfigState.homePageId);
  assert.ok(runtimeConfigState.pageRegistryCount > 0, '运行时配置应包含页面注册表');
  assert.equal(runtimeConfigState.hasPageTemplates, true);
  assert.equal(runtimeConfigState.leaksCategories, false);
  assert.equal(runtimeConfigState.leaksSites, false);
}

async function runDomThemeSearchContract(page, baseUrl) {
  await openPage(page, baseUrl, '/');

  const domState = await page.evaluate(async () => {
    const nav = document.querySelector('.nav-item[data-page]');
    const category = document.querySelector('[data-type="category"]');
    const site = document.querySelector('[data-type="site"]');
    const social = document.querySelector('[data-type="social-link"]');
    const themeButton = document.querySelector('.theme-toggle');
    const search = document.querySelector('#search');

    themeButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    const htmlHasLight = document.documentElement.classList.contains('light-theme');
    const surfaceFrosted = getComputedStyle(document.documentElement)
      .getPropertyValue('--surface-frosted')
      .trim();
    const searchBoxBg = document.querySelector('.search-box')
      ? getComputedStyle(document.querySelector('.search-box')).backgroundColor
      : '';

    if (search) {
      search.value = site?.getAttribute('data-name') || 'example';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return {
      navAttrs: {
        type: nav?.getAttribute('data-type') || '',
        id: nav?.getAttribute('data-id') || '',
        page: nav?.getAttribute('data-page') || '',
      },
      categoryAttrs: {
        type: category?.getAttribute('data-type') || '',
        id: category?.getAttribute('data-id') || '',
        name: category?.getAttribute('data-name') || '',
      },
      siteAttrs: {
        type: site?.getAttribute('data-type') || '',
        name: site?.getAttribute('data-name') || '',
        url: site?.getAttribute('data-url') || '',
        icon: site?.getAttribute('data-icon') || '',
      },
      socialAttrs: {
        type: social?.getAttribute('data-type') || '',
        name: social?.getAttribute('data-name') || '',
        url: social?.getAttribute('data-url') || '',
      },
      htmlHasLight,
      surfaceFrosted,
      searchBoxBg,
      storedTheme: localStorage.getItem('theme') || '',
      searchPageActive:
        document.querySelector('#search-results')?.classList.contains('active') || false,
      searchHasState:
        document.querySelector('.search-box')?.classList.contains('has-results') ||
        document.querySelector('.search-box')?.classList.contains('no-results') ||
        false,
      searchSubtitle: document.querySelector('#search-results .subtitle')?.textContent || '',
    };
  });

  assert.equal(domState.navAttrs.type, 'nav-item');
  assert.ok(domState.navAttrs.id);
  assert.ok(domState.navAttrs.page);
  assert.equal(domState.categoryAttrs.type, 'category');
  assert.ok(domState.categoryAttrs.id || domState.categoryAttrs.name);
  assert.equal(domState.siteAttrs.type, 'site');
  assert.ok(domState.siteAttrs.name);
  assert.ok(domState.siteAttrs.url);
  assert.ok(domState.siteAttrs.icon);
  assert.equal(domState.socialAttrs.type, 'social-link');
  assert.ok(domState.socialAttrs.name);
  assert.ok(domState.socialAttrs.url);
  assert.equal(domState.htmlHasLight, true);
  assert.match(domState.surfaceFrosted, /240, 240, 235/);
  const searchBoxBg = parseRgba(domState.searchBoxBg);
  assert.ok(searchBoxBg, '搜索框背景色应为 rgba 格式');
  assert.ok(searchBoxBg.r >= 235 && searchBoxBg.g >= 235 && searchBoxBg.b >= 230);
  assert.ok(searchBoxBg.a >= 0.6 && searchBoxBg.a <= 0.75);
  assert.equal(domState.storedTheme, 'light');
  assert.equal(domState.searchPageActive, true);
  assert.equal(domState.searchHasState, true);
  assert.match(domState.searchSubtitle, /找到|未找到|加载/);

  await page.evaluate(() => {
    const search = document.querySelector('#search');
    if (search) {
      search.value = '';
      search.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    }
  });
  await page.waitForTimeout(100);
  const resetState = await page.evaluate(() => ({
    searchActive: document.querySelector('#search-results')?.classList.contains('active') || false,
    activePageId: document.querySelector('.page.active')?.id || '',
    activeNavId: document.querySelector('.nav-item.active')?.getAttribute('data-page') || '',
  }));
  assert.equal(resetState.searchActive, false);
  assert.equal(resetState.activePageId, resetState.activeNavId);
}

async function waitForBodyLoaded(page) {
  await page.waitForFunction(() => document.body.classList.contains('loaded'), null, {
    timeout: 5000,
  });
}

async function runSidebarBreakpointContract(page, baseUrl) {
  await openPage(page, baseUrl, '/');
  await waitForBodyLoaded(page);
  await page.evaluate(() => localStorage.setItem('sidebarCollapsed', 'false'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForMenav(page);
  await waitForBodyLoaded(page);

  const initialState = await page.evaluate(() => ({
    collapsed: document.querySelector('.sidebar')?.classList.contains('collapsed') || false,
    expanded: document.querySelector('.content')?.classList.contains('expanded') || false,
  }));
  assert.equal(initialState.collapsed, false);
  assert.equal(initialState.expanded, false);

  await page.evaluate(() => document.querySelector('.sidebar-toggle')?.click());
  await page.waitForFunction(
    () => document.querySelector('.sidebar')?.classList.contains('collapsed') === true,
    null,
    { timeout: 5000 }
  );
  const collapsedState = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    return {
      collapsed: sidebar?.classList.contains('collapsed') || false,
      expanded: document.querySelector('.content')?.classList.contains('expanded') || false,
      panelVisible: sidebar?.classList.contains('submenu-panel-visible') || false,
      ariaExpanded: sidebar?.querySelector('.sidebar-toggle')?.getAttribute('aria-expanded') || '',
    };
  });
  assert.equal(collapsedState.collapsed, true);
  assert.equal(collapsedState.expanded, true);
  assert.equal(collapsedState.panelVisible, false);
  assert.equal(collapsedState.ariaExpanded, 'false');

  await page.setViewportSize({ width: 600, height: 900 });
  await page.waitForFunction(
    () => {
      const sidebar = document.querySelector('.sidebar');
      const content = document.querySelector('.content');
      return Boolean(
        sidebar &&
        content &&
        !sidebar.classList.contains('collapsed') &&
        !content.classList.contains('expanded') &&
        sidebar.classList.contains('submenu-panel-visible')
      );
    },
    null,
    { timeout: 5000 }
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('sidebarCollapsed')),
    'true',
    '窄屏不应清掉桌面折叠偏好'
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForFunction(
    () => {
      const sidebar = document.querySelector('.sidebar');
      const content = document.querySelector('.content');
      return Boolean(
        sidebar &&
        content &&
        sidebar.classList.contains('collapsed') &&
        content.classList.contains('expanded') &&
        !sidebar.classList.contains('submenu-panel-visible')
      );
    },
    null,
    { timeout: 5000 }
  );

  await page.setViewportSize({ width: 600, height: 900 });
  const mobileLayout = await page.evaluate(() => {
    const content = document.querySelector('main.content');
    const contentStyle = content ? getComputedStyle(content) : null;
    const themeButton = document.querySelector('.theme-toggle');
    const themeStyle = themeButton ? getComputedStyle(themeButton) : null;
    const category =
      document.querySelector('.page.active .category') || document.querySelector('.category');
    return {
      paddingLeft: contentStyle ? parseFloat(contentStyle.paddingLeft) : NaN,
      paddingRight: contentStyle ? parseFloat(contentStyle.paddingRight) : NaN,
      buttonPosition: themeStyle?.position || '',
      categoryRight: category ? category.getBoundingClientRect().right : 0,
      viewportWidth: window.innerWidth,
    };
  });
  assert.equal(mobileLayout.buttonPosition, 'fixed', '移动端主题按钮应悬浮');
  assert.ok(
    Math.abs(mobileLayout.paddingLeft - mobileLayout.paddingRight) <= 1,
    '移动端内容左右留白应一致，不应为浮动按钮预留整列'
  );
  assert.ok(
    mobileLayout.categoryRight >= mobileLayout.viewportWidth - 30,
    '移动端分类卡片应延伸到视口右侧，浮动按钮叠加在内容之上：' + JSON.stringify(mobileLayout)
  );

  const mobileTitleLayout = await page.evaluate(() => {
    const title = document.querySelector('.page.active .site-card h3');
    if (!title) return null;
    const original = title.textContent;
    title.textContent = '很长的站点标题'.repeat(8);
    const style = getComputedStyle(title);
    const layout = {
      lineClamp: style.webkitLineClamp || '',
      overflow: style.overflow || '',
      whiteSpace: style.whiteSpace || '',
      clientHeight: title.clientHeight,
      scrollHeight: title.scrollHeight,
    };
    title.textContent = original;
    return layout;
  });
  assert.ok(mobileTitleLayout, '浏览器契约需要一张可测量标题的站点卡片');
  assert.equal(mobileTitleLayout.lineClamp, '2', '移动端标题最多显示两行');
  assert.equal(mobileTitleLayout.overflow, 'hidden', '移动端标题超出两行应隐藏');
  assert.equal(mobileTitleLayout.whiteSpace, 'normal', '移动端标题应允许换行');
  assert.ok(
    mobileTitleLayout.scrollHeight > mobileTitleLayout.clientHeight + 1,
    '移动端标题超过两行应被截断：' + JSON.stringify(mobileTitleLayout)
  );

  // 窄屏加载时也保留偏好，回到桌面再恢复折叠
  await page.setViewportSize({ width: 600, height: 900 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForMenav(page);
  await waitForBodyLoaded(page);
  const mobileLoadState = await page.evaluate(() => ({
    collapsed: document.querySelector('.sidebar')?.classList.contains('collapsed') || false,
    expanded: document.querySelector('.content')?.classList.contains('expanded') || false,
    stored: localStorage.getItem('sidebarCollapsed'),
  }));
  assert.equal(mobileLoadState.collapsed, false);
  assert.equal(mobileLoadState.expanded, false);
  assert.equal(mobileLoadState.stored, 'true');

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(
    () => document.querySelector('.sidebar')?.classList.contains('collapsed') === true,
    null,
    { timeout: 5000 }
  );

  await page.evaluate(() => localStorage.setItem('sidebarCollapsed', 'false'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForMenav(page);
  await waitForBodyLoaded(page);
}

async function runStorageFailureContract(browser, baseUrl) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    });
  });

  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  try {
    await openPage(page, baseUrl, '/');
    await waitForBodyLoaded(page);

    const initialState = await page.evaluate(() => ({
      activePageId: document.querySelector('.page.active')?.id || '',
      activeNavId: document.querySelector('.nav-item.active')?.getAttribute('data-page') || '',
      bodyLoaded: document.body.classList.contains('loaded'),
    }));
    assert.equal(initialState.bodyLoaded, true, '存储不可用时运行时仍应完成初始化');
    assert.ok(initialState.activePageId);
    assert.equal(initialState.activePageId, initialState.activeNavId);

    const targetPageId = await page.evaluate(() => {
      const currentPageId =
        document.querySelector('.nav-item.active')?.getAttribute('data-page') || '';
      const next = Array.from(document.querySelectorAll('.nav-item[data-page]')).find(
        (item) => item.getAttribute('data-page') !== currentPageId
      );
      if (!next) return '';
      const pageId = next.getAttribute('data-page') || '';
      next.click();
      return pageId;
    });

    if (targetPageId) await waitForRouteState(page, { pageId: targetPageId });
    assert.deepEqual(pageErrors, [], '存储不可用时不应产生未捕获异常');
    assert.deepEqual(consoleErrors, [], '存储不可用时不应输出控制台错误');
  } finally {
    await context.close();
  }
}

async function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..', '..');
  const messages = [];
  const { server, port } = await startServer({
    rootDir: path.join(repoRoot, 'dist'),
    host: '127.0.0.1',
    port: 0,
    strictPort: true,
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage();
    page.on('console', (message) => {
      messages.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error) => {
      messages.push({ type: 'error', text: error.message });
    });

    await runRouteContract(page, baseUrl);
    await runRuntimeConfigContract(page, baseUrl);
    await runDomThemeSearchContract(page, baseUrl);
    await runSidebarBreakpointContract(page, baseUrl);
    await runStorageFailureContract(browser, baseUrl);
    await assertNoConsoleErrors(messages);

    log.ok('完成', { ms: elapsedMs(), url: baseUrl });
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

if (require.main === module) {
  main().catch((error) => {
    log.error('失败', { message: error && error.message ? error.message : String(error) });
    if (error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
