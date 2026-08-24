import type { D1Database } from '@cloudflare/workers-types';

/**
 * D1 → 站点模型组装。
 *
 * 领域定案(技术方案「四、数据层」):D1 是现有 CategoryItem/SiteItem 结构的持久化投影,
 * 读回时按 categories.parent_id 递归重建「任意深度嵌套分类树」——建树思想对照
 * src/lib/site-model/index.ts:156 assignCardsToCategory 的递归展开,但本层只产出结构化
 * 树(不产构建期 CardViewModel),供 API 与快照导出共用。
 *
 * 一次三查询(页面/分类/站点全量) + 内存按 parent_id 组树,避免 N+1;导航数据量小,全量读取最简。
 */

type PageRow = { id: string; label: string; sort: number; hidden: number; template: string | null };
type CategoryRow = {
  id: string;
  page_id: string;
  parent_id: string | null;
  label: string;
  sort: number;
  foldable: number;
};
type SiteRow = {
  id: string;
  category_id: string;
  name: string;
  url: string;
  description: string | null;
  icon: string | null;
  favicon_url: string | null;
  external: number;
  sort: number;
};

export interface SiteNode {
  id: string;
  name: string;
  url: string;
  description?: string;
  icon?: string;
  faviconUrl?: string;
  external: boolean;
  sort: number;
}

export interface CategoryNode {
  id: string;
  label: string;
  foldable: boolean;
  sort: number;
  /** 子分类/分组(嵌套树) */
  categories: CategoryNode[];
  sites: SiteNode[];
}

export interface PageNode {
  id: string;
  label: string;
  template?: string;
  hidden: boolean;
  categories: CategoryNode[];
}

/** 读取并组装全量(或单页面)站点模型。 */
export async function loadSiteModel(
  db: D1Database,
  opts?: { pageId?: string },
): Promise<PageNode[]> {
  const [pagesRes, catsRes, sitesRes] = await Promise.all([
    db.prepare('SELECT id, label, sort, hidden, template FROM pages ORDER BY sort').all<PageRow>(),
    db
      .prepare('SELECT id, page_id, parent_id, label, sort, foldable FROM categories ORDER BY sort')
      .all<CategoryRow>(),
    db.prepare('SELECT * FROM sites ORDER BY sort').all<SiteRow>(),
  ]);

  const sitesByCategory = new Map<string, SiteNode[]>();
  for (const r of sitesRes.results) {
    const arr = sitesByCategory.get(r.category_id) ?? [];
    arr.push({
      id: r.id,
      name: r.name,
      url: r.url,
      ...(r.description ? { description: r.description } : {}),
      ...(r.icon ? { icon: r.icon } : {}),
      ...(r.favicon_url ? { faviconUrl: r.favicon_url } : {}),
      external: r.external !== 0,
      sort: r.sort,
    });
    sitesByCategory.set(r.category_id, arr);
  }

  const categoryById = new Map<string, CategoryNode>();
  const topLevelByPage = new Map<string, CategoryNode[]>();
  for (const r of catsRes.results) {
    const node: CategoryNode = {
      id: r.id,
      label: r.label,
      foldable: r.foldable !== 0,
      sort: r.sort,
      categories: [],
      sites: sitesByCategory.get(r.id) ?? [],
    };
    categoryById.set(r.id, node);
    if (r.parent_id === null) {
      const arr = topLevelByPage.get(r.page_id) ?? [];
      arr.push(node);
      topLevelByPage.set(r.page_id, arr);
    }
  }

  // 二级及以上:挂到父分类;查询已按 sort 排序,append 顺序即排序。
  for (const r of catsRes.results) {
    if (r.parent_id !== null) {
      const parent = categoryById.get(r.parent_id);
      const self = categoryById.get(r.id);
      if (parent && self) parent.categories.push(self);
    }
  }

  const pages: PageNode[] = [];
  for (const r of pagesRes.results) {
    if (opts?.pageId && r.id !== opts.pageId) continue;
    pages.push({
      id: r.id,
      label: r.label,
      ...(r.template ? { template: r.template } : {}),
      hidden: r.hidden !== 0,
      categories: topLevelByPage.get(r.id) ?? [],
    });
  }
  return pages;
}

/** 便捷:按页面 id 取单个页面模型(不存在返回 null)。 */
export async function loadPage(db: D1Database, pageId: string): Promise<PageNode | null> {
  const pages = await loadSiteModel(db, { pageId });
  return pages[0] ?? null;
}