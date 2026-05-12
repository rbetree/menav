const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { createLogger, isVerbose, startTimer } = require('../src/lib/logging/logger.ts');

const log = createLogger('check');

function runNode(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' });
  return result && Number.isFinite(result.status) ? result.status : 1;
}

async function main() {
  const elapsedMs = startTimer();
  log.info('开始', { version: process.env.npm_package_version });

  const repoRoot = path.resolve(__dirname, '..');

  const lintExit = runNode(path.join(repoRoot, 'scripts', 'lint.js'));
  if (lintExit !== 0) {
    log.error('lint 失败', { exit: lintExit });
    process.exitCode = lintExit;
    return;
  }

  const testExit = runNode(path.join(repoRoot, 'scripts', 'test.js'));
  if (testExit !== 0) {
    log.error('test 失败', { exit: testExit });
    process.exitCode = testExit;
    return;
  }

  const buildExit = runNode(path.join(repoRoot, 'scripts', 'build.js'));
  if (buildExit !== 0) {
    log.error('build 失败', { exit: buildExit });
    process.exitCode = buildExit;
    return;
  }

  const browserTestExit = runNode(path.join(repoRoot, 'scripts', 'test-browser.js'));
  if (browserTestExit !== 0) {
    log.error('browser contract 失败', { exit: browserTestExit });
    process.exitCode = browserTestExit;
    return;
  }

  log.ok('完成', { ms: elapsedMs() });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('执行失败', { message: error && error.message ? error.message : String(error) });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
