const test = require('node:test');
const assert = require('node:assert/strict');
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
    assert.ok(pages.friends.includes('site-card-friend'));
    assert.ok(!pages.friends.includes('category-header'), 'friends 不应输出分类标题结构');

    assert.ok(typeof pages.articles === 'string' && pages.articles.length > 0);
    assert.ok(pages.articles.includes('page-template-articles'));
    assert.ok(pages.articles.includes('flat-sites-grid'));
    assert.ok(pages.articles.includes('site-card-article'));
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

