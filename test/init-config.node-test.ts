const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('init-config：应提供不会覆盖现有用户配置的初始化入口', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(
    packageJson.scripts['init-config'],
    'node -r ./scripts/register-ts.cjs ./scripts/init-config.ts'
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-init-config-'));
  fs.mkdirSync(path.join(tmp, 'config/_default/pages'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'config/_default/site.yml'), 'title: Default\n', 'utf8');
  fs.writeFileSync(path.join(tmp, 'config/_default/pages/common.yml'), 'categories: []\n', 'utf8');

  const registerScript = path.join(repoRoot, 'scripts/register-ts.cjs');
  const initScript = path.join(repoRoot, 'scripts/init-config.ts');

  const firstRun = spawnSync(process.execPath, ['-r', registerScript, initScript], {
    cwd: tmp,
    encoding: 'utf8',
  });
  assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
  assert.equal(fs.readFileSync(path.join(tmp, 'config/user/site.yml'), 'utf8'), 'title: Default\n');
  assert.equal(
    fs.readFileSync(path.join(tmp, 'config/user/pages/common.yml'), 'utf8'),
    'categories: []\n'
  );

  fs.writeFileSync(path.join(tmp, 'config/user/site.yml'), 'title: User\n', 'utf8');
  const secondRun = spawnSync(process.execPath, ['-r', registerScript, initScript], {
    cwd: tmp,
    encoding: 'utf8',
  });
  assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
  assert.equal(fs.readFileSync(path.join(tmp, 'config/user/site.yml'), 'utf8'), 'title: User\n');
});
