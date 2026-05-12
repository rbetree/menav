const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveAstroCli } = require('./lib/astro-cli');

function runAstroBuild(args = []) {
  const repoRoot = path.resolve(__dirname, '..');
  const astroCli = resolveAstroCli(repoRoot);
  const registerScript = path.join(__dirname, 'register-ts.cjs');
  const result = spawnSync(process.execPath, ['-r', registerScript, astroCli, 'build', ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  return result && Number.isFinite(result.status) ? result.status : 1;
}

if (require.main === module) {
  process.exitCode = runAstroBuild(process.argv.slice(2));
}

module.exports = {
  runAstroBuild,
};
