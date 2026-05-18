import fs from 'node:fs';
import path from 'node:path';

import { collectSitesRecursively } from '../../src/lib/site-data/sites.ts';

type PublicAssetsLogger = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

type SiteLike = {
  favicon?: string;
};

type SiteItemLike = {
  faviconUrl?: unknown;
};

type PageConfigLike = {
  sites?: SiteItemLike[];
  categories?: unknown[];
};

type NavigationItemLike = {
  id?: unknown;
};

type ConfigLike = {
  site?: SiteLike;
  navigation?: NavigationItemLike[];
  [key: string]: unknown;
};

type EsbuildLike = {
  buildSync: (options: Record<string, unknown>) => void;
  transformSync: (
    source: string,
    options: Record<string, unknown>
  ) => {
    code: string;
  };
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function isPageConfig(value: unknown): value is PageConfigLike {
  return Boolean(value && typeof value === 'object');
}

function loadEsbuild(): EsbuildLike | null {
  try {
    return require('esbuild') as EsbuildLike;
  } catch {
    return null;
  }
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(srcPath: string, destPath: string): void {
  ensureDir(path.dirname(destPath));
  fs.copyFileSync(srcPath, destPath);
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);

  fs.readdirSync(src, { withFileTypes: true }).forEach((entry) => {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
      return;
    }
    copyFile(srcPath, destPath);
  });
}

function tryBundleCss(
  srcPath: string,
  destPath: string,
  log: PublicAssetsLogger,
  verbose = false
): boolean {
  const esbuild = loadEsbuild();
  if (!esbuild) {
    return false;
  }

  try {
    esbuild.buildSync({
      entryPoints: [path.resolve(srcPath)],
      outfile: path.resolve(destPath),
      bundle: true,
      minify: true,
      logLevel: 'silent',
    });
    return true;
  } catch (error) {
    log.warn('CSS bundle 失败，降级为复制', {
      message: getErrorMessage(error),
    });
    const stack = getErrorStack(error);
    if (verbose && stack) console.error(stack);
    return false;
  }
}

function prepareCssAssets(log: PublicAssetsLogger, verbose = false): void {
  if (!tryBundleCss('assets/style.css', 'public/assets/style.css', log, verbose)) {
    copyFile('assets/style.css', 'public/assets/style.css');
    copyDirRecursive('assets/styles', 'public/assets/styles');
  }
}

function writeMinifiedStaticScript(
  source: string,
  destPath: string,
  log: PublicAssetsLogger,
  verbose = false
): boolean {
  const esbuild = loadEsbuild();
  if (!esbuild) {
    return false;
  }

  try {
    const result = esbuild.transformSync(source, {
      loader: 'js',
      minify: true,
      charset: 'utf8',
    });
    ensureDir(path.dirname(destPath));
    fs.writeFileSync(destPath, result.code);
    return true;
  } catch (error) {
    log.warn('压缩静态脚本失败，已降级为原始脚本', {
      path: destPath,
      message: getErrorMessage(error),
    });
    const stack = getErrorStack(error);
    if (verbose && stack) console.error(stack);
    return false;
  }
}

function preparePinyinMatchScript(log: PublicAssetsLogger, verbose = false): void {
  const { pinyinMatchScript } = require('../../assets/pinyin-match.ts') as {
    pinyinMatchScript: string;
  };

  if (!writeMinifiedStaticScript(pinyinMatchScript, 'public/pinyin-match.js', log, verbose)) {
    ensureDir(path.dirname('public/pinyin-match.js'));
    fs.writeFileSync('public/pinyin-match.js', pinyinMatchScript);
  }
}

function copyLocalFaviconUrls(config: ConfigLike, log: PublicAssetsLogger): void {
  const copied = new Set();

  const copyLocalAsset = (rawUrl: unknown): void => {
    const raw = String(rawUrl || '').trim();
    if (!raw || /^https?:\/\//i.test(raw)) return;

    const rel = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
    if (!rel.startsWith('assets/')) return;

    const normalized = path.posix.normalize(rel);
    if (!normalized.startsWith('assets/') || copied.has(normalized)) return;
    copied.add(normalized);

    const srcPath = path.join(process.cwd(), normalized);
    const destPath = path.join(process.cwd(), 'public', normalized);
    if (!fs.existsSync(srcPath)) {
      log.warn('faviconUrl 本地文件不存在', { path: normalized });
      return;
    }

    copyFile(srcPath, destPath);
  };

  if (!config || !Array.isArray(config.navigation)) return;

  config.navigation.forEach((navItem) => {
    const pageId = navItem && navItem.id ? String(navItem.id) : '';
    if (!pageId) return;
    const pageConfig = config[pageId];
    if (!isPageConfig(pageConfig)) return;

    if (Array.isArray(pageConfig.sites)) {
      pageConfig.sites.forEach((site) => site && copyLocalAsset(site.faviconUrl));
    }

    if (Array.isArray(pageConfig.categories)) {
      const sites: SiteItemLike[] = [];
      pageConfig.categories.forEach((category) => collectSitesRecursively(category, sites));
      sites.forEach((site) => site && copyLocalAsset(site.faviconUrl));
    }
  });
}

function copySiteFavicon(config: ConfigLike, log: PublicAssetsLogger): void {
  const favicon = config && config.site ? config.site.favicon : '';
  if (!favicon) return;

  const candidates = [path.join('assets', favicon), favicon];
  const src = candidates.find((candidate) => fs.existsSync(candidate));
  if (!src) {
    log.warn('favicon 文件不存在', { path: favicon });
    return;
  }

  copyFile(src, path.join('public', path.basename(favicon)));
}

function prepareIconAssets(config: ConfigLike, log: PublicAssetsLogger): void {
  copyLocalFaviconUrls(config, log);
  copySiteFavicon(config, log);
}

export {
  ensureDir,
  getErrorMessage,
  getErrorStack,
  prepareCssAssets,
  prepareIconAssets,
  preparePinyinMatchScript,
};
export type { ConfigLike, PublicAssetsLogger };
