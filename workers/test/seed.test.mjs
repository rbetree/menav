import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackend } from './helpers.mjs';

test('种子保留页面正文、分类元数据和站点附加字段，页面返回排序值', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  const seed = {
    settings: { site: JSON.stringify({ title: '我的导航', theme: { mode: 'light' } }) },
    pages: [
      {
        id: 'about',
        label: '关于',
        template: 'content',
        metadata: {
          title: '完整标题',
          subtitle: '副标题',
          content: { file: 'content/about.md', markdown: '# 正文' },
        },
        navigation: { icon: 'fas fa-info' },
        categories: [
          {
            label: '分类',
            foldable: true,
            metadata: { icon: 'fas fa-star', slug: 'custom' },
            sites: [
              {
                name: 'Example',
                url: 'https://example.com',
                metadata: { forceIconMode: 'manual', style: 'repo' },
              },
            ],
          },
        ],
      },
    ],
  };
  const result = await app.request('POST', '/api/seed', seed);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const state = await app.request('GET', '/api/state');
  const page = state.data[0];
  assert.equal(page.sort, 0);
  assert.equal(page.metadata.content.markdown, '# 正文');
  assert.equal(page.metadata.title, '完整标题');
  assert.equal(page.categories[0].metadata.icon, 'fas fa-star');
  assert.equal(page.categories[0].sites[0].metadata.forceIconMode, 'manual');
});

test('种子导入整体校验并回滚，不因后段无效数据丢失原内容', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  await app.request('POST', '/api/seed', { pages: [{ id: 'keep', label: '保留' }] });
  const before = await app.request('GET', '/api/state');
  const invalid = await app.request('POST', '/api/seed?reset=1', {
    pages: Array.from({ length: 150 }, (_, i) => ({
      id: i === 149 ? 'p0' : `p${i}`,
      label: `页面${i}`,
    })),
  });
  assert.equal(invalid.status, 400);
  const after = await app.request('GET', '/api/state');
  assert.deepEqual(after.data, before.data);
  assert.equal(after.headers.get('etag'), before.headers.get('etag'));
});

test('数千条种子在一个事务内导入，配置替换不残留旧键', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  const result = await app.request('POST', '/api/seed', {
    settings: { site: '{}', externalData: '{}' },
    pages: [
      {
        id: 'home',
        label: '首页',
        categories: [
          {
            label: '工具',
            sites: Array.from({ length: 1200 }, (_, i) => ({
              name: `站点${i}`,
              url: `https://example.com/${i}`,
            })),
          },
        ],
      },
    ],
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const state = await app.request('GET', '/api/state');
  assert.equal(state.data[0].categories[0].sites.length, 1200);
  const reset = await app.request('POST', '/api/seed?reset=1', {
    settings: { site: '{}' },
    pages: [{ id: 'new', label: '新首页' }],
  });
  assert.equal(reset.status, 200);
  const settings = await app.request('GET', '/api/settings');
  assert.equal(settings.status, 200);
  assert.deepEqual(settings.data, { site: '{}' });
});

test('分类 metadata 不能夹带结构字段或无效图标，失败不覆盖已有内容', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  await app.request('POST', '/api/pages', { label: '保留' });
  const before = await app.request('GET', '/api/export');
  for (const metadata of [
    { sites: [{ name: '绕过检查', url: 'javascript:alert(1)' }] },
    { icon: 42 },
    { foldable: false },
    { categories: [] },
  ]) {
    const result = await app.request('POST', '/api/seed?reset=1', {
      pages: [{ id: 'home', categories: [{ label: '分类', metadata }] }],
    });
    assert.equal(result.status, 400, JSON.stringify(metadata));
  }
  assert.deepEqual((await app.request('GET', '/api/export')).data, before.data);
});
