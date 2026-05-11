const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { getFaviconV2Url, getFaviconFallbackUrl } = require('../src/lib/view-data/view-utils.ts');

test('faviconV2：应追加 drop_404_icon=true 以避免返回占位图', () => {
  const rootCom = { icons: { region: 'com' } };
  const rootCn = { icons: { region: 'cn' } };

  const url = 'https://example.com';

  const com = getFaviconV2Url(url, rootCom);
  const cn = getFaviconV2Url(url, rootCn);
  const fallbackCom = getFaviconFallbackUrl(url, rootCom);
  const fallbackCn = getFaviconFallbackUrl(url, rootCn);

  for (const out of [com, cn, fallbackCom, fallbackCn]) {
    assert.ok(out.includes('drop_404_icon=true'), '生成的 URL 应包含 drop_404_icon=true');
  }
});

test('运行时新增站点：faviconV2 URL 也应包含 drop_404_icon=true', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const runtimePath = path.join(repoRoot, 'src', 'runtime', 'extension-api', 'add-element.ts');
  const content = fs.readFileSync(runtimePath, 'utf8');
  assert.ok(
    content.includes('drop_404_icon=true'),
    'src/runtime/extension-api/add-element.ts 应追加 drop_404_icon=true'
  );
});
