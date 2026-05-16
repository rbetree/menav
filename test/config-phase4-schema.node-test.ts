const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  getConfigValidationErrors,
  loadConfig,
  loadModularConfig,
  resolveConfigDirectory,
} = require('../src/lib/config/index.ts');
const { ConfigError } = require('../src/lib/errors.ts');

function withTempCwd(callback) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-config-phase4-'));
  const originalCwd = process.cwd();

  try {
    process.chdir(tmpDir);
    callback(tmpDir);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('Phase 4：schema 错误信息应包含精确字段路径', () => {
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
              name: '正常站点',
              url: 'https://example.com/ok',
            },
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
    issues.map((issue) => issue.path),
    [
      'pages.bookmarks.categories[0].sites[1].url',
      'pages.bookmarks.categories[0].sites[1].external',
    ]
  );
});

test('Phase 4：默认配置应通过 YAML schema', () => {
  const repoRoot = path.join(__dirname, '..');
  const config = loadModularConfig(path.join(repoRoot, 'config', '_default'));
  const issues = getConfigValidationErrors(config);

  assert.deepEqual(issues, []);
});

test('Phase 4：config/user 完全替换策略不从 _default 补齐页面', () => {
  withTempCwd(() => {
    fs.mkdirSync('config/_default/pages', { recursive: true });
    fs.mkdirSync('config/user/pages', { recursive: true });

    fs.writeFileSync(
      'config/_default/site.yml',
      ['title: Default', 'navigation:', '  - name: 默认页', '    id: default-only', ''].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      'config/_default/pages/default-only.yml',
      ['title: 默认页', 'template: page', 'categories: []', ''].join('\n'),
      'utf8'
    );

    fs.writeFileSync(
      'config/user/site.yml',
      ['title: User', 'navigation:', '  - name: 用户页', '    id: user-only', ''].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      'config/user/pages/user-only.yml',
      ['title: 用户页', 'template: page', 'categories: []', ''].join('\n'),
      'utf8'
    );

    assert.equal(resolveConfigDirectory(), 'config/user');

    const config = loadConfig();
    assert.equal(config.site.title, 'User');
    assert.ok(config['user-only']);
    assert.equal(config['default-only'], undefined);
    assert.deepEqual(getConfigValidationErrors(config), []);
  });
});

test('Phase 4：config/user 缺少 site.yml 时应提示使用 init-config', () => {
  withTempCwd(() => {
    fs.mkdirSync('config/user', { recursive: true });
    fs.mkdirSync('config/_default/pages', { recursive: true });
    fs.writeFileSync('config/_default/site.yml', 'title: Default\n', 'utf8');

    assert.throws(
      () => resolveConfigDirectory(),
      (error) => {
        assert.ok(error instanceof ConfigError);
        const details = [error.message, ...(error.suggestions || [])].join('\n');
        assert.match(details, /npm run init-config/);
        assert.doesNotMatch(details, /完整复制 config\/_default\/ 到 config\/user\//);
        return true;
      }
    );
  });
});

test('Phase 4：config/user 缺少 pages 目录时应提示 init-config 不覆盖现有配置', () => {
  withTempCwd(() => {
    fs.mkdirSync('config/user', { recursive: true });
    fs.writeFileSync('config/user/site.yml', 'title: User\n', 'utf8');

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (line) => warnings.push(String(line));

    try {
      assert.equal(resolveConfigDirectory(), 'config/user');
    } finally {
      console.warn = originalWarn;
    }

    const output = warnings.join('\n');
    assert.match(output, /config\/user\/pages/);
    assert.match(output, /npm run init-config/);
    assert.match(output, /不会覆盖已有 config\/user/);
  });
});

test('Phase 4：导航与页面文件不匹配时应输出提示但不阻断配置加载', () => {
  withTempCwd(() => {
    fs.mkdirSync('config/_default/pages', { recursive: true });
    fs.writeFileSync(
      'config/_default/site.yml',
      [
        'title: Default',
        'navigation:',
        '  - name: 缺页',
        '    id: missing-page',
        '  - name: 已有',
        '    id: common',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      'config/_default/pages/common.yml',
      ['title: 已有', 'template: page', 'categories: []', ''].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      'config/_default/pages/orphan.yml',
      ['title: 未导航', 'template: page', 'categories: []', ''].join('\n'),
      'utf8'
    );

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (line) => warnings.push(String(line));

    try {
      const config = loadModularConfig('config/_default');
      assert.equal(config['missing-page'], undefined);
      assert.ok(config.common);
      assert.ok(config.orphan);
    } finally {
      console.warn = originalWarn;
    }

    const output = warnings.join('\n');
    assert.match(output, /navigation 页面缺少配置文件/);
    assert.match(output, /id=missing-page/);
    assert.match(output, /页面配置未出现在 navigation 中/);
    assert.match(output, /id=orphan/);
  });
});

test('Phase 4：存在的空 YAML 也应输出字段路径错误', () => {
  withTempCwd(() => {
    fs.mkdirSync('config/_default/pages', { recursive: true });
    fs.writeFileSync('config/_default/site.yml', '', 'utf8');
    fs.writeFileSync('config/_default/pages/broken.yml', '', 'utf8');

    const config = loadModularConfig('config/_default');
    const issues = getConfigValidationErrors(config);

    assert.ok(
      issues.some((issue) => issue.path === 'site'),
      '空 site.yml 应被 schema 校验并标记为 site'
    );
    assert.ok(
      issues.some((issue) => issue.path === 'pages.broken'),
      '空页面 YAML 应被 schema 校验并标记为 pages.broken'
    );
  });
});

test('Phase 4：config/README.md 记录的配置字段应存在于 schema', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'config', 'README.md'), 'utf8');
  const { siteConfigSchema } = require('../src/lib/config/schema/site.ts');
  const { pageConfigSchema } = require('../src/lib/config/schema/page.ts');
  const { siteItemSchema } = require('../src/lib/config/schema/shared.ts');

  const siteFields = Object.keys(siteConfigSchema.shape);
  const pageFields = Object.keys(pageConfigSchema.shape);
  const siteItemFields = Object.keys(siteItemSchema.shape);

  for (const field of siteFields) {
    assert.ok(readme.includes(`\`${field}\``), `${field} 未在 config/README.md 中记录`);
  }

  for (const field of pageFields) {
    assert.ok(readme.includes(`\`${field}\``), `${field} 未在 config/README.md 中记录`);
  }

  for (const field of siteItemFields) {
    assert.ok(readme.includes(`\`${field}\``), `${field} 未在 config/README.md 中记录`);
  }
});
