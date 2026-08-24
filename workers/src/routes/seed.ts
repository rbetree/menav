import { Hono } from 'hono';
import type { Env } from '../types';
import { markDirty } from '../db/dirty';
import { sanitizeHttpUrl } from '../safe-url';
import { BOOKMARKS_PAGE_ID } from '../bookmarks/import';

/**
 * 种子导入(需求 R3,引导式隔离):一次性把仓库 YAML 产出的站点模型写入 D1。
 *
 * 解析在 Node 侧复用根 `loadConfig`(scripts/generate-seed.ts),产出层级 SeedInput;
 * 本路由把它扁平化并**事务级重建**(清空 + 重插)。这是初始引导而非增量同步,
 * 故 page 用 navigation id、category/site 用随机 uuid——不依赖幂等 id,且 uuid 无
 * 特殊字符,可直接作为路由 :id 路径参数。
 *
 * M5:语义为「一次性整库重置」——重复导入会覆盖后台在线编辑。因此当数据库已含非书签
 * 页面数据时,需显式 `?reset=1` 才执行清空重建;首次引导(空库)无需开关。
 */

interface SeedSiteNode {
  name?: string;
  url?: string;
  description?: string;
  icon?: string;
  faviconUrl?: string;
  external?: boolean;
}
interface SeedCategoryNode {
  label?: string;
  foldable?: boolean;
  sites?: SeedSiteNode[];
  categories?: SeedCategoryNode[];
}
interface SeedPage {
  id?: string;
  label?: string;
  template?: string;
  hidden?: boolean;
  categories?: SeedCategoryNode[];
}
interface SeedInput {
  settings?: Record<string, string>;
  pages?: SeedPage[];
}

type SiteRow = [string, string, string, string, string | null, string | null, string | null, number, number];
type CatRow = [string, string, string | null, string, number, number];
type PageRow = [string, string, number, number, string | null];

export const seedRoutes = new Hono<{ Bindings: Env }>();

seedRoutes.post('/', async (c) => {
  const body = await c.req.json<SeedInput>();
  const reset = c.req.query('reset') === '1';

  // M5:清空重建会覆盖后台在线编辑——非首次(已有非书签页面数据)必须显式 ?reset=1
  if (!reset) {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM pages WHERE id != ?')
      .bind(BOOKMARKS_PAGE_ID)
      .first<{ n: number }>();
    if (Number(row?.n ?? 0) > 0) {
      return c.json(
        { ok: false, error: '数据库已包含数据,清空重建将覆盖在线编辑;如确实需要请以 ?reset=1 调用' },
        409,
      );
    }
  }

  const pageRows: PageRow[] = [];
  const catRows: CatRow[] = [];
  const siteRows: SiteRow[] = [];

  (body.pages ?? []).forEach((p, pi) => {
    const pageId = ((p.id ?? p.label ?? `page-${pi}`) || '').trim();
    const label = ((p.label ?? pageId) || '未命名').trim();
    pageRows.push([pageId, label, pi, p.hidden ? 1 : 0, p.template ?? null]);
    if (Array.isArray(p.categories)) {
      walkCategory(pageId, null, p.categories, catRows, siteRows);
    }
  });

  const stmts: ReturnType<typeof c.env.DB.prepare>[] = [
    c.env.DB.prepare('DELETE FROM sites'),
    c.env.DB.prepare('DELETE FROM categories'),
    c.env.DB.prepare('DELETE FROM pages'),
  ];
  for (const r of siteRows) {
    stmts.push(
      c.env.DB.prepare(
        'INSERT INTO sites (id, category_id, name, url, description, icon, favicon_url, external, sort) VALUES (?,?,?,?,?,?,?,?,?)',
      ).bind(...r),
    );
  }
  for (const r of catRows) {
    stmts.push(
      c.env.DB.prepare(
        'INSERT INTO categories (id, page_id, parent_id, label, sort, foldable) VALUES (?,?,?,?,?,?)',
      ).bind(...r),
    );
  }
  for (const r of pageRows) {
    stmts.push(
      c.env.DB.prepare('INSERT INTO pages (id, label, sort, hidden, template) VALUES (?,?,?,?,?)').bind(
        ...r,
      ),
    );
  }
  for (const [k, v] of Object.entries(body.settings ?? {})) {
    stmts.push(
      c.env.DB.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).bind(k, v),
    );
  }

  // M7:≤100 条/批分片提交(D1 batch 上限);首批为 3 条 DELETE + 首个插入批,保证「清空重建」原子生效
  const BATCH_LIMIT = 100;
  for (let i = 0; i < stmts.length; i += BATCH_LIMIT) {
    await c.env.DB.batch(stmts.slice(i, i + BATCH_LIMIT));
  }
  await markDirty(c.env.DB);
  return c.json({
    ok: true,
    reset: true, // M5:显式声明该调用为整库重置
    pages: pageRows.length,
    categories: catRows.length,
    sites: siteRows.length,
  });
});

function walkCategory(
  pageId: string,
  parentId: string | null,
  cats: SeedCategoryNode[],
  catRows: CatRow[],
  siteRows: SiteRow[],
): void {
  cats.forEach((cat, idx) => {
    const label = ((cat.label ?? '未命名') || '').trim();
    const catId = crypto.randomUUID();
    catRows.push([catId, pageId, parentId, label, idx, cat.foldable ? 1 : 0]);

    const sites = Array.isArray(cat.sites) ? cat.sites : [];
    sites.forEach((s, si) => {
      const name = ((s.name ?? '') as string).trim();
      const url = sanitizeHttpUrl(s.url ?? '');
      // M1:非 http(s) scheme 的 url 不落库
      if (!name || url === null) return;
      const faviconUrl = s.faviconUrl == null ? null : sanitizeHttpUrl(s.faviconUrl);
      siteRows.push([
        crypto.randomUUID(),
        catId,
        name,
        url,
        s.description ?? null,
        s.icon ?? null,
        faviconUrl,
        s.external === false ? 0 : 1,
        si,
      ]);
    });

    if (Array.isArray(cat.categories) && cat.categories.length > 0) {
      walkCategory(pageId, catId, cat.categories, catRows, siteRows);
    }
  });
}