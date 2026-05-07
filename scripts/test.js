const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { createLogger, isVerbose, startTimer } = require('../src/lib/logging/logger.ts');

const log = createLogger('test');

function collectTestFiles(repoRoot) {
  const testDir = path.join(repoRoot, 'test');
  if (!fs.existsSync(testDir)) return [];

  return fs
    .readdirSync(testDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join('test', name))
    .sort();
}

async function main() {
  const elapsedMs = startTimer();
  log.info('开始', { version: process.env.npm_package_version });

  const repoRoot = path.resolve(__dirname, '..');
  const files = collectTestFiles(repoRoot);
  if (files.length === 0) {
    log.ok('未发现测试文件，跳过');
    return;
  }

  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  const exitCode = result && Number.isFinite(result.status) ? result.status : 1;
  if (exitCode !== 0) {
    log.error('失败', { ms: elapsedMs(), exit: exitCode });
    process.exitCode = exitCode;
    return;
  }

  log.ok('完成', { ms: elapsedMs(), files: files.length });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('执行失败', { message: error && error.message ? error.message : String(error) });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
