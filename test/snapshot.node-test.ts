const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../src/lib/config/index.ts');
const { buildSiteModel } = require('../src/lib/site-model/index.ts');
const { collectSiteExternalData } = require('../src/lib/site-model/external-data.ts');
const { createSeed } = require('../scripts/lib/seed.ts');
const { configFromSnapshot } = require('../src/lib/config/snapshot.ts');
const { ensureConfigDefaults } = require('../src/lib/config/normalizer.ts');
const { createRenderContext } = require('../src/lib/view-data/render-context.ts');

test('JSON 快照在没有 YAML 和 Markdown 文件时渲染正文与隐藏页面', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-snapshot-'));
  const oldSnapshot = process.env.MENAV_SNAPSHOT_FILE;
  const oldConfig = process.env.MENAV_CONFIG_DIR;
  try {
    const snapshot = {
      schemaVersion: 1,
      revision: 7,
      updatedAt: '2026-09-08T00:00:00.000Z',
      settings: { site: JSON.stringify({ title: 'D1 Site', fonts: { source: 'system' } }) },
      pages: [
        {
          id: 'about',
          label: '关于',
          sort: 0,
          hidden: false,
          template: 'content',
          navigation: {},
          metadata: {
            title: '正文',
            content: { file: 'missing.md', markdown: '# 来自 D1\n\n[链接](https://example.com)' },
          },
          categories: [],
        },
        {
          id: 'hidden',
          label: '隐藏页',
          sort: 1,
          hidden: true,
          template: 'page',
          navigation: { icon: 'fas fa-eye-slash' },
          metadata: {},
          categories: [
            {
              id: 'cat',
              label: '工具',
              sort: 0,
              metadata: { icon: 'fas fa-tools' },
              sites: [
                {
                  id: 'site',
                  name: 'Example',
                  url: 'https://example.com',
                  external: true,
                  sort: 0,
                  metadata: { forceIconMode: 'manual' },
                },
              ],
              categories: [],
            },
          ],
        },
      ],
    };
    process.env.MENAV_SNAPSHOT_FILE = path.join(dir, 'snapshot.json');
    process.env.MENAV_CONFIG_DIR = path.join(dir, 'no-config');
    fs.writeFileSync(process.env.MENAV_SNAPSHOT_FILE, JSON.stringify(snapshot));
    const config = loadConfig();
    const model = buildSiteModel({ config, externalData: collectSiteExternalData(config) });
    assert.equal(config.site.title, 'D1 Site');
    assert.equal(config.fonts.source, 'system');
    assert.match(model.pages[0].data.contentHtml, /<h1>来自 D1<\/h1>/);
    assert.deepEqual(
      model.navigationData.map((nav) => nav.id),
      ['about']
    );
    assert.ok(model.searchSources.some((card) => card.pageId === 'hidden'));
    assert.equal(config.pages.hidden.categories[0].sites[0].forceIconMode, 'manual');
  } finally {
    if (oldSnapshot === undefined) delete process.env.MENAV_SNAPSHOT_FILE;
    else process.env.MENAV_SNAPSHOT_FILE = oldSnapshot;
    if (oldConfig === undefined) delete process.env.MENAV_CONFIG_DIR;
    else process.env.MENAV_CONFIG_DIR = oldConfig;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('现有默认配置经种子和快照往返后卡片、导航和正文等价', () => {
  const config = loadConfig();
  const seed = createSeed(config);
  const snapshotConfig = ensureConfigDefaults(
    configFromSnapshot({
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-09-08T00:00:00.000Z',
      ...seed,
    })
  );
  snapshotConfig.homePageId = config.homePageId;
  snapshotConfig.renderContext = createRenderContext(snapshotConfig);
  const original = buildSiteModel({ config, externalData: collectSiteExternalData(config) });
  const restored = buildSiteModel({
    config: snapshotConfig,
    externalData: collectSiteExternalData(snapshotConfig),
  });
  const navigation = (model) =>
    model.navigationData.map((nav) => ({
      id: nav.id,
      name: nav.name,
      icon: nav.icon,
      submenu: (nav.submenu ?? []).map((item) => ({
        name: item.name,
        icon: item.icon,
        slug: item.slug,
      })),
    }));
  assert.deepEqual(navigation(restored), navigation(original));
  assert.deepEqual(restored.searchSources, original.searchSources);
  assert.deepEqual(
    restored.pages.filter((p) => p.templateName === 'content').map((p) => p.data.contentHtml),
    original.pages.filter((p) => p.templateName === 'content').map((p) => p.data.contentHtml)
  );
  assert.ok(JSON.parse(seed.settings.assets)['menav.svg']);
});

test('构建刷新按来源合并文章，失败来源保留 D1 数据且忽略仓库缓存', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-refresh-'));
  const previous = {
    RSS_CACHE_DIR: process.env.RSS_CACHE_DIR,
    PROJECTS_CACHE_DIR: process.env.PROJECTS_CACHE_DIR,
  };
  const article = (name, sourceUrl, publishedAt) => ({
    name,
    url: sourceUrl + '/' + name,
    sourceUrl,
    publishedAt,
  });
  const cache = path.join(dir, 'fresh');
  fs.mkdirSync(cache);
  const config = {
    site: { rss: { cacheDir: dir }, github: { cacheDir: dir } },
    navigation: [{ id: 'articles' }, { id: 'projects' }],
    pages: {
      articles: {
        categories: [{ sites: [{ url: 'https://a.example' }, { url: 'https://b.example' }] }],
      },
      projects: {},
    },
    snapshot: {
      cacheDir: cache,
      externalData: {
        articles: {
          articles: {
            items: [
              article('旧甲', 'https://a.example', '2026-09-01'),
              article('旧乙', 'https://b.example', '2026-09-02'),
            ],
            meta: { generatedAt: 'old' },
          },
        },
        projects: {
          projects: {
            repoMetaMap: {
              'https://github.com/a/one': { stars: 1 },
              'https://github.com/b/two': { stars: 2 },
            },
          },
        },
      },
    },
  };
  try {
    process.env.RSS_CACHE_DIR = dir;
    process.env.PROJECTS_CACHE_DIR = dir;
    fs.writeFileSync(
      path.join(dir, 'articles.feed-cache.json'),
      JSON.stringify({ articles: [{ title: '仓库缓存', url: 'https://old.example' }] })
    );
    fs.writeFileSync(
      path.join(dir, 'projects.repo-cache.json'),
      JSON.stringify({ repos: [{ url: 'https://github.com/a/one', stars: 999 }] })
    );
    let result = collectSiteExternalData(config);
    assert.deepEqual(
      result.articles.articles.items.map((item) => item.name),
      ['旧甲', '旧乙']
    );
    assert.equal(result.projects.projects.repoMetaMap.get('https://github.com/a/one').stars, 1);
    const writeFeed = (sites, articles) =>
      fs.writeFileSync(
        path.join(cache, 'articles.feed-cache.json'),
        JSON.stringify({
          sites,
          articles,
          stats: { successSites: sites.filter((s) => s.status === 'success').length },
        })
      );
    writeFeed(
      [
        { url: 'https://a.example', status: 'success' },
        { url: 'https://b.example', status: 'failed' },
      ],
      [
        {
          title: '新甲',
          url: 'https://a.example/new',
          sourceUrl: 'https://a.example',
          publishedAt: '2026-09-08',
        },
      ]
    );
    fs.writeFileSync(
      path.join(cache, 'projects.repo-cache.json'),
      JSON.stringify({ repos: [{ url: 'https://github.com/a/one', stars: 3 }] })
    );
    result = collectSiteExternalData(config);
    assert.deepEqual(
      result.articles.articles.items.map((item) => item.name),
      ['新甲', '旧乙']
    );
    assert.equal(result.projects.projects.repoMetaMap.get('https://github.com/a/one').stars, 3);
    assert.equal(result.projects.projects.repoMetaMap.get('https://github.com/b/two').stars, 2);
    writeFeed(
      [
        { url: 'https://a.example', status: 'success' },
        { url: 'https://b.example', status: 'failed' },
      ],
      []
    );
    assert.deepEqual(
      collectSiteExternalData(config).articles.articles.items.map((item) => item.name),
      ['旧乙']
    );
    writeFeed(
      [
        { url: 'https://a.example', status: 'failed' },
        { url: 'https://b.example', status: 'failed' },
      ],
      []
    );
    assert.deepEqual(
      collectSiteExternalData(config).articles.articles.items.map((item) => item.name),
      ['旧甲', '旧乙']
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('混合分类和站点字段按 D1 顺序渲染，关闭折叠的选择被保留', () => {
  const raw = configFromSnapshot({
    schemaVersion: 1,
    revision: 1,
    settings: {},
    pages: [
      {
        id: 'home',
        label: '首页',
        categories: [
          {
            label: '根分类',
            foldable: false,
            metadata: {},
            sites: [
              { name: '后项', url: 'https://b.example', kind: 'sites', sort: 1 },
              { name: '前项', url: 'https://a.example', kind: 'items', sort: 0 },
            ],
            categories: [
              {
                label: '子分类',
                kind: 'subcategories',
                sort: 1,
                sites: [{ name: '子分类链接', url: 'https://sub.example' }],
              },
              {
                label: '分组',
                kind: 'groups',
                sort: 0,
                sites: [{ name: '分组链接', url: 'https://group.example' }],
              },
            ],
          },
        ],
      },
    ],
  });
  const config = ensureConfigDefaults(raw);
  config.homePageId = 'home';
  config.renderContext = createRenderContext(config);
  const model = buildSiteModel({ config });
  const category = model.pages[0].data.categories[0];
  assert.equal(category.foldable, false);
  assert.deepEqual(
    category.cards.map((card) => card.title),
    ['前项', '后项']
  );
  assert.deepEqual(
    model.searchSources.map((card) => card.title),
    ['分组链接', '子分类链接', '前项', '后项']
  );
});
