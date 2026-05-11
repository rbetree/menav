const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function collectRuntimeTsFiles(dir = path.join(repoRoot, 'src', 'runtime')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectRuntimeTsFiles(fullPath);
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];
    return [path.relative(repoRoot, fullPath).split(path.sep).join('/')];
  });
}

test('Phase 7 runtime：入口应迁移为 TypeScript 并由 esbuild 打包', () => {
  const buildRuntime = read('scripts/build-runtime.js');
  const runtimeBundle = read('scripts/lib/runtime-bundle.js');

  assert.ok(exists('src/runtime/index.ts'), 'src/runtime/index.ts 应作为运行时入口存在');
  assert.ok(!exists('src/runtime/index.js'), '旧 src/runtime/index.js 应删除');
  assert.ok(
    buildRuntime.includes("require('./lib/runtime-bundle')"),
    'scripts/build-runtime.js 应复用 runtime bundle 配置'
  );
  assert.ok(
    runtimeBundle.includes("'src', 'runtime', 'index.ts'"),
    'runtime bundle 配置应以 src/runtime/index.ts 作为入口'
  );
});

test('Phase 7 runtime：window.MeNav facade 应由 extension-api 统一组装', () => {
  const runtimeEntry = read('src/runtime/index.ts');
  const extensionApi = read('src/runtime/extension-api/index.ts');
  const extensionMethods = [
    'getConfig',
    'getAllElements',
    'addElement',
    'updateElement',
    'removeElement',
    'events',
  ];

  assert.ok(!exists('src/runtime/menav'), '旧 src/runtime/menav 目录应删除');
  assert.ok(runtimeEntry.includes("require('./extension-api')"), 'runtime 入口应先加载扩展 API');
  assert.ok(
    runtimeEntry.indexOf("require('./extension-api')") <
      runtimeEntry.indexOf("require('./app/nested.ts')"),
    'extension-api 应先于 nested/app 运行，保证 window.MeNav 可用'
  );
  assert.ok(
    extensionApi.includes('window.MeNav = Object.assign'),
    'src/runtime/extension-api/index.ts 应负责组装 window.MeNav facade'
  );

  for (const method of extensionMethods) {
    assert.match(
      extensionApi,
      new RegExp(`${method}:\\s*${method}`),
      `window.MeNav 应暴露 ${method}`
    );
  }
});

test('Phase 9 runtime：启动初始化应留在 app/index.ts，router 只处理路由', () => {
  const appIndex = read('src/runtime/app/index.ts');
  const router = read('src/runtime/app/router.ts');

  for (const token of [
    'ui.initTheme()',
    'ui.initSidebarState()',
    'search.initSearchEngine()',
    'search.initSearchIndex()',
    'window.MeNav.version = version',
  ]) {
    assert.ok(appIndex.includes(token), `app/index.ts 应保留 ${token}`);
    assert.ok(!router.includes(token), `router.ts 不应保留 ${token}`);
  }
});

test('Phase 7 runtime：全局 DOM selector 应集中到 dom/selectors.ts', () => {
  const selectorPattern = /document\.querySelector|querySelectorAll|getElementById/g;
  const matches = collectRuntimeTsFiles().flatMap((relativePath) => {
    const content = read(relativePath);
    return Array.from(content.matchAll(selectorPattern)).map((match) => ({
      relativePath,
      token: match[0],
    }));
  });

  assert.ok(matches.length > 0, 'selector adapter 中应存在 DOM 查询封装');
  assert.deepEqual(
    [...new Set(matches.map((match) => match.relativePath))],
    ['src/runtime/dom/selectors.ts'],
    'document/querySelectorAll/getElementById 只能出现在 DOM adapter 中'
  );

  const selectors = read('src/runtime/dom/selectors.ts');
  for (const exportName of ['SELECTORS', 'qs', 'qsa', 'byId', 'dataTypeAttrSelector']) {
    assert.ok(selectors.includes(exportName), `selector adapter 应导出 ${exportName}`);
  }
});

test('Phase 7 runtime：TypeScript runtime 不应保留 ts-nocheck 逃逸', () => {
  const filesWithNoCheck = collectRuntimeTsFiles().filter((relativePath) =>
    /@ts-(nocheck|ignore|expect-error)/.test(read(relativePath))
  );

  assert.deepEqual(filesWithNoCheck, [], 'src/runtime 下不应保留 TypeScript 检查逃逸标记');
});
