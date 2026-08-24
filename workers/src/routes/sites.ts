import { Hono } from 'hono';
import type { Env } from '../types';

/** 站点 CRUD。挂载到嵌套树任意层级的分类下。 */
export const sitesRoutes = new Hono<{ Bindings: Env }>();

sitesRoutes.post('/', async (c) => {
  const b = await c.req.json<{
    categoryId: string;
    name: string;
    url: string;
    description?: string;
    icon?: string;
    faviconUrl?: string;
    external?: boolean;
    sort?: number;
  }>();
  const name = (b.name ?? '').trim();
  const url = (b.url ?? '').trim();
  if (!b.categoryId) return c.json({ ok: false, error: 'categoryId required' }, 400);
  if (!name || !url) return c.json({ ok: false, error: 'name/url required' }, 400);
  const cat = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?')
    .bind(b.categoryId)
    .first();
  if (!cat) return c.json({ ok: false, error: 'category not found' }, 404);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO sites
       (id, category_id, name, url, description, icon, favicon_url, external, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      b.categoryId,
      name,
      url,
      b.description ?? null,
      b.icon ?? null,
      b.faviconUrl ?? null,
      b.external === false ? 0 : 1,
      b.sort ?? 0,
    )
    .run();
  return c.json({ ok: true, data: { id } }, 201);
});

sitesRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json<{
    categoryId?: string;
    name?: string;
    url?: string;
    description?: string;
    icon?: string;
    faviconUrl?: string;
    external?: boolean;
    sort?: number;
  }>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.categoryId !== undefined) {
    sets.push('category_id = ?');
    vals.push(b.categoryId);
  }
  if (b.name !== undefined) {
    sets.push('name = ?');
    vals.push(String(b.name).trim());
  }
  if (b.url !== undefined) {
    sets.push('url = ?');
    vals.push(String(b.url).trim());
  }
  if (b.description !== undefined) {
    sets.push('description = ?');
    vals.push(b.description || null);
  }
  if (b.icon !== undefined) {
    sets.push('icon = ?');
    vals.push(b.icon || null);
  }
  if (b.faviconUrl !== undefined) {
    sets.push('favicon_url = ?');
    vals.push(b.faviconUrl || null);
  }
  if (b.external !== undefined) {
    sets.push('external = ?');
    vals.push(b.external ? 1 : 0);
  }
  if (b.sort !== undefined) {
    sets.push('sort = ?');
    vals.push(Number(b.sort));
  }
  if (sets.length === 0) return c.json({ ok: false, error: 'no fields' }, 400);
  vals.push(id);
  const res = await c.env.DB.prepare(`UPDATE sites SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run();
  if (res.meta.changes === 0) return c.json({ ok: false, error: 'not found' }, 404);
  return c.json({ ok: true });
});

sitesRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const res = await c.env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(id).run();
  if (res.meta.changes === 0) return c.json({ ok: false, error: 'not found' }, 404);
  return c.json({ ok: true });
});