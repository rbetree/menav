import { Hono } from 'hono';
import { commitEdit, type AdminEnv } from '../db/revision';
import { sanitizeSiteUrl, sanitizeIconUrl } from '../safe-url';
import { object, text, bool, sortValue } from '../validation';
import { ApiError } from '../errors';
import type { D1Database } from '@cloudflare/workers-types';

export const sitesRoutes = new Hono<AdminEnv>();

async function siteUrl(db: D1Database, value: unknown): Promise<string> {
  const settings = await db
    .prepare("SELECT value FROM settings WHERE key = 'site'")
    .first<{ value: string }>();
  const allowedSchemes: unknown = settings
    ? JSON.parse(settings.value).security?.allowedSchemes
    : undefined;
  const url = sanitizeSiteUrl(value, allowedSchemes);
  if (url === null) throw new ApiError(400, '链接无效或使用不安全的协议');
  return url;
}

function faviconUrl(value: unknown): string | null {
  if (value === '' || value === null) return null;
  const url = sanitizeIconUrl(value);
  if (url === null) throw new ApiError(400, '图标需为 HTTP(S) 地址或 assets/ 资源路径');
  return url;
}

sitesRoutes.post('/', async (c) => {
  const b = object(await c.req.json());
  const categoryId = text(b.categoryId, 'categoryId');
  const name = text(b.name, '站点名称');
  const url = await siteUrl(c.env.DB, b.url);
  if (!(await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(categoryId).first()))
    throw new ApiError(404, '分类不存在');
  const id = crypto.randomUUID();
  await commitEdit(c, [
    c.env.DB.prepare(
      'INSERT INTO sites (id, category_id, name, url, description, icon, favicon_url, external, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM sites WHERE category_id = ?)))'
    ).bind(
      id,
      categoryId,
      name,
      url,
      b.description == null ? null : text(b.description, 'description', false),
      b.icon == null ? null : text(b.icon, 'icon', false),
      b.faviconUrl === undefined ? null : faviconUrl(b.faviconUrl),
      b.external === undefined ? 1 : Number(bool(b.external, 'external')),
      b.sort === undefined ? null : sortValue(b.sort),
      categoryId
    ),
  ]);
  return c.json({ ok: true, data: { id } }, 201);
});

sitesRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const self = await c.env.DB.prepare('SELECT category_id FROM sites WHERE id = ?')
    .bind(id)
    .first<{ category_id: string }>();
  if (!self) throw new ApiError(404, '站点不存在');
  const b = object(await c.req.json());
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (b.categoryId !== undefined) {
    const categoryId = text(b.categoryId, 'categoryId');
    if (
      !(await c.env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(categoryId).first())
    )
      throw new ApiError(404, '目标分类不存在');
    sets.push('category_id = ?', "kind = 'sites'");
    values.push(categoryId);
    if (categoryId !== self.category_id && b.sort === undefined) {
      sets.push('sort = (SELECT COALESCE(MAX(sort), -1) + 1 FROM sites WHERE category_id = ?)');
      values.push(categoryId);
    }
  }
  if (b.name !== undefined) {
    sets.push('name = ?');
    values.push(text(b.name, '站点名称'));
  }
  if (b.url !== undefined) {
    sets.push('url = ?');
    values.push(await siteUrl(c.env.DB, b.url));
  }
  if (b.description !== undefined) {
    sets.push('description = ?');
    values.push(b.description === null ? null : text(b.description, 'description', false));
  }
  if (b.icon !== undefined) {
    sets.push('icon = ?');
    values.push(b.icon === null ? null : text(b.icon, 'icon', false));
  }
  if (b.faviconUrl !== undefined) {
    sets.push('favicon_url = ?');
    values.push(faviconUrl(b.faviconUrl));
  }
  if (b.external !== undefined) {
    sets.push('external = ?');
    values.push(Number(bool(b.external, 'external')));
  }
  if (b.sort !== undefined) {
    sets.push('sort = ?');
    values.push(sortValue(b.sort));
  }
  if (!sets.length) throw new ApiError(400, '没有可更新字段');
  await commitEdit(c, [
    c.env.DB.prepare('UPDATE sites SET ' + sets.join(', ') + ' WHERE id = ?').bind(...values, id),
  ]);
  return c.json({ ok: true });
});

sitesRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await c.env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(id).first()))
    throw new ApiError(404, '站点不存在');
  await commitEdit(c, [c.env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(id)]);
  return c.json({ ok: true });
});
