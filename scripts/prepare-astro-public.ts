import type { ResolvedConfig } from '../src/types/config';

import { loadConfig } from '../src/lib/config/index.ts';
import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';
import {
  ensureDir,
  getErrorMessage,
  getErrorStack,
  prepareCssAssets,
  prepareIconAssets,
  preparePinyinMatchScript,
  type ConfigLike,
} from './lib/public-assets.ts';
import { writeSearchIndexAsset } from './lib/search-index-assets.ts';

const log = createLogger('astro-public');

function main() {
  const elapsedMs = startTimer();
  const config = loadConfig() as ResolvedConfig & ConfigLike;
  const verbose = isVerbose();

  ensureDir('public');
  prepareCssAssets(log, verbose);
  preparePinyinMatchScript(log, verbose);
  writeSearchIndexAsset(config);
  prepareIconAssets(config, log);

  log.ok('完成', { ms: elapsedMs(), public: 'public/' });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    log.error('失败', { message: getErrorMessage(error) });
    const stack = getErrorStack(error);
    if (isVerbose() && stack) console.error(stack);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
};
