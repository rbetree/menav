const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('render context：layout 不应把完整 config 传入页面内容组件', () => {
  const layout = read('src/layouts/DefaultLayout.astro');

  assert.ok(layout.includes('renderContext={renderContext}'));
  assert.equal(layout.includes('root={config}'), false);
});

test('render context：页面内容组件链路应使用 renderContext 命名入口', () => {
  const files = [
    'src/components/PageContent.astro',
    'src/components/Category.astro',
    'src/components/Group.astro',
    'src/components/SiteCard.astro',
    'src/components/CardIcon.astro',
  ];

  files.forEach((file) => {
    const content = read(file);
    assert.ok(content.includes('renderContext'), `${file} 应使用 renderContext`);
    assert.equal(content.includes('root?:'), false, `${file} 不应保留 root prop 类型`);
    assert.equal(content.includes('root={'), false, `${file} 不应继续传递 root prop`);
  });
});
