const path = require('node:path');
const { spawnSync } = require('node:child_process');

const lib = require('./lib/index.ts');
const { wrapAsyncError } = require('./lib/errors.ts');

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const generateScript = path.join(repoRoot, 'scripts', 'generate.js');

  console.warn('[WARN] src/generator.js 已弃用，请改用 scripts/generate.js 或 src/lib/index.ts');

  const result = spawnSync(process.execPath, [generateScript], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  process.exitCode = result && Number.isFinite(result.status) ? result.status : 1;
}

module.exports = {
  ...lib,
  main,
};

if (require.main === module) {
  wrapAsyncError(main)();
}
