import path from 'node:path';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';
import { ensureSupportedNodeVersion } from './lib/node-version.ts';

const { ensureUserConfigInitialized } = require('../src/bookmark-processor.ts') as {
  ensureUserConfigInitialized: () => { initialized: boolean; source: string };
};

const log = createLogger('init-config');

async function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');

  if (!ensureSupportedNodeVersion({ repoRoot, log, command: 'npm run init-config' })) {
    process.exitCode = 1;
    return;
  }

  const result = ensureUserConfigInitialized();
  if (result.source === 'existing') {
    log.ok('config/user 已存在，跳过初始化以避免覆盖用户配置', { ms: elapsedMs() });
    return;
  }

  log.ok('完成', { ms: elapsedMs(), source: result.source });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('初始化失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
