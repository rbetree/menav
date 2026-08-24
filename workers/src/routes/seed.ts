import { Hono } from 'hono';
import type { Env } from '../types';

/**
 * 种子导入(需求 R3,引导式隔离):一次性把仓库 YAML 产出的站点模型写入 D1。
 *
 * 解析在 Node 侧复用根 `loadConfig`(scripts/generate-seed.ts),产出层级 SeedInput;
 * 本路由把它扁平化并**事务级重建**(清空 + 重插)。这是初始引导而非增量同步,
 * 故 page 用 navigation id、category/site 用随机 uuid——不依赖幂等 id,且 uuid 无
 * 特殊字符,可直接作为路由 :id 路径参数。
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

  await c.env.DB.batch(stmts); // D1 batch = 事务
  return c.json({ ok: true, pages: pageRows.length, categories: catRows.length, sites: siteRows.length });
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
      const url = ((s.url ?? '') as string).trim();
      if (!name || !url) return;
      siteRows.push([
        crypto.randomUUID(),
        catId,
        name,
        url,
        s.description ?? null,
        s.icon ?? null,
        s.faviconUrl ?? null,
        s.external === false ? 0 : 1,
        si,
      ]);
    });

    if (Array.isArray(cat.categories) && cat.categories.length > 0) {
      walkCategory(pageId, catId, cat.categories, catRows, siteRows);
    }
  });
}