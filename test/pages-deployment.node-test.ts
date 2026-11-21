const test = require('node:test');
const assert = require('node:assert/strict');

const { deployPages } = require('../scripts/deploy-pages.ts');

function makeEnv() {
  return {
    GITHUB_REPOSITORY: 'fixture/navigation',
    GITHUB_SHA: 'fixture-sha',
    PAGES_ARTIFACT_ID: '456',
    GITHUB_TOKEN: 'fixture-github-token',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example.test/token',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-runtime-token',
  };
}

function makeFetch(responses) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const response = responses[Math.min(requests.length - 1, responses.length - 1)];
    return {
      ok: !response.status || (response.status >= 200 && response.status < 300),
      status: response.status || 200,
      json: async () => response.body,
    };
  };
  return { fetchImpl, requests };
}

test('Pages deployment：使用本次上传 ID 和 OIDC 直接发布，不再通过 Twirp 列举产物', async () => {
  const deployment = { id: 'deployment-123', page_url: 'https://example.test/navigation/' };
  const { fetchImpl, requests } = makeFetch([
    { body: { value: 'fixture-oidc-token' } },
    { body: deployment },
    { body: { status: 'deployment_in_progress' } },
    { body: { status: 'succeed' } },
  ]);
  const delays = [];

  const result = await deployPages(makeEnv(), fetchImpl, async (delay) => delays.push(delay));

  assert.deepEqual(result, deployment);
  assert.equal(requests.length, 4);
  assert.equal(requests[0].url, 'https://oidc.example.test/token');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer fixture-runtime-token');
  assert.equal(
    requests[1].url,
    'https://api.github.com/repos/fixture/navigation/pages/deployments'
  );
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer fixture-github-token');
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    artifact_id: 456,
    pages_build_version: 'fixture-sha',
    oidc_token: 'fixture-oidc-token',
  });
  assert.equal(requests[2].url, `${requests[1].url}/deployment-123`);
  assert.ok(requests.every((request) => !request.url.includes('twirp')));
  assert.deepEqual(delays, [5000, 5000]);
});

test('Pages deployment：OIDC 响应无效时不得创建部署', async () => {
  const { fetchImpl, requests } = makeFetch([{ body: {} }]);

  await assert.rejects(
    deployPages(makeEnv(), fetchImpl, async () => {}),
    /missing value/
  );
  assert.equal(requests.length, 1);
});

test('Pages deployment：创建请求失败时不盲目重试 POST', async () => {
  const { fetchImpl, requests } = makeFetch([
    { body: { value: 'fixture-oidc-token' } },
    { status: 403, body: { message: 'Forbidden' } },
  ]);

  await assert.rejects(
    deployPages(makeEnv(), fetchImpl, async () => {}),
    /creation failed: HTTP 403/
  );
  assert.equal(requests.length, 2);
});

test('Pages deployment：永久失败状态必须使工作流失败', async () => {
  const { fetchImpl, requests } = makeFetch([
    { body: { value: 'fixture-oidc-token' } },
    { body: { id: 'deployment-123' } },
    { body: { status: 'deployment_content_failed' } },
  ]);

  await assert.rejects(
    deployPages(makeEnv(), fetchImpl, async () => {}),
    /Pages deployment failed: deployment_content_failed/
  );
  assert.equal(requests.length, 3);
});

test('Pages deployment：状态读取异常时取消未完成部署并保留原错误', async () => {
  const { fetchImpl, requests } = makeFetch([
    { body: { value: 'fixture-oidc-token' } },
    { body: { id: 'deployment-123' } },
    { status: 503, body: {} },
    { status: 204 },
  ]);

  await assert.rejects(
    deployPages(makeEnv(), fetchImpl, async () => {}),
    /status failed: HTTP 503/
  );
  assert.equal(requests.length, 4);
  assert.match(requests[3].url, /\/deployment-123\/cancel$/);
  assert.equal(requests[3].options.method, 'POST');
});

test('Pages deployment：长时间无终态时有上限地取消并失败', async () => {
  const { fetchImpl, requests } = makeFetch([
    { body: { value: 'fixture-oidc-token' } },
    { body: { id: 'deployment-123' } },
    { body: { status: 'deployment_in_progress' } },
  ]);
  const delays = [];

  await assert.rejects(
    deployPages(makeEnv(), fetchImpl, async (delay) => delays.push(delay)),
    /timed out after 120 status checks/
  );
  assert.equal(delays.length, 120);
  assert.equal(requests.length, 123);
  assert.match(requests[122].url, /\/cancel$/);
});

test('Pages deployment：未返回部署 ID 时按官方协议使用构建 SHA 查询', async () => {
  const { fetchImpl, requests } = makeFetch([
    { body: { value: 'fixture-oidc-token' } },
    { body: { page_url: 'https://example.test/navigation/' } },
    { body: { status: 'succeed' } },
  ]);

  await deployPages(makeEnv(), fetchImpl, async () => {});
  assert.match(requests[2].url, /\/fixture-sha$/);
});

test('Pages deployment：慢响应耗尽总时限时提前取消，不能等到 runner 硬超时', async () => {
  let clock = 0;
  const fixture = makeFetch([
    { body: { value: 'fixture-oidc-token' } },
    { body: { id: 'deployment-123' } },
    { body: { status: 'deployment_in_progress' } },
  ]);
  const fetchImpl = async (url, options) => {
    const response = await fixture.fetchImpl(url, options);
    if (url.endsWith('/deployment-123')) clock += 9000;
    return response;
  };

  await assert.rejects(
    deployPages(
      makeEnv(),
      fetchImpl,
      async (milliseconds) => {
        clock += milliseconds;
      },
      () => clock
    ),
    /10 minute total deadline/
  );
  assert.equal(fixture.requests.length, 46);
  assert.match(fixture.requests[45].url, /\/cancel$/);
});

test('Pages deployment：中断信号后取消部署，取消请求不能沿用已中断的 signal', async () => {
  const controller = new AbortController();
  const error = new Error('Fixture interruption');
  const { fetchImpl, requests } = makeFetch([
    { body: { value: 'fixture-oidc-token' } },
    { body: { id: 'deployment-123' } },
    { status: 204 },
  ]);

  await assert.rejects(
    deployPages(
      makeEnv(),
      fetchImpl,
      async () => controller.abort(error),
      Date.now,
      controller.signal
    ),
    (actual) => actual === error
  );
  assert.equal(requests.length, 3);
  assert.match(requests[2].url, /\/cancel$/);
  assert.equal(requests[2].options.signal.aborted, false);
});

test('Pages deployment：拒绝无效的上传产物 ID', async () => {
  const env = makeEnv();
  env.PAGES_ARTIFACT_ID = 'invalid';
  const { fetchImpl, requests } = makeFetch([]);

  await assert.rejects(
    deployPages(env, fetchImpl, async () => {}),
    /positive safe integer/
  );
  assert.equal(requests.length, 0);
});
