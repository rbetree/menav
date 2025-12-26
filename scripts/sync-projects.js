/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const { loadConfig } = require('../src/generator.js');

const DEFAULT_SETTINGS = {
  enabled: true,
  cacheDir: 'dev',
  fetch: {
    timeoutMs: 10_000,
    concurrency: 4,
    userAgent: 'MeNavProjectsSync/1.0'
  },
  colors: {
    url: 'https://raw.githubusercontent.com/ozh/github-colors/master/colors.json',
    maxAgeMs: 7 * 24 * 60 * 60 * 1000
  }
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
    config && config.site && config.site.github && typeof config.site.github === 'object' ? config.site.github : {};

  const merged = {
    ...DEFAULT_SETTINGS,
    ...fromConfig,
    fetch: {
      ...DEFAULT_SETTINGS.fetch,
      ...(fromConfig.fetch || {})
    },
    colors: {
      ...DEFAULT_SETTINGS.colors,
      ...(fromConfig.colors || {})
    }
  };

  merged.enabled = parseBooleanEnv(process.env.PROJECTS_ENABLED, merged.enabled);
  merged.cacheDir = process.env.PROJECTS_CACHE_DIR ? String(process.env.PROJECTS_CACHE_DIR) : merged.cacheDir;
  merged.fetch.timeoutMs = parseIntegerEnv(process.env.PROJECTS_FETCH_TIMEOUT, merged.fetch.timeoutMs);
  merged.fetch.concurrency = parseIntegerEnv(process.env.PROJECTS_FETCH_CONCURRENCY, merged.fetch.concurrency);

  merged.fetch.timeoutMs = Math.max(1_000, merged.fetch.timeoutMs);
  merged.fetch.concurrency = Math.max(1, Math.min(10, merged.fetch.concurrency));

  return merged;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isGithubRepoUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.hostname.toLowerCase() !== 'github.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    if (!owner || !repo) return null;
    return { owner, repo, canonicalUrl: `https://github.com/${owner}/${repo}` };
  } catch {
    return null;
  }
}

function collectSitesRecursively(node, output) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node.subcategories)) node.subcategories.forEach(child => collectSitesRecursively(child, output));
  if (Array.isArray(node.groups)) node.groups.forEach(child => collectSitesRecursively(child, output));
  if (Array.isArray(node.subgroups)) node.subgroups.forEach(child => collectSitesRecursively(child, output));
  if (Array.isArray(node.sites)) node.sites.forEach(site => output.push(site));
}

function findProjectsPages(config) {
  const pages = [];
  const nav = Array.isArray(config.navigation) ? config.navigation : [];
  nav.forEach(item => {
    const pageId = item && item.id ? String(item.id) : '';
    if (!pageId || !config[pageId]) return;
    const page = config[pageId];
    const templateName = page && page.template ? String(page.template) : pageId;
    if (templateName !== 'projects') return;
    pages.push({ pageId, page });
  });
  return pages;
}

async function fetchJsonWithTimeout(url, { timeoutMs, headers }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadLanguageColors(settings, cacheBaseDir) {
  const cachePath = path.join(cacheBaseDir, 'github-colors.json');

  try {
    const stat = fs.existsSync(cachePath) ? fs.statSync(cachePath) : null;
    if (stat && stat.mtimeMs && Date.now() - stat.mtimeMs < settings.colors.maxAgeMs) {
      const raw = fs.readFileSync(cachePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // 继续联网抓取
  }

  try {
    const headers = { 'user-agent': settings.fetch.userAgent, accept: 'application/json' };
    const colors = await fetchJsonWithTimeout(settings.colors.url, { timeoutMs: settings.fetch.timeoutMs, headers });
    if (colors && typeof colors === 'object') {
      fs.writeFileSync(cachePath, JSON.stringify(colors, null, 2), 'utf8');
      return colors;
    }
  } catch (error) {
    console.warn(`[WARN] 获取语言颜色表失败（将不输出 languageColor）：${String(error && error.message ? error.message : error)}`);
  }

  return {};
}

async function fetchRepoMeta(repo, settings, colors) {
  const headers = {
    'user-agent': settings.fetch.userAgent,
    accept: 'application/vnd.github+json'
  };

  const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  const data = await fetchJsonWithTimeout(apiUrl, { timeoutMs: settings.fetch.timeoutMs, headers });

  const language = data && data.language ? String(data.language) : '';
  const stars = data && Number.isFinite(data.stargazers_count) ? data.stargazers_count : null;
  const forks = data && Number.isFinite(data.forks_count) ? data.forks_count : null;

  let languageColor = '';
  if (language && colors && colors[language] && colors[language].color) {
    languageColor = String(colors[language].color);
  }

  return {
    url: repo.canonicalUrl,
    fullName: data && data.full_name ? String(data.full_name) : `${repo.owner}/${repo.repo}`,
    language,
    languageColor,
    stars,
    forks
  };
}

async function runPool(items, concurrency, worker) {
  const results = [];
  let index = 0;

  async function runOne() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      // eslint-disable-next-line no-await-in-loop
      const result = await worker(current);
      if (result) results.push(result);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runOne());
  await Promise.all(runners);
  return results;
}

async function main() {
  const config = loadConfig();
  const settings = getSettings(config);

  if (!settings.enabled) {
    console.log('[INFO] projects 仓库同步已禁用（PROJECTS_ENABLED=false）');
    return;
  }

  const cacheBaseDir = path.isAbsolute(settings.cacheDir) ? settings.cacheDir : path.join(process.cwd(), settings.cacheDir);
  ensureDir(cacheBaseDir);

  const colors = await loadLanguageColors(settings, cacheBaseDir);
  const pages = findProjectsPages(config);

  if (!pages.length) {
    console.log('[INFO] 未找到 template=projects 的页面，跳过同步');
    return;
  }

  for (const { pageId, page } of pages) {
    const categories = Array.isArray(page.categories) ? page.categories : [];
    const sites = [];
    categories.forEach(category => collectSitesRecursively(category, sites));

    const repos = sites
      .map(site => (site && site.url ? isGithubRepoUrl(site.url) : null))
      .filter(Boolean);

    const unique = new Map();
    repos.forEach(r => unique.set(r.canonicalUrl, r));
    const repoList = Array.from(unique.values());

    if (!repoList.length) {
      console.log(`[INFO] 页面 ${pageId}：未发现 GitHub 仓库链接，跳过`);
      continue;
    }

    let success = 0;
    let failed = 0;

    const results = await runPool(repoList, settings.fetch.concurrency, async repo => {
      try {
        const meta = await fetchRepoMeta(repo, settings, colors);
        success += 1;
        return meta;
      } catch (error) {
        failed += 1;
        console.warn(`[WARN] 拉取失败：${repo.canonicalUrl}（${String(error && error.message ? error.message : error)}）`);
        return null;
      }
    });

    const payload = {
      version: '1.0',
      pageId,
      generatedAt: new Date().toISOString(),
      repos: results,
      stats: {
        totalRepos: repoList.length,
        success,
        failed
      }
    };

    const cachePath = path.join(cacheBaseDir, `${pageId}.repo-cache.json`);
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf8');

    console.log(`[INFO] 页面 ${pageId}：同步完成（成功 ${success} / 失败 ${failed}），写入缓存 ${cachePath}`);
  }
}

main().catch(error => {
  console.error('[ERROR] projects 同步异常：', error);
  process.exitCode = 0; // best-effort：不阻断后续 build
});

