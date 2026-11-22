const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { runDoctor } = require('../scripts/backend-doctor.ts');
const { tempRepo, writeJson, validConfig, silentLogger } = require('./helpers/backend-tools.ts');

function messages(result) {
  return result.checks.map((item) => `${item.level}:${item.message}`).join('\n');
}

function testConfig(overrides = {}) {
  return {
    name: 'menav-backend-staging',
    main: 'src/index.ts',
    env: {
      staging: {
        name: 'menav-backend-staging',
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
        ...overrides,
      },
    },
  };
}

test('backend:doctor 校验顶层配置、AUD 警告与 routes 格式', async () => {
  const root = tempRepo();
  const workers = path.join(root, 'workers');
  writeJson(path.join(workers, 'wrangler.jsonc'), validConfig());
  const ok = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(ok.exitCode, 0, messages(ok));

  const withoutAud = validConfig({
    vars: {
      TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
      POLICY_AUD: 'REPLACE_WITH_ACCESS_AUD',
      CF_ACCOUNT_ID: 'account-id',
      CF_PAGES_PROJECT: 'menav-web',
    },
  });
  writeJson(path.join(workers, 'wrangler.jsonc'), withoutAud);
  const audResult = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(audResult.exitCode, 0, messages(audResult));
  assert.match(messages(audResult), /POLICY_AUD 尚未填写/);

  writeJson(
    path.join(workers, 'wrangler.jsonc'),
    validConfig({
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
    })
  );
  const deployable = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(deployable.exitCode, 0, messages(deployable));
  assert.doesNotMatch(messages(deployable), /env\.staging/);

  writeJson(
    path.join(workers, 'wrangler.jsonc'),
    validConfig({ routes: [{ pattern: 'admin.example.com' }] })
  );
  const badRoute = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(badRoute.exitCode, 1);
  assert.match(messages(badRoute), /custom_domain: true、zone_name 或 zone_id/);

  for (const route of [
    { pattern: 'admin.example.com/*', zone_name: 'example.com' },
    { pattern: 'admin.example.com/*', zone_id: '0123456789abcdef0123456789abcdef' },
  ]) {
    writeJson(path.join(workers, 'wrangler.jsonc'), validConfig({ routes: [route] }));
    const goodRoute = await runDoctor({
      repoRoot: root,
      configName: 'wrangler.jsonc',
      env: {},
      logger: silentLogger,
    });
    assert.equal(goodRoute.exitCode, 0, messages(goodRoute));
  }

  writeJson(path.join(workers, 'wrangler.jsonc'), validConfig({ routes: ['admin.example.com/*'] }));
  const stringRoute = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(stringRoute.exitCode, 0, messages(stringRoute));
  assert.match(messages(stringRoute), /资源存在性未检查/);
});

test('backend:doctor 校验 TEAM_DOMAIN 的 https 与结尾斜杠', async () => {
  const root = tempRepo();
  const workers = path.join(root, 'workers');
  for (const [teamDomain, pattern] of [
    ['http://team.cloudflareaccess.com', /必须以 https:\/\/ 开头/],
    ['https://team.cloudflareaccess.com/', /不能以 \/ 结尾/],
  ]) {
    writeJson(
      path.join(workers, 'wrangler.jsonc'),
      validConfig({
        vars: {
          TEAM_DOMAIN: teamDomain,
          POLICY_AUD: 'aud',
          CF_ACCOUNT_ID: 'account-id',
          CF_PAGES_PROJECT: 'menav-web',
        },
      })
    );
    const result = await runDoctor({
      repoRoot: root,
      configName: 'wrangler.jsonc',
      env: {},
      logger: silentLogger,
    });
    assert.equal(result.exitCode, 1, messages(result));
    assert.match(messages(result), pattern);
  }
});

test('backend:doctor 独立报告 Worker 名与 D1 冲突', async () => {
  const root = tempRepo();
  const workers = path.join(root, 'workers');
  writeJson(
    path.join(workers, 'wrangler.jsonc'),
    validConfig({
      d1_databases: [
        {
          binding: 'DB',
          database_name: 'menav-db',
          database_id: 'REPLACE_WITH_D1_DATABASE_ID',
        },
      ],
    })
  );
  writeJson(
    path.join(workers, 'wrangler.test.jsonc'),
    testConfig({
      name: 'menav-backend',
      d1_databases: [
        {
          binding: 'DB',
          database_name: 'menav-db-staging',
          database_id: '22222222-2222-2222-2222-222222222222',
        },
      ],
    })
  );
  const split = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.test.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(split.exitCode, 1);
  assert.match(messages(split), /生产配置的 D1 未填写，未做隔离比对/);
  assert.match(messages(split), /Worker 名与生产相同/);

  writeJson(path.join(workers, 'wrangler.jsonc'), validConfig());
  writeJson(
    path.join(workers, 'wrangler.test.jsonc'),
    testConfig({
      name: 'menav-backend',
      d1_databases: [
        {
          binding: 'DB',
          database_name: 'menav-db',
          database_id: '11111111-1111-1111-1111-111111111111',
        },
      ],
    })
  );
  const both = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.test.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(both.exitCode, 1);
  assert.match(messages(both), /Worker 名与生产相同/);
  assert.match(messages(both), /D1 与生产是同一个数据库/);
});

