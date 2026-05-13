const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Phase 14：最终审计脚本应接入 check 门禁', () => {
  const check = read('scripts/check.ts');
  const audit = read('scripts/audit-final.ts');

  assert.ok(check.includes("scripts', 'audit-final.ts'"), 'npm run check 应执行最终审计脚本');
  assert.ok(audit.includes('auditDependencyDirection'), '最终审计应覆盖依赖方向');
  assert.ok(audit.includes('auditPublicArtifacts'), '最终审计应覆盖公开产物');
  assert.ok(audit.includes('auditStyleLayers'), '最终审计应覆盖样式分层');
  assert.ok(audit.includes('auditDocs'), '最终审计应覆盖文档入口');
});

test('Phase 14：源码文档应说明浏览器契约测试入口', () => {
  const srcReadme = read('src/README.md');

  assert.ok(srcReadme.includes('npm run test:browser'));
  assert.ok(srcReadme.includes('scripts/test-browser.ts'));
  assert.ok(srcReadme.includes('test/browser/contract.js'));
});
