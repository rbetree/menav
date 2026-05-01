const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  ensureUserConfigInitialized,
  ensureUserSiteYmlExists,
  upsertBookmarksNavInSiteYml,
  parseBookmarks,
  generateBookmarksYaml,
} = require('../src/bookmark-processor.js');

function stripYamlComments(yamlText) {
  return yamlText
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
    .trim();
}

test('parseBookmarks：解析书签栏、根目录书签与图标映射', () => {
  const html = `
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
  <DL><p>
    <DT><A HREF="https://github.com/">GitHub</A>
    <DT><H3>工具</H3>
    <DL><p>
      <DT><A HREF="https://www.google.com/">Google</A>
    </DL><p>
  </DL><p>
</DL><p>
`;

  const bookmarks = parseBookmarks(html);
  assert.ok(bookmarks);
  assert.ok(Array.isArray(bookmarks.categories));
  assert.ok(bookmarks.categories.length >= 2);

  // 根目录书签应该插入到首位
  assert.equal(bookmarks.categories[0].name, '根目录书签');
  assert.ok(Array.isArray(bookmarks.categories[0].sites));
  assert.equal(bookmarks.categories[0].sites[0].name, 'GitHub');
  assert.equal(bookmarks.categories[0].sites[0].icon, 'fab fa-github');

  const tools = bookmarks.categories.find((c) => c.name === '工具');
  assert.ok(tools, '应解析出“工具”分类');
  assert.ok(Array.isArray(tools.sites));
  assert.equal(tools.sites[0].name, 'Google');
});

test('page-data：subgroups（第4层）应保留给 Astro 页面渲染', () => {
  const { preparePageData } = require('../src/generator.js');
  const config = {
    site: { title: 'Test Site', description: '', author: '', favicon: '', logo_text: 'Test' },
    profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
    social: [],
    navigation: [{ id: 'bookmarks', name: '书签', icon: 'fas fa-bookmark' }],
    bookmarks: {
      title: '我的书签',
      subtitle: '测试 subgroups 渲染',
      template: 'bookmarks',
      icons: { mode: 'manual' },
      categories: [
        {
          name: '技术',
          icon: 'fas fa-code',
          subcategories: [
            {
              name: '前端',
              icon: 'fas fa-laptop-code',
              groups: [
                {
                  name: '框架',
                  icon: 'fas fa-cubes',
                  subgroups: [
                    {
                      name: 'React生态',
                      icon: 'fab fa-react',
                      sites: [
                        {
                          name: 'React',
                          url: 'https://reactjs.org/',
                          icon: 'fab fa-react',
                          description: 'React官方',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const page = preparePageData('bookmarks', config).data;
  const subgroup = page.categories[0].subcategories[0].groups[0].subgroups[0];

  assert.equal(subgroup.name, 'React生态');
  assert.equal(subgroup.sites[0].name, 'React');
});

test('generateBookmarksYaml：生成 YAML 且可被解析', () => {
  const bookmarks = {
    categories: [
      {
        name: '示例分类',
        icon: 'fas fa-folder',
        sites: [
          { name: 'Example', url: 'https://example.com', icon: 'fas fa-link', description: '' },
        ],
      },
    ],
  };

  const yamlText = generateBookmarksYaml(bookmarks);
  assert.ok(typeof yamlText === 'string');
  assert.ok(yamlText.includes('# 自动生成的书签配置文件'));
  assert.ok(yamlText.includes('categories:'));

  const yaml = require('js-yaml');
  const parsed = yaml.load(stripYamlComments(yamlText));
  assert.equal(parsed.title, '我的书签');
  assert.ok(Array.isArray(parsed.categories));
  assert.equal(parsed.categories[0].name, '示例分类');
});

test('upsertBookmarksNavInSiteYml：无 navigation 时追加并幂等', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-test-'));
  const filePath = path.join(tmp, 'site.yml');

  fs.writeFileSync(filePath, `title: Test Site\n`, 'utf8');

  const r1 = upsertBookmarksNavInSiteYml(filePath);
  assert.equal(r1.updated, true);

  const updated1 = fs.readFileSync(filePath, 'utf8');
  assert.ok(updated1.includes('navigation:'));
  assert.ok(updated1.includes('- name: 书签'));
  assert.ok(updated1.includes('id: bookmarks'));

  const r2 = upsertBookmarksNavInSiteYml(filePath);
  assert.equal(r2.updated, false);
  assert.equal(r2.reason, 'already_present');
});

test('ensureUserConfigInitialized/ensureUserSiteYmlExists：可在空目录初始化用户配置', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-test-'));
  const originalCwd = process.cwd();
  process.chdir(tmp);

  try {
    fs.mkdirSync('config/_default/pages', { recursive: true });
    fs.writeFileSync('config/_default/site.yml', 'title: Default\n', 'utf8');
    fs.writeFileSync('config/_default/pages/common.yml', 'categories: []\n', 'utf8');

    const init = ensureUserConfigInitialized();
    assert.equal(init.initialized, true);
    assert.ok(fs.existsSync('config/user/site.yml'));
    assert.ok(fs.existsSync('config/user/pages/common.yml'));

    // 若 site.yml 已存在，应直接返回 true
    assert.equal(ensureUserSiteYmlExists(), true);
  } finally {
    process.chdir(originalCwd);
  }
});
