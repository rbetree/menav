import path from 'node:path';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';
import { buildRuntimeBundle } from './lib/runtime-bundle.ts';

const log = createLogger('bundle');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');

  try {
    await buildRuntimeBundle({ repoRoot: projectRoot, log, startTimer });
  } catch (error) {
    log.error('构建 public/script.js 失败', {
      message: getErrorMessage(error),
    });
    const stack = getErrorStack(error);
    if (isVerbose() && stack) {
      console.error(stack);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
