const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('构建命令：build/generate 离线，dev 显式联网', () => {
  assert.match(read('scripts/build.ts'), /sync:\s*false/);
  assert.match(read('scripts/generate.ts'), /sync:\s*false/);
  assert.match(read('scripts/dev.ts'), /sync:\s*true/);
  assert.match(read('scripts/dev-offline.ts'), /sync:\s*false/);

  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts.sync, 'node -r ./scripts/register-ts.cjs ./scripts/sync.ts');
});

test('deploy workflow：先同步动态缓存，再执行离线 build', () => {
  const workflow = read('.github/workflows/deploy.yml');
  const syncIndex = workflow.indexOf('npm run sync');
  const buildIndex = workflow.indexOf('npm run build');

  assert.ok(syncIndex > 0, 'workflow 应包含 npm run sync');
  assert.ok(buildIndex > syncIndex, 'build 应在 sync 之后执行');
});
