const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildD1ExecuteArgs,
  comparePublicationState,
  parseWranglerJson,
  runVerify,
} = require('../scripts/backend-verify.ts');

const silentLogger = { info() {}, warn() {}, error() {}, ok() {} };

function messages(result) {
  return result.checks.map((item) => `${item.level}:${item.message}`).join('\n');
}

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-verify-'));
  fs.mkdirSync(path.join(root, 'workers'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'workers', 'wrangler.jsonc'),
    JSON.stringify(
      {
        name: 'menav-backend',
        d1_databases: [{ binding: 'DB', database_name: 'menav-db', database_id: 'db-id' }],
        vars: {
          TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
          POLICY_AUD: 'aud',
          CF_ACCOUNT_ID: 'account-id',
          CF_PAGES_PROJECT: 'menav-web',
        },
      },
      null,
      2
    ),
    'utf8'
  );
  return root;
}

test('backend:verify 识别回滚导致的 Pages 与 D1 版本不一致', () => {
  const checks = comparePublicationState({
    project: { canonical_deployment: { id: 'deploy-old', url: 'https://old.menav.pages.dev' } },
    marker: { publicationId: 'job-old', revision: 1 },
    state: { revision: 3, published_revision: 3 },
    job: {
      job_id: 'job-new',
      revision: 3,
      status: 'published',
      deployment_id: 'deploy-new',
    },
  });
  const text = checks.map((item) => `${item.level}:${item.message}`).join('\n');
  assert.equal(
    checks.some((item) => item.level === 'error'),
    true
  );
  assert.match(text, /published_revision=3 不一致/);
  assert.match(text, /publicationId 与 D1 最近发布任务不一致/);
  assert.match(text, /可能已回滚/);
});

test('backend:verify 在生产部署与 D1 一致时通过', async () => {
  const root = tempRepo();
  const fetchImpl = async (url) => {
    if (String(url).includes('/pages/projects/')) {
      return Response.json({
        success: true,
        result: {
          canonical_deployment: { id: 'deploy-1', url: 'https://deploy-1.menav.pages.dev' },
        },
      });
    }
    return Response.json({ publicationId: 'job-1', revision: 2 });
  };
  const result = await runVerify({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: { CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account-id' },
    fetchImpl,
    logger: silentLogger,
    d1Query: async (sql) =>
      sql.includes('content_state')
        ? [{ revision: 2, published_revision: 2 }]
        : [{ job_id: 'job-1', revision: 2, status: 'published', deployment_id: 'deploy-1' }],
  });
  assert.equal(result.exitCode, 0, messages(result));
  assert.match(messages(result), /Pages 产物 revision=2 与 D1 published_revision 一致/);
});

test('backend:verify 缺少凭据时给出明确错误且不打印 Token', async () => {
  const root = tempRepo();
  const result = await runVerify({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: {},
    fetchImpl: async () => Response.json({ success: false }, { status: 401 }),
    logger: silentLogger,
  });
  assert.equal(result.exitCode, 1);
  assert.match(messages(result), /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(messages(result), /Bearer/);
});

test('backend:verify 解析 wrangler d1 的 JSON 输出', () => {
  const rows = parseWranglerJson(
    'warn before\n[{"results":[{"revision":2,"published_revision":2}],"success":true}]\n'
  );
  assert.deepEqual(rows, [{ revision: 2, published_revision: 2 }]);
});

test('backend:verify 为测试配置补 staging 环境参数', () => {
  const production = buildD1ExecuteArgs('wrangler.jsonc', 'SELECT 1');
  assert.equal(production.includes('--env'), false);
  assert.equal(production[production.indexOf('--config') + 1], 'wrangler.jsonc');
  const staging = buildD1ExecuteArgs('wrangler.test.jsonc', 'SELECT 1');
  assert.equal(staging[staging.indexOf('--env') + 1], 'staging');
  assert.equal(staging[staging.indexOf('--config') + 1], 'wrangler.test.jsonc');
  const custom = buildD1ExecuteArgs('wrangler.jsonc', 'SELECT 1', 'NAV_DB');
  assert.equal(custom[2], 'NAV_DB');
});

function verifyFetch() {
  return async (url) => {
    if (String(url).includes('/pages/projects/')) {
      return Response.json({
        success: true,
        result: {
          canonical_deployment: { id: 'deploy-1', url: 'https://deploy-1.menav.pages.dev' },
        },
      });
    }
    return Response.json({ publicationId: 'job-1', revision: 2 });
  };
}

test('backend:verify 缺少发布任务或任务未完成时返回非 0', async () => {
  const root = tempRepo();
  const noJob = await runVerify({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: { CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account-id' },
    fetchImpl: verifyFetch(),
    logger: silentLogger,
    d1Query: async (sql) =>
      sql.includes('content_state') ? [{ revision: 2, published_revision: 2 }] : [],
  });
  assert.equal(noJob.exitCode, 1);
  assert.match(messages(noJob), /没有发布任务记录/);

  const building = await runVerify({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: { CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account-id' },
    fetchImpl: verifyFetch(),
    logger: silentLogger,
    d1Query: async (sql) =>
      sql.includes('content_state')
        ? [{ revision: 2, published_revision: 2 }]
        : [{ job_id: 'job-1', revision: 2, status: 'building', deployment_id: 'deploy-1' }],
  });
  assert.equal(building.exitCode, 1);
  assert.match(messages(building), /仍在进行中/);
});

test('backend:verify 通过真实 wrangler 子进程路径读取 D1', async () => {
  const root = tempRepo();
  const binDir = path.join(root, 'workers', 'node_modules', 'wrangler', 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, 'wrangler.js'),
    `const args = process.argv.slice(2);
const sql = args[args.indexOf('--command') + 1];
const rows = sql.includes('content_state')
  ? [{ revision: 2, published_revision: 2 }]
  : [{ job_id: 'job-1', revision: 2, status: 'published', deployment_id: 'deploy-1' }];
console.log(JSON.stringify([{ results: rows, success: true }]));
`,
    'utf8'
  );
  const result = await runVerify({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: { CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account-id' },
    fetchImpl: verifyFetch(),
    logger: silentLogger,
  });
  assert.equal(result.exitCode, 0, messages(result));
});
