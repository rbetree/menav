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

test('ci workflow：默认使用快速 check，并按路径变更触发浏览器契约', () => {
  const ciWorkflow = read('.github/workflows/ci.yml');
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(
    packageJson.scripts['check:fast'],
    'node -r ./scripts/register-ts.cjs ./scripts/check.ts && npm run build:lib && node -e "require(\'.\')" && tsc --noEmit'
  );
  assert.equal(packageJson.scripts.check, 'npm run check:fast');
  assert.equal(packageJson.scripts['check:browser'], 'npm run build && npm run test:browser');
  assert.ok(ciWorkflow.includes('npm run check'));
  assert.ok(ciWorkflow.includes('dorny/paths-filter'));
  assert.ok(ciWorkflow.includes('src/components/**'));
  assert.ok(ciWorkflow.includes('src/runtime/**'));
  assert.ok(ciWorkflow.includes('src/lib/site-model/**'));
  assert.ok(ciWorkflow.includes('npx playwright install --with-deps chromium'));
  assert.ok(ciWorkflow.includes('npm run check:browser'));
  assert.equal(ciWorkflow.includes('npm run lint'), false);
  assert.equal(ciWorkflow.includes('npm test'), false);
  assert.equal(ciWorkflow.includes('npm run build'), false);
});
