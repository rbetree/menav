/* eslint-disable no-console */
const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

import { loadConfig } from '../src/lib/config/index.ts';
import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';

const log = createLogger('sync:projects');

type GithubConfigLike = {
  fetch?: Partial<ProjectSettings['fetch']>;
  colors?: Partial<ProjectSettings['colors']>;
  [key: string]: unknown;
};

type ConfigLike = {
  site?: {
    github?: GithubConfigLike;
  };
  navigation?: Array<{ id?: unknown }>;
  [key: string]: unknown;
};

type ProjectSettings = {
  enabled: boolean;
  cacheDir: string;
  fetch: {
    timeoutMs: number;
    concurrency: number;
    userAgent: string;
  };
  colors: {
    url: string;
    maxAgeMs: number;
  };
};

type SiteLike = {
  url?: unknown;
};

type PageLike = Record<string, unknown>;

type ProjectPage = {
  pageId: string;
  page: PageLike;
};

type GithubRepo = {
  owner: string;
  repo: string;
  canonicalUrl: string;
};

type GithubApiRepo = {
  full_name?: unknown;
  language?: unknown;
  stargazers_count?: unknown;
  forks_count?: unknown;
};

type LanguageColors = Record<string, { color?: unknown }>;

type FetchJsonOptions = {
  timeoutMs: number;
  headers: Record<string, string>;
};

type RepoMeta = {
  url: string;
  fullName: string;
  language: string;
  languageColor: string;
  stars: number | null;
  forks: number | null;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DEFAULT_SETTINGS = {
  enabled: true,
  cacheDir: 'dev',
  fetch: {
    timeoutMs: 10_000,
    concurrency: 4,
    userAgent: 'MeNavProjectsSync/1.0',
  },
  colors: {
    url: 'https://raw.githubusercontent.com/ozh/github-colors/master/colors.json',
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
};

function parseBooleanEnv(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'y') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'n') return false;
  return fallback;
}

function parseIntegerEnv(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function getSettings(config: ConfigLike): ProjectSettings {
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
    colors: {
      ...DEFAULT_SETTINGS.colors,
      ...(fromConfig.colors || {}),
    },
  };

  merged.enabled = parseBooleanEnv(process.env.PROJECTS_ENABLED, merged.enabled);
  merged.cacheDir = process.env.PROJECTS_CACHE_DIR
    ? String(process.env.PROJECTS_CACHE_DIR)
    : merged.cacheDir;
  merged.fetch.timeoutMs = parseIntegerEnv(
    process.env.PROJECTS_FETCH_TIMEOUT,
    merged.fetch.timeoutMs
  );
  merged.fetch.concurrency = parseIntegerEnv(
    process.env.PROJECTS_FETCH_CONCURRENCY,
    merged.fetch.concurrency
  );

  merged.fetch.timeoutMs = Math.max(1_000, merged.fetch.timeoutMs);
  merged.fetch.concurrency = Math.max(1, Math.min(10, merged.fetch.concurrency));

  return merged;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isGithubRepoUrl(url: unknown): GithubRepo | null {
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

function collectSitesRecursively(node: unknown, output: SiteLike[]): void {
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.subcategories))
    record.subcategories.forEach((child) => collectSitesRecursively(child, output));
  if (Array.isArray(record.groups))
    record.groups.forEach((child) => collectSitesRecursively(child, output));
  if (Array.isArray(record.subgroups))
    record.subgroups.forEach((child) => collectSitesRecursively(child, output));
  if (Array.isArray(record.sites)) record.sites.forEach((site) => output.push(site as SiteLike));
}

function findProjectsPages(config: ConfigLike): ProjectPage[] {
  const pages: ProjectPage[] = [];
  const nav = Array.isArray(config.navigation) ? config.navigation : [];
  nav.forEach((item) => {
    const pageId = item && item.id ? String(item.id) : '';
    if (!pageId || !config[pageId]) return;
    const page = config[pageId];
    if (!page || typeof page !== 'object') return;
    const pageRecord = page as PageLike;
    const templateName = pageRecord.template ? String(pageRecord.template) : pageId;
    if (templateName !== 'projects') return;
    pages.push({ pageId, page: pageRecord });
  });
  return pages;
}

