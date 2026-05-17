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

test('Phase 12：旧 generator 与 lib 兼容入口应删除', () => {
  assert.equal(exists('src/generator.js'), false);
  assert.equal(exists('src/lib/render-data.js'), false);
  assert.equal(exists('src/lib/view-utils.js'), false);
  assert.equal(exists('src/helpers'), false);
});

test('Phase 12：业务代码不应再引用旧 generator、helpers 或 lib 兼容路径', () => {
  const files = [
    ...fs
      .readdirSync(path.join(repoRoot, 'src'), { recursive: true })
      .filter((file) => typeof file === 'string')
      .map((file) => path.join('src', file)),
    ...fs
      .readdirSync(path.join(repoRoot, 'scripts'), { recursive: true })
      .filter((file) => typeof file === 'string')
      .map((file) => path.join('scripts', file)),
    ...fs
      .readdirSync(path.join(repoRoot, 'test'), { recursive: true })
      .filter((file) => typeof file === 'string')
      .map((file) => path.join('test', file)),
  ].filter(
    (file) =>
      file !== 'test/modernization-phase12.node-test.ts' &&
      file !== 'scripts/audit-final.ts' &&
      fs.statSync(path.join(repoRoot, file)).isFile()
  );

  const forbidden = [
    'src/generator',
    '../generator',
    './generator',
    'generator.js',
    'src/helpers',
    'helpers/',
    'render-data.js',
    'view-utils.js',
    'src/lib/render-data',
    'src/lib/view-utils',
  ];

  const hits = files.flatMap((file) => {
    const content = read(file);
    return forbidden.filter((token) => content.includes(token)).map((token) => `${file}: ${token}`);
  });

  assert.deepEqual(hits, []);
});

test('Phase 12：PageRegistryItem 应只有共享类型来源', () => {
  const pageTypes = read('src/types/page.ts');
  const renderData = read('src/lib/config/render-data.ts');
  const runtimeConfig = read('src/lib/config/runtime-config.ts');
  const router = read('src/runtime/app/router.ts');
  const routerUrl = read('src/runtime/app/router-url.ts');

  assert.ok(pageTypes.includes('export interface PageRegistryItem'));
  assert.ok(renderData.includes("import type { PageRegistryItem } from '../../types/page'"));
  assert.ok(runtimeConfig.includes("import type { PageRegistryItem } from '../../types/page'"));
  assert.ok(router.includes("import type { PageRegistryItem } from '../../types/page'"));
  assert.ok(routerUrl.includes("import type { PageRegistryItem } from '../../types/page'"));
  assert.equal(renderData.includes('type PageRegistryItem ='), false);
  assert.equal(runtimeConfig.includes('type PageRegistryItem ='), false);
  assert.equal(router.includes('RuntimePageRegistryItem'), false);
});

test('Phase 12：page-data 主流程不直接依赖页面特化数据源', () => {
  const pageData = read('src/lib/view-data/page-data.ts');
  const pageKind = read('src/lib/view-data/page-kind.ts');

  assert.ok(pageData.includes('applyPageKindData'));
  assert.ok(pageKind.includes('tryLoadArticlesFeedCache'));
  assert.ok(pageKind.includes('tryLoadProjectsRepoCache'));
  assert.ok(pageKind.includes('renderMarkdownToHtml'));
  assert.equal(pageData.includes("'cache', 'articles.ts'"), false);
  assert.equal(pageData.includes("'cache', 'projects.ts'"), false);
  assert.equal(pageData.includes("'content', 'markdown.ts'"), false);
  assert.equal(pageData.includes('getPageConfigUpdatedAtMeta'), false);
});
