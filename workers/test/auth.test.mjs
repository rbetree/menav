import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createBackend } from './helpers.mjs';

test('生产缺少 Access 配置时拒绝后台', async (t) => {
  const app = await createBackend({ bindings: { ALLOW_INSECURE_DEV: '' } });
  t.after(() => app.dispose());
  for (const path of ['/', '/api/state', '/api/settings', '/api/export']) {
    const response = await app.request('GET', path);
    assert.equal(response.status, 503, path);
    assert.equal(response.headers.get('cache-control'), 'no-store', path);
  }
  const asset = await app.request('GET', '/app.js');
  assert.equal(asset.status, 503);
  assert.equal(asset.headers.get('cache-control'), 'private, max-age=300');
  assert.equal((await app.request('POST', '/api/pages', { label: '未授权' })).status, 503);
});

test('ALLOW_INSECURE_DEV 只在 Access 变量都为空时生效', async (t) => {
  for (const bindings of [
    { TEAM_DOMAIN: 'https://team.cloudflareaccess.com', ALLOW_INSECURE_DEV: '1' },
    { POLICY_AUD: 'menav-admin', ALLOW_INSECURE_DEV: '1' },
  ]) {
    const app = await createBackend({ bindings });
    t.after(() => app.dispose());
    assert.equal((await app.request('GET', '/api/state')).status, 503, JSON.stringify(bindings));
  }

  const local = await createBackend({ bindings: { ALLOW_INSECURE_DEV: '1' } });
  t.after(() => local.dispose());
  assert.equal((await local.request('GET', '/api/state')).status, 200);
});

test('Access 校验签名、受众与过期时间；构建 Token 不能写管理 API', async (t) => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  let certificates = 0;
  const app = await createBackend({
    bindings: {
      TEAM_DOMAIN: 'https://menav-test.cloudflareaccess.com',
      POLICY_AUD: 'menav-admin',
      ALLOW_INSECURE_DEV: '',
      BUILD_TOKEN: 'build-only',
    },
    outboundService: (request) => {
      assert.equal(new URL(request.url).pathname, '/cdn-cgi/access/certs');
      certificates++;
      return Response.json({ keys: [jwk] });
    },
  });
  t.after(() => app.dispose());
  const token = (audience, expiration, payload = {}) =>
    new SignJWT({ email: 'admin@example.com', sub: 'admin-user', ...payload })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('https://menav-test.cloudflareaccess.com')
      .setAudience(audience)
      .setExpirationTime(expiration)
      .sign(privateKey);
  const unauthorized = await app.request('GET', '/api/state');
  assert.equal(unauthorized.status, 403);
  assert.equal(unauthorized.headers.get('cache-control'), 'no-store');
  assert.equal(
    (await app.request('GET', '/api/state', undefined, { 'cf-access-jwt-assertion': 'forged' }))
      .status,
    403
  );
  assert.equal(
    (
      await app.request('GET', '/api/state', undefined, {
        'cf-access-jwt-assertion': await token('wrong', '1h'),
      })
    ).status,
    403
  );
  assert.equal(
    (
      await app.request('GET', '/api/state', undefined, {
        'cf-access-jwt-assertion': await token('menav-admin', 1),
      })
    ).status,
    403
  );
  // 服务令牌与身份令牌同签名同受众，但 sub 为空且带 common_name。
  for (const payload of [
    { sub: '' },
    { sub: '', common_name: 'e367826f93b8d71185e03fe518aff3b4.access' },
    { common_name: 'e367826f93b8d71185e03fe518aff3b4.access' },
  ]) {
    const response = await app.request('GET', '/api/state', undefined, {
      'cf-access-jwt-assertion': await token('menav-admin', '1h', payload),
    });
    assert.equal(response.status, 403, JSON.stringify(payload));
  }
  const valid = await token('menav-admin', '1h');
  for (const path of ['/', '/index.html', '/api/state', '/api/settings', '/api/export']) {
    const response = await app.request('GET', path, undefined, {
      'cf-access-jwt-assertion': valid,
    });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cache-control'), 'no-store', path);
  }
  for (const path of ['/app.js', '/style.css']) {
    const response = await app.request('GET', path, undefined, {
      'cf-access-jwt-assertion': valid,
    });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cache-control'), 'private, max-age=300', path);
  }
  assert.equal(
    (
      await app.request(
        'POST',
        '/api/pages',
        { label: '越权' },
        { authorization: 'Bearer build-only' }
      )
    ).status,
    403
  );
  assert.equal(certificates, 1);
});
