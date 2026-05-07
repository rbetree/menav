const test = require('node:test');
const assert = require('node:assert/strict');

const { getConfigValidationErrors } = require('../src/lib/config/index.ts');

test('Phase 3：配置校验错误应包含页面字段路径', () => {
  const issues = getConfigValidationErrors({
    site: {},
    navigation: [{ id: 'bookmarks', name: '书签' }],
    bookmarks: {
      template: 'bookmarks',
      categories: [
        {
          name: '工具',
          sites: [
            {
              name: '错误站点',
              url: 123,
              external: 'yes',
            },
          ],
        },
      ],
    },
  });

  assert.deepEqual(
    issues.map((issue) => `${issue.path}: ${issue.message}`),
    [
      'pages.bookmarks.categories[0].sites[0].url: 期望为 字符串',
      'pages.bookmarks.categories[0].sites[0].external: 期望为 布尔值',
    ]
  );
});
