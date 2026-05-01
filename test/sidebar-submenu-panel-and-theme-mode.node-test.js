const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Astro 默认布局：应包含侧边栏分类面板容器', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const layoutPath = path.join(repoRoot, 'src', 'layouts', 'DefaultLayout.astro');
  const content = fs.readFileSync(layoutPath, 'utf8');

  assert.ok(content.includes('sidebar-submenu-panel'));
  assert.ok(content.includes('data-container="sidebar-submenu"'));
});

test('Astro 默认布局：应输出 data-theme-mode，支持 dark/light/system 默认模式', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const layoutPath = path.join(repoRoot, 'src', 'layouts', 'DefaultLayout.astro');
  const content = fs.readFileSync(layoutPath, 'utf8');

  assert.ok(content.includes('data-theme-mode={themeMode}'));
  assert.ok(content.includes("site.theme?.mode || 'dark'"));
});
