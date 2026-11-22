const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildDryRunCommands, runExampleChecks } = require('../scripts/check-example-configs.ts');

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-example-configs-'));
  const workers = path.join(root, 'workers');
  fs.mkdirSync(workers, { recursive: true });
  for (const config of [
    'wrangler.example.jsonc',
    'wrangler.test.example.jsonc',
    'wrangler.local.example.jsonc',
  ]) {
    fs.writeFileSync(path.join(workers, config), '{}\n', 'utf8');
  }
  const bin = path.join(workers, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(
    bin,
    `const args = process.argv.slice(2);
const config = args[args.indexOf('--config') + 1];
process.exit(process.env.MENAV_FAKE_FAIL_CONFIG === config ? 1 : 0);
`,
    'utf8'
  );
  return root;
}

test('示例配置校验不向顶层环境传空 --env', () => {
  const commands = buildDryRunCommands();
  assert.equal(commands.find((item) => item.name === 'example').env, undefined);
  assert.equal(commands.find((item) => item.name === 'test').env, 'staging');
});

test('示例配置校验按 wrangler 真实退出码返回', () => {
  const root = tempRepo();
  assert.equal(runExampleChecks(root), 0);

  const previous = process.env.MENAV_FAKE_FAIL_CONFIG;
  process.env.MENAV_FAKE_FAIL_CONFIG = 'wrangler.test.example.jsonc';
  try {
    assert.equal(runExampleChecks(root), 1);
  } finally {
    if (previous === undefined) delete process.env.MENAV_FAKE_FAIL_CONFIG;
    else process.env.MENAV_FAKE_FAIL_CONFIG = previous;
  }
});
