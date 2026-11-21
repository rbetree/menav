const test = require('node:test');
const assert = require('node:assert/strict');

const { waitForPagesArtifact } = require('../scripts/wait-pages-artifact.ts');

function makeEnv() {
  return {
    GITHUB_REPOSITORY: 'fixture/navigation',
    GITHUB_RUN_ID: '123',
    PAGES_ARTIFACT_ID: '456',
    GITHUB_TOKEN: 'fixture-token',
    GITHUB_API_URL: 'https://api.github.com',
  };
}

function makeArtifact(overrides = {}) {
  return { id: 456, name: 'github-pages', expired: false, ...overrides };
}

function makeFetch(payloads, status = 200) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const payload = payloads[Math.min(requests.length - 1, payloads.length - 1)];
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
  };
  return { fetchImpl, requests };
}

test('Pages artifact：当前上传产物已可见时立即继续', async () => {
  const artifact = makeArtifact();
  const { fetchImpl, requests } = makeFetch([{ artifacts: [artifact] }]);
  const delays = [];

  const result = await waitForPagesArtifact(makeEnv(), fetchImpl, async (delay) =>
    delays.push(delay)
  );

  assert.deepEqual(result, artifact);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/repos\/fixture\/navigation\/actions\/runs\/123\/artifacts/);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer fixture-token');
  assert.equal(requests[0].options.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(requests[0].options.signal.aborted, false);
  assert.deepEqual(delays, []);
});

test('Pages artifact：元数据延迟可见时重试，忽略旧产物、错误名称和过期产物', async () => {
  const artifact = makeArtifact();
  const { fetchImpl, requests } = makeFetch([
    { artifacts: [] },
    {
      artifacts: [
        makeArtifact({ id: 455 }),
        makeArtifact({ name: 'other-artifact' }),
        makeArtifact({ expired: true }),
      ],
    },
    { artifacts: [artifact] },
  ]);
  const delays = [];

  const result = await waitForPagesArtifact(makeEnv(), fetchImpl, async (delay) =>
    delays.push(delay)
  );

  assert.deepEqual(result, artifact);
  assert.equal(requests.length, 3);
  assert.deepEqual(delays, [5000, 5000]);
});

test('Pages artifact：产物始终不可见时有上限地失败', async () => {
  const { fetchImpl, requests } = makeFetch([{ artifacts: [] }]);
  const delays = [];

  await assert.rejects(
    waitForPagesArtifact(makeEnv(), fetchImpl, async (delay) => delays.push(delay)),
    /did not become visible after 24 attempts/
  );

  assert.equal(requests.length, 24);
  assert.equal(delays.length, 23);
});

test('Pages artifact：权限错误立即失败，不能伪装成就绪', async () => {
  const { fetchImpl, requests } = makeFetch([{ message: 'Forbidden' }], 403);
  const delays = [];

  await assert.rejects(
    waitForPagesArtifact(makeEnv(), fetchImpl, async (delay) => delays.push(delay)),
    /HTTP 403/
  );

  assert.equal(requests.length, 1);
  assert.deepEqual(delays, []);
});

test('Pages artifact：不接受格式错误的元数据响应', async () => {
  const { fetchImpl } = makeFetch([{ total_count: 1 }]);

  await assert.rejects(
    waitForPagesArtifact(makeEnv(), fetchImpl, async () => {}),
    /Invalid artifact metadata response/
  );
});

for (const error of [
  new Error('Network request failed'),
  new DOMException('Request timed out', 'TimeoutError'),
]) {
  test(`Pages artifact：请求异常应向上传播（${error.name}）`, async () => {
    const delays = [];
    const fetchImpl = async () => {
      throw error;
    };

    await assert.rejects(
      waitForPagesArtifact(makeEnv(), fetchImpl, async (delay) => delays.push(delay)),
      (actual) => actual === error
    );
    assert.deepEqual(delays, []);
  });
}

test('Pages artifact：JSON 解析异常不能被当作空产物忽略', async () => {
  const error = new SyntaxError('Invalid JSON');
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw error;
    },
  });

  await assert.rejects(
    waitForPagesArtifact(makeEnv(), fetchImpl, async () => {}),
    (actual) => actual === error
  );
});

test('Pages artifact：缺少上传产物 ID 时在请求前失败', async () => {
  const env = makeEnv();
  delete env.PAGES_ARTIFACT_ID;
  const { fetchImpl, requests } = makeFetch([{ artifacts: [makeArtifact()] }]);

  await assert.rejects(
    waitForPagesArtifact(env, fetchImpl, async () => {}),
    /PAGES_ARTIFACT_ID is required/
  );
  assert.equal(requests.length, 0);
});
