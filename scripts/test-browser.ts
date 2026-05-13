const path = require('node:path') as typeof import('node:path');
const { spawnSync } = require('node:child_process') as typeof import('node:child_process');

const { createLogger, startTimer } = require('../src/lib/logging/logger.ts');
const { ensureSupportedNodeVersion } = require('./lib/node-version.ts');

const log = createLogger('test:browser');

function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');

  if (!ensureSupportedNodeVersion({ repoRoot, log, command: 'npm run test:browser' })) {
    process.exitCode = 1;
    return;
  }

  const registerScript = path.join(__dirname, 'register-ts.cjs');
  const result = spawnSync(
    process.execPath,
    ['-r', registerScript, path.join(repoRoot, 'test', 'browser', 'contract.js')],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    }
  );

  const exitCode = Number.isFinite(result.status) ? Number(result.status) : 1;
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
