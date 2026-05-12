const path = require('node:path');

const { createLogger, isVerbose, startTimer } = require('../src/lib/logging/logger.ts');
const { buildRuntimeBundle } = require('./lib/runtime-bundle');

const log = createLogger('bundle');

async function main() {
  const projectRoot = path.resolve(__dirname, '..');

  try {
    await buildRuntimeBundle({ repoRoot: projectRoot, log, startTimer });
  } catch (error) {
    log.error('构建 public/script.js 失败', {
      message: error && error.message ? error.message : String(error),
    });
    if (isVerbose() && error && error.stack) {
      console.error(error.stack);
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
