const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Phase 11：package.json 应提供 dev:astro 且默认 dev 保持稳定静态服务', () => {
  const pkg = JSON.parse(read('package.json'));

  assert.equal(
    pkg.scripts['dev:astro'],
    'node -r ./scripts/register-ts.cjs ./scripts/dev-astro.js'
  );
  assert.equal(pkg.scripts.dev, 'node -r ./scripts/register-ts.cjs ./scripts/dev.js');
  assert.equal(
    pkg.scripts['dev:offline'],
    'node -r ./scripts/register-ts.cjs ./scripts/dev-offline.js'
  );
});

test('Phase 11：dev:astro 应准备 public 资源、监听 runtime，并启动 Astro dev', () => {
  const devAstro = read('scripts/dev-astro.js');

  assert.ok(devAstro.includes("require('./lib/runtime-bundle')"));
  assert.ok(devAstro.includes('watchRuntimeBundle'));
  assert.ok(devAstro.includes('prepare-astro-public.js'));
  assert.ok(devAstro.includes('resolveAstroCli(repoRoot)'));
  assert.ok(devAstro.includes("'dev'"), '脚本应通过 Astro CLI 启动 dev 模式');
});

test('Phase 11：dev:astro 应监听配置、资源和数据准备边界', () => {
  const { PREPARE_WATCH_DIRS, resolveAstroDevArgs } = require('../scripts/dev-astro');

  for (const expected of [
    'config',
    'assets',
    path.join('src', 'lib', 'config'),
    path.join('src', 'lib', 'search-index'),
    path.join('src', 'lib', 'view-data'),
  ]) {
    assert.ok(PREPARE_WATCH_DIRS.includes(expected), `${expected} 应被 dev:astro 监听`);
  }

  assert.deepEqual(resolveAstroDevArgs(['--port', '3000', '--host', '127.0.0.1']), [
    '--port',
    '3000',
    '--host',
    '127.0.0.1',
  ]);

  const defaultArgs = resolveAstroDevArgs([]);
  assert.deepEqual(defaultArgs, ['--port', '5173', '--host', '0.0.0.0']);
});

test('Phase 11：build-runtime 与 dev:astro 应复用同一份 runtime bundle 配置', () => {
  const buildRuntime = read('scripts/build-runtime.js');
  const runtimeBundle = read('scripts/lib/runtime-bundle.js');

  assert.ok(buildRuntime.includes("require('./lib/runtime-bundle')"));
  assert.ok(runtimeBundle.includes("'src', 'runtime', 'index.ts'"));
  assert.ok(runtimeBundle.includes("'public', 'script.js'"));
  assert.ok(runtimeBundle.includes('watchRuntimeBundle'));
  assert.ok(runtimeBundle.includes('buildRuntimeBundle'));
});