async function fetchJsonWithTimeout(url: string, { timeoutMs, headers }: FetchJsonOptions): Promise<unknown> {
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

async function loadLanguageColors(settings: ProjectSettings, cacheBaseDir: string): Promise<LanguageColors> {
  const cachePath = path.join(cacheBaseDir, 'github-colors.json');

  try {
    const stat = fs.existsSync(cachePath) ? fs.statSync(cachePath) : null;
    if (stat && stat.mtimeMs && Date.now() - stat.mtimeMs < settings.colors.maxAgeMs) {
      const raw = fs.readFileSync(cachePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as LanguageColors;
    }
  } catch {
    // 继续联网抓取
  }

  try {
    const headers = { 'user-agent': settings.fetch.userAgent, accept: 'application/json' };
    const colors = await fetchJsonWithTimeout(settings.colors.url, {
      timeoutMs: settings.fetch.timeoutMs,
      headers,
    });
    if (colors && typeof colors === 'object') {
      fs.writeFileSync(cachePath, JSON.stringify(colors, null, 2), 'utf8');
      return colors as LanguageColors;
    }
  } catch (error) {
    log.warn('获取语言颜色表失败（将不输出 languageColor）', {
      message: getErrorMessage(error),
    });
  }

  return {};
}

async function fetchRepoMeta(
  repo: GithubRepo,
  settings: ProjectSettings,
  colors: LanguageColors
): Promise<RepoMeta> {
  const headers = {
    'user-agent': settings.fetch.userAgent,
    accept: 'application/vnd.github+json',
  };

  const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  const rawData = await fetchJsonWithTimeout(apiUrl, { timeoutMs: settings.fetch.timeoutMs, headers });
  const data = rawData && typeof rawData === 'object' ? (rawData as GithubApiRepo) : {};

  const language = data && data.language ? String(data.language) : '';
  const stars = Number.isFinite(data.stargazers_count) ? Number(data.stargazers_count) : null;
  const forks = Number.isFinite(data.forks_count) ? Number(data.forks_count) : null;

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
    forks,
  };
}

async function runPool<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  worker: (item: TItem) => Promise<TResult | null>
): Promise<TResult[]> {
  const results: TResult[] = [];
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
  const elapsedMs = startTimer();
  const config = loadConfig() as ConfigLike;
  const settings = getSettings(config);

  log.info('开始');

  if (!settings.enabled) {
    log.ok('projects 仓库同步已禁用，跳过', { env: 'PROJECTS_ENABLED=false' });
    return;
  }

  const cacheBaseDir = path.isAbsolute(settings.cacheDir)
    ? settings.cacheDir
    : path.join(process.cwd(), settings.cacheDir);
  ensureDir(cacheBaseDir);

  const colors = await loadLanguageColors(settings, cacheBaseDir);
  const pages = findProjectsPages(config);

  if (!pages.length) {
    log.ok('未找到 template=projects 的页面，跳过同步');
    return;
  }

  log.info('准备同步 projects 页面缓存', { pages: pages.length });

  let pageSuccess = 0;
  let pageFailed = 0;

  for (const { pageId, page } of pages) {
    const categories = Array.isArray(page.categories) ? page.categories : [];
    const sites: SiteLike[] = [];
    categories.forEach((category) => collectSitesRecursively(category, sites));

    const repos = sites
      .map((site) => (site && site.url ? isGithubRepoUrl(site.url) : null))
      .filter((repo): repo is GithubRepo => Boolean(repo));

    const unique = new Map<string, GithubRepo>();
    repos.forEach((r) => unique.set(r.canonicalUrl, r));
    const repoList = Array.from(unique.values());

    if (!repoList.length) {
      log.ok('页面未发现 GitHub 仓库链接，跳过', { page: pageId });
      continue;
    }

    let success = 0;
    let failed = 0;

    const results = await runPool(repoList, settings.fetch.concurrency, async (repo) => {
      try {
        const meta = await fetchRepoMeta(repo, settings, colors);
        success += 1;
        return meta;
      } catch (error) {
        failed += 1;
        log.warn('拉取仓库元信息失败（best-effort）', {
          repo: repo.canonicalUrl,
          message: getErrorMessage(error),
        });
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
        failed,
      },
    };

    const cachePath = path.join(cacheBaseDir, `${pageId}.repo-cache.json`);
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf8');

    if (failed === 0) pageSuccess += 1;
    else pageFailed += 1;

    log.ok('页面同步完成', {
      page: pageId,
      success,
      failed,
      cache: cachePath,
    });
  }

  log.ok('完成', { ms: elapsedMs(), pages: pages.length, pageSuccess, pageFailed });
}

main().catch((error) => {
  log.error('执行异常（best-effort，不阻断后续 build）', {
    message: getErrorMessage(error),
  });
  if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 0; // best-effort：不阻断后续 build
});
