const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { prepareSiteRenderData } = require('../src/lib/view-data/render-data.ts');

function withRepoRoot(fn) {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));
  try {
    return fn();
  } finally {
    process.chdir(originalCwd);
  }
}

test('P1-2：子菜单锚点应使用分类 slug（href + data-category-id）', () => {
  withRepoRoot(() => {
    const config = {
      site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
      profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
      social: [],
      navigation: [{ id: 'home', name: '首页', icon: 'fas fa-home' }],
      home: {
        title: 'HOME',
        subtitle: 'HOME_SUB',
        template: 'page',
        categories: [
          { name: '重复 分类', icon: 'fas fa-tag', sites: [] },
          { name: '重复 分类', icon: 'fas fa-tag', sites: [] },
        ],
      },
    };

    const renderData = prepareSiteRenderData(config);
    const navItem = renderData.navigationData[0];

    assert.equal(navItem.id, 'home');
    assert.ok(Array.isArray(navItem.submenu), '应准备子菜单项');
    assert.equal(navItem.submenu[0].slug, '重复-分类');
    assert.equal(navItem.submenu[1].slug, '重复-分类-2');
  });
});
