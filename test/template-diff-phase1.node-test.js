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

test('friends/articles：应恢复分类展示（扩展仍以 data-* 结构为准）', () => {
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
      home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'page', categories: [] },
      friends: {
        title: '友情链接',
        subtitle: '朋友们',
        template: 'page',
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
    assert.ok(pages.friends.includes('sites-grid'));
    assert.ok(pages.friends.includes('class="site-card'), 'friends 应使用普通 site-card 样式（图标在左，标题在右）');
    assert.ok(!pages.friends.includes('site-card-friend'), 'friends 不应使用 site-card-friend 变体样式');
    assert.ok(pages.friends.includes('category-header'), 'friends 应输出分类标题结构');

    assert.ok(typeof pages.articles === 'string' && pages.articles.length > 0);
    assert.ok(pages.articles.includes('page-template-articles'));
    assert.ok(pages.articles.includes('sites-grid'));
    assert.ok(pages.articles.includes('class="site-card'), 'articles 应使用普通 site-card 样式（图标在左，标题在右）');
    assert.ok(!pages.articles.includes('site-card-article'), 'articles 不应使用 site-card-article 变体样式');
    assert.ok(pages.articles.includes('category-header'), 'articles 应输出分类标题结构');
  });
});

test('friends/articles：页面配置使用顶层 sites 时应自动映射为分类容器', () => {
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
      home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'page', categories: [] },
      friends: {
        title: '友情链接',
        subtitle: '朋友们',
        template: 'page',
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
    assert.ok(pages.friends.includes('sites-grid'));
    assert.ok(pages.friends.includes('class="site-card'), 'friends 应使用普通 site-card 样式（图标在左，标题在右）');
    assert.ok(!pages.friends.includes('site-card-friend'), 'friends 不应使用 site-card-friend 变体样式');
    assert.ok(pages.friends.includes('category-header'), 'friends 应输出分类标题结构');

    assert.ok(typeof pages.articles === 'string' && pages.articles.length > 0);
    assert.ok(pages.articles.includes('page-template-articles'));
    assert.ok(pages.articles.includes('sites-grid'));
    assert.ok(pages.articles.includes('class="site-card'), 'articles 应使用普通 site-card 样式（图标在左，标题在右）');
    assert.ok(!pages.articles.includes('site-card-article'), 'articles 不应使用 site-card-article 变体样式');
    assert.ok(pages.articles.includes('category-header'), 'articles 应输出分类标题结构');
  });
});

test('缺少 friends 页面配置时：仍应渲染页面（标题回退为导航名称）', () => {
  withRepoRoot(() => {
    loadHandlebarsTemplates();

    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [
        { id: 'home', name: '首页', icon: 'fas fa-home' },
        { id: 'friends', name: '朋友', icon: 'fas fa-users' },
      ],
      home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'page', categories: [] },
      // 刻意不提供 friends 配置
    };

    const pages = generateAllPagesHTML(config);
    const html = pages.friends;

    assert.ok(typeof html === 'string' && html.length > 0);
    assert.ok(html.includes('page-template-friends'));
    assert.ok(html.includes('data-editable="page-title"'));
    assert.ok(html.includes('朋友'));
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
      home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'page', categories: [] },
      bookmarks: { title: '书签', subtitle: '书签页', template: 'bookmarks', categories: [] },
    };

    const pages = generateAllPagesHTML(config);
    const html = pages.bookmarks;

    assert.ok(typeof html === 'string' && html.length > 0);
    assert.ok(html.includes('page-updated-inline'));
    assert.ok(html.includes('update:'), '应显示 update: 前缀');
    assert.ok(html.includes('from:'), '应显示 from: 前缀');
    assert.ok(/update:\s*\d{4}-\d{2}-\d{2}/.test(html), '应显示 YYYY-MM-DD 日期');
    assert.ok(/from:\s*(git|mtime)/.test(html), '应显示来源（git|mtime）');
  });
});

test('projects：应输出代码仓库风格卡片（site-card-repo）', () => {
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
    assert.ok(html.includes('page-template-projects'), 'projects 应包含模板容器 class');
    assert.ok(html.includes('sites-grid'), 'projects 应包含网格容器（sites-grid）');
    assert.ok(html.includes('site-card-repo'), 'projects 应包含代码仓库风格卡片类');
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
              sourceUrl: 'https://example.com',
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
        home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'page', categories: [] },
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
      assert.match(
        html,
        /<section class="category category-level-1 category-readonly">[\s\S]*?来源[\s\S]*?Article A[\s\S]*?<\/section>/,
        '文章条目应按页面配置分类聚合展示'
      );
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
