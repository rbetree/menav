/* eslint-disable no-console */
const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

import { loadConfig } from '../src/lib/config/index.ts';
import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';
import { collectSitesRecursively } from '../src/lib/site-data/sites.ts';

const { fetchWithRedirects, writeSourceCacheIfUsable } = require('./sync-articles.ts') as {
  fetchWithRedirects: (
    url: string,
    options: {
      timeoutMs: number;
      maxRedirects: number;
      headers: Record<string, string>;
      maxBytes: number;
    }
  ) => Promise<{ url: string; text: string }>;
  writeSourceCacheIfUsable: (
    cachePath: string,
    payload: unknown,
    totalSources: number,
    successSources: number
  ) => boolean;
};

const log = createLogger('sync:projects');

// 语言颜色表约 100 KB，上限防异常响应占用内存。
const COLORS_MAX_BYTES = 256 * 1024;

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
  pages?: Record<string, unknown>;
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
  maxBytes?: number;
};

type RepoMeta = {
  url: string;
  fullName: string;
  language: string;
  languageColor: string;
  stars: number | null;
  forks: number | null;
};

type SyncSourceReport = {
  name: string;
  url?: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  fallback?: boolean;
};

type SyncReport = {
  script: string;
  success: number;
  failed: number;
  skipped: number;
  cacheWritten: boolean;
  sources: SyncSourceReport[];
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function appendSyncReport(report: SyncReport): void {
  const reportPath = process.env.MENAV_SYNC_REPORT;
  if (!reportPath) return;
  try {
    fs.appendFileSync(reportPath, `${JSON.stringify(report)}\n`, 'utf8');
  } catch {
    // 报告写入失败不应影响同步结果
  }
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

function findProjectsPages(config: ConfigLike): ProjectPage[] {
  const pages: ProjectPage[] = [];
  const nav = Array.isArray(config.navigation) ? config.navigation : [];
  nav.forEach((item) => {
    const pageId = item && item.id ? String(item.id) : '';
    const page = pageId && config.pages ? config.pages[pageId] : config[pageId];
    if (!pageId || !page) return;
    if (!page || typeof page !== 'object') return;
    const pageRecord = page as PageLike;
    const templateName = pageRecord.template ? String(pageRecord.template) : pageId;
    if (templateName !== 'projects') return;
    pages.push({ pageId, page: pageRecord });
  });
  return pages;
}

async function fetchJsonWithTimeout(
  url: string,
  { timeoutMs, headers, maxBytes }: FetchJsonOptions
): Promise<unknown> {
  // 与 sync-articles 共用安全抓取层：协议、私网地址、重定向与响应大小都在同一处校验。
  const fetched = await fetchWithRedirects(url, {
    timeoutMs,
    maxRedirects: 3,
    headers,
    maxBytes: maxBytes ?? 1024 * 1024,
  });
  return JSON.parse(fetched.text);
}

async function loadLanguageColors(
  settings: ProjectSettings,
  cacheBaseDir: string
): Promise<LanguageColors> {
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
      maxBytes: COLORS_MAX_BYTES,
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
  const rawData = await fetchJsonWithTimeout(apiUrl, {
    timeoutMs: settings.fetch.timeoutMs,
    headers,
  });
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

function loadPreviousRepoMetas(cachePath: string): RepoMeta[] {
  try {
    if (!fs.existsSync(cachePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
      repos?: Array<Record<string, unknown> | null>;
    } | null;
    const raw = Array.isArray(parsed?.repos) ? parsed.repos : [];
    return raw
      .map((repo): RepoMeta | null => {
        if (!repo || typeof repo !== 'object') return null;
        const canonicalUrl = isGithubRepoUrl(repo.url)?.canonicalUrl;
        if (!canonicalUrl) return null;
        return {
          url: canonicalUrl,
          fullName: repo.fullName ? String(repo.fullName) : '',
          language: repo.language ? String(repo.language) : '',
          languageColor: repo.languageColor ? String(repo.languageColor) : '',
          stars: Number.isFinite(repo.stars) ? Number(repo.stars) : null,
          forks: Number.isFinite(repo.forks) ? Number(repo.forks) : null,
        };
      })
      .filter((repo): repo is RepoMeta => Boolean(repo));
  } catch {
    return [];
  }
}

function mergeRepoMetas(
  repoList: GithubRepo[],
  freshMetas: RepoMeta[],
  previousMetas: RepoMeta[]
): { repos: RepoMeta[]; retainedUrls: Set<string> } {
  const freshMap = new Map(freshMetas.map((meta) => [meta.url, meta]));
  const previousMap = new Map(previousMetas.map((meta) => [meta.url, meta]));
  const repos: RepoMeta[] = [];
  const retainedUrls = new Set<string>();

  for (const repo of repoList) {
    const fresh = freshMap.get(repo.canonicalUrl);
    if (fresh) {
      repos.push(fresh);
      continue;
    }

    // 失败仓库沿用上次成功数据；已从配置删除的仓库不保留。
    const previous = previousMap.get(repo.canonicalUrl);
    if (!previous) continue;
    repos.push(previous);
    retainedUrls.add(repo.canonicalUrl);
  }

  return { repos, retainedUrls };
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

  // 先确认存在 projects 页，避免在没有消费方时联网抓颜色表。
  const pages = findProjectsPages(config);
  if (!pages.length) {
    log.ok('未找到 template=projects 的页面，跳过同步');
    return;
  }

  const cacheBaseDir = path.isAbsolute(settings.cacheDir)
    ? settings.cacheDir
    : path.join(process.cwd(), settings.cacheDir);
  ensureDir(cacheBaseDir);

  const colors = await loadLanguageColors(settings, cacheBaseDir);

  log.info('准备同步 projects 页面缓存', { pages: pages.length });

  let pageSuccess = 0;
  let pageFailed = 0;
  let cacheWritten = false;
  const reportSources: SyncSourceReport[] = [];

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
    const errors = new Map<string, string>();

    const freshMetas = await runPool(repoList, settings.fetch.concurrency, async (repo) => {
      try {
        const meta = await fetchRepoMeta(repo, settings, colors);
        success += 1;
        return meta;
      } catch (error) {
        failed += 1;
        errors.set(repo.canonicalUrl, getErrorMessage(error));
        log.warn('拉取仓库元信息失败（best-effort）', {
          repo: repo.canonicalUrl,
          message: getErrorMessage(error),
        });
        return null;
      }
    });

    const cachePath = path.join(cacheBaseDir, `${pageId}.repo-cache.json`);
    const previousMetas = loadPreviousRepoMetas(cachePath);
    const { repos: mergedRepos, retainedUrls } = mergeRepoMetas(
      repoList,
      freshMetas,
      previousMetas
    );
    const payload = {
      version: '1.0',
      pageId,
      generatedAt: new Date().toISOString(),
      repos: mergedRepos,
      stats: {
        totalRepos: repoList.length,
        success,
        failed,
      },
    };

    const written = writeSourceCacheIfUsable(cachePath, payload, repoList.length, success);
    cacheWritten = cacheWritten || written;
    if (!written) {
      log.warn('全部仓库来源失败，保留上一次成功缓存', {
        page: pageId,
        cache: cachePath,
        failed,
      });
    }

    reportSources.push(
      ...repoList.map((repo): SyncSourceReport => {
        const error = errors.get(repo.canonicalUrl);
        return {
          name: repo.canonicalUrl,
          url: repo.canonicalUrl,
          status: error ? 'failed' : 'success',
          ...(error ? { error } : {}),
          ...(retainedUrls.has(repo.canonicalUrl) ? { fallback: true } : {}),
        };
      })
    );

    if (failed === 0) pageSuccess += 1;
    else pageFailed += 1;

    log.ok(written ? '页面同步完成' : '页面保留旧缓存', {
      page: pageId,
      success,
      failed,
      retained: retainedUrls.size,
      cache: cachePath,
    });
  }

  appendSyncReport({
    script: 'projects',
    success: reportSources.filter((source) => source.status === 'success').length,
    failed: reportSources.filter((source) => source.status === 'failed').length,
    skipped: 0,
    cacheWritten,
    sources: reportSources,
  });

  log.ok('完成', { ms: elapsedMs(), pages: pages.length, pageSuccess, pageFailed });
}

if (require.main === module) {
  main().catch((error) => {
    appendSyncReport({
      script: 'projects',
      success: 0,
      failed: 1,
      skipped: 0,
      cacheWritten: false,
      sources: [{ name: 'projects', status: 'failed', error: getErrorMessage(error) }],
    });
    log.error('执行异常（best-effort，不阻断后续 build）', {
      message: getErrorMessage(error),
    });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 0; // best-effort：不阻断后续 build
  });
}

module.exports = {
  getSettings,
  findProjectsPages,
  loadPreviousRepoMetas,
  mergeRepoMetas,
};
