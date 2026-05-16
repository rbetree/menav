const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('deploy workflow：书签导入应复用 npm 脚本入口', () => {
  const deployWorkflow = read('.github/workflows/deploy.yml');
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(
    packageJson.scripts['import-bookmarks'],
    'node -r ./scripts/register-ts.cjs src/bookmark-processor.ts'
  );
  assert.ok(deployWorkflow.includes('npm run import-bookmarks'));
  assert.equal(deployWorkflow.includes('src/bookmark-processor.js'), false);
});