test('backend:doctor 忽略生产配置里遗留的 env.staging', async () => {
  const root = tempRepo();
  const workers = path.join(root, 'workers');
  writeJson(
    path.join(workers, 'wrangler.jsonc'),
    validConfig({
      env: {
        staging: {
          name: 'menav-backend',
          d1_databases: [
            {
              binding: 'DB',
              database_name: 'menav-db',
              database_id: '11111111-1111-1111-1111-111111111111',
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
    })
  );
  const result = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(result.exitCode, 0, messages(result));
  assert.doesNotMatch(messages(result), /env\.staging/);
});

test('backend:doctor 测试配置比较生产 Worker 与 D1', async () => {
  const root = tempRepo();
  const workers = path.join(root, 'workers');

  writeJson(path.join(workers, 'wrangler.test.jsonc'), testConfig());
  const missingProduction = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.test.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(missingProduction.exitCode, 0, messages(missingProduction));
  assert.match(messages(missingProduction), /未与生产 Worker 和 D1 做隔离比对/);

  writeJson(path.join(workers, 'wrangler.jsonc'), validConfig());
  writeJson(
    path.join(workers, 'wrangler.test.jsonc'),
    testConfig({
      name: 'menav-backend',
      d1_databases: [
        {
          binding: 'DB',
          database_name: 'menav-db',
          database_id: '11111111-1111-1111-1111-111111111111',
        },
      ],
    })
  );
  const reused = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.test.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(reused.exitCode, 1);
  assert.match(messages(reused), /Worker 名与生产相同/);

  writeJson(path.join(workers, 'wrangler.test.jsonc'), testConfig());
  const isolated = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.test.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(isolated.exitCode, 0, messages(isolated));
  assert.match(messages(isolated), /未复用生产 Worker 名与 D1/);

  writeJson(
    path.join(workers, 'wrangler.jsonc'),
    validConfig({
      d1_databases: [
        {
          binding: 'DB',
          database_name: 'menav-db',
          database_id: 'REPLACE_WITH_D1_DATABASE_ID',
        },
      ],
    })
  );
  const unknownProduction = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.test.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(unknownProduction.exitCode, 0, messages(unknownProduction));
  assert.match(messages(unknownProduction), /生产配置的 D1 未填写，未做隔离比对/);
});

test('backend:doctor 测试配置缺少 env.staging 时报错', async () => {
  const root = tempRepo();
  const workers = path.join(root, 'workers');
  writeJson(path.join(workers, 'wrangler.jsonc'), validConfig());
  writeJson(path.join(workers, 'wrangler.test.jsonc'), {
    name: 'menav-backend-staging',
    main: 'src/index.ts',
  });
  const result = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.test.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(result.exitCode, 1);
  assert.match(messages(result), /缺少 env\.staging/);
});

test('backend:doctor 本地配置接受空 Access 变量并要求 ALLOW_INSECURE_DEV=1', async () => {
  const root = tempRepo();
  const workers = path.join(root, 'workers');
  const localConfig = {
    name: 'menav-backend-local',
    main: 'src/index.ts',
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
  writeJson(path.join(workers, 'wrangler.local.jsonc'), localConfig);
  const missing = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.local.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(missing.exitCode, 1);
  assert.match(messages(missing), /ALLOW_INSECURE_DEV=1/);

  fs.writeFileSync(path.join(workers, '.dev.vars'), 'ALLOW_INSECURE_DEV=1\n', 'utf8');
  const ok = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.local.jsonc',
    env: {},
    logger: silentLogger,
  });
  assert.equal(ok.exitCode, 0, messages(ok));
});

test('backend:doctor 有凭据时检查资源，缺权限时标注未检查', async () => {
  const root = tempRepo();
  const workers = path.join(root, 'workers');
  writeJson(path.join(workers, 'wrangler.jsonc'), validConfig());

  const fetchImpl = async (url) => {
    const text = String(url);
    if (text.includes('/d1/database/')) {
      return Response.json({ success: true, result: { uuid: 'db' } });
    }
    if (text.includes('/pages/projects/')) {
      return Response.json({ success: false, result: null }, { status: 404 });
    }
    return Response.json({ success: false }, { status: 403 });
  };
  const result = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: { CLOUDFLARE_API_TOKEN: 'test-token', CLOUDFLARE_ACCOUNT_ID: 'account-id' },
    fetchImpl,
    logger: silentLogger,
  });
  assert.equal(result.exitCode, 0, messages(result));
  assert.match(messages(result), /D1 数据库存在/);
  assert.match(messages(result), /Pages 项目尚未创建/);
  assert.match(messages(result), /无 Access 权限/);
  assert.doesNotMatch(messages(result), /test-token/);

  const missingD1 = async (url) => {
    if (String(url).includes('/d1/database/')) {
      return Response.json({ success: false }, { status: 404 });
    }
    return Response.json({ success: true, result: [] });
  };
  const failed = await runDoctor({
    repoRoot: root,
    configName: 'wrangler.jsonc',
    env: { CLOUDFLARE_API_TOKEN: 'test-token', CLOUDFLARE_ACCOUNT_ID: 'account-id' },
    fetchImpl: missingD1,
    logger: silentLogger,
  });
  assert.equal(failed.exitCode, 1);
  assert.match(messages(failed), /D1 数据库不存在/);
});
