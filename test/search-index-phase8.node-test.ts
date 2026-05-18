const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildTestSiteModel } = require('./helpers/site-model.ts');
const {
  SEARCH_INDEX_SCHEMA_VERSION,
  buildSearchIndex,
} = require('../src/lib/search-index/index.ts');

function withRepoRoot(fn) {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));
  try {
    return fn();
  } finally {
    process.chdir(originalCwd);
  }
}

test('Phase 8：构建期搜索索引应扁平化页面、分类、站点和文章基础字段', () => {
  withRepoRoot(() => {
    const config = {
      site: {
        title: 'Test Site',
        description: '',
        author: '',
        favicon: '',
        logo_text: 'Test',
        security: { allowedSchemes: ['https:', 'mailto:'] },
      },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [
        { id: 'home', name: '首页', icon: 'fas fa-home' },
        { id: 'projects', name: '项目', icon: 'fas fa-code' },
        { id: 'articles', name: '文章', icon: 'fas fa-rss' },
      ],
      home: {
        title: 'HOME',
        subtitle: 'HOME_SUB',
        template: 'page',
        categories: [
          {
            name: '工具',
            icon: 'fas fa-toolbox',
            subcategories: [
              {
                name: '开发',
                icon: 'fas fa-code',
                sites: [
                  {
                    name: 'Example Tool',
                    url: 'https://example.com/tool',
                    icon: 'fas fa-link',
                    description: 'Developer utility',
                    faviconUrl: 'assets/menav.svg',
                    forceIconMode: 'manual',
                  },
                ],
              },
            ],
          },
        ],
      },
      projects: {
        title: '项目',
        subtitle: '项目页',
        template: 'projects',
        categories: [
          {
            name: '项目',
            icon: 'fas fa-code',
            groups: [
              {
                name: 'CLI',
                icon: 'fas fa-terminal',
                sites: [
                  {
                    name: 'Repo A',
                    url: 'https://github.com/example/repo-a',
                    icon: 'fas fa-code',
                    description: 'Repo description',
                    language: 'TypeScript',
                    languageColor: '#3178c6',
                    stars: 42,
                    forks: 7,
                    issues: 3,
                  },
                ],
              },
            ],
          },
        ],
      },
      articles: {
        title: '文章',
        subtitle: '文章入口',
        template: 'articles',
        categories: [
          {
            name: '来源',
            icon: 'fas fa-rss',
            sites: [
              {
                name: 'Source A',
                url: 'https://blog.example.com',
                icon: 'fas fa-rss',
                description: 'RSS source should not be searched when article cache exists',
              },
            ],
          },
        ],
      },
    };

    const articleItem = {
      name: 'Article A',
      url: 'https://blog.example.com/a',
      icon: 'fas fa-pen',
      description: 'Article summary',
      publishedAt: '2026-01-01T00:00:00.000Z',
      source: 'Example Blog',
      external: true,
    };
    const model = buildTestSiteModel(config, {
      externalData: {
        articles: {
          articles: {
            items: [articleItem],
            meta: { generatedAt: '2026-01-01T00:00:00.000Z' },
          },
        },
      },
    });
    const index = buildSearchIndex(model);
      const byTitle = new Map(index.items.map((item) => [String(item.title).toLowerCase(), item]));

      assert.equal(index.schemaVersion, SEARCH_INDEX_SCHEMA_VERSION);
      assert.match(index.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.ok(byTitle.has('example tool'), '应包含普通页面嵌套站点');
      assert.ok(byTitle.has('repo a'), '应包含 projects 仓库卡片');
      assert.ok(byTitle.has('article a'), '应包含文章缓存条目');
      assert.equal(byTitle.get('example tool').categoryName, '开发');
      assert.deepEqual(byTitle.get('example tool').categoryPath, ['工具', '开发']);
      assert.equal(byTitle.get('example tool').faviconUrl, 'assets/menav.svg');
      assert.equal(byTitle.get('example tool').forceIconMode, 'manual');
      assert.equal(byTitle.get('article a').type, 'article');
      assert.equal(byTitle.get('repo a').style, 'repo');
      assert.equal(byTitle.get('repo a').language, 'TypeScript');
      assert.equal(byTitle.get('repo a').languageColor, '#3178c6');
      assert.equal(byTitle.get('repo a').stars, 42);
      assert.equal(byTitle.get('repo a').forks, 7);
      assert.equal(byTitle.get('repo a').issues, 3);
      assert.equal(byTitle.has('source a'), false, '文章缓存存在时不应索引扩展影子来源卡片');
      assert.equal(
        index.items.some((item) => item.pageId === 'search-results'),
        false
      );

      const raw = JSON.stringify(index);
      assert.ok(!raw.includes('navigation'));
      assert.ok(!raw.includes('runtimeConfig'));
      assert.ok(!raw.includes('runtimeConfigJson'));
  });
});

test('Phase 12：runtime 搜索只依赖构建期索引，不保留页面卡片索引生成路径', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const runtimeSearchPath = path.join(repoRoot, 'src', 'runtime', 'app', 'search', 'index.ts');
  const content = fs.readFileSync(runtimeSearchPath, 'utf8');
  const removedBuilder = ['build', 'Dom', 'Search', 'Index'].join('');
  const removedSource = ["source = '", 'dom', "'"].join('');
  const removedElementClone = ['item', '.', 'element'].join('');

  assert.equal(content.includes(removedBuilder), false);
  assert.equal(content.includes(removedSource), false);
  assert.equal(content.includes(removedElementClone), false);
  assert.ok(content.includes('search-index.json'), 'runtime 搜索应读取构建期索引文件');
  assert.ok(content.includes('搜索索引加载失败'), '索引失败时应有用户可见提示');
});
