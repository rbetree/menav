import path from 'node:path';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';
import { runBuildPipeline } from './lib/build-pipeline.ts';

const log = createLogger('build');

async function main() {
  const elapsedMs = startTimer();
  log.info('开始', { version: process.env.npm_package_version });

  const repoRoot = path.resolve(__dirname, '..');

  if (!runBuildPipeline({ log, repoRoot, sync: true, command: 'npm run build' })) {
    process.exitCode = 1;
    return;
  }

  log.ok('完成', { ms: elapsedMs(), dist: 'dist/' });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('构建失败', { message: error && error.message ? error.message : String(error) });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
