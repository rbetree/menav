import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createLogger, startTimer } from '../src/lib/logging/logger.ts';
import { ensureSupportedNodeVersion } from './lib/node-version.ts';

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
