const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadConfig } = require('../src/lib/config/index.ts');
const { buildSiteModel } = require('../src/lib/site-model/index.ts');

const MALICIOUS_LABEL = '注入</script><script>alert(1)</script>';

function assertRuntimeConfigSafe(model) {
  assert.doesNotMatch(model.runtimeConfigJson, /<\/script/i, '不应出现可闭合脚本的序列');
  assert.match(model.runtimeConfigJson, /<\\\/script/i, '结束标签应带真实反斜杠');
  assert.equal(JSON.parse(model.runtimeConfigJson).data.pageRegistry[0].name, MALICIOUS_LABEL);
}

function withEnv(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  try {
    return fn();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

test('运行时配置：静态 YAML 中的 </script> 应转义且 JSON 仍可解析', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-runtime-yaml-'));
  try {
    fs.mkdirSync(path.join(dir, 'pages'));
    fs.writeFileSync(
      path.join(dir, 'site.yml'),
      [
        'title: Test Site',
        'navigation:',
        '  - id: home',
        `    name: ${JSON.stringify(MALICIOUS_LABEL)}`,
        '    icon: fas fa-home',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(path.join(dir, 'pages', 'home.yml'), 'template: page\ncategories: []\n');

    const model = withEnv({ MENAV_CONFIG_DIR: dir, MENAV_SNAPSHOT_FILE: undefined }, () =>
      buildSiteModel({ config: loadConfig() })
    );
    assertRuntimeConfigSafe(model);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('运行时配置：D1 快照中的 </script> 应转义且 JSON 仍可解析', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-runtime-snapshot-'));
  try {
    const snapshot = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-09-08T00:00:00.000Z',
      settings: { site: JSON.stringify({ title: 'D1 Site' }) },
      pages: [
        {
          id: 'home',
          label: MALICIOUS_LABEL,
          sort: 0,
          hidden: false,
          template: 'page',
          navigation: {},
          metadata: {},
          categories: [],
        },
      ],
    };
    const snapshotFile = path.join(dir, 'snapshot.json');
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot), 'utf8');

    const model = withEnv(
      { MENAV_SNAPSHOT_FILE: snapshotFile, MENAV_CONFIG_DIR: path.join(dir, 'no-config') },
      () => buildSiteModel({ config: loadConfig() })
    );
    assertRuntimeConfigSafe(model);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
