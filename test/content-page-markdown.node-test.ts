const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { preparePageData } = require('../src/lib/view-data/page-data.ts');

function withRepoRoot(fn) {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));
  try {
    return fn();
  } finally {
    process.chdir(originalCwd);
  }
}

test('content：构建期渲染 markdown 文件，并对链接做 scheme 安全降级', () => {
  withRepoRoot(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-content-page-'));
    const mdPath = path.join(tmpDir, 'about.md');
    fs.writeFileSync(
      mdPath,
      [
        '# About',
        '',
        'A normal link: [ok](https://example.com)',
        '',
        'A bad link: [bad](javascript:alert(1))',
        '',
        'Protocol-relative should be blocked: [pr](//example.com)',
        '',
        'Image should be disabled: ![x](https://example.com/x.png)',
      ].join('\n'),
      'utf8'
    );

    try {
      const config = {
        site: {
          title: 'Test Site',
          description: '',
          author: '',
          favicon: '',
          logo_text: 'Test',
          security: { allowedSchemes: ['http', 'https', 'mailto', 'tel'] },
        },
        profile: { title: 'PROFILE_TITLE', subtitle: 'PROFILE_SUBTITLE' },
        social: [],
        navigation: [{ id: 'about', name: '关于', icon: 'fas fa-info' }],
        about: {
          title: '关于',
          subtitle: '说明',
          template: 'content',
          content: {
            file: mdPath,
          },
        },
      };

      const { data, templateName } = preparePageData('about', config);
      const html = data.contentHtml;

      assert.equal(templateName, 'content');
      assert.ok(typeof html === 'string' && html.length > 0);
      assert.ok(html.includes('<h1>About</h1>'));
      assert.ok(html.includes('A normal link'));
      assert.ok(html.includes('href="https://example.com"'));

      // javascript: should be blocked
      assert.ok(html.includes('A bad link'));
      assert.ok(/href=['"]#['"]/.test(html), '不安全链接应降级为 href="#"');

      // protocol-relative should be blocked
      assert.ok(html.includes('Protocol-relative should be blocked'));

      // image should be disabled
      assert.ok(!html.includes('<img'), '本期不支持图片：markdown 渲染不应输出 <img>');
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});
