import { Hono } from 'hono';
import type { Env } from '../types';
import { markDirty } from '../db/dirty';

/** 页面 CRUD。删除遵守 T-5=B:非空拒绝 + 显式级联(?force=1)。每次写成功置 dirty(快照待重建)。 */
export const pagesRoutes = new Hono<{ Bindings: Env }>();

// 新增页面
pagesRoutes.post('/', async (c) => {
  const b = await c.req.json<{
    label: string;
    template?: string;
    sort?: number;
    hidden?: boolean;
  }>();
  const label = (b.label ?? '').trim();
  if (!label) return c.json({ ok: false, error: 'label required' }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO pages (id, label, sort, hidden, template) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, label, b.sort ?? 0, b.hidden ? 1 : 0, b.template ?? null)
    .run();
  await markDirty(c.env.DB);
  return c.json({ ok: true, data: { id } }, 201);
});

// 更新页面
pagesRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json<{
    label?: string;
    template?: string;
    sort?: number;
    hidden?: boolean;
  }>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.label !== undefined) {
    sets.push('label = ?');
    vals.push(String(b.label).trim());
  }
  if (b.template !== undefined) {
    sets.push('template = ?');
    vals.push(b.template || null);
  }
  if (b.sort !== undefined) {
    sets.push('sort = ?');
    vals.push(Number(b.sort));
  }
  if (b.hidden !== undefined) {
    sets.push('hidden = ?');
    vals.push(b.hidden ? 1 : 0);
  }
  if (sets.length === 0) return c.json({ ok: false, error: 'no fields' }, 400);
  vals.push(id);
  const res = await c.env.DB.prepare(`UPDATE pages SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run();
  if (res.meta.changes === 0) return c.json({ ok: false, error: 'not found' }, 404);
  await markDirty(c.env.DB);
  return c.json({ ok: true });
});

// 删除页面(非空拒绝 + 显式级联)
pagesRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const force = c.req.query('force') === '1';
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM categories WHERE page_id = ?')
    .bind(id)
    .first<{ n: number }>();
  const count = Number(row?.n ?? 0);
  if (count > 0 && !force) {
    return c.json({ ok: false, error: 'page has categories', count }, 409);
  }
  if (count > 0) {
    await c.env.DB.batch([
      c.env.DB.prepare(
        'DELETE FROM sites WHERE category_id IN (SELECT id FROM categories WHERE page_id = ?)',
      ).bind(id),
      c.env.DB.prepare('DELETE FROM categories WHERE page_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(id),
    ]);
  } else {
    const res = await c.env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(id).run();
    if (res.meta.changes === 0) return c.json({ ok: false, error: 'not found' }, 404);
  }
  await markDirty(c.env.DB);
  return c.json({ ok: true, count });
});