import type { CategoryItem } from '../../types/page';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

const { createLogger } = require(
  path.join(process.cwd(), 'src', 'lib', 'logging', 'logger.ts')
) as {
  createLogger: (scope: string) => {
    warn: (message: string, meta?: Record<string, unknown>) => void;
  };
};

type RenderConfigLike = {
  site?: {
    github?: {
      username?: unknown;
      heatmapColor?: unknown;
      cacheDir?: unknown;
    };
  };
};

type ProjectsHeatmapCachePayload = {
  pageId?: unknown;
  username?: unknown;
  html?: unknown;
  generatedAt?: unknown;
  sourceUrl?: unknown;
};

type ProjectsRepoCachePayload = {
  pageId?: unknown;
  generatedAt?: unknown;
  repos?: Array<{
    url?: unknown;
    language?: unknown;
    languageColor?: unknown;
    stars?: unknown;
    forks?: unknown;
  } | null>;
};

type ProjectsHeatmapCache = {
  username: string;
  html: string;
  meta: {
    pageId: unknown;
    generatedAt: unknown;
    sourceUrl: unknown;
  };
};

type RepoMeta = {
  language: string;
  languageColor: string;
  stars: number | null;
  forks: number | null;
};

type ProjectsRepoCache = {
  map: Map<string, RepoMeta>;
  meta: {
    pageId: unknown;
    generatedAt: unknown;
  };
};

type CategoryNode = CategoryItem & {
  sites?: Array<Record<string, unknown>>;
  subcategories?: CategoryNode[];
  groups?: CategoryNode[];
  subgroups?: CategoryNode[];
};

const log = createLogger('cache:projects');

function getProjectsCacheDir(config: RenderConfigLike | null | undefined): string {
  const cacheDirFromEnv = process.env.PROJECTS_CACHE_DIR
    ? String(process.env.PROJECTS_CACHE_DIR)
    : '';
  const cacheDirFromConfig = config?.site?.github?.cacheDir
    ? String(config.site.github.cacheDir)
    : '';
  return cacheDirFromEnv || cacheDirFromConfig || 'dev';
}

function resolveCachePath(
  pageId: string,
  config: RenderConfigLike | null | undefined,
  suffix: string
) {
  const cacheDir = getProjectsCacheDir(config);
  const cacheBaseDir = path.isAbsolute(cacheDir) ? cacheDir : path.join(process.cwd(), cacheDir);
  return path.join(cacheBaseDir, `${pageId}.${suffix}.json`);
}

function tryLoadProjectsHeatmapCache(
  pageId: string,
  config: RenderConfigLike | null | undefined
): ProjectsHeatmapCache | null {
  if (!pageId) return null;

  const cachePath = resolveCachePath(pageId, config, 'heatmap-cache');
  if (!fs.existsSync(cachePath)) return null;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as ProjectsHeatmapCachePayload | null;
    if (!parsed || typeof parsed !== 'object') return null;

    const username = parsed.username ? String(parsed.username).trim() : '';
    const html = parsed.html ? String(parsed.html) : '';
    if (!username || !html) return null;

    return {
      username,
      html,
      meta: {
        pageId: parsed.pageId || pageId,
        generatedAt: parsed.generatedAt || '',
        sourceUrl: parsed.sourceUrl || '',
      },
    };
  } catch {
    log.warn('heatmap 缓存读取失败，将降级为运行时加载', { path: cachePath });
    return null;
  }
}

function tryLoadProjectsRepoCache(
  pageId: string,
  config: RenderConfigLike | null | undefined
): ProjectsRepoCache | null {
  if (!pageId) return null;

  const cachePath = resolveCachePath(pageId, config, 'repo-cache');
  if (!fs.existsSync(cachePath)) return null;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as ProjectsRepoCachePayload | null;
    if (!parsed || typeof parsed !== 'object') return null;

    const repos = Array.isArray(parsed.repos) ? parsed.repos : [];
    const map = new Map<string, RepoMeta>();
    repos.forEach((repo) => {
      const url = repo?.url ? String(repo.url) : '';
      if (!url) return;
      map.set(url, {
        language: repo?.language ? String(repo.language) : '',
        languageColor: repo?.languageColor ? String(repo.languageColor) : '',
        stars: Number.isFinite(repo?.stars) ? (repo?.stars as number) : null,
        forks: Number.isFinite(repo?.forks) ? (repo?.forks as number) : null,
      });
    });

    return {
      map,
      meta: {
        pageId: parsed.pageId || pageId,
        generatedAt: parsed.generatedAt || '',
      },
    };
  } catch {
    log.warn('projects 缓存读取失败，将仅展示标题与描述', { path: cachePath });
    return null;
  }
}

function normalizeGithubRepoUrl(url: unknown): string {
  if (!url) return '';
  try {
    const parsed = new URL(String(url));
    if (parsed.hostname.toLowerCase() !== 'github.com') return '';
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return '';
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    if (!owner || !repo) return '';
    return `https://github.com/${owner}/${repo}`;
  } catch {
    return '';
  }
}

function applyRepoMetaToCategories(
  categories: CategoryItem[] | null | undefined,
  repoMetaMap: Map<string, RepoMeta> | null | undefined
): void {
  if (!Array.isArray(categories) || !(repoMetaMap instanceof Map)) return;

  const walk = (node: CategoryNode | null | undefined): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.subcategories)) node.subcategories.forEach(walk);
    if (Array.isArray(node.groups)) node.groups.forEach(walk);
    if (Array.isArray(node.subgroups)) node.subgroups.forEach(walk);

    if (Array.isArray(node.sites)) {
      node.sites.forEach((site) => {
        if (!site || typeof site !== 'object' || !site.url) return;
        const canonical = normalizeGithubRepoUrl(site.url);
        if (!canonical) return;
        const meta = repoMetaMap.get(canonical);
        if (!meta) return;

        site.language = meta.language || '';
        site.languageColor = meta.languageColor || '';
        site.stars = meta.stars;
        site.forks = meta.forks;
      });
    }
  };

  categories.forEach((category) => walk(category as CategoryNode));
}

function normalizeGithubHeatmapColor(input: unknown): string {
  const raw = String(input || '')
    .trim()
    .replace(/^#/, '');
  const color = raw.toLowerCase();
  if (/^[0-9a-f]{6}$/.test(color)) return color;
  if (/^[0-9a-f]{3}$/.test(color)) return color;
  return '339af0';
}

function getGithubUsernameFromConfig(config: RenderConfigLike | null | undefined): string {
  const username = config?.site?.github?.username ? String(config.site.github.username).trim() : '';
  return username;
}

function buildProjectsMeta(config: RenderConfigLike | null | undefined): {
  heatmap: {
    username: string;
    profileUrl: string;
    imageUrl: string;
    html?: string;
    generatedAt?: unknown;
    sourceUrl?: unknown;
  };
} | null {
  const username = getGithubUsernameFromConfig(config);
  if (!username) return null;

  const color = normalizeGithubHeatmapColor(config?.site?.github?.heatmapColor || '339af0');

  return {
    heatmap: {
      username,
      profileUrl: `https://github.com/${username}`,
      imageUrl: `https://ghchart.rshah.org/${color}/${username}`,
    },
  };
}

export {
  tryLoadProjectsRepoCache,
  tryLoadProjectsHeatmapCache,
  applyRepoMetaToCategories,
  buildProjectsMeta,
};
