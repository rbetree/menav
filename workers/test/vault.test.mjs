import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackend } from './helpers.mjs';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

/** 私密区走独立 Host 分流；测试里把 VAULT_HOST 指向 127.0.0.1。 */
function vaultBackend(options = {}) {
  return createBackend({
    ...options,
    bindings: {
      VAULT_HOST: '127.0.0.1',
      VAULT_PASSWORD: 'correct-horse',
      VAULT_SECRET: 'test-secret',
      ...options.bindings,
    },
  });
}

async function post(app, path, fields, headers = {}) {
  const response = await app.request(
    'POST',
    path,
    new URLSearchParams(fields).toString(),
    { ...FORM, ...headers },
    { redirect: 'manual' }
  );
  return {
    status: response.status,
    headers: response.headers,
    text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
  };
}

function sessionCookie(response) {
  const raw = response.headers.get('set-cookie') ?? '';
  const match = raw.match(/menav_vault=([^;]+)/);
  return match ? `menav_vault=${match[1]}` : '';
}

test('未配置密码时私密区整体拒绝访问', async (t) => {
  const app = await createBackend({ bindings: { VAULT_HOST: '127.0.0.1' } });
  t.after(() => app.dispose());
  const page = await app.request('GET', '/');
  assert.equal(page.status, 503);
  assert.match(page.data, /尚未配置/);
});

test('未登录只显示登录页，登录后按分类渲染条目', async (t) => {
  const app = await vaultBackend();
  t.after(() => app.dispose());

  const anonymous = await app.request('GET', '/');
  assert.equal(anonymous.status, 200);
  assert.match(anonymous.data, /请输入访问密码/);
  assert.doesNotMatch(anonymous.data, /订阅地址/);
  assert.equal(anonymous.headers.get('cache-control'), 'no-store');
  assert.match(anonymous.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.match(anonymous.headers.get('content-security-policy') ?? '', /connect-src 'self'/);

  // GET /login 兜底重定向：登录页渲染在 POST 响应里，刷新 /login 不应 404。
  const loginRedirect = await app.request('GET', '/login', undefined, {}, { redirect: 'manual' });
  assert.equal(loginRedirect.status, 302);
  assert.equal(loginRedirect.headers.get('location'), '/');

  const login = await post(app, '/login', { password: 'correct-horse' });
  assert.equal(login.status, 200);
  assert.match(login.text, /退出/);
  const cookie = sessionCookie(login);
  assert.ok(cookie, '登录后应写入会话 Cookie');
  assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/);
  assert.match(login.headers.get('set-cookie') ?? '', /Secure/);
  assert.match(login.headers.get('set-cookie') ?? '', /SameSite=Lax/);

  const created = await post(
    app,
    '/items',
    {
      kind: 'link',
      category: '订阅',
      title: '主订阅地址',
      url: 'https://example.com/sub?token=abc',
      note: '机场订阅',
    },
    { cookie }
  );
  assert.equal(created.status, 303);

  const page = await app.request('GET', '/', undefined, { cookie });
  assert.equal(page.status, 200);
  assert.match(page.data, /订阅 · 1/);
  assert.match(page.data, /主订阅地址/);
  assert.match(page.data, /https:\/\/example\.com\/sub\?token=abc/);

  const api = await app.request('GET', '/api/items', undefined, { cookie });
  assert.equal(api.status, 200);
  assert.equal(api.data.items.length, 1);
  assert.equal(api.data.items[0].title, '主订阅地址');
  assert.equal((await app.request('GET', '/api/items')).status, 401);
});

test('密码错误返回 401，且不写入会话', async (t) => {
  const app = await vaultBackend();
  t.after(() => app.dispose());
  const response = await post(app, '/login', { password: 'wrong' });
  assert.equal(response.status, 401);
  assert.match(response.text, /密码不正确/);
  assert.equal(sessionCookie(response), '');
});

test('伪造或过期的会话 Cookie 一律拒绝', async (t) => {
  const app = await vaultBackend();
  t.after(() => app.dispose());
  const forged = [
    'menav_vault=9999999999.deadbeef',
    'menav_vault=1.9999999999',
    'menav_vault=garbage',
  ];
  for (const cookie of forged) {
    const page = await app.request('GET', '/', undefined, { cookie });
    assert.equal(page.status, 200);
    assert.match(page.data, /请输入访问密码/, cookie);
    assert.equal((await app.request('GET', '/api/items', undefined, { cookie })).status, 401);
  }
});

test('同一 IP 连续失败 10 次后进入限速窗口', async (t) => {
  const app = await vaultBackend();
  t.after(() => app.dispose());
  for (let i = 0; i < 10; i++) {
    const response = await post(app, '/login', { password: 'wrong' });
    assert.equal(response.status, 401, `第 ${i + 1} 次`);
  }
  const blocked = await post(app, '/login', { password: 'correct-horse' });
  assert.equal(blocked.status, 429);
  assert.match(blocked.text, /尝试次数过多/);
  assert.equal(blocked.headers.get('retry-after'), '900');
});

test('未登录不能增删条目（登录接口接受任意来源）', async (t) => {
  const app = await vaultBackend();
  t.after(() => app.dispose());

  // 登录接口不再做 Origin 同源校验：跨站表单也应正常处理
  // （CSRF 防护依赖 SameSite=Lax Cookie + 密码门槛 + IP 限速）。
  const crossSite = await post(
    app,
    '/login',
    { password: 'correct-horse' },
    { origin: 'https://evil.example' }
  );
  assert.equal(crossSite.status, 200);
  assert.ok(sessionCookie(crossSite));

  const anonymous = await post(app, '/items', { kind: 'link', title: 'x', url: 'https://x.test' });
  assert.equal(anonymous.status, 303);
  assert.equal((await app.request('GET', '/api/items')).status, 401);

  const login = await post(app, '/login', { password: 'correct-horse' });
  const cookie = sessionCookie(login);
  const badUrl = await post(
    app,
    '/items',
    { kind: 'link', title: '坏链接', url: 'javascript:alert(1)' },
    { cookie }
  );
  assert.equal(badUrl.status, 400);
  assert.match(badUrl.text, /http:\/\/ 或 https:\/\//);
});

test('私密条目不会进入公开快照', async (t) => {
  const app = await vaultBackend();
  t.after(() => app.dispose());
  const login = await post(app, '/login', { password: 'correct-horse' });
  const cookie = sessionCookie(login);
  await post(
    app,
    '/items',
    { kind: 'link', category: '私密', title: '绝密订阅', url: 'https://secret.example/sub' },
    { cookie }
  );

  // 快照构建只读取 pages/categories/sites 与 snapshot_chunks；
  // 私密条目必须只存在于 vault_items，不能落到任何公开表。
  const db = await app.db();
  const siteLeak = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM sites WHERE name LIKE '%绝密%' OR url LIKE '%secret.example%'"
    )
    .first();
  assert.equal(siteLeak.n, 0);
  const categoryLeak = await db
    .prepare("SELECT COUNT(*) AS n FROM categories WHERE label LIKE '%私密%'")
    .first();
  assert.equal(categoryLeak.n, 0);
  const stored = await db.prepare('SELECT COUNT(*) AS n FROM vault_items').first();
  assert.equal(stored.n, 1);
});
