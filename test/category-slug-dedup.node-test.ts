const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { prepareTestPageData } = require('./helpers/site-model.ts');

function withRepoRoot(fn) {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));
  try {
    return fn();
  } finally {
    process.chdir(originalCwd);
  }
}

function makeConfig(categories) {
  return {
    site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
    profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
    social: [],
    navigation: [{ id: 'home', name: '首页', icon: 'fas fa-home' }],
    home: { title: 'HOME', subtitle: 'HOME_SUB', template: 'page', categories },
  };
}

test('P1-2：分类 slug 应稳定且可去重', () => {
  withRepoRoot(() => {
    const { data } = prepareTestPageData(
      'home',
      makeConfig([
        { name: '重复 分类', icon: 'fas fa-tag', sites: [] },
        { name: '重复 分类', icon: 'fas fa-tag', sites: [] },
        { name: '含 空格/特殊#字符', icon: 'fas fa-tag', sites: [] },
      ])
    );

    assert.deepEqual(
      data.categories.map((category) => category.slug),
      ['重复-分类', '重复-分类-2', '含-空格-特殊-字符']
    );
  });
});

test('P2-14：显式 slug 保留，自动生成避开同名显式值', () => {
  withRepoRoot(() => {
    const { data } = prepareTestPageData(
      'home',
      makeConfig([
        { name: 'Tools', icon: 'fas fa-tag', slug: 'tools', sites: [] },
        { name: 'Tools', icon: 'fas fa-tag', sites: [] },
        { name: 'Tools', icon: 'fas fa-tag', sites: [] },
      ])
    );

    assert.deepEqual(
      data.categories.map((category) => category.slug),
      ['tools', 'tools-2', 'tools-3']
    );
  });
});

test('P2-14：显式 slug 出现在自动项之后仍应保留', () => {
  withRepoRoot(() => {
    const { data } = prepareTestPageData(
      'home',
      makeConfig([
        { name: 'Tools', icon: 'fas fa-tag', sites: [] },
        { name: 'Tools', icon: 'fas fa-tag', slug: 'tools', sites: [] },
      ])
    );

    assert.deepEqual(
      data.categories.map((category) => category.slug),
      ['tools-2', 'tools']
    );
  });
});

test('P2-14：groups/subgroups 递归生成 slug 并全局去重', () => {
  withRepoRoot(() => {
    const { data } = prepareTestPageData(
      'home',
      makeConfig([
        {
          name: '分类',
          subcategories: [{ name: '子分类', sites: [] }],
          groups: [
            { name: '分组', sites: [] },
            { name: '分组', sites: [] },
          ],
          subgroups: [{ name: 'Custom', slug: 'custom', sites: [] }],
        },
      ])
    );

    const category = data.categories[0];
    assert.equal(category.slug, '分类');
    assert.equal(category.subcategories[0].slug, '子分类');
    assert.deepEqual(
      category.groups.map((group) => group.slug),
      ['分组', '分组-2']
    );
    assert.equal(category.subgroups[0].slug, 'custom');
  });
});

test('P2-14：自动 slug 应避开其他层级的显式值', () => {
  withRepoRoot(() => {
    const { data } = prepareTestPageData(
      'home',
      makeConfig([
        {
          name: '父级',
          groups: [{ name: 'Shared', sites: [] }],
          subgroups: [{ name: 'Shared', slug: 'shared', sites: [] }],
        },
      ])
    );

    const category = data.categories[0];
    assert.equal(category.groups[0].slug, 'shared-2');
    assert.equal(category.subgroups[0].slug, 'shared');
  });
});
