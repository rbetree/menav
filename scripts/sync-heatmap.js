/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const { loadConfig } = require('../src/generator.js');
const { extractYearlyContributionsInnerHtml } = require('../src/lib/github/contributions.ts');
const { createLogger, isVerbose, startTimer } = require('../src/lib/logging/logger.ts');

const log = createLogger('sync:heatmap');

const DEFAULT_SETTINGS = {
  enabled: true,
  cacheDir: 'dev',
  fetch: {
    timeoutMs: 10_000,
    userAgent: 'MeNavHeatmapSync/1.0',
  },
};

function parseBooleanEnv(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'y') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'n') return false;
  return fallback;
}

function parseIntegerEnv(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function getSettings(config) {
  const fromConfig =
    config && config.site && config.site.github && typeof config.site.github === 'object'
      ? config.site.github
      : {};

  const merged = {
    ...DEFAULT_SETTINGS,
    ...fromConfig,
    fetch: {
      ...DEFAULT_SETTINGS.fetch,
      ...(fromConfig.fetch || {}),
    },
  };

  merged.enabled = parseBooleanEnv(process.env.HEATMAP_ENABLED, merged.enabled);

  // 复用 projects 的 cacheDir 逻辑，保持所有 dev 缓存在同一目录
  merged.cacheDir = process.env.PROJECTS_CACHE_DIR
    ? String(process.env.PROJECTS_CACHE_DIR)
    : process.env.HEATMAP_CACHE_DIR
      ? String(process.env.HEATMAP_CACHE_DIR)
      : merged.cacheDir;

  merged.fetch.timeoutMs = parseIntegerEnv(
    process.env.HEATMAP_FETCH_TIMEOUT,
    merged.fetch.timeoutMs
  );
  merged.fetch.timeoutMs = Math.max(1_000, merged.fetch.timeoutMs);

  return merged;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function findProjectsPages(config) {
  const pages = [];
  const nav = Array.isArray(config.navigation) ? config.navigation : [];
  nav.forEach((item) => {
    const pageId = item && item.id ? String(item.id) : '';
    if (!pageId || !config[pageId]) return;
    const page = config[pageId];
    const templateName = page && page.template ? String(page.template) : pageId;
    if (templateName !== 'projects') return;
    pages.push({ pageId, page });
  });
  return pages;
}

function getGithubUsernameFromConfig(config) {
  const username =
    config && config.site && config.site.github && config.site.github.username
      ? String(config.site.github.username).trim()
      : '';
  return username;
}

async function fetchTextWithTimeout(url, { timeoutMs, headers }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const elapsedMs = startTimer();
  const config = loadConfig();
  const settings = getSettings(config);

  log.info('开始');

  if (!settings.enabled) {
    log.ok('heatmap 同步已禁用，跳过', { env: 'HEATMAP_ENABLED=false' });
    return;
  }

  const username = getGithubUsernameFromConfig(config);
  if (!username) {
    log.ok('未配置 site.github.username，跳过');
    return;
  }

  const pages = findProjectsPages(config);
  if (!pages.length) {
    log.ok('未找到 template=projects 的页面，跳过同步');
    return;
  }

  const cacheBaseDir = path.isAbsolute(settings.cacheDir)
    ? settings.cacheDir
    : path.join(process.cwd(), settings.cacheDir);
  ensureDir(cacheBaseDir);

  const url = `https://github.com/users/${encodeURIComponent(username)}/contributions`;
  const headers = {
    'user-agent': settings.fetch.userAgent,
    accept: 'text/html',
  };

  let html;
  try {
    html = await fetchTextWithTimeout(url, { timeoutMs: settings.fetch.timeoutMs, headers });
  } catch (error) {
    log.warn('获取 GitHub contributions 失败（best-effort）', {
      url,
      message: String(error && error.message ? error.message : error),
    });
    return;
  }

  const innerHtml = extractYearlyContributionsInnerHtml(html);
  if (!innerHtml) {
    log.warn('解析 contributions HTML 失败（best-effort）', { url, username });
    return;
  }

  for (const { pageId } of pages) {
    const payload = {
      version: '1.0',
      pageId,
      generatedAt: new Date().toISOString(),
      username,
      sourceUrl: url,
      html: innerHtml,
    };

    const cachePath = path.join(cacheBaseDir, `${pageId}.heatmap-cache.json`);
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf8');
    log.ok('写入 heatmap 缓存', { page: pageId, cache: cachePath });
  }

  log.ok('完成', { ms: elapsedMs(), pages: pages.length, username });
}

main().catch((error) => {
  log.error('执行异常（best-effort，不阻断后续 build）', {
    message: error && error.message ? error.message : String(error),
  });
  if (isVerbose() && error && error.stack) console.error(error.stack);
  process.exitCode = 0; // best-effort：不阻断后续 build
});
