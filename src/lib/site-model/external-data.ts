import type { ResolvedConfig } from '../../types/config';
import type { SiteExternalData } from '../../types/model';
import fs from 'node:fs';
import path from 'node:path';
import { buildArticlesCategoriesByPageCategories, tryLoadArticlesFeedCache } from '../cache/articles.ts';
import {
  buildProjectsMeta,
  tryLoadProjectsHeatmapCache,
  tryLoadProjectsRepoCache,
} from '../cache/projects.ts';
import { renderMarkdownToHtml } from '../content/markdown.ts';
import { ConfigError } from '../errors.ts';
import { getPageConfigUpdatedAtMeta } from '../site-data/page-meta.ts';

type ProjectRepoCache = ReturnType<typeof tryLoadProjectsRepoCache>;

function readContentPage(pageId: string, page: Record<string, unknown>, config: ResolvedConfig) {
  const content =
    page && page.content && typeof page.content === 'object'
      ? (page.content as { file?: unknown })
      : null;
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
