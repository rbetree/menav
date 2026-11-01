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
  const token = (audience, expiration) =>
    new SignJWT({ email: 'admin@example.com' })
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
