import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackend } from './helpers.mjs';

async function seedSite(app, site) {
  await app.request('POST', '/api/seed?reset=1', {
    pages: [{ id: 'home', label: '首页' }],
    settings: { site: JSON.stringify(site) },
  });
}

test('站点配置支持分区块更新并保留未提交字段', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  await seedSite(app, { title: '旧标题', description: '说明', theme: { mode: 'dark' } });
  const r = await app.request('PUT', '/api/settings/site', { title: '新标题' });
  assert.equal(r.status, 200);
  const site = JSON.parse((await app.request('GET', '/api/settings')).data.site);
  assert.equal(site.title, '新标题');
  assert.equal(site.description, '说明');
  assert.deepEqual(site.theme, { mode: 'dark' });
});

test('站点配置整体校验:非法值被拒绝且不写入', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  await seedSite(app, { title: 'T' });
  const bad = await app.request('PUT', '/api/settings/site', { theme: { mode: 'rainbow' } });
  assert.equal(bad.status, 400);
  assert.equal(JSON.parse((await app.request('GET', '/api/settings')).data.site).title, 'T');
});

test('站点配置忽略 navigation 并校验 favicon 资源', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  await seedSite(app, { title: 'T' });
  const ok = await app.request('PUT', '/api/settings/site', {
    title: 'T2',
    navigation: [{ id: 'x', name: 'x' }],
  });
  assert.equal(ok.status, 200);
  const site = JSON.parse((await app.request('GET', '/api/settings')).data.site);
  assert.equal(site.title, 'T2');
  assert.equal(site.navigation, undefined);
  const badFavicon = await app.request('PUT', '/api/settings/site', { favicon: 'not-there.png' });
  assert.equal(badFavicon.status, 400);
});

test('站点配置写入遵循版本并发控制', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  await seedSite(app, { title: 'T' });
  const stale = (await app.request('GET', '/api/state')).headers.get('etag');
  assert.ok(stale);
  const first = await app.request('PUT', '/api/settings/site', { title: 'T2' }, { 'if-match': stale });
  assert.equal(first.status, 200);
  const conflict = await app.request(
    'PUT',
    '/api/settings/site',
    { title: 'T3' },
    { 'if-match': stale }
  );
  assert.equal(conflict.status, 409);
});

test('分类与站点 metadata 可经 PUT 更新', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  await app.request('POST', '/api/seed?reset=1', {
    pages: [
      {
        id: 'home',
        label: '首页',
        categories: [{ label: '分类', sites: [{ name: 'A', url: 'https://a.com' }] }],
      },
    ],
  });
  const state = await app.request('GET', '/api/state');
  const cat = state.data[0].categories[0];
  const site = cat.sites[0];
  assert.equal(
    (await app.request('PUT', '/api/categories/' + cat.id, { metadata: { icon: 'fas fa-star' } }))
      .status,
    200
  );
  assert.equal(
    (
      await app.request('PUT', '/api/sites/' + site.id, {
        metadata: { forceIconMode: 'manual' },
      })
    ).status,
    200
  );
  const after = await app.request('GET', '/api/state');
  assert.equal(after.data[0].categories[0].metadata.icon, 'fas fa-star');
  assert.equal(after.data[0].categories[0].sites[0].metadata.forceIconMode, 'manual');
});
