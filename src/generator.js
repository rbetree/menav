const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { loadConfig } = require('./generator/config');
const { preparePageData } = require('./generator/html/page-data');
const { prepareSiteRenderData, preparePages, prepareNavigationData } = require('./lib/render-data');
const { wrapAsyncError } = require('./generator/utils/errors');

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const buildScript = path.join(repoRoot, 'scripts', 'build.js');
  const result = spawnSync(process.execPath, [buildScript], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  process.exitCode = result && Number.isFinite(result.status) ? result.status : 1;
}

module.exports = {
  main,
  loadConfig,
  prepareNavigationData,
  preparePageData,
  preparePages,
  prepareSiteRenderData,
};

if (require.main === module) {
  wrapAsyncError(main)();
}
