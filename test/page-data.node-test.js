const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { preparePageData } = require('../src/generator.js');

function withRepoRoot(fn) {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));
  try {
    return fn();
  } finally {
    process.chdir(originalCwd);
  }
}

test('friends/articles：应保留分类展示数据结构', () => {
  withRepoRoot(() => {
    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [
        { id: 'home', name: '首页', icon: 'fas fa-home' },
        { id: 'friends', name: '朋友', icon: 'fas fa-users' },
        { id: 'articles', name: '文章', icon: 'fas fa-book' },
      ],
      home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'page', categories: [] },
      friends: {
        title: '友情链接',
        subtitle: '朋友们',
        template: 'page',
        categories: [
          {
            name: '技术博主',
            icon: 'fas fa-user-friends',
            sites: [
              {
                name: 'Example',
                url: 'https://example.com',
                icon: 'fas fa-link',
                description: 'desc',
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
            name: '最新文章',
            icon: 'fas fa-pen',
            sites: [
              {
                name: 'Article A',
                url: 'https://example.com/a',
                icon: 'fas fa-link',
                description: 'summary',
              },
            ],
          },
        ],
      },
    };

    const friends = preparePageData('friends', config);
    const articles = preparePageData('articles', config);

    assert.equal(friends.templateName, 'page');
    assert.equal(friends.data.categories[0].name, '技术博主');
    assert.equal(friends.data.categories[0].sites[0].name, 'Example');

    assert.equal(articles.templateName, 'articles');
    assert.equal(articles.data.categories[0].name, '最新文章');
    assert.equal(articles.data.categories[0].sites[0].name, 'Article A');
  });
});

test('friends/articles：页面配置使用顶层 sites 时应自动映射为分类容器', () => {
  withRepoRoot(() => {
    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [
        { id: 'home', name: '首页', icon: 'fas fa-home' },
        { id: 'friends', name: '朋友', icon: 'fas fa-users' },
        { id: 'articles', name: '文章', icon: 'fas fa-book' },
      ],
      home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'page', categories: [] },
      friends: {
        title: '友情链接',
        subtitle: '朋友们',
        template: 'page',
        sites: [
          { name: 'Example', url: 'https://example.com', icon: 'fas fa-link', description: 'desc' },
        ],
      },
      articles: {
        title: '文章',
        subtitle: '文章入口',
        template: 'articles',
        sites: [
          {
            name: 'Article A',
            url: 'https://example.com/a',
            icon: 'fas fa-link',
            description: 'summary',
          },
        ],
      },
    };

    const friends = preparePageData('friends', config).data;
    const articles = preparePageData('articles', config).data;

    assert.equal(friends.categories[0].name, '全部友链');
    assert.equal(friends.categories[0].sites[0].name, 'Example');
    assert.equal(articles.categories[0].name, '全部来源');
    assert.equal(articles.categories[0].sites[0].name, 'Article A');
  });
});

test('缺少 friends 页面配置时：仍应准备页面数据（标题回退为导航名称）', () => {
  withRepoRoot(() => {
    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [
        { id: 'home', name: '首页', icon: 'fas fa-home' },
        { id: 'friends', name: '朋友', icon: 'fas fa-users' },
      ],
      home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'page', categories: [] },
    };

    const page = preparePageData('friends', config);

    assert.equal(page.templateName, 'page');
    assert.equal(page.data.title, '朋友');
    assert.deepEqual(page.data.categories, []);
  });
});

test('bookmarks：标题区应准备内容更新时间元数据', () => {
  withRepoRoot(() => {
    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [
        { id: 'home', name: '首页', icon: 'fas fa-home' },
        { id: 'bookmarks', name: '书签', icon: 'fas fa-bookmark' },
      ],
      home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'page', categories: [] },
      bookmarks: { title: '书签', subtitle: '书签页', template: 'bookmarks', categories: [] },
    };

    const page = preparePageData('bookmarks', config).data;

    assert.ok(page.pageMeta, '应包含 pageMeta');
    assert.match(page.pageMeta.updatedAt, /^\d{4}-\d{2}-\d{2}/);
    assert.match(page.pageMeta.updatedAtSource, /^(git|mtime)$/);
  });
});

test('projects：应准备代码仓库风格卡片数据', () => {
  withRepoRoot(() => {
    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [{ id: 'projects', name: '项目', icon: 'fas fa-project-diagram' }],
      projects: {
        title: '项目',
        subtitle: '项目页',
        template: 'projects',
        categories: [
          {
            name: '项目',
            icon: 'fas fa-code',
            sites: [
              {
                name: 'Proj',
                url: 'https://example.com',
                icon: 'fas fa-link',
                description: 'desc',
              },
            ],
          },
        ],
      },
    };

    const page = preparePageData('projects', config);

    assert.equal(page.templateName, 'projects');
    assert.equal(page.data.siteCardStyle, 'repo');
    assert.equal(page.data.categories[0].sites[0].name, 'Proj');
  });
});

test('articles Phase 2：存在 RSS 缓存时准备文章条目与扩展影子结构数据', () => {
  withRepoRoot(() => {
    const previousCacheDir = process.env.RSS_CACHE_DIR;
    const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-rss-cache-'));
    process.env.RSS_CACHE_DIR = tmpCacheDir;

    fs.writeFileSync(
      path.join(tmpCacheDir, 'articles.feed-cache.json'),
      JSON.stringify(
        {
          version: '1.0',
          pageId: 'articles',
          generatedAt: '2025-12-26T00:00:00.000Z',
          articles: [
            {
              title: 'Article A',
              url: 'https://example.com/a',
              summary: 'summary',
              publishedAt: '2025-12-25T12:00:00.000Z',
              source: 'Example Blog',
              sourceUrl: 'https://example.com',
              icon: 'fas fa-pen',
            },
          ],
          stats: { totalArticles: 1 },
        },
        null,
        2
      )
    );

    try {
      const config = {
        site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
        profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
        social: [],
        navigation: [
          { id: 'home', name: '首页', icon: 'fas fa-home' },
          { id: 'articles', name: '文章', icon: 'fas fa-book' },
        ],
        home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'page', categories: [] },
        articles: {
          title: '文章',
          subtitle: '文章入口',
          template: 'articles',
          categories: [
            {
              name: '来源',
              icon: 'fas fa-pen',
              sites: [
                {
                  name: 'Source A',
                  url: 'https://example.com',
                  icon: 'fas fa-link',
                  description: 'desc',
                },
              ],
            },
          ],
        },
      };

      const page = preparePageData('articles', config).data;

      assert.equal(page.articlesItems[0].name, 'Article A');
      assert.equal(page.articlesItems[0].source, 'Example Blog');
      assert.equal(page.articlesItems[0].publishedAt, '2025-12-25T12:00:00.000Z');
      assert.equal(page.articlesCategories[0].name, '来源');
      assert.equal(page.articlesCategories[0].items[0].name, 'Article A');
      assert.equal(page.categories[0].sites[0].name, 'Source A');
    } finally {
      try {
        fs.rmSync(tmpCacheDir, { recursive: true, force: true });
      } finally {
        if (previousCacheDir === undefined) {
          delete process.env.RSS_CACHE_DIR;
        } else {
          process.env.RSS_CACHE_DIR = previousCacheDir;
        }
      }
    }
  });
});
