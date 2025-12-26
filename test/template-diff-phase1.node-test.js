const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadHandlebarsTemplates, generateAllPagesHTML } = require('../src/generator.js');

function withRepoRoot(fn) {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));
  try {
    return fn();
  } finally {
    process.chdir(originalCwd);
  }
}

test('friends/articles：应扁平展示且不输出分类标题 DOM（扩展仍可依赖 data-* 结构）', () => {
  withRepoRoot(() => {
    loadHandlebarsTemplates();

    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [
        { id: 'home', name: '首页', icon: 'fas fa-home' },
        { id: 'friends', name: '朋友', icon: 'fas fa-users' },
        { id: 'articles', name: '文章', icon: 'fas fa-book' },
      ],
      home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'home', categories: [] },
      friends: {
        title: '友情链接',
        subtitle: '朋友们',
        template: 'friends',
        categories: [
          {
            name: '技术博主',
            icon: 'fas fa-user-friends',
            sites: [{ name: 'Example', url: 'https://example.com', icon: 'fas fa-link', description: 'desc' }],
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
            sites: [{ name: 'Article A', url: 'https://example.com/a', icon: 'fas fa-link', description: 'summary' }],
          },
        ],
      },
    };

    const pages = generateAllPagesHTML(config);

    assert.ok(typeof pages.friends === 'string' && pages.friends.length > 0);
    assert.ok(pages.friends.includes('page-template-friends'));
    assert.ok(pages.friends.includes('flat-sites-grid'));
    assert.ok(pages.friends.includes('class="site-card'), 'friends 应使用普通 site-card 样式（图标在左，标题在右）');
    assert.ok(!pages.friends.includes('site-card-friend'), 'friends 不应使用 site-card-friend 变体样式');
    assert.ok(!pages.friends.includes('category-header'), 'friends 不应输出分类标题结构');

    assert.ok(typeof pages.articles === 'string' && pages.articles.length > 0);
    assert.ok(pages.articles.includes('page-template-articles'));
    assert.ok(pages.articles.includes('flat-sites-grid'));
    assert.ok(pages.articles.includes('class="site-card'), 'articles 应使用普通 site-card 样式（图标在左，标题在右）');
    assert.ok(!pages.articles.includes('site-card-article'), 'articles 不应使用 site-card-article 变体样式');
    assert.ok(!pages.articles.includes('category-header'), 'articles 不应输出分类标题结构');
  });
});

test('friends/articles：页面配置使用顶层 sites 时也应扁平展示（避免配置与页面表现不一致）', () => {
  withRepoRoot(() => {
    loadHandlebarsTemplates();

    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [
        { id: 'home', name: '首页', icon: 'fas fa-home' },
        { id: 'friends', name: '朋友', icon: 'fas fa-users' },
        { id: 'articles', name: '文章', icon: 'fas fa-book' },
      ],
      home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'home', categories: [] },
      friends: {
        title: '友情链接',
        subtitle: '朋友们',
        template: 'friends',
        sites: [{ name: 'Example', url: 'https://example.com', icon: 'fas fa-link', description: 'desc' }],
      },
      articles: {
        title: '文章',
        subtitle: '文章入口',
        template: 'articles',
        sites: [{ name: 'Article A', url: 'https://example.com/a', icon: 'fas fa-link', description: 'summary' }],
      },
    };

    const pages = generateAllPagesHTML(config);

    assert.ok(typeof pages.friends === 'string' && pages.friends.length > 0);
    assert.ok(pages.friends.includes('page-template-friends'));
    assert.ok(pages.friends.includes('flat-sites-grid'));
    assert.ok(pages.friends.includes('class="site-card'), 'friends 应使用普通 site-card 样式（图标在左，标题在右）');
    assert.ok(!pages.friends.includes('site-card-friend'), 'friends 不应使用 site-card-friend 变体样式');
    assert.ok(!pages.friends.includes('category-header'), 'friends 不应输出分类标题结构');

    assert.ok(typeof pages.articles === 'string' && pages.articles.length > 0);
    assert.ok(pages.articles.includes('page-template-articles'));
    assert.ok(pages.articles.includes('flat-sites-grid'));
    assert.ok(pages.articles.includes('class="site-card'), 'articles 应使用普通 site-card 样式（图标在左，标题在右）');
    assert.ok(!pages.articles.includes('site-card-article'), 'articles 不应使用 site-card-article 变体样式');
    assert.ok(!pages.articles.includes('category-header'), 'articles 不应输出分类标题结构');
  });
});

test('bookmarks：标题区应显示内容更新时间（日期 + 来源）', () => {
  withRepoRoot(() => {
    loadHandlebarsTemplates();

    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [
        { id: 'home', name: '首页', icon: 'fas fa-home' },
        { id: 'bookmarks', name: '书签', icon: 'fas fa-bookmark' },
      ],
      home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'home', categories: [] },
      bookmarks: { title: '书签', subtitle: '书签页', template: 'bookmarks', categories: [] },
    };

    const pages = generateAllPagesHTML(config);
    const html = pages.bookmarks;

    assert.ok(typeof html === 'string' && html.length > 0);
    assert.ok(html.includes('page-updated-at'));
    assert.ok(html.includes('内容更新：'));
    assert.ok(/\d{4}-\d{2}-\d{2}/.test(html), '应显示 YYYY-MM-DD 日期');
    assert.ok(/（(git|mtime)）/.test(html), '应显示来源（git|mtime）');
  });
});

test('projects：应输出大卡片样式 class（site-card-large）', () => {
  withRepoRoot(() => {
    loadHandlebarsTemplates();

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
            sites: [{ name: 'Proj', url: 'https://example.com', icon: 'fas fa-link', description: 'desc' }],
          },
        ],
      },
    };

    const pages = generateAllPagesHTML(config);
    const html = pages.projects;

    assert.ok(typeof html === 'string' && html.length > 0);
    assert.ok(html.includes('site-card-large'), 'projects 应包含大卡片样式类');
  });
});

test('articles Phase 2：存在 RSS 缓存时渲染文章条目，并隐藏扩展写回结构', () => {
  withRepoRoot(() => {
    loadHandlebarsTemplates();

    const previousCacheDir = process.env.RSS_CACHE_DIR;
    const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-rss-cache-'));
    process.env.RSS_CACHE_DIR = tmpCacheDir;

    const cachePath = path.join(tmpCacheDir, 'articles.feed-cache.json');
    fs.writeFileSync(
      cachePath,
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
              icon: 'fas fa-pen'
            }
          ],
          stats: { totalArticles: 1 }
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
        home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'home', categories: [] },
        articles: {
          title: '文章',
          subtitle: '文章入口',
          template: 'articles',
          categories: [
            {
              name: '来源',
              icon: 'fas fa-pen',
              sites: [{ name: 'Source A', url: 'https://example.com', icon: 'fas fa-link', description: 'desc' }],
            },
          ],
        },
      };

      const pages = generateAllPagesHTML(config);
      const html = pages.articles;

      assert.ok(typeof html === 'string' && html.length > 0);
      assert.ok(html.includes('data-type="article"'), '文章条目卡片应为 data-type="article"（只读）');
      assert.ok(html.includes('site-card-meta'), '文章条目应展示日期/来源元信息');
      assert.ok(html.includes('Example Blog'));
      assert.ok(html.includes('2025-12-25'));
      assert.ok(html.includes('data-extension-shadow="true"'), '应保留隐藏的扩展写回结构');
      assert.ok(html.includes('data-search-exclude="true"'), '扩展影子结构应排除搜索索引');
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
