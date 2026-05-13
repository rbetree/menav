import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type AstroPackageJson = {
  bin?: string | { astro?: string };
};

function resolveAstroCli(repoRoot: string): string {
  const astroPackagePath = require.resolve('astro/package.json', { paths: [repoRoot] });
  const astroPackage = require(astroPackagePath) as AstroPackageJson;
  const bin = typeof astroPackage.bin === 'string' ? astroPackage.bin : astroPackage.bin?.astro;
  if (!bin) {
    throw new Error('无法解析 astro CLI 入口');
  }

  return path.resolve(path.dirname(astroPackagePath), bin);
}

export { resolveAstroCli };
