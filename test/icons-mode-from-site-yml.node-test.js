const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadConfig } = require('../src/lib/config/index.ts');

function withTempCwd(callback) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-icons-mode-test-'));
  const originalCwd = process.cwd();

  try {
    process.chdir(tmpDir);
    callback(tmpDir);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('site.yml 的 icons.mode 应提升为顶层 icons.mode（manual 不应被默认 favicon 覆盖）', () => {
  withTempCwd((tmpDir) => {
    const defaultConfigDir = path.join(tmpDir, 'config', '_default');
    fs.mkdirSync(defaultConfigDir, { recursive: true });

    fs.writeFileSync(
      path.join(defaultConfigDir, 'site.yml'),
      ['title: Test', 'icons:', '  mode: manual', ''].join('\n'),
      'utf8'
    );

    const config = loadConfig();
    assert.equal(config.icons.mode, 'manual');
  });
});

test('未配置 icons.mode 时应回退为默认 favicon', () => {
  withTempCwd((tmpDir) => {
    const defaultConfigDir = path.join(tmpDir, 'config', '_default');
    fs.mkdirSync(defaultConfigDir, { recursive: true });

    fs.writeFileSync(path.join(defaultConfigDir, 'site.yml'), 'title: Test\n', 'utf8');

    const config = loadConfig();
    assert.equal(config.icons.mode, 'favicon');
  });
});
