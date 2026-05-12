const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { preparePageData } = require('../src/lib/view-data/page-data.ts');

test('首页（navigation 第一项）应使用 profile 覆盖 title/subtitle 数据', () => {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));

  try {
    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [
        { id: 'bookmarks', name: '书签', icon: 'fas fa-bookmark' },
        { id: 'home', name: '首页', icon: 'fas fa-home' },
        { id: 'projects', name: '项目', icon: 'fas fa-project-diagram' },
      ],
      bookmarks: {
        title: '书签页标题',
        subtitle: '书签页副标题',
        template: 'bookmarks',
        categories: [],
      },
      home: {
        title: 'HOME_PAGE_TITLE',
        subtitle: 'HOME_PAGE_SUBTITLE',
        template: 'page',
        categories: [],
      },
      projects: {
        title: '项目页标题',
        subtitle: '项目页副标题',
        template: 'projects',
        categories: [],
      },
    };

    const bookmarks = preparePageData('bookmarks', config).data;
    const home = preparePageData('home', config).data;
    const projects = preparePageData('projects', config).data;

    assert.equal(bookmarks.title, 'PROFILE_TITLE');
    assert.equal(bookmarks.subtitle, 'PROFILE_SUBTITLE');
    assert.equal(bookmarks.isHome, true);

    assert.equal(home.title, 'HOME_PAGE_TITLE');
    assert.equal(home.subtitle, 'HOME_PAGE_SUBTITLE');
    assert.equal(home.isHome, false);

    assert.equal(projects.title, '项目页标题');
    assert.equal(projects.subtitle, '项目页副标题');
    assert.equal(projects.isHome, false);
  } finally {
    process.chdir(originalCwd);
  }
});
