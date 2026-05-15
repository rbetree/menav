const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { getFaviconV2Url, getFaviconFallbackUrl } = require('../src/lib/view-data/view-utils.ts');

test('faviconV2：应追加 drop_404_icon=true 以避免返回占位图', () => {
  const url = 'https://example.com';

  const com = getFaviconV2Url(url, 'com');
  const cn = getFaviconV2Url(url, 'cn');
  const fallbackCom = getFaviconFallbackUrl(url, 'com');
  const fallbackCn = getFaviconFallbackUrl(url, 'cn');

  for (const out of [com, cn, fallbackCom, fallbackCn]) {
    assert.ok(out.includes('drop_404_icon=true'), '生成的 URL 应包含 drop_404_icon=true');
  }
});

test('运行时不应再保留扩展式新增站点入口', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const runtimePath = path.join(repoRoot, 'src', 'runtime', 'index.ts');
  const content = fs.readFileSync(runtimePath, 'utf8');
  assert.ok(
    !content.includes("require('./extension-api')"),
    'src/runtime/index.ts 不应再加载扩展式 DOM 增删改查入口'
  );
});
