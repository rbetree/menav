const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadConfig } = require('../src/lib/config/index.ts');

function withTempCwd(callback) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-multilevel-external-test-'));
  const originalCwd = process.cwd();

  try {
    process.chdir(tmpDir);
    callback(tmpDir);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('多级结构下 sites.external 未配置时应默认 true，且 external:false 不应被覆盖', () => {
  withTempCwd((tmpDir) => {
    const defaultConfigDir = path.join(tmpDir, 'config', '_default');
    const defaultPagesDir = path.join(defaultConfigDir, 'pages');
    fs.mkdirSync(defaultPagesDir, { recursive: true });

    fs.writeFileSync(path.join(defaultConfigDir, 'site.yml'), 'title: Test\n', 'utf8');

    fs.writeFileSync(
      path.join(defaultPagesDir, 'bookmarks.yml'),
      [
        'title: 书签',
        'subtitle: bookmarks',
        'template: bookmarks',
        'categories:',
        '  - name: 技术资源',
        '    groups:',
        '      - name: 组内站点',
        '        sites:',
        '          - name: GroupSite',
        '            url: https://example.com/group',
        '    subcategories:',
        '      - name: 前端开发',
        '        groups:',
        '          - name: 框架库',
        '            subgroups:',
        '              - name: 深层分组',
        '                sites:',
        '                  - name: DeepDefaultExternal',
        '                    url: https://example.com/deep-default',
        '                  - name: DeepExternalFalse',
        '                    url: https://example.com/deep-false',
        '                    external: false',
        '',
      ].join('\n'),
      'utf8'
    );

    const config = loadConfig();

    const groupSite = config.bookmarks.categories[0].groups[0].sites[0];
    assert.equal(groupSite.external, true);

    const deepSites = config.bookmarks.categories[0].subcategories[0].groups[0].subgroups[0].sites;
    assert.equal(deepSites[0].external, true);
    assert.equal(deepSites[1].external, false);
  });
});
