const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { loadConfig } = require('../src/lib/config/index.ts');
const { buildTestSiteModel } = require('./helpers/site-model.ts');

function withRepoRoot(fn) {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));
  try {
    return fn();
  } finally {
    process.chdir(originalCwd);
  }
}

test('P1-7：页面内不应注入整站配置，应仅保留最小运行时参数', () => {
  withRepoRoot(() => {
    const config = loadConfig();
    const model = buildTestSiteModel(config);
    const raw = String(model.runtimeConfigJson || '').trim();
    assert.ok(raw.length > 0, 'menav-runtime-config 内容不应为空');

    const parsed = JSON.parse(raw);

    assert.ok(parsed && typeof parsed === 'object');
    assert.ok(parsed.version, '应包含 version');
    assert.ok(parsed.timestamp, '应包含 timestamp');

    assert.ok(parsed.icons && typeof parsed.icons === 'object', '应包含 icons 配置（用于运行时）');

    assert.ok(parsed.data && typeof parsed.data === 'object', '应包含 data 对象');
    assert.ok(parsed.data.homePageId, '应包含 homePageId');
    assert.ok(
      parsed.data.pageTemplates && typeof parsed.data.pageTemplates === 'object',
      '应包含 pageTemplates'
    );
    assert.ok(Array.isArray(parsed.data.pageRegistry), '应包含页面注册表');
    assert.ok(parsed.data.pageRegistry.length > 0, '页面注册表不应为空');
    assert.deepEqual(
      Object.keys(parsed.data.pageRegistry[0]).sort(),
      ['active', 'id', 'name', 'template'],
      '页面注册表只应包含路由需要的最小字段'
    );

    // 不应再把 pages/<id>.yml 的完整结构（categories/sites 等）注入到页面中
    assert.equal(parsed.data.common, undefined);
    assert.equal(parsed.data.projects, undefined);
    assert.equal(parsed.data.articles, undefined);
    assert.equal(parsed.data.bookmarks, undefined);
    assert.ok(!/"categories"\s*:/.test(raw), '不应包含 categories 字段');
    assert.ok(!/"sites"\s*:/.test(raw), '不应包含 sites 字段');
  });
});
