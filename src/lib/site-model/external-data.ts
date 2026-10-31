import type { ResolvedConfig } from '../../types/config';
import type { SiteExternalData } from '../../types/model';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildArticlesCategoriesByPageCategories,
  tryLoadArticlesFeedCache,
} from '../cache/articles.ts';
import {
  buildProjectsMeta,
  tryLoadProjectsHeatmapCache,
  tryLoadProjectsRepoCache,
} from '../cache/projects.ts';
import { renderMarkdownToHtml } from '../content/markdown.ts';
import { ConfigError } from '../errors.ts';
import { getPageConfigUpdatedAtMeta } from '../site-data/page-meta.ts';
import { sanitizeContributionsHtml } from '../github/contributions.ts';
import type { RepoMeta } from '../../types/card';
import type { SiteItem } from '../../types/site';
import { collectSitesRecursively, normalizeUrlKey } from '../site-data/sites.ts';

type ProjectRepoCache = ReturnType<typeof tryLoadProjectsRepoCache>;

function readContentPage(pageId: string, page: Record<string, unknown>, config: ResolvedConfig) {
  const content =
    page && page.content && typeof page.content === 'object'
      ? (page.content as { file?: unknown; markdown?: unknown })
      : null;
  if (typeof content?.markdown === 'string') {
    return {
      file: content.file ? String(content.file) : '',
      html: renderMarkdownToHtml(content.markdown, {
        allowedSchemes: config.site?.security?.allowedSchemes,
      }),
    };
  }
  if (config.snapshot) throw new ConfigError(`快照内容页缺少内嵌 Markdown：${pageId}`);
  const file = content && content.file ? String(content.file).trim() : '';
  if (!file) {
    throw new ConfigError(`内容页缺少 content.file：${pageId}`, [
      `请在 config/*/pages/${pageId}.yml 中配置：`,
      'template: content',
      'content:',
      '  file: path/to/file.md',
    ]);
  }

  const normalized = file.replace(/\\/g, '/');
  const absPath = path.isAbsolute(normalized)
    ? path.normalize(normalized)
    : path.join(process.cwd(), normalized.replace(/^\//, ''));
  if (!fs.existsSync(absPath)) {
    throw new ConfigError(`内容页 markdown 文件不存在：${pageId}`, [
      `检查路径是否正确：${file}`,
      '提示：路径相对于仓库根目录（process.cwd()）解析',
    ]);
  }

  const markdownText = fs.readFileSync(absPath, 'utf8');
  return {
    file: normalized,
    html: renderMarkdownToHtml(markdownText, {
      allowedSchemes: config.site?.security?.allowedSchemes,
    }),
  };
}

function collectSiteExternalData(config: ResolvedConfig): SiteExternalData {
  const externalData: SiteExternalData = {
    articles: {},
    content: {},
    pageMeta: {},
    projects: {},
  };

  if (config.snapshot) {
    const stored = config.snapshot.externalData as SiteExternalData;
    const cacheDir = config.snapshot.cacheDir;
    const refreshedConfig = cacheDir ? { snapshot: { cacheDir } } : null;
    for (const nav of config.navigation) {
      const page = config.pages[nav.id];
      const template = page?.template || nav.id;
      if (template === 'content' && page)
        externalData.content![nav.id] = readContentPage(nav.id, page, config);
      if (template === 'articles') {
        const baseline = stored.articles?.[nav.id] ?? { items: [], meta: null };
        const fresh = refreshedConfig ? tryLoadArticlesFeedCache(nav.id, refreshedConfig) : null;
        const sources: unknown[] = [];
        for (const category of page?.categories ?? []) collectSitesRecursively(category, sources);
        const sourceUrls = new Set(
          sources.map((source) => normalizeUrlKey((source as SiteItem).url))
        );
        // 已删除的订阅源不再回退；成功空 feed 清空该来源，失败来源保留 D1 的文章。
        const retained = baseline.items.filter((item) =>
          sourceUrls.has(normalizeUrlKey(item.sourceUrl))
        );
        if (fresh && (fresh.items.length || Number(fresh.meta.successSites) > 0)) {
          const successful = new Set((fresh.meta.successfulSourceUrls ?? []).map(normalizeUrlKey));
          const byUrl = new Map<string, SiteItem>();
          for (const item of retained)
            if (!successful.has(normalizeUrlKey(item.sourceUrl))) byUrl.set(String(item.url), item);
          for (const item of fresh.items) byUrl.set(item.url, item);
          const limit = Math.max(1, Math.min(500, Number(config.site?.rss?.articles?.total) || 50));
          const date = (item: SiteItem) => Date.parse(String(item.publishedAt ?? '')) || 0;
          const items = [...byUrl.values()].sort((a, b) => date(b) - date(a)).slice(0, limit);
          externalData.articles![nav.id] = { items, meta: { ...fresh.meta, total: items.length } };
        } else {
          externalData.articles![nav.id] = { ...baseline, items: retained };
        }
      }
      if (template === 'bookmarks')
        externalData.pageMeta![nav.id] = {
          updatedAt: config.snapshot.updatedAt,
          updatedAtSource: 'D1',
        };
      if (template === 'projects') {
        const project = stored.projects?.[nav.id];
        const freshHeatmap = refreshedConfig
          ? tryLoadProjectsHeatmapCache(nav.id, refreshedConfig)
          : null;
        const freshRepos = refreshedConfig
          ? tryLoadProjectsRepoCache(nav.id, refreshedConfig)
          : null;
        const baselineRepos = project?.repoMetaMap
          ? new Map(Object.entries(project.repoMetaMap) as [string, RepoMeta][])
          : new Map<string, RepoMeta>();
        for (const [url, meta] of freshRepos?.map ?? []) baselineRepos.set(url, meta);
        externalData.projects![nav.id] = {
          heatmap: project?.heatmap
            ? { ...project.heatmap, html: sanitizeContributionsHtml(project.heatmap.html) }
            : null,
          repoMetaMap: baselineRepos,
        };
        if (freshHeatmap)
          externalData.projects![nav.id].heatmap = {
            html: freshHeatmap.html,
            meta: freshHeatmap.meta,
          };
      }
    }
    return externalData;
  }

  config.navigation.forEach((nav) => {
    const pageId = String(nav.id).trim();
    const page = config.pages[pageId] as Record<string, unknown> | undefined;
    const template = page && page.template ? String(page.template).trim() : pageId;

    if (template === 'articles') {
      const cache = tryLoadArticlesFeedCache(pageId, config);
      externalData.articles![pageId] = {
        items: cache && Array.isArray(cache.items) ? cache.items : [],
        meta: cache ? cache.meta : null,
      };
    }

    if (template === 'bookmarks') {
      externalData.pageMeta![pageId] = getPageConfigUpdatedAtMeta(pageId);
    }

    if (template === 'content' && page) {
      externalData.content![pageId] = readContentPage(pageId, page, config);
    }

    if (template === 'projects') {
      const heatmapCache = tryLoadProjectsHeatmapCache(pageId, config);
      const repoCache: ProjectRepoCache = tryLoadProjectsRepoCache(pageId, config);
      externalData.projects![pageId] = {
        heatmap: heatmapCache
          ? {
              html: heatmapCache.html,
              meta: heatmapCache.meta as Record<string, unknown>,
            }
          : null,
        repoMetaMap: repoCache ? repoCache.map : null,
      };
    }
  });

  return externalData;
}

export { buildArticlesCategoriesByPageCategories, buildProjectsMeta, collectSiteExternalData };
