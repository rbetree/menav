const path = require('node:path');

function resolveAstroCli(repoRoot) {
  const astroPackagePath = require.resolve('astro/package.json', { paths: [repoRoot] });
  const astroPackage = require(astroPackagePath);
  const bin = typeof astroPackage.bin === 'string' ? astroPackage.bin : astroPackage.bin?.astro;
  if (!bin) {
    throw new Error('无法解析 astro CLI 入口');
  }

  return path.resolve(path.dirname(astroPackagePath), bin);
}

module.exports = {
  resolveAstroCli,
};
