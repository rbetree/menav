const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { prepareIconAssets } = require('../scripts/lib/public-assets.ts');
const { createSeed } = require('../scripts/lib/seed.ts');
const {
  resolveSnapshotAssetReference,
  isSnapshotAssetPath,
} = require('../src/shared/snapshot-assets.ts');

function createTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-assets-'));
  fs.mkdirSync(path.join(dir, 'assets', 'icons'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  return dir;
}

function withCwd(dir, callback) {
  const originalCwd = process.cwd();
  process.chdir(dir);
  try {
    callback();
  } finally {
    process.chdir(originalCwd);
  }
}

function createLogger() {
  const warnings = [];
  return {
    warnings,
    warn(message, meta) {
      warnings.push({ message, meta });
    },
  };
}

test('快照资产路径：保留 assets 相对路径，拒绝目录穿越', () => {
  assert.deepEqual(resolveSnapshotAssetReference('assets/icons/fav.ico'), {
    destination: 'assets/icons/fav.ico',
    source: 'assets/icons/fav.ico',
  });
  assert.deepEqual(resolveSnapshotAssetReference('./logo.svg'), {
    destination: 'logo.svg',
    source: 'assets/logo.svg',
  });
  assert.equal(resolveSnapshotAssetReference('assets/../evil.ico'), null);
  assert.equal(resolveSnapshotAssetReference('../evil.ico'), null);
  assert.equal(resolveSnapshotAssetReference('icons/fav.ico'), null);
  assert.equal(resolveSnapshotAssetReference('https://example.com/logo.png'), null);
  assert.equal(isSnapshotAssetPath('assets/icons/fav.ico'), true);
});

test('静态构建：favicon 与 logo 按配置相对路径复制到 public', () => {
  const dir = createTempProject();
  fs.writeFileSync(path.join(dir, 'assets', 'icons', 'fav.ico'), 'favicon');
  fs.writeFileSync(path.join(dir, 'assets', 'logo.svg'), 'logo');

  try {
    withCwd(dir, () => {
      const log = createLogger();
      prepareIconAssets(
        { site: { favicon: 'assets/icons/fav.ico', logo: 'assets/logo.svg' } },
        log
      );

      assert.equal(
        fs.readFileSync(path.join(dir, 'public', 'assets', 'icons', 'fav.ico'), 'utf8'),
        'favicon'
      );
      assert.equal(fs.readFileSync(path.join(dir, 'public', 'assets', 'logo.svg'), 'utf8'), 'logo');
      assert.deepEqual(log.warnings, []);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('静态构建：拒绝目录穿越的 favicon，且不中断构建', () => {
  const dir = createTempProject();
  fs.writeFileSync(path.join(dir, 'evil.ico'), 'evil');

  try {
    withCwd(dir, () => {
      const log = createLogger();
      prepareIconAssets({ site: { favicon: 'assets/../evil.ico' } }, log);

      assert.equal(fs.existsSync(path.join(dir, 'public', 'evil.ico')), false);
      assert.equal(fs.existsSync(path.join(dir, 'public', 'assets', 'evil.ico')), false);
      assert.equal(log.warnings.length, 1);
      assert.match(log.warnings[0].message, /路径不受支持/);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('种子导入：favicon 与 logo 都写入快照资产映射', () => {
  const dir = createTempProject();
  fs.writeFileSync(path.join(dir, 'assets', 'icons', 'fav.ico'), 'favicon');
  fs.writeFileSync(path.join(dir, 'assets', 'logo.svg'), 'logo');

  try {
    withCwd(dir, () => {
      const seed = createSeed({
        site: { favicon: 'assets/icons/fav.ico', logo: 'assets/logo.svg' },
        navigation: [],
        pages: {},
      });
      const assets = JSON.parse(seed.settings.assets);

      assert.ok(assets['assets/icons/fav.ico']);
      assert.ok(assets['assets/logo.svg']);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('默认布局：favicon 与 logo 输出使用同一配置相对路径', () => {
  const layout = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'layouts', 'DefaultLayout.astro'),
    'utf8'
  );

  assert.ok(layout.includes("const favicon = toSiteAssetHref(site.favicon || 'menav.svg');"));
  assert.ok(
    layout.includes("const brandImage = toSiteAssetHref(site.logo || site.favicon || '');")
  );
  assert.ok(layout.includes('<link rel="icon" href={favicon}'));
  assert.ok(layout.includes('src={brandImage}'));
});
