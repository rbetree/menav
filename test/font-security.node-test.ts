const test = require('node:test');
const assert = require('node:assert/strict');

const { generateFontCss, generateFontLinks } = require('../src/lib/html/fonts.ts');

test('html/fonts：字体 CSS 只输出安全 family 和 weight', () => {
  const css = generateFontCss({
    fonts: {
      family: 'LXGW WenKai, sans-serif',
      weight: '400; color:red',
    },
  });

  assert.ok(css.includes('--font-body: "LXGW WenKai", sans-serif;'));
  assert.ok(css.includes('--font-weight-body: normal;'));
  assert.ok(!css.includes('color:red'));
});

test('html/fonts：危险 font family 降级为系统字体', () => {
  const css = generateFontCss({
    fonts: {
      family: 'Bad"; } body { background:red',
      weight: 700,
    },
  });

  assert.ok(css.includes('--font-body: system-ui, sans-serif;'));
  assert.ok(css.includes('--font-weight-body: 700;'));
  assert.ok(!css.includes('background:red'));
  assert.ok(!css.includes('</style'));
});

test('html/fonts：Google 字体链接使用规范化后的安全 family', () => {
  const links = generateFontLinks({
    fonts: {
      source: 'google',
      family: 'Noto Sans SC, sans-serif',
      weight: 500,
    },
  });

  assert.ok(links.includes('family=Noto+Sans+SC:wght@500'));
  assert.ok(!links.includes('%22'));
});
