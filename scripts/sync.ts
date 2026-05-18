import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';

const log = createLogger('sync');

function runNode(scriptPath: string): number {
  const registerScript = path.join(__dirname, 'register-ts.cjs');
  const result = spawnSync(process.execPath, ['-r', registerScript, scriptPath], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  });
  return Number.isFinite(result.status) ? Number(result.status) : 1;
}

async function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');
  log.info('开始', { version: process.env.npm_package_version });

  const steps = [
    ['sync-projects', path.join(repoRoot, 'scripts', 'sync-projects.ts')],
    ['sync-heatmap', path.join(repoRoot, 'scripts', 'sync-heatmap.ts')],
    ['sync-articles', path.join(repoRoot, 'scripts', 'sync-articles.ts')],
  ] as const;

  steps.forEach(([label, script]) => {
    const exit = runNode(script);
    if (exit !== 0) log.warn(`${label} 异常退出，已继续（best-effort）`, { exit });
  });

  log.ok('完成', { ms: elapsedMs() });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('执行失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
