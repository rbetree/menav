import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackend } from './helpers.mjs';

test('修改返回递增版本；过期标签页不能覆盖新编辑', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  const initial = await app.request('GET', '/api/state');
  const first = await app.request(
    'POST',
    '/api/pages',
    { label: '首页' },
    { 'if-match': initial.headers.get('etag') }
  );
  assert.equal(first.status, 201);
  const etag = first.headers.get('etag');
  assert.ok(etag && etag !== initial.headers.get('etag'));
  const stale = await app.request(
    'PUT',
    `/api/pages/${first.data.data.id}`,
    { label: '过期编辑' },
    { 'if-match': initial.headers.get('etag') }
  );
  assert.equal(stale.status, 409);
  const current = await app.request('GET', '/api/state');
  assert.equal(current.data[0].label, '首页');
  assert.equal(current.headers.get('etag'), etag);
});

test('同时提交同一版本只有一次成功，后提交不产生部分写入', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  const before = await app.request('GET', '/api/state');
  const results = await Promise.all(
    ['A', 'B'].map((label) =>
      app.request('POST', '/api/pages', { label }, { 'if-match': before.headers.get('etag') })
    )
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const state = await app.request('GET', '/api/state');
  assert.equal(state.data.length, 1);
  assert.equal(state.headers.get('etag'), '"1"');
});

test('四层分类可移动并级联删除；循环、跨页面和第五层被拒绝', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  const pageId = (await app.request('POST', '/api/pages', { label: '层级' })).data.data.id;
  const otherId = (await app.request('POST', '/api/pages', { label: '其他' })).data.data.id;
  const ids = [];
  for (let depth = 0; depth < 4; depth++) {
    const result = await app.request('POST', '/api/categories', {
      pageId,
      parentId: ids.at(-1) ?? null,
      label: `第${depth + 1}层`,
    });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    ids.push(result.data.data.id);
  }
  assert.equal(
    (await app.request('POST', '/api/categories', { pageId, parentId: ids[3], label: '第五层' }))
      .status,
    400
  );
  assert.equal(
    (await app.request('PUT', '/api/categories/' + ids[0], { parentId: ids[3] })).status,
    400
  );
  assert.equal(
    (
      await app.request('POST', '/api/categories', {
        pageId: otherId,
        parentId: ids[0],
        label: '跨页',
      })
    ).status,
    400
  );
  const site = await app.request('POST', '/api/sites', {
    categoryId: ids[3],
    name: '深层链接',
    url: 'https://example.com',
  });
  assert.equal(site.status, 201);
  assert.equal(
    (await app.request('PUT', '/api/categories/' + ids[2], { parentId: ids[0] })).status,
    200
  );
  const state = (await app.request('GET', '/api/state')).data;
  const moved = state[0].categories[0].categories.find((c) => c.id === ids[2]);
  assert.equal(moved.kind, 'subcategories');
  assert.equal(moved.categories[0].kind, 'groups');
  assert.equal(moved.categories[0].sites[0].name, '深层链接');
  assert.equal((await app.request('DELETE', '/api/categories/' + ids[0])).status, 409);
  assert.equal((await app.request('DELETE', '/api/categories/' + ids[0] + '?force=1')).status, 200);
  assert.equal((await app.request('GET', '/api/state')).data[0].categories.length, 0);
});

test('无效父页面和混合父级排序不写入；同级默认顺序连续并可反转', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  const bad = await app.request('POST', '/api/categories', {
    pageId: 'missing',
    label: '孤立分类',
  });
  assert.equal(bad.status, 404);
  const pageIds = [];
  for (const label of ['首页', '链接']) {
    const result = await app.request('POST', '/api/pages', { label });
    assert.equal(result.status, 201);
    pageIds.push(result.data.data.id);
  }
  let state = await app.request('GET', '/api/state');
  assert.deepEqual(
    state.data.map((p) => p.sort),
    [0, 1]
  );
  const categories = [];
  for (const pageId of pageIds) {
    const result = await app.request('POST', '/api/categories', { pageId, label: '分类' });
    categories.push(result.data.data.id);
  }
  const mixed = await app.request('POST', '/api/reorder', {
    type: 'categories',
    items: categories.map((id, sort) => ({ id, sort })),
  });
  assert.equal(mixed.status, 400);
  const reorder = await app.request('POST', '/api/reorder', {
    type: 'pages',
    items: pageIds.toReversed().map((id, sort) => ({ id, sort })),
  });
  assert.equal(reorder.status, 200);
  state = await app.request('GET', '/api/state');
  assert.deepEqual(
    state.data.map((p) => p.label),
    ['链接', '首页']
  );
  const invalid = await app.request('POST', '/api/reorder', {
    type: 'pages',
    items: [{ id: pageIds[0] }],
  });
  assert.equal(invalid.status, 400);
});

test('站点编辑使用 D1 的协议白名单，危险协议始终拒绝', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  const seed = await app.request('POST', '/api/seed', {
    settings: {
      site: JSON.stringify({ security: { allowedSchemes: ['https', 'obsidian', 'javascript'] } }),
    },
    pages: [{ id: 'home', label: '首页', categories: [{ label: '工具' }] }],
  });
  assert.equal(seed.status, 200);
  const categoryId = (await app.request('GET', '/api/state')).data[0].categories[0].id;
  const created = await app.request('POST', '/api/sites', {
    categoryId,
    name: '笔记',
    url: 'obsidian://open?vault=notes',
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.data.id;
  assert.equal(
    (await app.request('PUT', '/api/sites/' + id, { url: 'obsidian://open?vault=work' })).status,
    200
  );
  assert.equal(
    (await app.request('PUT', '/api/sites/' + id, { url: 'javascript:alert(1)' })).status,
    400
  );
  assert.equal(
    (await app.request('PUT', '/api/sites/' + id, { url: 'http://example.com' })).status,
    400
  );
  assert.equal(
    (await app.request('GET', '/api/state')).data[0].categories[0].sites[0].url,
    'obsidian://open?vault=work'
  );
});
