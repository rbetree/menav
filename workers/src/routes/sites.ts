import { Hono } from 'hono';
import type { Env } from '../types';
import { markDirty } from '../db/dirty';
import { sanitizeHttpUrl } from '../safe-url';

/** 站点 CRUD。挂载到嵌套树任意层级的分类下。每次写成功置 dirty(快照待重建)。 */
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
  const url = sanitizeHttpUrl(b.url ?? '');
  const faviconUrl = b.faviconUrl === undefined ? null : sanitizeHttpUrl(b.faviconUrl);
  if (!b.categoryId) return c.json({ ok: false, error: 'categoryId required' }, 400);
  if (!name || url === null) return c.json({ ok: false, error: 'name/url required (url 需 http/https)' }, 400);
  if (b.faviconUrl !== undefined && faviconUrl === null) {
    return c.json({ ok: false, error: 'faviconUrl 需为 http/https 地址' }, 400);
  }
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
      faviconUrl,
      b.external === false ? 0 : 1,
      b.sort ?? 0,
    )
    .run();
  await markDirty(c.env.DB);
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
    // 校验目标分类存在(与 POST 一致,防孤儿引用)
    const cat = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?')
      .bind(b.categoryId)
      .first();
    if (!cat) return c.json({ ok: false, error: 'category not found' }, 404);
    sets.push('category_id = ?');
    vals.push(b.categoryId);
  }
  if (b.name !== undefined) {
    sets.push('name = ?');
    vals.push(String(b.name).trim());
  }
  if (b.url !== undefined) {
    // M1:写路径 scheme 白名单
    const url = sanitizeHttpUrl(b.url);
    if (url === null) return c.json({ ok: false, error: 'url 需为 http/https 地址' }, 400);
    sets.push('url = ?');
    vals.push(url);
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
    const faviconUrl = b.faviconUrl === '' ? null : sanitizeHttpUrl(b.faviconUrl);
    if (b.faviconUrl !== '' && faviconUrl === null) {
      return c.json({ ok: false, error: 'faviconUrl 需为 http/https 地址' }, 400);
    }
    sets.push('favicon_url = ?');
    vals.push(faviconUrl);
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
  await markDirty(c.env.DB);
  return c.json({ ok: true });
});

sitesRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const res = await c.env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(id).run();
  if (res.meta.changes === 0) return c.json({ ok: false, error: 'not found' }, 404);
  await markDirty(c.env.DB);
  return c.json({ ok: true });
});