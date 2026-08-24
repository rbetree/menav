import { Hono } from 'hono';
import type { Env } from '../types';
import { markDirty } from '../db/dirty';

/**
 * 分类(嵌套树节点)CRUD。
 * - parent_id 自引用表达多级嵌套;POST 可指定层级,PUT 的 parentId 变更即层级维护(R6)。
 * - 删除遵守 T-5=B:非空拒绝 + 显式级联(?force=1,整棵子树)。
 */
export const categoriesRoutes = new Hono<{ Bindings: Env }>();

categoriesRoutes.post('/', async (c) => {
  const b = await c.req.json<{
    pageId: string;
    parentId?: string | null;
    label: string;
    foldable?: boolean;
    sort?: number;
  }>();
  const label = (b.label ?? '').trim();
  if (!label) return c.json({ ok: false, error: 'label required' }, 400);
  if (!b.pageId) return c.json({ ok: false, error: 'pageId required' }, 400);
  if (b.parentId) {
    const p = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ? AND page_id = ?')
      .bind(b.parentId, b.pageId)
      .first();
    if (!p) return c.json({ ok: false, error: 'parent not in page' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO categories (id, page_id, parent_id, label, sort, foldable) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, b.pageId, b.parentId ?? null, label, b.sort ?? 0, b.foldable ? 1 : 0)
    .run();
  await markDirty(c.env.DB);
  return c.json({ ok: true, data: { id } }, 201);
});

categoriesRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json<{
    label?: string;
    foldable?: boolean;
    sort?: number;
    parentId?: string | null;
  }>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.label !== undefined) {
    sets.push('label = ?');
    vals.push(String(b.label).trim());
  }
  if (b.foldable !== undefined) {
    sets.push('foldable = ?');
    vals.push(b.foldable ? 1 : 0);
  }
  if (b.sort !== undefined) {
    sets.push('sort = ?');
    vals.push(Number(b.sort));
  }
  if (b.parentId !== undefined) {
    const newParent = b.parentId || null;
    if (newParent === id) return c.json({ ok: false, error: 'cannot be own parent' }, 400);
    if (newParent !== null) {
      // 校验父分类存在且与 self 同页面(与 POST 一致,防跨页挂父后随 page_id 级联误删)
      const self = await c.env.DB.prepare('SELECT page_id FROM categories WHERE id = ?')
        .bind(id)
        .first<{ page_id: string }>();
      const par = await c.env.DB.prepare('SELECT page_id FROM categories WHERE id = ?')
        .bind(newParent)
        .first<{ page_id: string }>();
      if (!par) return c.json({ ok: false, error: 'parent not found' }, 404);
      if (self && par.page_id !== self.page_id) {
        return c.json({ ok: false, error: 'parent not in page' }, 400);
      }
      // 防循环:newParent 不得是 self 的子孙
      const desc = await c.env.DB.prepare(
        `WITH RECURSIVE sub(id) AS (
           SELECT id FROM categories WHERE parent_id = ?
           UNION ALL
           SELECT c.id FROM categories c JOIN sub s ON c.parent_id = s.id
         ) SELECT * FROM sub WHERE id = ?`,
      )
        .bind(id, newParent)
        .first();
      if (desc) return c.json({ ok: false, error: 'cycle detected' }, 400);
    }
    sets.push('parent_id = ?');
    vals.push(newParent);
  }
  if (sets.length === 0) return c.json({ ok: false, error: 'no fields' }, 400);
  vals.push(id);
  const res = await c.env.DB.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run();
  if (res.meta.changes === 0) return c.json({ ok: false, error: 'not found' }, 404);
  await markDirty(c.env.DB);
  return c.json({ ok: true });
});

categoriesRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const force = c.req.query('force') === '1';
  const childRow = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?')
    .bind(id)
    .first<{ n: number }>();
  const siteRow = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM sites WHERE category_id = ?')
    .bind(id)
    .first<{ n: number }>();
  const childCount = Number(childRow?.n ?? 0);
  const siteCount = Number(siteRow?.n ?? 0);
  if (childCount + siteCount > 0 && !force) {
    return c.json(
      { ok: false, error: 'category not empty', detail: { childCount, siteCount } },
      409,
    );
  }
  if (force) {
    // 级联:递归子树 = self + 所有后代;先删子树 sites,再删子树 categories
    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM sites WHERE category_id IN (
           WITH RECURSIVE sub(id) AS (
             SELECT ? UNION ALL
             SELECT c.id FROM categories c JOIN sub s ON c.parent_id = s.id
           ) SELECT id FROM sub)`,
      ).bind(id),
      c.env.DB.prepare(
        `DELETE FROM categories WHERE id IN (
           WITH RECURSIVE sub(id) AS (
             SELECT ? UNION ALL
             SELECT c.id FROM categories c JOIN sub s ON c.parent_id = s.id
           ) SELECT id FROM sub)`,
      ).bind(id),
    ]);
  } else {
    const res = await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
    if (res.meta.changes === 0) return c.json({ ok: false, error: 'not found' }, 404);
  }
  await markDirty(c.env.DB);
  return c.json({ ok: true, count: childCount + siteCount });
});