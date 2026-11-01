import type { D1Database } from '@cloudflare/workers-types';

/**
 * D1 → 站点模型组装。
 *
 * D1 保存现有 CategoryItem/SiteItem 结构，按 categories.parent_id 重建分类树。
 * 写入校验限制为最多四层；本层只产出结构化树，供 API 与快照导出共用。
 *
 * 页面、分类、站点、版本和配置通过同一批次的五个查询读取，再在内存中组树。
 */

type PageRow = {
  id: string;
  label: string;
  sort: number;
  hidden: number;
  template: string | null;
  metadata: string;
  navigation: string;
};
type CategoryRow = {
  id: string;
  page_id: string;
  parent_id: string | null;
  label: string;
  sort: number;
  foldable: number;
  metadata: string;
  kind: string;
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
  metadata: string;
  kind: string;
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
  metadata: Record<string, unknown>;
  kind: string;
}

export interface CategoryNode {
  id: string;
  label: string;
  foldable: boolean;
  sort: number;
  metadata: Record<string, unknown>;
  kind: string;
  /** 子分类/分组(嵌套树) */
  categories: CategoryNode[];
  sites: SiteNode[];
}

export interface PageNode {
  id: string;
  label: string;
  template?: string;
  hidden: boolean;
  sort: number;
  metadata: Record<string, unknown>;
  navigation: Record<string, unknown>;
  categories: CategoryNode[];
}

/**
 * 同一事务读取页面树与版本，避免把不同编辑版本的行混到一起。
 * hidden 只隐藏导航，仍保留页面、链接和搜索内容。
 */
export async function loadSiteModel(db: D1Database): Promise<PageNode[]> {
  const snapshot = await loadSnapshot(db);
  return snapshot.pages;
}

export interface Snapshot {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  settings: Record<string, string>;
  pages: PageNode[];
}

export async function loadSnapshot(db: D1Database): Promise<Snapshot> {
  const results = await db.batch([
    db.prepare('SELECT * FROM pages ORDER BY sort, id'),
    db.prepare('SELECT * FROM categories ORDER BY sort, id'),
    db.prepare('SELECT * FROM sites ORDER BY sort, id'),
    db.prepare('SELECT * FROM content_state WHERE id = 1'),
    db.prepare('SELECT key, value FROM settings'),
  ]);
  const pagesRows = results[0].results as PageRow[];
  const catsRows = results[1].results as CategoryRow[];
  const sitesRows = results[2].results as SiteRow[];
  const revision = results[3].results[0] as { revision: number; updated_at: string };

  const sitesByCategory = new Map<string, SiteNode[]>();
  for (const r of sitesRows) {
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
      metadata: JSON.parse(r.metadata),
      kind: r.kind,
    });
    sitesByCategory.set(r.category_id, arr);
  }

  const categoryById = new Map<string, CategoryNode>();
  const topLevelByPage = new Map<string, CategoryNode[]>();
  for (const r of catsRows) {
    const node: CategoryNode = {
      id: r.id,
      label: r.label,
      foldable: r.foldable !== 0,
      sort: r.sort,
      metadata: JSON.parse(r.metadata),
      kind: r.kind,
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
  for (const r of catsRows) {
    if (r.parent_id !== null) {
      const parent = categoryById.get(r.parent_id);
      const self = categoryById.get(r.id);
      if (parent && self) parent.categories.push(self);
    }
  }

  const pages: PageNode[] = [];
  for (const r of pagesRows) {
    pages.push({
      id: r.id,
      label: r.label,
      ...(r.template ? { template: r.template } : {}),
      hidden: r.hidden !== 0,
      sort: r.sort,
      metadata: JSON.parse(r.metadata),
      navigation: JSON.parse(r.navigation),
      categories: topLevelByPage.get(r.id) ?? [],
    });
  }
  return {
    schemaVersion: 1,
    revision: revision.revision,
    updatedAt: revision.updated_at,
    settings: Object.fromEntries(
      (results[4].results as { key: string; value: string }[]).map((row) => [row.key, row.value])
    ),
    pages,
  };
}

/**
 * 读取 settings 表中的全部业务配置，供管理台展示。
 * 版本与发布状态保存在独立表中，不进入业务配置。
 */
export async function loadSettings(db: D1Database): Promise<Record<string, string>> {
  const res = await db
    .prepare('SELECT key, value FROM settings')
    .all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const r of res.results) out[r.key] = r.value;
  return out;
}
