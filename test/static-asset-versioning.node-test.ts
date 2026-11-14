const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { versionStaticAssets } = require('../scripts/version-static-assets.ts');

const repoRoot = path.resolve(__dirname, '..');
const HASH_LENGTH = 10;
const STYLE_CONTENT = 'body{color:#000}';
const PINYIN_CONTENT = 'window.PinyinMatch={};';

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, HASH_LENGTH);
}

function createDistFixture() {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-version-assets-'));
  const searchIndexContent = '{"schemaVersion":1,"items":[]}';
  const runtimeSource = 'const SEARCH_INDEX_URL="./search-index.json";fetch(SEARCH_INDEX_URL);';

  fs.mkdirSync(path.join(distDir, 'assets'));
  fs.writeFileSync(path.join(distDir, 'search-index.json'), searchIndexContent);
  fs.writeFileSync(path.join(distDir, 'script.js'), runtimeSource);
  fs.writeFileSync(path.join(distDir, 'pinyin-match.js'), PINYIN_CONTENT);
  fs.writeFileSync(path.join(distDir, 'assets', 'style.css'), STYLE_CONTENT);
  fs.writeFileSync(
    path.join(distDir, 'index.html'),
    [
      '<link rel="stylesheet" href="./assets/style.css">',
      '<script src="./pinyin-match.js" defer></script>',
      '<script src="./script.js" defer></script>',
    ].join('')
  );

  return { distDir, searchIndexContent, runtimeSource };
}

test('静态资源版本化：索引 hash 注入 runtime 后再计算 HTML 引用版本', () => {
  const { distDir, searchIndexContent, runtimeSource } = createDistFixture();
  try {
    const versions = versionStaticAssets(distDir);
    const runtimeAfter = fs.readFileSync(path.join(distDir, 'script.js'), 'utf8');
    const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

    assert.equal(versions.searchIndex, sha256(searchIndexContent));
    assert.ok(runtimeAfter.includes(`./search-index.json?v=${versions.searchIndex}`));
    assert.equal(versions.runtime, sha256(runtimeAfter));
    assert.notEqual(versions.runtime, sha256(runtimeSource));
    assert.equal(versions.style, sha256(STYLE_CONTENT));
    assert.equal(versions.pinyin, sha256(PINYIN_CONTENT));
    assert.ok(html.includes(`./assets/style.css?v=${versions.style}`));
    assert.ok(html.includes(`./pinyin-match.js?v=${versions.pinyin}`));
    assert.ok(html.includes(`./script.js?v=${versions.runtime}`));
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});

test('静态资源版本化：重复执行只替换查询串', () => {
  const { distDir, searchIndexContent } = createDistFixture();
  try {
    const first = versionStaticAssets(distDir);
    const second = versionStaticAssets(distDir);
    const runtimeAfter = fs.readFileSync(path.join(distDir, 'script.js'), 'utf8');
    const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

    assert.deepEqual(second, first);
    assert.equal(second.searchIndex, sha256(searchIndexContent));
    assert.equal((runtimeAfter.match(/\?v=/g) || []).length, 1);
    assert.equal((html.match(/\?v=/g) || []).length, 3);
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});

test('静态资源版本化：缺失搜索索引字面量时失败', () => {
  const { distDir } = createDistFixture();
  try {
    fs.writeFileSync(path.join(distDir, 'script.js'), 'console.log("no index");');
    assert.throws(() => versionStaticAssets(distDir), /search-index\.json/);
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});

test('静态资源版本化：构建流水线与最终审计均接入版本化', () => {
  const buildPipeline = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'lib', 'build-pipeline.ts'),
    'utf8'
  );
  const auditFinal = fs.readFileSync(path.join(repoRoot, 'scripts', 'audit-final.ts'), 'utf8');

  assert.ok(buildPipeline.includes("'version-static-assets.ts'"));
  assert.ok(
    buildPipeline.indexOf('run-astro-build.ts') < buildPipeline.indexOf('version-static-assets.ts'),
    '版本化必须在 Astro build 之后执行'
  );
  assert.ok(auditFinal.includes('auditStaticAssetVersioning'));
  assert.ok(auditFinal.includes("'./script.js?v='"));
});

test('静态资源版本化：缺少构建产物时失败', () => {
  const { distDir } = createDistFixture();
  try {
    fs.rmSync(path.join(distDir, 'assets', 'style.css'));
    assert.throws(() => versionStaticAssets(distDir), /assets[\\/]style\.css/);
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});
