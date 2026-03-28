const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('默认布局：应包含侧边栏分类面板容器（避免子菜单过长挤压页面列表）', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const layoutPath = path.join(repoRoot, 'templates', 'layouts', 'default.hbs');
  const content = fs.readFileSync(layoutPath, 'utf8');

  assert.ok(
    content.includes('sidebar-submenu-panel'),
    'templates/layouts/default.hbs 应包含 sidebar-submenu-panel 容器'
  );
  assert.ok(
    content.includes('data-container="sidebar-submenu"'),
    'sidebar-submenu-panel 容器应包含 data-container="sidebar-submenu"'
  );
});

test('默认布局：应输出 data-theme-mode，支持 dark/light/system 默认模式', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const layoutPath = path.join(repoRoot, 'templates', 'layouts', 'default.hbs');
  const content = fs.readFileSync(layoutPath, 'utf8');

  assert.ok(
    content.includes('data-theme-mode='),
    'templates/layouts/default.hbs 应输出 data-theme-mode 属性'
  );
});

test('侧边栏样式：收起时不应在页面按钮下方显示目录子菜单', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const sidebarStylePath = path.join(repoRoot, 'assets', 'styles', '_sidebar.css');
  const content = fs.readFileSync(sidebarStylePath, 'utf8');

  assert.ok(
    content.includes('.sidebar.collapsed .nav-item-wrapper > .submenu'),
    'assets/styles/_sidebar.css 应在收起态隐藏 nav-item-wrapper 下的 submenu'
  );
  assert.match(
    content,
    /\.sidebar\.collapsed \.nav-item-wrapper > \.submenu\s*\{[^}]*display:\s*none;/m,
    '收起态的 submenu 应明确设置为 display: none'
  );
});

test('侧边栏目录面板：应默认隐藏，并通过独立状态类延后淡入', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const sidebarStylePath = path.join(repoRoot, 'assets', 'styles', '_sidebar.css');
  const uiPath = path.join(repoRoot, 'src', 'runtime', 'app', 'ui.js');
  const styleContent = fs.readFileSync(sidebarStylePath, 'utf8');
  const uiContent = fs.readFileSync(uiPath, 'utf8');

  assert.match(
    styleContent,
    /\.sidebar-submenu-panel\s*\{[\s\S]*opacity:\s*0;[\s\S]*visibility:\s*hidden;/m,
    '目录面板默认应处于隐藏状态'
  );
  assert.match(
    styleContent,
    /\.sidebar\.submenu-panel-visible \.sidebar-submenu-panel:not\(:empty\)\s*\{[\s\S]*opacity:\s*1;[\s\S]*visibility:\s*visible;/m,
    '目录面板应通过 submenu-panel-visible 状态类显现'
  );
  assert.ok(
    uiContent.includes('submenu-panel-visible'),
    'src/runtime/app/ui.js 应控制 submenu-panel-visible 状态类'
  );
});
