const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildRoutePath, parseRouteFromHref } = require('../src/runtime/app/router-url.ts');

const pageRegistry = [
  { id: 'home', name: '首页', template: 'page', active: true },
  { id: 'projects', name: '项目', template: 'projects', active: false },
  { id: 'articles', name: '文章', template: 'articles', active: false },
];

test('Phase 9 router：应从 ?page 和 hash 解析有效单页路由', () => {
  const route = parseRouteFromHref('https://example.com/?page=projects#开源项目', {
    pageRegistry,
    homePageId: 'home',
  });

  assert.deepEqual(route, {
    pageId: 'projects',
    rawPageId: 'projects',
    hash: '开源项目',
    shouldReplaceUrl: false,
  });
});

test('Phase 9 router：未知 page 应回退首页并要求规范化 URL', () => {
  const route = parseRouteFromHref('https://example.com/?page=missing#abc', {
    pageRegistry,
    homePageId: 'home',
  });

  assert.equal(route.pageId, 'home');
  assert.equal(route.rawPageId, 'missing');
  assert.equal(route.hash, 'abc');
  assert.equal(route.shouldReplaceUrl, true);
});

test('Phase 9 router：缺少 page 参数时应回退首页，供 runtime 规范化为 /?page=<id>', () => {
  const route = parseRouteFromHref('https://example.com/#置顶', {
    pageRegistry,
    homePageId: 'home',
  });

  assert.equal(route.pageId, 'home');
  assert.equal(route.rawPageId, '');
  assert.equal(route.hash, '置顶');
  assert.equal(route.shouldReplaceUrl, false);
});

test('Phase 9 router：应构造推荐的 /?page=<id>#<categorySlug> URL', () => {
  assert.equal(
    buildRoutePath('https://example.com/?page=home#old', {
      pageId: 'projects',
      hash: '开源项目',
    }),
    '/?page=projects#%E5%BC%80%E6%BA%90%E9%A1%B9%E7%9B%AE'
  );

  assert.equal(
    buildRoutePath('https://example.com/?page=projects#old', {
      pageId: 'articles',
      hash: '',
    }),
    '/?page=articles'
  );
});

test('Phase 9 runtime：router 应绑定 popstate 并用 pushState 记录导航历史', () => {
  const router = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'runtime', 'app', 'router.ts'),
    'utf8'
  );

  assert.match(router, /addEventListener\('popstate'/);
  assert.match(router, /setUrlState\(\{ pageId, hash: '' \}, \{ replace: false \}\)/);
  assert.ok(!router.includes('/<id>'), 'router 不应恢复旧路径回跳模型');
});
