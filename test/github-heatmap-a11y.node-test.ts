const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { prepareHeatmapHtml } = require('../src/lib/github/contributions.ts');
const { buildHeatmapPalette } = require('../src/lib/github/heatmap-colors.ts');

const REPO_ROOT = path.join(__dirname, '..');
const DARK_CARD_BG = '#1e1c1a';
const LIGHT_CARD_BG = '#e9e9e4';

const SAMPLE_HTML = [
  '<div class="js-calendar-graph">',
  '<h2 id="js-contribution-activity-description">552 contributions in the last year</h2>',
  '<a class="show-on-focus" href="#year-link-2026">Skip to contributions year list</a>',
  '<div class="float-left">',
  '<a href="https://docs.github.com/en/account-and-profile">Learn how we count contributions</a>',
  '</div>',
  '<table>',
  '<caption class="sr-only">Contribution Graph</caption>',
  '<tbody><tr>',
  '<td tabindex="0" data-ix="1" aria-selected="false" aria-readonly="false"',
  ' aria-describedby="contribution-graph-legend-level-1" data-date="2025-11-09"',
  ' data-level="1" role="gridcell" data-view-component="true"',
  ' data-hydro-click="{&quot;event_type&quot;:&quot;click&quot;}"',
  ' data-hydro-click-hmac="abc" class="ContributionCalendar-day"></td>',
  '<tool-tip id="tooltip-1" class="sr-only position-absolute">',
  '3 contributions on November 9th.',
  '</tool-tip>',
  '<td tabindex="0" data-date="2025-11-10" data-level="2" role="gridcell"',
  ' class="ContributionCalendar-day"></td>',
  '<tool-tip id="tooltip-2" class="sr-only">7 contributions on November 10th.</tool-tip>',
  '</tr></tbody>',
  '</table>',
  '</div>',
].join('');

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function channelToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function assertHexClose(actual: string, expected: string, tolerance = 2): void {
  const actualChannels = parseHex(actual);
  const expectedChannels = parseHex(expected);
  actualChannels.forEach((channel, index) => {
    assert.ok(
      Math.abs(channel - expectedChannels[index]) <= tolerance,
      `${actual} 与调研值 ${expected} 的第 ${index + 1} 通道差异超过 ${tolerance}`
    );
  });
}

test('github/heatmap：清理后不保留 tabindex、链接、tool-tip 与 grid 语义', () => {
  const prepared = prepareHeatmapHtml(SAMPLE_HTML);
  const html = prepared.html;

  assert.ok(html);
  assert.ok(!html.includes('tabindex'));
  assert.ok(!/<a\b/i.test(html));
  assert.ok(!html.includes('tool-tip'));
  assert.ok(!/role\s*=\s*["']?grid/i.test(html));
  assert.ok(!html.includes('aria-selected'));
  assert.ok(!html.includes('aria-readonly'));
  assert.ok(!html.includes('aria-describedby'));
  assert.ok(!html.includes('data-hydro-click'));
  // 布局与数据属性保留：CSS 依赖 data-level，脚本依赖 data-date。
  assert.ok(html.includes('data-level="1"'));
  assert.ok(html.includes('data-level="2"'));
  assert.ok(html.includes('data-date="2025-11-09"'));
  assert.ok(html.includes('class="ContributionCalendar-day"'));
  assert.ok(html.includes('<caption class="sr-only">Contribution Graph</caption>'));
  assert.equal(prepared.summary, '552 contributions in the last year');
});

test('github/heatmap：摘要从 h2 提取纯文本并解码实体', () => {
  const prepared = prepareHeatmapHtml(
    '<div><h2 id="js-contribution-activity-description">1,234 contributions &amp; counting</h2></div>'
  );

  assert.equal(prepared.summary, '1,234 contributions & counting');
  assert.equal(prepareHeatmapHtml('<div><p>no summary</p></div>').summary, '');
});

test('github/heatmap：转换后仍含焦点元素时 fail-closed 返回空可视化 HTML', () => {
  const withButton = prepareHeatmapHtml(
    `<div>${SAMPLE_HTML}<button type="button">打开</button></div>`
  );
  assert.equal(withButton.html, '');
  assert.equal(withButton.summary, '552 contributions in the last year');

  const unclosedLink = prepareHeatmapHtml('<div><a href="#">未闭合链接');
  assert.equal(unclosedLink.html, '');

  assert.deepEqual(prepareHeatmapHtml(''), { html: '', summary: '' });
  assert.deepEqual(prepareHeatmapHtml('<a href="#">only link</a>'), { html: '', summary: '' });
});

test('github/heatmap：默认色 37b24d 生成接近调研表格的双主题色阶', () => {
  const palette = buildHeatmapPalette('37b24d');

  assert.equal(palette.dark[0], 'rgba(255, 255, 255, 0.08)');
  assert.equal(palette.light[0], '#d8dee4');
  assertHexClose(palette.dark[1], '#277f37');
  assertHexClose(palette.dark[2], '#2f9a42');
  assertHexClose(palette.dark[3], '#3bb350');
  assertHexClose(palette.dark[4], '#77cb86');
  assertHexClose(palette.light[1], '#2e9340');
  assertHexClose(palette.light[2], '#277f37');
  assertHexClose(palette.light[3], '#216b2e');
  assertHexClose(palette.light[4], '#1a5525');

  // 深色 level 递增变亮，浅色 level 递增变暗。
  const darkLevels = palette.dark.slice(1).map(relativeLuminance);
  const lightLevels = palette.light.slice(1).map(relativeLuminance);
  darkLevels.forEach((luminance, index) => {
    if (index > 0) assert.ok(luminance > darkLevels[index - 1]);
  });
  lightLevels.forEach((luminance, index) => {
    if (index > 0) assert.ok(luminance < lightLevels[index - 1]);
  });
});

test('github/heatmap：默认与极端颜色在两个主题下 1–4 级对卡片背景 ≥ 3:1', () => {
  for (const color of ['37b24d', '#000000', '#ffffff', '339af0', 'abcdef']) {
    const palette = buildHeatmapPalette(color);

    // level 0 是没有贡献的空格子，只做弱提示，不参与数据层级对比度要求。
    palette.dark.slice(1).forEach((value: string, index: number) => {
      assert.ok(
        contrastRatio(value, DARK_CARD_BG) >= 3,
        `${color} 深色 level ${index + 1} (${value}) 对比度不足`
      );
    });
    palette.light.slice(1).forEach((value: string, index: number) => {
      assert.ok(
        contrastRatio(value, LIGHT_CARD_BG) >= 3,
        `${color} 浅色 level ${index + 1} (${value}) 对比度不足`
      );
    });
  }
});

test('github/heatmap：组件把可视化标记为装饰并提供摘要与 GitHub 链接降级', () => {
  const component = fs.readFileSync(
    path.join(REPO_ROOT, 'src', 'components', 'GitHubHeatmap.astro'),
    'utf8'
  );
  const styles = fs.readFileSync(
    path.join(REPO_ROOT, 'assets', 'styles', '_github-heatmap.css'),
    'utf8'
  );

  assert.ok(component.includes('aria-hidden="true"'));
  assert.ok(component.includes('visually-hidden'));
  assert.ok(component.includes('gh-heatmap-fallback'));
  assert.ok(component.includes('在 GitHub 查看完整贡献数据'));
  assert.ok(component.includes('html.theme-preload'));
  assert.ok(component.includes('html.light-theme'));
  assert.ok(!component.includes('Loading data...'));
  assert.ok(!/rgba\(/.test(component));
  assert.ok(!styles.includes('show-on-focus'));
});
