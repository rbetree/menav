import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackend } from './helpers.mjs';

const bindings = {
  CF_ACCOUNT_ID: 'test-account',
  CF_PAGES_PROJECT: 'menav-test',
  CF_API_TOKEN: 'test-api-token',
  BUILD_TOKEN: 'test-build-token',
};

function cloudflare() {
  const deployments = [];
  const snapshots = new Map();
  let canonical;
  return {
    deployments,
    snapshots,
    loseNextResponse: false,
    rejectNext: false,
    succeed(id) {
      const d = deployments.find((d) => d.id === id);
      d.latest_stage = { name: 'deploy', status: 'success' };
      canonical = d;
    },
    fail(id) {
      deployments.find((d) => d.id === id).latest_stage = { name: 'build', status: 'failure' };
    },
    async fetch(request) {
      const url = new URL(request.url);
      if (url.hostname === 'api.cloudflare.com') {
        assert.equal(request.headers.get('authorization'), 'Bearer test-api-token');
        let result;
        if (request.method === 'POST') {
          if (this.rejectNext) {
            this.rejectNext = false;
            return Response.json({ success: false }, { status: 403 });
          }
          const form = await request.formData();
          const id = 'deployment-' + (deployments.length + 1);
          result = {
            id,
            url: `https://${id}.menav-test.pages.dev`,
            environment: 'production',
            deployment_trigger: { metadata: { commit_message: form.get('commit_message') } },
            latest_stage: { name: 'build', status: 'active' },
          };
          deployments.push(result);
          if (this.loseNextResponse) {
            this.loseNextResponse = false;
            return Response.json({ success: false }, { status: 502 });
          }
        } else if (url.pathname.endsWith('/deployments')) result = deployments.toReversed();
        else if (/\/deployments\//.test(url.pathname))
          result = deployments.find((d) => url.pathname.endsWith('/' + d.id));
        else result = { canonical_deployment: canonical };
        return Response.json({ success: true, result });
      }
      const id = url.hostname.split('.')[0];
      if (url.pathname === '/menav-build.json' && snapshots.has(id)) {
        const snapshot = snapshots.get(id);
        return Response.json({
          publicationId: snapshot.publicationId,
          revision: snapshot.revision,
        });
      }
      return new Response('not found', { status: 404 });
    },
  };
}

test('仅真实部署成功才推进已发布版本，构建期间的新编辑仍待发布', async (t) => {
  const cf = cloudflare();
  const app = await createBackend({ bindings, outboundService: (req) => cf.fetch(req) });
  t.after(() => app.dispose());
  await app.request('POST', '/api/pages', { label: '第一版' });
  const results = await Promise.all([
    app.request('POST', '/api/rebuild'),
    app.request('POST', '/api/rebuild'),
  ]);
  assert.ok(
    results.every((r) => r.status === 200),
    JSON.stringify(results.map((r) => r.data))
  );
  assert.equal(cf.deployments.length, 1);
  const status = await app.request('GET', '/api/publish-status');
  assert.equal(status.data.publishedRevision, 0);
  assert.equal(status.data.job.status, 'building');
  const deploy = cf.deployments[0];
  const denied = await app.request('GET', '/build/snapshot?url=' + encodeURIComponent(deploy.url));
  assert.equal(denied.status, 403);
  const snapshot = await app.request(
    'GET',
    '/build/snapshot?url=' + encodeURIComponent(deploy.url),
    undefined,
    { authorization: 'Bearer test-build-token' }
  );
  assert.equal(snapshot.status, 200, JSON.stringify(snapshot.data));
  assert.equal(snapshot.data.pages[0].label, '第一版');
  cf.snapshots.set(deploy.id, snapshot.data);
  await app.request('POST', '/api/pages', { label: '第二版' });
  const frozen = await app.request(
    'GET',
    '/build/snapshot?url=' + encodeURIComponent(deploy.url),
    undefined,
    { authorization: 'Bearer test-build-token' }
  );
  assert.equal(frozen.data.pages.length, 1);
  cf.succeed(deploy.id);
  const published = await app.request('GET', '/api/publish-status');
  assert.equal(published.data.publishedRevision, 1);
  assert.equal(published.data.revision, 2);
  assert.equal(published.data.pending, true);
  const next = await app.request('POST', '/api/rebuild');
  assert.equal(next.status, 200);
  assert.equal(cf.deployments.length, 2);
});

test('Pages 已受理但响应丢失时构建端可恢复同一快照，不重复触发', async (t) => {
  const cf = cloudflare();
  cf.loseNextResponse = true;
  const app = await createBackend({ bindings, outboundService: (req) => cf.fetch(req) });
  t.after(() => app.dispose());
  await app.request('POST', '/api/pages', { label: '可恢复' });
  const dispatch = await app.request('POST', '/api/rebuild');
  assert.equal(dispatch.status, 502);
  assert.equal(cf.deployments.length, 1);
  const retry = await app.request('POST', '/api/rebuild');
  assert.equal(retry.status, 200);
  assert.equal(cf.deployments.length, 1);
  const snapshot = await app.request(
    'GET',
    '/build/snapshot?url=' + encodeURIComponent(cf.deployments[0].url),
    undefined,
    { authorization: 'Bearer test-build-token' }
  );
  assert.equal(snapshot.status, 200, JSON.stringify(snapshot.data));
  assert.equal(snapshot.data.pages[0].label, '可恢复');
  assert.equal((await app.request('GET', '/api/publish-status')).data.job.status, 'building');
});

test('API 明确拒绝和产物版本不匹配均保留待发布内容', async (t) => {
  const cf = cloudflare();
  cf.rejectNext = true;
  const app = await createBackend({ bindings, outboundService: (req) => cf.fetch(req) });
  t.after(() => app.dispose());
  await app.request('POST', '/api/pages', { label: '版本检查' });
  assert.equal((await app.request('POST', '/api/rebuild')).status, 502);
  assert.equal((await app.request('GET', '/api/publish-status')).data.job.status, 'failed');
  assert.equal((await app.request('POST', '/api/rebuild')).status, 200);
  cf.snapshots.set(cf.deployments[0].id, { publicationId: 'wrong', revision: 1 });
  cf.succeed(cf.deployments[0].id);
  const status = await app.request('GET', '/api/publish-status');
  assert.equal(status.data.publishedRevision, 0);
  assert.equal(status.data.pending, true);
  assert.equal(status.data.job.status, 'failed');
});

test('部署失败保留未发布版本并可重试，未接线不会假报成功', async (t) => {
  const cf = cloudflare();
  const app = await createBackend({ bindings, outboundService: (req) => cf.fetch(req) });
  t.after(() => app.dispose());
  await app.request('POST', '/api/pages', { label: '待发布' });
  await app.request('POST', '/api/rebuild');
  assert.equal(cf.deployments.length, 1);
  cf.fail(cf.deployments[0].id);
  const failed = await app.request('GET', '/api/publish-status');
  assert.equal(failed.data.job.status, 'failed');
  assert.equal(failed.data.publishedRevision, 0);
  await app.request('POST', '/api/rebuild');
  assert.equal(cf.deployments.length, 2);
  const local = await createBackend();
  t.after(() => local.dispose());
  await local.request('POST', '/api/pages', { label: '本地' });
  const unwired = await local.request('POST', '/api/rebuild');
  assert.equal(unwired.status, 501);
  assert.equal((await local.request('GET', '/api/publish-status')).data.pending, true);
});
