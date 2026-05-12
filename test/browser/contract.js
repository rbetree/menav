const assert = require('node:assert/strict');
const path = require('node:path');

const { chromium } = require('playwright');
const { startServer } = require('../../scripts/serve-dist');
const { createLogger, startTimer } = require('../../src/lib/logging/logger.ts');

const log = createLogger('browser-contract');

async function waitForMenav(page) {
  await page.waitForFunction(() => Boolean(window.MeNav && window.MeNav.getConfig), null, {
    timeout: 5000,
  });
}

async function openPage(page, baseUrl, pathAndQuery = '/') {
  await page.goto(`${baseUrl}${pathAndQuery}`, { waitUntil: 'domcontentloaded' });
  await waitForMenav(page);
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

  const routeState = await page.evaluate(() => {
    const navItems = Array.from(document.querySelectorAll('.nav-item[data-page]'));
    const pageIds = navItems.map((item) => item.getAttribute('data-page')).filter(Boolean);
    const targetPageId = pageIds.find((id) => id !== pageIds[0]);
    const targetSubmenu = targetPageId
      ? document.querySelector(
          `.submenu-item[data-page="${CSS.escape(targetPageId)}"][data-category-id]`
        )
      : null;
    const categoryId = targetSubmenu ? targetSubmenu.getAttribute('data-category-id') : '';

    return {
      pageIds,
      targetPageId,
      categoryId,
    };
  });

  assert.ok(routeState.pageIds.length >= 2, '浏览器契约需要至少两个导航页');
  assert.ok(routeState.targetPageId, '浏览器契约需要目标导航页');

  await page.evaluate((targetPageId) => {
    document.querySelector(`.nav-item[data-page="${CSS.escape(targetPageId)}"]`)?.click();
  }, routeState.targetPageId);
  await waitForRouteState(page, { pageId: routeState.targetPageId });

  const afterClick = await page.evaluate(() => ({
    activePageId: document.querySelector('.page.active')?.id || '',
    activeNavId: document.querySelector('.nav-item.active')?.getAttribute('data-page') || '',
    path: `${location.pathname}${location.search}${location.hash}`,
  }));
  assert.equal(afterClick.activePageId, routeState.targetPageId);
  assert.equal(afterClick.activeNavId, routeState.targetPageId);
  assert.match(afterClick.path, new RegExp(`[?&]page=${routeState.targetPageId}`));

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

async function runExtensionContract(page, baseUrl) {
  await openPage(page, baseUrl, '/');

  const extensionState = await page.evaluate(() => {
    const api = window.MeNav;
    const config = api.getConfig();
    const clonedConfig = api.getConfig({ clone: true });
    const sites = api.getAllElements('site');
    const firstCategoryName =
      document.querySelector('[data-type="category"]')?.getAttribute('data-name') || '';
    const firstSite = sites[0];
    let eventPayload = null;
    api.events.on('elementAdded', (payload) => {
      eventPayload = payload;
    });

    const added = firstCategoryName
      ? api.addElement('site', firstCategoryName, {
          name: 'Browser Contract Site',
          url: 'https://contract.example.com',
          icon: 'fas fa-vial',
          description: 'Created by browser contract test',
        })
      : null;
    const addedElement = document.querySelector(
      '[data-type="site"][data-url="https://contract.example.com"]'
    );
    const updated = addedElement
      ? api.updateElement('site', 'https://contract.example.com', {
          name: 'Browser Contract Site Updated',
          description: 'Updated by browser contract test',
        })
      : false;
    const updatedElement = document.querySelector(
      '[data-type="site"][data-url="https://contract.example.com"]'
    );
    const removed = updatedElement
      ? api.removeElement('site', 'https://contract.example.com')
      : false;

    return {
      hasApi: Boolean(api),
      configUrl: config?.configUrl,
      configCloneDistinct: clonedConfig !== config,
      pageRegistryCount: config?.data?.pageRegistry?.length || 0,
      sitesCount: sites.length,
      firstSiteHasElement: Boolean(firstSite?.element),
      firstSiteId: firstSite?.id || '',
      addedId: added || '',
      addedTag: addedElement?.tagName || '',
      addedExists: Boolean(addedElement),
      updated,
      updatedName: updatedElement?.getAttribute('data-name') || '',
      removed,
      removedExists: Boolean(
        document.querySelector('[data-type="site"][data-url="https://contract.example.com"]')
      ),
      eventType: eventPayload?.type || '',
      eventId: eventPayload?.id || '',
    };
  });

  assert.equal(extensionState.hasApi, true);
  assert.equal(extensionState.configUrl, './menav-config.json');
  assert.equal(extensionState.configCloneDistinct, true);
  assert.ok(extensionState.pageRegistryCount > 0, '扩展配置应包含页面注册表');
  assert.ok(extensionState.sitesCount > 0, '应能读取站点元素');
  assert.equal(extensionState.firstSiteHasElement, true);
  assert.ok(extensionState.firstSiteId, '站点元素应有稳定 id');
  assert.equal(extensionState.addedId, 'Browser Contract Site');
  assert.equal(extensionState.addedTag, 'A');
  assert.equal(extensionState.addedExists, true);
  assert.equal(extensionState.updated, true);
  assert.equal(extensionState.updatedName, 'Browser Contract Site Updated');
  assert.equal(extensionState.removed, true);
  assert.equal(extensionState.removedExists, false);
  assert.equal(extensionState.eventType, 'site');
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
    const bodyHasLight = document.body.classList.contains('light-theme');

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
      bodyHasLight,
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
  assert.equal(domState.bodyHasLight, true);
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
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', (message) => {
      messages.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error) => {
      messages.push({ type: 'error', text: error.message });
    });

    await runRouteContract(page, baseUrl);
    await runExtensionContract(page, baseUrl);
    await runDomThemeSearchContract(page, baseUrl);
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
