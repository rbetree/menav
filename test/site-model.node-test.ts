const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSiteModel } = require('../src/lib/site-model/index.ts');
const { createRenderContext } = require('../src/lib/view-data/render-context.ts');

function makeConfig() {
  const config = {
    site: { title: 'Test', description: '', author: '', favicon: 'menav.svg', logo_text: 'Test' },
    fonts: {},
    profile: { title: 'Profile', subtitle: 'Sub' },
    social: [],
    icons: { mode: 'manual', region: 'com' },
    navigation: [
      { id: 'home', name: '首页', icon: 'fas fa-home' },
      { id: 'secret', name: '隐藏页', icon: 'fas fa-eye-slash', hidden: true },
    ],
    pages: {
      home: {
        title: 'Home',
        template: 'page',
        categories: [{ name: '工具', icon: 'fas fa-box', sites: [] }],
      },
      secret: {
        title: 'Secret',
        template: 'page',
        categories: [
          {
            name: '隐藏分类',
            icon: 'fas fa-lock',
            sites: [{ name: 'Secret Site', url: 'https://example.com', icon: 'fas fa-link' }],
          },
        ],
      },
    },
  };
  config.homePageId = 'home';
  config.renderContext = createRenderContext(config);
  return config;
}

test('SiteModel：hidden 页面可访问但不出现在侧边栏导航', () => {
  const model = buildSiteModel({
    config: makeConfig(),
    now: new Date('2026-01-01T00:00:00.000Z'),
    version: '9.9.9',
  });

  assert.deepEqual(
    model.navigationData.map((item) => item.id),
    ['home']
  );
  assert.ok(model.pageRegistry.some((item) => item.id === 'secret'));
  assert.equal(model.pageTemplates.secret, 'page');
  assert.ok(model.pages.some((page) => page.id === 'secret'));
  assert.ok(model.searchSources.some((card) => card.pageId === 'secret'));
  assert.equal(model.runtimeConfig.data.pageRegistry.some((item) => item.id === 'secret'), true);
  assert.equal(model.meta.version, '9.9.9');
  assert.equal(model.runtimeConfig.timestamp, '2026-01-01T00:00:00.000Z');
});

test('SiteModel：search-results 只由模型层合成', () => {
  const model = buildSiteModel(makeConfig());
  const searchPages = model.pages.filter((page) => page.id === 'search-results');

  assert.equal(searchPages.length, 1);
  assert.equal(model.config.pages['search-results'], undefined);
});
