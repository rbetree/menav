const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

const { loadConfig, MENAV_EXTENSION_CONFIG_FILE } = require('../src/lib/config/index.ts');
const { prepareSiteRenderData } = require('../src/lib/view-data/render-data.ts');
const { buildSearchIndex, MENAV_SEARCH_INDEX_FILE } = require('../src/lib/search-index/index.ts');
const { collectSitesRecursively } = require('../src/lib/site-data/sites.ts');
const { createLogger, isVerbose, startTimer } = require('../src/lib/logging/logger.ts');

const log = createLogger('astro-public');

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
  extensionConfig?: unknown;
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

function tryBundleCss(srcPath: string, destPath: string): boolean {
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
    if (isVerbose() && stack) console.error(stack);
    return false;
  }
}

function tryMinifyStaticAsset(srcPath: string, destPath: string, loader: string): boolean {
  const esbuild = loadEsbuild();
  if (!esbuild) {
    return false;
  }

  try {
    const source = fs.readFileSync(srcPath, 'utf8');
    const result = esbuild.transformSync(source, {
      loader,
      minify: true,
      charset: 'utf8',
    });
    ensureDir(path.dirname(destPath));
    fs.writeFileSync(destPath, result.code);
    return true;
  } catch (error) {
    log.warn('压缩静态资源失败，已降级为原文件', {
      path: srcPath,
      message: getErrorMessage(error),
    });
    const stack = getErrorStack(error);
    if (isVerbose() && stack) console.error(stack);
    return false;
  }
}

function copyLocalFaviconUrls(config: ConfigLike): void {
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

function copyFavicon(config: ConfigLike): void {
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

function main() {
  const elapsedMs = startTimer();
  const config = loadConfig() as ConfigLike;

  ensureDir('public');

  if (!tryBundleCss('assets/style.css', 'public/assets/style.css')) {
    copyFile('assets/style.css', 'public/assets/style.css');
    copyDirRecursive('assets/styles', 'public/assets/styles');
  }

  if (!tryMinifyStaticAsset('assets/pinyin-match.js', 'public/pinyin-match.js', 'js')) {
    copyFile('assets/pinyin-match.js', 'public/pinyin-match.js');
  }

  try {
    const extensionConfig =
      config && config.extensionConfig ? JSON.stringify(config.extensionConfig, null, 2) : '';
    if (extensionConfig) {
      fs.writeFileSync(path.join('public', MENAV_EXTENSION_CONFIG_FILE), extensionConfig);
    }
  } catch (error) {
    log.warn('写入扩展配置文件失败', {
      message: getErrorMessage(error),
    });
  }

  try {
    const renderData = prepareSiteRenderData(config);
    const searchIndex = buildSearchIndex(renderData.pages, renderData.config);
    fs.writeFileSync(path.join('public', MENAV_SEARCH_INDEX_FILE), JSON.stringify(searchIndex));
  } catch (error) {
    throw new Error(`写入搜索索引失败：${getErrorMessage(error)}`);
  }

  copyLocalFaviconUrls(config);
  copyFavicon(config);

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
