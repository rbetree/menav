const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function buildSite() {
  const repoRoot = path.resolve(__dirname, '..');
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'build.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PROJECTS_ENABLED: 'false',
      HEATMAP_ENABLED: 'false',
      RSS_ENABLED: 'false',
    },
    stdio: 'inherit',
  });

  const exitCode = result && Number.isFinite(result.status) ? result.status : 1;
  assert.equal(exitCode, 0);

  return fs.readFileSync(path.join(repoRoot, 'dist', 'index.html'), 'utf8');
}

test('站点配置包含 faviconUrl 时，Astro 构建产物保留 data-favicon-url 与 img src', () => {
  const html = buildSite();

  assert.match(html, /data-favicon-url="assets\/menav\.svg"/);
  assert.match(html, /src="assets\/menav\.svg"/);
});
