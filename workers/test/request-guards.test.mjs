import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackend } from './helpers.mjs';

async function seedOneSite(app) {
  await app.request('POST', '/api/seed?reset=1', {
    pages: [
      {
        id: 'home',
        label: '首页',
        categories: [{ label: 'C', sites: [{ name: 'A', url: 'https://a.com' }] }],
      },
    ],
  });
  const state = await app.request('GET', '/api/state');
  return state.data[0].categories[0].sites[0];
}

test('浏览器发起的 DELETE（无 Content-Type）不被 CSRF 中间件拦截', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  const site = await seedOneSite(app);
  const origin = new URL(app.url).origin;
  const res = await app.request('DELETE', '/api/sites/' + site.id, undefined, {
    origin,
    'sec-fetch-site': 'same-origin',
  });
  assert.equal(res.status, 200);
});

test('浏览器发起的跨站写请求被拒绝', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  await seedOneSite(app);
  const crossSite = await app.request(
    'POST',
    '/api/pages',
    { label: 'X' },
    { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }
  );
  assert.equal(crossSite.status, 403);
  // 表单可伪造的简单类型也不放行
  const formType = await app.request(
    'POST',
    '/api/pages',
    { label: 'Y' },
    { origin: new URL(app.url).origin, 'content-type': 'text/plain' }
  );
  assert.equal(formType.status, 415);
});

test('If-Match 接受弱验证器 W/"n" 与通配符，过期版本仍冲突', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  await seedOneSite(app);
  const etag = (await app.request('GET', '/api/state')).headers.get('etag');
  assert.ok(etag);
  const weak = await app.request(
    'PUT',
    '/api/pages/home',
    { label: '改名' },
    { 'if-match': 'W/' + etag }
  );
  assert.equal(weak.status, 200);
  const wildcard = await app.request(
    'PUT',
    '/api/pages/home',
    { label: '再改' },
    { 'if-match': '*' }
  );
  assert.equal(wildcard.status, 200);
  const stale = await app.request(
    'PUT',
    '/api/pages/home',
    { label: '冲突' },
    { 'if-match': '"999"' }
  );
  assert.equal(stale.status, 409);
});
