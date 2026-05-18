const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const lib = require('..');

test('包主入口应只暴露稳定构建期 API', () => {
  assert.deepEqual(Object.keys(lib).sort(), [
    'BuildError',
    'ConfigError',
    'FileError',
    'buildSearchIndex',
    'buildSiteModel',
    'loadConfig',
  ]);
  assert.equal(typeof lib.loadConfig, 'function');
  assert.equal(typeof lib.buildSiteModel, 'function');
  assert.equal(typeof lib.buildSearchIndex, 'function');
  assert.equal(typeof lib.ConfigError, 'function');
  assert.equal(typeof lib.BuildError, 'function');
  assert.equal(typeof lib.FileError, 'function');
});

test('包主入口不依赖 register-ts 也能被普通 Node 加载', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const result = spawnSync(process.execPath, ['-e', "require('.')"], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('src/lib 内部不再通过 process.cwd 拼接源码路径', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const libRoot = path.join(repoRoot, 'src', 'lib');
  const offenders = [];

  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        return;
      }
      if (!entry.isFile() || !entry.name.endsWith('.ts')) return;

      const source = fs.readFileSync(fullPath, 'utf8');
      if (/path\.join\(process\.cwd\(\), ['"]src['"]/.test(source)) {
        offenders.push(path.relative(repoRoot, fullPath));
      }
    });
  };

  walk(libRoot);
  assert.deepEqual(offenders, []);
});
