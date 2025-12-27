const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { loadHandlebarsTemplates, generateAllPagesHTML } = require('../src/generator.js');

test('首页（navigation 第一项）应使用 profile 覆盖 title/subtitle 显示', () => {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));

  try {
    loadHandlebarsTemplates();

    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [
        { id: 'bookmarks', name: '书签', icon: 'fas fa-bookmark' },
        { id: 'home', name: '首页', icon: 'fas fa-home' },
        { id: 'projects', name: '项目', icon: 'fas fa-project-diagram' },
      ],
      bookmarks: { title: '书签页标题', subtitle: '书签页副标题', template: 'bookmarks', categories: [] },
      home: { title: 'HOME_PAGE_TITLE', subtitle: 'HOME_PAGE_SUBTITLE', template: 'page', categories: [] },
      projects: { title: '项目页标题', subtitle: '项目页副标题', template: 'projects', categories: [] },
    };

    const pages = generateAllPagesHTML(config);

    assert.ok(typeof pages.bookmarks === 'string' && pages.bookmarks.length > 0);
    assert.ok(pages.bookmarks.includes('PROFILE_TITLE'));
    assert.ok(pages.bookmarks.includes('PROFILE_SUBTITLE'));
    assert.ok(pages.bookmarks.includes('data-editable="profile-title"'));
    assert.ok(pages.bookmarks.includes('data-editable="profile-subtitle"'));
    assert.ok(pages.bookmarks.includes('<h3'));
    assert.ok(!pages.bookmarks.includes('书签页标题'));
    assert.ok(!pages.bookmarks.includes('书签页副标题'));
    assert.ok(!pages.bookmarks.includes('data-editable="page-title"'));

    assert.ok(typeof pages.home === 'string' && pages.home.length > 0);
    assert.ok(pages.home.includes('HOME_PAGE_TITLE'));
    assert.ok(pages.home.includes('HOME_PAGE_SUBTITLE'));
    assert.ok(pages.home.includes('data-editable="page-title"'));
    assert.ok(pages.home.includes('data-editable="page-subtitle"'));
    assert.ok(pages.home.includes('<p class="subtitle"'));
    assert.ok(!pages.home.includes('PROFILE_TITLE'));

    assert.ok(typeof pages.projects === 'string' && pages.projects.length > 0);
    assert.ok(pages.projects.includes('项目页标题'));
    assert.ok(pages.projects.includes('项目页副标题'));
    assert.ok(pages.projects.includes('<p class="subtitle"'));
  } finally {
    process.chdir(originalCwd);
  }
});
