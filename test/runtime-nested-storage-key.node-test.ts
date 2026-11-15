const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { getToggleStateKey } = require('../src/runtime/app/nested.ts');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function makeElement(dataset, pageId) {
  return {
    dataset,
    id: '',
    parentElement: null,
    closest: () => (pageId ? { id: pageId } : null),
  };
}

test('nested 折叠键：同名分类使用不同稳定 key 时不共享状态', () => {
  const first = makeElement(
    { type: 'category', level: '1', key: 'articles-0', name: '同名分类' },
    'articles'
  );
  const second = makeElement(
    { type: 'category', level: '1', key: 'articles-1', name: '同名分类' },
    'articles'
  );

  assert.notEqual(getToggleStateKey(first), getToggleStateKey(second));
});

test('nested 折叠键：缺少稳定 key 时按同级序号区分同名分类', () => {
  const parent = { children: [] };
  const first = {
    dataset: { type: 'category', level: '1', name: '同名分类' },
    id: '',
    parentElement: parent,
    closest: () => ({ id: 'bookmarks' }),
  };
  const second = {
    dataset: { type: 'category', level: '1', name: '同名分类' },
    id: '',
    parentElement: parent,
    closest: () => ({ id: 'bookmarks' }),
  };
  parent.children = [first, second];

  assert.notEqual(getToggleStateKey(first), getToggleStateKey(second));
});

test('nested 折叠键：不同页面的相同分类 key 互相隔离', () => {
  const first = makeElement({ type: 'category', level: '1', key: 'tools' }, 'bookmarks');
  const second = makeElement({ type: 'category', level: '1', key: 'tools' }, 'projects');

  assert.notEqual(getToggleStateKey(first), getToggleStateKey(second));
});

test('文章页分类：slug 优先、index 兜底，最新文章也有稳定键', () => {
  const pageContent = read('src/components/PageContent.astro');
  const categoryComponent = read('src/components/Category.astro');
  const groupComponent = read('src/components/Group.astro');

  assert.ok(pageContent.includes('articlesCategories.map((category, index) =>'));
  assert.ok(pageContent.includes('data-key={category.slug || `articles-${index}`}'));
  assert.ok(pageContent.includes('data-key="articles-latest"'));
  assert.ok(categoryComponent.includes('data-key={id}'));
  assert.ok(groupComponent.includes('data-key={group.slug || group.name}'));
});
