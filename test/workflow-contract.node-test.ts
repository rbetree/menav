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

test('deploy workflow：部署前应等待本次上传产物的元数据可见', () => {
  const yaml = require('js-yaml');
  const workflow = yaml.load(read('.github/workflows/deploy.yml'));
  const steps = workflow.jobs.build_and_deploy.steps;
  const uploadIndex = steps.findIndex((step) => step.uses === 'actions/upload-pages-artifact@v3');
  const waitIndex = steps.findIndex(
    (step) => step.run === 'node -r ./scripts/register-ts.cjs ./scripts/wait-pages-artifact.ts'
  );
  const deployIndex = steps.findIndex(
    (step) => step.run === 'node -r ./scripts/register-ts.cjs ./scripts/deploy-pages.ts'
  );

  assert.equal(workflow.permissions.actions, 'read');
  assert.ok(waitIndex > uploadIndex, '上传后必须等待产物元数据可见');
  assert.ok(deployIndex > waitIndex, '部署必须在元数据可见后执行');
  assert.equal(steps[uploadIndex].id, 'upload_pages');
  assert.equal(
    steps[waitIndex].env.PAGES_ARTIFACT_ID,
    '${{ steps.upload_pages.outputs.artifact_id }}'
  );
  assert.equal(steps[waitIndex].env.GITHUB_TOKEN, '${{ github.token }}');
  assert.equal(steps[uploadIndex].if, steps[waitIndex].if);
  assert.equal(steps[waitIndex].if, steps[deployIndex].if);
  assert.equal(steps[waitIndex]['timeout-minutes'], 5);
  assert.equal(steps[deployIndex]['timeout-minutes'], 15);
  assert.equal(steps[deployIndex].env.PAGES_ARTIFACT_ID, steps[waitIndex].env.PAGES_ARTIFACT_ID);
  assert.equal(steps[deployIndex].env.GITHUB_TOKEN, '${{ github.token }}');
  assert.equal(
    steps.some((step) => step.uses?.startsWith('actions/deploy-pages@')),
    false
  );
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

  for (const browserContractPath of [
    'assets/style.css',
    'assets/styles/**',
    'assets/pinyin-match.ts',
    'config/_default/**',
    'src/components/**',
    'src/layouts/**',
    'src/pages/**',
    'src/lib/search-index/**',
    'src/runtime/**',
    'src/lib/site-model/**',
    'src/lib/view-data/**',
    'scripts/lib/public-assets.ts',
    'scripts/lib/runtime-bundle.ts',
    'scripts/lib/search-index-assets.ts',
    'scripts/build-runtime.ts',
    'scripts/prepare-astro-public.ts',
    'test/browser/**',
  ]) {
    assert.ok(
      ciWorkflow.includes(browserContractPath),
      `ci.yml 应按 ${browserContractPath} 变更触发浏览器契约`
    );
  }

  assert.ok(ciWorkflow.includes("github.repository == 'rbetree/menav'"));
  assert.ok(ciWorkflow.includes('npx playwright install --with-deps chromium'));
  assert.ok(ciWorkflow.includes('npm run check:browser'));
  assert.equal(ciWorkflow.includes('npm run lint'), false);
  assert.equal(ciWorkflow.includes('npm test'), false);
  assert.equal(ciWorkflow.includes('npm run build'), false);
});
