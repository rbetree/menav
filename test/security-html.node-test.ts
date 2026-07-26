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

test('github/contributions：只保留贡献图白名单标签和安全属性（含 tool-tip 无障碍文本）', () => {
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

test('github/contributions：保留 tool-tip 元素及其无障碍文本，过滤危险属性', () => {
  const html = [
    '<div class="js-yearly-contributions">',
    '<table>',
    '<tbody>',
    '<tr>',
    '<td tabindex="0" data-date="2025-07-27" data-level="0" class="ContributionCalendar-day"></td>',
    '<tool-tip class="sr-only position-absolute" data-type="label" onclick="evil()">',
    'No contributions on July 27th.',
    '</tool-tip>',
    '<td tabindex="0" data-date="2025-08-03" data-level="2" class="ContributionCalendar-day"></td>',
    '<tool-tip class="sr-only position-absolute" data-type="label">',
    '7 contributions on August 3rd.',
    '</tool-tip>',
    '</tr>',
    '</tbody>',
    '</table>',
    '</div>',
  ].join('');

  const inner = extractYearlyContributionsInnerHtml(html);

  assert.ok(inner);
  // tool-tip 标签应被保留（用于无障碍）
  assert.ok(inner.includes('<tool-tip'));
  assert.ok(inner.includes('</tool-tip>'));
  // tool-tip 内的文本应被保留（屏幕阅读器依赖）
  assert.ok(inner.includes('No contributions on July 27th.'));
  assert.ok(inner.includes('7 contributions on August 3rd.'));
  // 安全属性（class, data-*）应保留
  assert.ok(inner.includes('class="sr-only position-absolute"'));
  assert.ok(inner.includes('data-type="label"'));
  // 危险属性应被过滤
  assert.ok(!inner.includes('onclick'));
  // td 元素仍然正常保留
  assert.ok(inner.includes('ContributionCalendar-day'));
  assert.ok(inner.includes('data-level="0"'));
  assert.ok(inner.includes('data-level="2"'));
});
