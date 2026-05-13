const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('404：Astro 默认 404 不再执行 /<id> 到 ?page=<id> 的自动回跳', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', '404.astro'), 'utf8');

  assert.ok(typeof html === 'string' && html.length > 0);
  assert.ok(html.includes('页面未找到'));
  assert.ok(html.includes('返回首页'));
  assert.ok(!html.includes('?page='), '不应再保留旧路径自动回跳逻辑');
  assert.ok(!html.includes('location.replace'), '不应通过脚本重写 404 路径');
});
