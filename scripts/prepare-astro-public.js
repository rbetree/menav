const fs = require('node:fs');
const path = require('node:path');

const { loadConfig, MENAV_EXTENSION_CONFIG_FILE } = require('../src/generator/config');
const { collectSitesRecursively } = require('../src/generator/utils/sites');
const { createLogger, isVerbose, startTimer } = require('../src/generator/utils/logger');

const log = createLogger('astro-public');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(srcPath, destPath) {
  ensureDir(path.dirname(destPath));
  fs.copyFileSync(srcPath, destPath);
}

function copyDirRecursive(src, dest) {
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

function tryBundleCss(srcPath, destPath) {
  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch {
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
      message: error && error.message ? error.message : String(error),
    });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    return false;
  }
}

function tryMinifyStaticAsset(srcPath, destPath, loader) {
  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch {
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
      message: error && error.message ? error.message : String(error),
    });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    return false;
  }
}

function copyLocalFaviconUrls(config) {
  const copied = new Set();

  const copyLocalAsset = (rawUrl) => {
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
    if (!pageConfig || typeof pageConfig !== 'object') return;

    if (Array.isArray(pageConfig.sites)) {
      pageConfig.sites.forEach((site) => site && copyLocalAsset(site.faviconUrl));
    }

    if (Array.isArray(pageConfig.categories)) {
      const sites = [];
      pageConfig.categories.forEach((category) => collectSitesRecursively(category, sites));
      sites.forEach((site) => site && copyLocalAsset(site.faviconUrl));
    }
  });
}

function copyFavicon(config) {
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
  const config = loadConfig();

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
      message: error && error.message ? error.message : String(error),
    });
  }

  copyLocalFaviconUrls(config);
  copyFavicon(config);

  log.ok('完成', { ms: elapsedMs(), public: 'public/' });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    log.error('失败', { message: error && error.message ? error.message : String(error) });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
};
