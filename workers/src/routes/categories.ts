import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { commitEdit, type AdminEnv } from '../db/revision';
import { object, text, bool, sortValue } from '../validation';
import { ApiError } from '../errors';

export const categoriesRoutes = new Hono<AdminEnv>();

/** 查询祖先链，校验页面归属与四层深度；同一 revision 保护校验到提交之间的树结构。 */
async function parentDepth(
  db: D1Database,
  pageId: string,
  parentId: string | null,
  selfId?: string
): Promise<number> {
  if (!parentId) return 0;
  const ancestors = await db
    .prepare(
      'WITH RECURSIVE ancestors(id, parent_id, page_id) AS (SELECT id, parent_id, page_id FROM categories WHERE id = ? UNION SELECT c.id, c.parent_id, c.page_id FROM categories c JOIN ancestors a ON c.id = a.parent_id) SELECT * FROM ancestors'
    )
    .bind(parentId)
    .all<{ id: string; parent_id: string | null; page_id: string }>();
  if (!ancestors.results.length) throw new ApiError(404, '父分类不存在');
  if (ancestors.results.some((r) => r.page_id !== pageId))
    throw new ApiError(400, '父分类必须位于同一页面');
  if (ancestors.results.some((r) => r.id === selfId))
    throw new ApiError(400, '不能移动到自身或后代分类');
  return ancestors.results.length;
}

categoriesRoutes.post('/', async (c) => {
  const b = object(await c.req.json());
  const pageId = text(b.pageId, 'pageId');
  const label = text(b.label, '分类名称');
  const parentId = b.parentId == null || b.parentId === '' ? null : text(b.parentId, 'parentId');
  if (!(await c.env.DB.prepare('SELECT id FROM pages WHERE id = ?').bind(pageId).first()))
    throw new ApiError(404, '页面不存在');
  const depth = await parentDepth(c.env.DB, pageId, parentId);
  if (depth >= 4) throw new ApiError(400, '分类最多支持 4 层');
  const id = crypto.randomUUID();
  const kind = depth < 2 ? 'subcategories' : depth === 2 ? 'groups' : 'subgroups';
  await commitEdit(c, [
    c.env.DB.prepare(
      'INSERT INTO categories (id, page_id, parent_id, label, sort, foldable, kind) VALUES (?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM categories WHERE page_id = ? AND parent_id IS ?)), ?, ?)'
    ).bind(
      id,
      pageId,
      parentId,
      label,
      b.sort === undefined ? null : sortValue(b.sort),
      pageId,
      parentId,
      b.foldable === undefined ? 1 : Number(bool(b.foldable, 'foldable')),
      kind
    ),
  ]);
  return c.json({ ok: true, data: { id } }, 201);
});

categoriesRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const self = await c.env.DB.prepare('SELECT page_id, parent_id FROM categories WHERE id = ?')
    .bind(id)
    .first<{ page_id: string; parent_id: string | null }>();
  if (!self) throw new ApiError(404, '分类不存在');
  const b = object(await c.req.json());
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (b.label !== undefined) {
    sets.push('label = ?');
    values.push(text(b.label, '分类名称'));
  }
  if (b.foldable !== undefined) {
    sets.push('foldable = ?');
    values.push(Number(bool(b.foldable, 'foldable')));
  }
  if (b.sort !== undefined) {
    sets.push('sort = ?');
    values.push(sortValue(b.sort));
  }
  const extra = [];
  if (b.parentId !== undefined) {
    const parentId = b.parentId === null || b.parentId === '' ? null : text(b.parentId, 'parentId');
    const depth = await parentDepth(c.env.DB, self.page_id, parentId, id);
    const height = await c.env.DB.prepare(
      'WITH RECURSIVE sub(id, depth) AS (SELECT ?, 1 UNION ALL SELECT c.id, s.depth + 1 FROM categories c JOIN sub s ON c.parent_id = s.id) SELECT MAX(depth) AS height FROM sub'
    )
      .bind(id)
      .first<{ height: number }>();
    if (depth + height!.height > 4) throw new ApiError(400, '移动后分类将超过 4 层');
    sets.push('parent_id = ?');
    values.push(parentId);
    if (parentId !== self.parent_id) {
      if (b.sort === undefined) {
        sets.push(
          'sort = (SELECT COALESCE(MAX(sort), -1) + 1 FROM categories WHERE page_id = ? AND parent_id IS ? AND id != ?)'
        );
        values.push(self.page_id, parentId, id);
      }
      // 归属改变后按新层级转换分类形态，避免 Group 模板忽略 subcategories。
      extra.push(
        c.env.DB.prepare(
          "WITH RECURSIVE sub(id, depth) AS (SELECT ?, ? UNION ALL SELECT c.id, s.depth + 1 FROM categories c JOIN sub s ON c.parent_id = s.id) UPDATE categories SET kind = CASE (SELECT depth FROM sub WHERE sub.id = categories.id) WHEN 1 THEN 'subcategories' WHEN 2 THEN 'subcategories' WHEN 3 THEN 'groups' ELSE 'subgroups' END, metadata = json_remove(metadata, '$.level') WHERE id IN (SELECT id FROM sub)"
        ).bind(id, depth + 1)
      );
    }
  }
  if (!sets.length) throw new ApiError(400, '没有可更新字段');
  await commitEdit(c, [
    c.env.DB.prepare('UPDATE categories SET ' + sets.join(', ') + ' WHERE id = ?').bind(
      ...values,
      id
    ),
    ...extra,
  ]);
  return c.json({ ok: true });
});

categoriesRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(id).first()))
    throw new ApiError(404, '分类不存在');
  const counts = await c.env.DB.prepare(
    'SELECT (SELECT COUNT(*) FROM categories WHERE parent_id = ?) AS childCount, (SELECT COUNT(*) FROM sites WHERE category_id = ?) AS siteCount'
  )
    .bind(id, id)
    .first<{ childCount: number; siteCount: number }>();
  const count = counts!.childCount + counts!.siteCount;
  if (count && c.req.query('force') !== '1')
    return c.json({ ok: false, error: '分类仍有内容，请确认级联删除', detail: counts }, 409);
  const subtree =
    'WITH RECURSIVE sub(id) AS (SELECT ? UNION SELECT c.id FROM categories c JOIN sub s ON c.parent_id = s.id) SELECT id FROM sub';
  await commitEdit(c, [
    c.env.DB.prepare('DELETE FROM sites WHERE category_id IN (' + subtree + ')').bind(id),
    c.env.DB.prepare('DELETE FROM categories WHERE id IN (' + subtree + ')').bind(id),
  ]);
  return c.json({ ok: true, count });
});
