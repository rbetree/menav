const path = require('node:path') as typeof import('node:path');
const { spawnSync } = require('node:child_process') as typeof import('node:child_process');

const { createLogger, isVerbose, startTimer } = require('../src/lib/logging/logger.ts');

const log = createLogger('check');

function runNode(scriptPath: string): number {
  const registerScript = path.join(__dirname, 'register-ts.cjs');
  const result = spawnSync(process.execPath, ['-r', registerScript, scriptPath], {
    stdio: 'inherit',
  });
  return Number.isFinite(result.status) ? Number(result.status) : 1;
}

async function main() {
  const elapsedMs = startTimer();
  log.info('开始', { version: process.env.npm_package_version });

  const repoRoot = path.resolve(__dirname, '..');

  const lintExit = runNode(path.join(repoRoot, 'scripts', 'lint.ts'));
  if (lintExit !== 0) {
    log.error('lint 失败', { exit: lintExit });
    process.exitCode = lintExit;
    return;
  }

  const testExit = runNode(path.join(repoRoot, 'scripts', 'test.ts'));
  if (testExit !== 0) {
    log.error('test 失败', { exit: testExit });
    process.exitCode = testExit;
    return;
  }

  const buildExit = runNode(path.join(repoRoot, 'scripts', 'build.ts'));
  if (buildExit !== 0) {
    log.error('build 失败', { exit: buildExit });
    process.exitCode = buildExit;
    return;
  }

  const browserTestExit = runNode(path.join(repoRoot, 'scripts', 'test-browser.ts'));
  if (browserTestExit !== 0) {
    log.error('browser contract 失败', { exit: browserTestExit });
    process.exitCode = browserTestExit;
    return;
  }

  const finalAuditExit = runNode(path.join(repoRoot, 'scripts', 'audit-final.ts'));
  if (finalAuditExit !== 0) {
    log.error('final audit 失败', { exit: finalAuditExit });
    process.exitCode = finalAuditExit;
    return;
  }

  log.ok('完成', { ms: elapsedMs() });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('执行失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
