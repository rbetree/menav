import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import {
  parseBookmarks,
  type BookmarkCategory,
  type BookmarksData,
} from '../../../src/lib/bookmarks/parser-core';
import { sanitizeHttpUrl } from '../safe-url';
import { markDirty } from '../db/dirty';

/**
 * 书签导入直写 D1(需求 R9,决策 D8)。
 *
 * 解析核心复用根 src/lib/bookmarks/parser-core.ts(单事实源,M4),本模块是「输出端适配器」:
 * 把解析出的结构化书签树按文件夹嵌套写入 D1——文件夹 → categories(parent_id 自引用,
 * 多级嵌套),叶子书签 → sites。
 *
 * 目标页:书签导入落在模板为 'bookmarks' 的页面下;不存在则自动建一个(page_id 固定
 * 'bookmarks')。导入语义(M2):**重导覆盖**——解析出有效内容时,先清空该书签页下旧分类/站点
 * 再整体写入,重复导入同一份 HTML 不会累积重复数据(与 seed「一次性引导」语义区分)。
 *
 * D1 单批 batch 上限约 100 条语句(M7):清理 + 插入按 ≤100 条分片提交;首批含清理语句,
 * 保证「清旧 + 建新」原子生效,后续批次可能因量大失败(已写入数据留存,可重导收敛)。
 */
/** 书签目标页 id(页面模板 template='bookmarks')。 */
export const BOOKMARKS_PAGE_ID = 'bookmarks';

type CatRow = [string, string, string | null, string, number, number];
type SiteRow = [
  string,
  string,
  string,
  string,
  string | null,
  string | null,
  string | null,
  number,
  number,
];

/** D1 batch 单批语句数上限（官方 limit ≈ 100）。 */
const BATCH_LIMIT = 100;

export interface BookmarkImportResult {
  /** 导入归类到的目标页面 id */
  pageId: string;
  pages: number;
  categories: number;
  sites: number;
  /** 超过 4 层嵌套被截断的文件夹数（0 为无截断）。 */
  truncated: number;
}

/**
 * 解析书签 HTML 并写入 D1。解析出有效内容时成功并置 dirty;解析为空时不写库、不置 dirty
 * (由路由返回 422 提示),避免错误文件覆盖既有书签数据。
 */
export async function importBookmarks(
  db: D1Database,
  html: string,
): Promise<BookmarkImportResult> {
  const data: BookmarksData = parseBookmarks(html);

  const pageId = await ensureBookmarkPage(db);

  const catRows: CatRow[] = [];
  const siteRows: SiteRow[] = [];
  for (const cat of data.categories) {
    walkCategory(pageId, null, cat, catRows, siteRows);
  }

  if (catRows.length === 0 && siteRows.length === 0) {
    // 未解析出任何有效书签:不清理既有数据,返回空结果由路由报 422
    return { pageId, pages: 1, categories: 0, sites: 0, truncated: data.truncated ?? 0 };
  }

  // 重导覆盖(M2):清空该书签页旧子树
  const cleanupStmts: D1PreparedStatement[] = [
    db.prepare(
      'DELETE FROM sites WHERE category_id IN (SELECT id FROM categories WHERE page_id = ?)',
    ).bind(pageId),
    db.prepare('DELETE FROM categories WHERE page_id = ?').bind(pageId),
  ];

  const insertStmts: D1PreparedStatement[] = [];
  for (const r of siteRows) {
    insertStmts.push(
      db.prepare(
        'INSERT INTO sites (id, category_id, name, url, description, icon, favicon_url, external, sort) VALUES (?,?,?,?,?,?,?,?,?)',
      ).bind(...r),
    );
  }
  for (const r of catRows) {
    insertStmts.push(
      db.prepare(
        'INSERT INTO categories (id, page_id, parent_id, label, sort, foldable) VALUES (?,?,?,?,?,?)',
      ).bind(...r),
    );
  }

  // M7:≤100 条/批分片;首批 = 清理 + 首批插入(原子)
  const allStmts = [...cleanupStmts, ...insertStmts];
  for (let i = 0; i < allStmts.length; i += BATCH_LIMIT) {
    await db.batch(allStmts.slice(i, i + BATCH_LIMIT));
  }

  await markDirty(db);
  return {
    pageId,
    pages: 1,
    categories: catRows.length,
    sites: siteRows.length,
    truncated: data.truncated ?? 0,
  };
}

/** 确保书签目标页存在(幂等 upsert),返回 page id。 */
async function ensureBookmarkPage(db: D1Database): Promise<string> {
  await db
    .prepare(
      `INSERT INTO pages (id, label, sort, hidden, template)
       VALUES ('${BOOKMARKS_PAGE_ID}', '书签', 0, 0, 'bookmarks')
       ON CONFLICT(id) DO UPDATE SET template = excluded.template`,
    )
    .run();
  return BOOKMARKS_PAGE_ID;
}

/** 递归把书签分类树扁平化为 categories(父 id 自引用)+ sites 行。 */
function walkCategory(
  pageId: string,
  parentId: string | null,
  cat: BookmarkCategory,
  catRows: CatRow[],
  siteRows: SiteRow[],
): void {
  const label = (cat.name || '').trim() || '未命名';
  const id = crypto.randomUUID();
  catRows.push([id, pageId, parentId, label, 0, 0]);

  const sites = Array.isArray(cat.sites) ? cat.sites : [];
  sites.forEach((s, si) => {
    const name = (s.name || '').trim();
    const url = sanitizeHttpUrl(s.url ?? '');
    // M1:非 http(s) scheme(含实体混淆的 javascript:)不落库
    if (!name || !url) return;
    siteRows.push([
      crypto.randomUUID(),
      id,
      name,
      url,
      s.description || null,
      // 书签图标以 font-awesome 类名(s.icon)表达,与 faviconUrl 无关
      s.icon || null,
      null,
      1,
      si,
    ]);
  });

  // 各层级子文件夹(与 BookmarkCategory 的 subcategories/groups/subgroups 同构)统一递归
  if (Array.isArray(cat.subcategories)) {
    for (const sub of cat.subcategories) walkCategory(pageId, id, sub, catRows, siteRows);
  }
  if (Array.isArray(cat.groups)) {
    for (const g of cat.groups) walkCategory(pageId, id, g, catRows, siteRows);
  }
  if (Array.isArray(cat.subgroups)) {
    for (const sg of cat.subgroups) walkCategory(pageId, id, sg, catRows, siteRows);
  }
}