const test = require('node:test');
const assert = require('node:assert/strict');
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

test('P1-2：分类 slug 应稳定且可去重', () => {
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
          { name: '含 空格/特殊#字符', icon: 'fas fa-tag', sites: [] },
        ],
      },
    };

    const { data } = preparePageData('home', config);
    const slugs = data.categories.map((category) => category.slug);

    assert.deepEqual(slugs, ['重复-分类', '重复-分类-2', '含-空格-特殊-字符']);
  });
});
