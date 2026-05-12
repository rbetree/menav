const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { createLogger, startTimer } = require('../src/lib/logging/logger.ts');

const log = createLogger('test:browser');

function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');
  const registerScript = path.join(__dirname, 'register-ts.cjs');
  const result = spawnSync(
    process.execPath,
    ['-r', registerScript, path.join(repoRoot, 'test', 'browser', 'contract.js')],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    }
  );

  const exitCode = result && Number.isFinite(result.status) ? result.status : 1;
  if (exitCode !== 0) {
    log.error('失败', { ms: elapsedMs(), exit: exitCode });
    process.exitCode = exitCode;
    return;
  }

  log.ok('完成', { ms: elapsedMs() });
}

if (require.main === module) {
  main();
}
