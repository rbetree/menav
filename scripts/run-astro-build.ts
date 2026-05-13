import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createLogger } from '../src/lib/logging/logger.ts';
import { resolveAstroCli } from './lib/astro-cli.ts';
import { ensureSupportedNodeVersion } from './lib/node-version.ts';

const log = createLogger('astro:build');

function runAstroBuild(args: string[] = []): number {
  const repoRoot = path.resolve(__dirname, '..');

  if (!ensureSupportedNodeVersion({ repoRoot, log, command: 'npm run build' })) {
    return 1;
  }

  const astroCli = resolveAstroCli(repoRoot);
  const registerScript = path.join(__dirname, 'register-ts.cjs');
  const result = spawnSync(process.execPath, ['-r', registerScript, astroCli, 'build', ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  return Number.isFinite(result.status) ? Number(result.status) : 1;
}

if (require.main === module) {
  process.exitCode = runAstroBuild(process.argv.slice(2));
}

module.exports = {
  runAstroBuild,
};
