const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const { spawnSync } = require('node:child_process') as typeof import('node:child_process');

const { createLogger, isVerbose, startTimer } = require('../src/lib/logging/logger.ts');
const { ensureSupportedNodeVersion } = require('./lib/node-version.ts');

const log = createLogger('test');

function collectTestFiles(repoRoot: string): string[] {
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

  if (!ensureSupportedNodeVersion({ repoRoot, log, command: 'npm run test' })) {
    process.exitCode = 1;
    return;
  }

  const files = collectTestFiles(repoRoot);
  if (files.length === 0) {
    log.ok('未发现测试文件，跳过');
    return;
  }

  const registerScript = path.join(__dirname, 'register-ts.cjs');
  const result = spawnSync(process.execPath, ['-r', registerScript, '--test', ...files], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  const exitCode = Number.isFinite(result.status) ? Number(result.status) : 1;
  if (exitCode !== 0) {
    log.error('失败', { ms: elapsedMs(), exit: exitCode });
    process.exitCode = exitCode;
    return;
  }

  log.ok('完成', { ms: elapsedMs(), files: files.length });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('执行失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
