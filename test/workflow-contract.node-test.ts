const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const { buildDryRunCommands } = require('../scripts/check-example-configs.ts');

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
  assert.equal(deployWorkflow.includes("'docker/**'"), false);
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

test('ci workflow：后端路径过滤覆盖构建链路并校验示例配置', () => {
  const ciWorkflow = read('.github/workflows/ci.yml');
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(
    packageJson.scripts['backend:check:configs'],
    'node -r ./scripts/register-ts.cjs ./scripts/check-example-configs.ts'
  );
  assert.ok(ciWorkflow.includes('npm run backend:check:configs'));
  assert.deepEqual(
    buildDryRunCommands().map((item: { config: string; env?: string }) => [item.config, item.env]),
    [
      ['wrangler.example.jsonc', undefined],
      ['wrangler.test.example.jsonc', 'staging'],
      ['wrangler.local.example.jsonc', undefined],
    ]
  );

  for (const backendPath of [
    'scripts/lib/build-pipeline.ts',
    'scripts/build-runtime.ts',
    'scripts/prepare-astro-public.ts',
    'src/pages/**',
    'src/layouts/**',
    'src/components/**',
    'src/runtime/**',
    'astro.config.mjs',
  ]) {
    assert.ok(ciWorkflow.includes(backendPath), `ci.yml 后端过滤应覆盖 ${backendPath}`);
  }
});

test('格式检查覆盖示例 jsonc、workers 脚本与 docs', () => {
  const formatScript = read('scripts/format.ts');
  const packageJson = JSON.parse(read('package.json'));

  for (const pattern of [
    "'workers/*.example.jsonc'",
    "'workers/scripts/**/*.{mjs,cjs}'",
    "'docs/**/*.md'",
  ]) {
    assert.ok(formatScript.includes(pattern), `format.ts 应覆盖 ${pattern}`);
  }
  assert.ok(packageJson['lint-staged']['**/*.{ts,mjs,cjs,html,jsonc}']);
});

test('test workflow：单元测试递归收集 node-test 且在测试前强制重建库', () => {
  const testScript = read('scripts/test.ts');

  assert.ok(testScript.includes("entry.name.endsWith('.node-test.ts')"));
  assert.ok(testScript.includes("entry.name === 'browser'"));
  assert.ok(testScript.includes("path.join(repoRoot, 'scripts', 'build-lib.ts')"));
  assert.ok(testScript.includes("log.error('build:lib 失败'"));
  assert.ok(testScript.includes('强制重建 dist-node'));
  assert.equal(testScript.includes('!fs.existsSync(distNodeIndex)'), false);
});
