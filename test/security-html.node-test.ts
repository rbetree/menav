const test = require('node:test');
const assert = require('node:assert/strict');

const { htmlToText, sanitizeHtmlFragment } = require('../src/lib/security/html.ts');
const { getSafeUrl } = require('../src/lib/view-data/view-utils.ts');
const { extractYearlyContributionsInnerHtml } = require('../src/lib/github/contributions.ts');

const LINK_POLICY = {
  allowedTags: new Set(['a', 'span']),
  globalAttributes: new Set(['href', 'class']),
  uriAttributes: new Set(['href']),
};

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

test('security/html：sanitize 拦截反斜杠协议相对 href，且文本实体消毒幂等', () => {
  // /\evil.com 应被拦截（WHATWG 在 authority 位置将反斜杠视为正斜杠）
  const backslash = sanitizeHtmlFragment('<a href="/\\evil.com">x</a>', LINK_POLICY);
  assert.equal(backslash, '<a>x</a>');

  // //evil.com 应被拦截
  const protoRel = sanitizeHtmlFragment('<a href="//evil.com">x</a>', LINK_POLICY);
  assert.equal(protoRel, '<a>x</a>');

  // 正常相对链接保留
  const normal = sanitizeHtmlFragment('<a href="/path">x</a>', LINK_POLICY);
  assert.equal(normal, '<a href="/path">x</a>');

  // 文本节点消毒幂等：已转义实体再消毒一次不升档
  const once = sanitizeHtmlFragment('<span>Nov &amp; Dec</span>', LINK_POLICY);
  assert.equal(once, '<span>Nov &amp; Dec</span>');
  const twice = sanitizeHtmlFragment(once, LINK_POLICY);
  assert.equal(twice, '<span>Nov &amp; Dec</span>');
});

test('security/html：URI 属性先解码再判定，实体编码的协议相对 URL 被拦截', () => {
  // 实体编码的 //evil.com 解码后是协议相对 URL，不能因为原文不含 // 就放行。
  assert.equal(
    sanitizeHtmlFragment('<a href="&#x2f;&#x2f;evil.com">x</a>', LINK_POLICY),
    '<a>x</a>'
  );
  assert.equal(sanitizeHtmlFragment('<a href="&#47;&#47;evil.com">x</a>', LINK_POLICY), '<a>x</a>');
  assert.equal(
    sanitizeHtmlFragment('<a href="&#x6a;avascript:alert(1)">x</a>', LINK_POLICY),
    '<a>x</a>'
  );

  // 安全的实体值输出与判定使用同一解码结果，仅做一次转义。
  assert.equal(
    sanitizeHtmlFragment('<a href="https://example.com/?a=1&amp;b=2">x</a>', LINK_POLICY),
    '<a href="https://example.com/?a=1&amp;b=2">x</a>'
  );
});

test('github/contributions：真实热力图标记保留 id、aria-labelledby 与 class', () => {
  const html = [
    '<div class="js-yearly-contributions">',
    '<div class="js-calendar-graph">',
    '<svg viewBox="0 0 20 20">',
    '<g>',
    '<rect id="search" aria-labelledby="tooltip-1" class="ContributionCalendar-day"',
    ' data-level="2" data-date="2025-11-10"></rect>',
    '<tool-tip id="tooltip-1">7 contributions on November 10th.</tool-tip>',
    '</g>',
    '</svg>',
    '</div>',
    '</div>',
  ].join('');

  const inner = extractYearlyContributionsInnerHtml(html);

  assert.ok(inner);
  assert.ok(inner.includes('id="search"'));
  assert.ok(inner.includes('aria-labelledby="tooltip-1"'));
  assert.ok(inner.includes('class="ContributionCalendar-day"'));
  assert.ok(inner.includes('data-level="2"'));
});

test('security/view-utils：getSafeUrl 拦截协议相对与反斜杠协议相对 URL', () => {
  const allowed = ['http', 'https', 'mailto', 'tel'];

  // 协议相对（// 与 /\）均应降级为 #
  assert.equal(getSafeUrl('//evil.com', allowed), '#');
  assert.equal(getSafeUrl('/\\evil.com', allowed), '#');
  assert.equal(getSafeUrl('/\\t/evil.com', allowed), '#');

  // 正常相对路径与合法 scheme 保留
  assert.equal(getSafeUrl('/path', allowed), '/path');
  assert.equal(getSafeUrl('./x', allowed), './x');
  assert.equal(getSafeUrl('https://example.com', allowed), 'https://example.com');

  // 危险 scheme 降级
  assert.equal(getSafeUrl('javascript:alert(1)', allowed), '#');
});
