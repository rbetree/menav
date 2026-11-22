const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const { runInit, parseInitArgs } = require('../scripts/backend-init.ts');
const { tempRepo } = require('./helpers/backend-tools.ts');

test('backend:init 默认只生成生产配置，可一次生成测试与本地配置', () => {
  const root = tempRepo();
  const first = runInit({ repoRoot: root, argv: [] });
  assert.equal(first.exitCode, 0);
  assert.deepEqual(first.generated, ['wrangler.jsonc']);
  assert.equal(fs.existsSync(path.join(root, 'workers', 'wrangler.test.jsonc')), false);
  assert.equal(fs.existsSync(path.join(root, 'workers', 'wrangler.local.jsonc')), false);

  fs.writeFileSync(path.join(root, 'workers', 'wrangler.jsonc'), 'keep\n', 'utf8');
  const second = runInit({ repoRoot: root, argv: ['--with-test', '--with-local'] });
  assert.equal(second.exitCode, 0);
  assert.ok(second.skipped.includes('wrangler.jsonc'));
  assert.ok(second.generated.includes('wrangler.test.jsonc'));
  assert.ok(second.generated.includes('wrangler.local.jsonc'));
  assert.ok(second.generated.includes('.dev.vars'));
  assert.equal(fs.readFileSync(path.join(root, 'workers', 'wrangler.jsonc'), 'utf8'), 'keep\n');

  const unknown = parseInitArgs(['--wat']);
  assert.deepEqual(unknown.unknown, ['--wat']);
  assert.equal(runInit({ repoRoot: root, argv: ['--wat'] }).exitCode, 1);

  const all = parseInitArgs(['--all']);
  assert.deepEqual(all.options, { withTest: true, withLocal: true });
});

test('check-config 在 local 配置下接受空 Access 变量，在占位符配置下拒绝', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-check-config-'));
  const checkScript = path.join(repoRoot, 'workers', 'scripts', 'check-config.mjs');

  const localConfig = {
    name: 'menav-backend-local',
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'menav-db-local',
        database_id: '00000000-0000-0000-0000-000000000000',
        remote: false,
      },
    ],
    vars: { TEAM_DOMAIN: '', POLICY_AUD: '', CF_ACCOUNT_ID: '', CF_PAGES_PROJECT: '' },
  };
  fs.writeFileSync(
    path.join(root, 'wrangler.local.jsonc'),
    JSON.stringify(localConfig, null, 2),
    'utf8'
  );
  fs.writeFileSync(path.join(root, '.dev.vars'), 'ALLOW_INSECURE_DEV=1\n', 'utf8');
  const localRun = spawnSync(process.execPath, [checkScript, 'wrangler.local.jsonc'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(localRun.status, 0, localRun.stderr || localRun.stdout);

  const missingRun = spawnSync(process.execPath, [checkScript, 'wrangler.jsonc'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.notEqual(missingRun.status, 0);
  assert.match(missingRun.stderr, /找不到 wrangler\.jsonc/);

  fs.writeFileSync(
    path.join(root, 'wrangler.jsonc'),
    '{\n  // 注释与尾逗号\n  "name": "menav",\n  "d1_databases": [{"database_id": "REPLACE_WITH_D1"}],\n}\n',
    'utf8'
  );
  const badRun = spawnSync(process.execPath, [checkScript, 'wrangler.jsonc'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.notEqual(badRun.status, 0);
  assert.match(badRun.stderr, /仍是占位符/);

  const productionConfig = {
    name: 'menav-backend',
    main: 'src/index.ts',
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'menav-db',
        database_id: '11111111-1111-1111-1111-111111111111',
      },
    ],
    vars: {
      TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
      POLICY_AUD: 'REPLACE_WITH_ACCESS_AUD',
      CF_ACCOUNT_ID: 'account-id',
      CF_PAGES_PROJECT: 'menav-web',
    },
    env: {
      staging: {
        name: 'REPLACE_WITH_STAGING_WORKER',
        d1_databases: [{ binding: 'DB', database_id: 'REPLACE_WITH_STAGING_D1' }],
        vars: {
          TEAM_DOMAIN: 'REPLACE_WITH_TEAM',
          POLICY_AUD: 'REPLACE_WITH_STAGING_AUD',
          CF_ACCOUNT_ID: 'REPLACE_WITH_ACCOUNT_ID',
          CF_PAGES_PROJECT: 'REPLACE_WITH_STAGING_PAGES_PROJECT',
        },
      },
    },
  };
  fs.writeFileSync(
    path.join(root, 'wrangler.jsonc'),
    JSON.stringify(productionConfig, null, 2),
    'utf8'
  );
  const audRun = spawnSync(process.execPath, [checkScript, 'wrangler.jsonc'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(audRun.status, 0, audRun.stderr || audRun.stdout);
  assert.match(audRun.stderr, /POLICY_AUD 尚未填写/);

  fs.writeFileSync(path.join(root, '.dev.vars'), '', 'utf8');
  fs.writeFileSync(
    path.join(root, 'wrangler.local.jsonc'),
    JSON.stringify(
      {
        ...localConfig,
        vars: {
          TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
          POLICY_AUD: 'aud-local',
          CF_ACCOUNT_ID: '',
          CF_PAGES_PROJECT: '',
        },
      },
      null,
      2
    ),
    'utf8'
  );
  const localJwtRun = spawnSync(process.execPath, [checkScript, 'wrangler.local.jsonc'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(localJwtRun.status, 0, localJwtRun.stderr || localJwtRun.stdout);

  const testConfig = {
    name: 'menav-backend-staging',
    env: {
      staging: {
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'menav-db-staging',
            database_id: '22222222-2222-2222-2222-222222222222',
          },
        ],
        vars: {
          TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
          POLICY_AUD: 'aud-staging',
          CF_ACCOUNT_ID: 'account-id',
          CF_PAGES_PROJECT: 'menav-web-staging',
        },
      },
    },
  };
  fs.writeFileSync(
    path.join(root, 'wrangler.test.jsonc'),
    JSON.stringify(testConfig, null, 2),
    'utf8'
  );
  const testRun = spawnSync(process.execPath, [checkScript, 'wrangler.test.jsonc'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(testRun.status, 0, testRun.stderr || testRun.stdout);
});
