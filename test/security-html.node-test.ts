const test = require('node:test');
const assert = require('node:assert/strict');

const { htmlToText } = require('../src/lib/security/html.ts');
const { extractYearlyContributionsInnerHtml } = require('../src/lib/github/contributions.ts');

test('security/html：RSS HTML 转文本时跳过脚本样式并解码实体', () => {
  const text = htmlToText(
    [
      '<p>Hello&nbsp;<strong>world</strong></p>',
      '<script>alert("&lt;x&gt;")</script>',
      '<style>body{display:none}</style>',
      '<p>&amp; &#x4f60;&#22909;</p>',
    ].join('')
  );

  assert.equal(text, 'Hello world & 你好');
});

test('github/contributions：只保留贡献图白名单标签和安全属性', () => {
  const html = [
    '<section>',
    '<div class="js-yearly-contributions" onclick="evil()">',
    '<script>alert(1)</script>',
    '<div class="js-calendar-graph" data-test="ok" style="color:red">',
    '<svg viewBox="0 0 20 20" onload="evil()">',
    '<g transform="translate(0, 0)">',
    '<rect class="day" data-level="4" width="10" height="10" onclick="evil()"></rect>',
    '</g>',
    '</svg>',
    '<a href="javascript:alert(1)">bad link</a>',
    '<a href="https://github.com/rbetree">safe link</a>',
    '<img src=x onerror=evil()>',
    '</div>',
    '</div>',
    '</section>',
  ].join('');

  const inner = extractYearlyContributionsInnerHtml(html);

  assert.ok(inner);
  assert.ok(inner.includes('class="js-calendar-graph"'));
  assert.ok(inner.includes('data-level="4"'));
  assert.ok(inner.includes('viewBox="0 0 20 20"'));
  assert.ok(inner.includes('href="https://github.com/rbetree"'));
  assert.ok(!inner.includes('script'));
  assert.ok(!inner.includes('onclick'));
  assert.ok(!inner.includes('onload'));
  assert.ok(!inner.includes('style='));
  assert.ok(!inner.includes('javascript:'));
  assert.ok(!inner.includes('<img'));
});
