const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('侧边栏折叠策略：窄屏只改外观，桌面偏好保留并在断点恢复', () => {
  const ui = read('src/runtime/app/ui.ts');
  const router = read('src/runtime/app/router.ts');
  const styles = read('assets/styles/_sidebar.css');

  assert.ok(ui.includes('return !isMobile() && state.isSidebarCollapsed;'));
  assert.ok(ui.includes('isSidebarCollapsed: isSidebarCollapsedEffective'));
  assert.ok(ui.includes("safeGetItem('sidebarCollapsed')"));
  assert.ok(ui.includes('applySidebarCollapseState()'));
  assert.ok(!/state\.isSidebarCollapsed\s*=\s*false/.test(ui), '窄屏分支不应清掉桌面折叠偏好');

  assert.ok(router.includes('ui.isSidebarCollapsed()'));
  assert.ok(
    !router.includes("sidebar.classList.contains('collapsed')"),
    'router 不应单独读取折叠 DOM class'
  );

  assert.match(styles, /\.sidebar\.collapsed\.submenu-panel-visible\s+\.sidebar-submenu-panel/);
});

test('localStorage 保护：运行时与内联脚本都不直接依赖原生存储', () => {
  for (const relativePath of [
    'src/runtime/app/ui.ts',
    'src/runtime/app/nested.ts',
    'src/runtime/app/search/index.ts',
  ]) {
    const content = read(relativePath);
    assert.ok(
      !/\blocalStorage\s*\.\s*(?:get|set)Item/.test(content),
      `${relativePath} 应通过 safeStorage 访问 localStorage`
    );
  }

  const preload = read('src/components/ThemePreloadScript.astro');
  assert.match(
    preload,
    /try\s*\{[\s\S]*?localStorage\.getItem\('theme'\)[\s\S]*?\}\s*catch/,
    '预加载脚本应保护主题读取'
  );
  assert.match(
    preload,
    /try\s*\{[\s\S]*?localStorage\.getItem\('sidebarCollapsed'\)[\s\S]*?\}\s*catch/,
    '预加载脚本应保护侧边栏读取'
  );

  const adminHtml = read('admin/index.html');
  assert.match(
    adminHtml,
    /try\s*\{[\s\S]*?localStorage\.getItem\('admin-theme'\)[\s\S]*?\}\s*catch/,
    '管理台内联主题脚本应保护读取'
  );

  const adminApp = read('admin/app.js');
  assert.match(
    adminApp,
    /try\s*\{[\s\S]*?localStorage\.setItem\('admin-theme'[\s\S]*?\}\s*catch/,
    '管理台主题切换应保护写入'
  );
});
