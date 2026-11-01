import { Hono } from 'hono';
import { commitEdit, type AdminEnv } from '../db/revision';
import {
  object,
  text,
  bool,
  sortValue,
  templateValue,
  pageMetadata,
  navigationMetadata,
  requireContent,
} from '../validation';
import { ApiError } from '../errors';

export const pagesRoutes = new Hono<AdminEnv>();

pagesRoutes.post('/', async (c) => {
  const b = object(await c.req.json());
  const label = text(b.label, '页面名称');
  const id = 'page-' + crypto.randomUUID();
  const sort = b.sort === undefined ? null : sortValue(b.sort);
  const template = b.template === undefined ? null : templateValue(b.template);
  const metadata = pageMetadata(b.metadata ?? {});
  requireContent(template, id, metadata);
  await commitEdit(c, [
    c.env.DB.prepare(
      'INSERT INTO pages (id, label, sort, hidden, template, metadata, navigation) VALUES (?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM pages)), ?, ?, ?, ?)'
    ).bind(
      id,
      label,
      sort,
      b.hidden === undefined ? 0 : Number(bool(b.hidden, 'hidden')),
      template,
      metadata,
      navigationMetadata(b.navigation ?? {})
    ),
  ]);
  return c.json({ ok: true, data: { id } }, 201);
});

pagesRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const current = await c.env.DB.prepare('SELECT template, metadata FROM pages WHERE id = ?')
    .bind(id)
    .first<{ template: string | null; metadata: string }>();
  if (!current) throw new ApiError(404, '页面不存在');
  const b = object(await c.req.json());
  requireContent(
    b.template === undefined ? current.template : templateValue(b.template),
    id,
    b.metadata === undefined ? current.metadata : pageMetadata(b.metadata)
  );
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (b.label !== undefined) {
    sets.push('label = ?');
    values.push(text(b.label, '页面名称'));
  }
  if (b.template !== undefined) {
    sets.push('template = ?');
    values.push(templateValue(b.template));
  }
  if (b.sort !== undefined) {
    sets.push('sort = ?');
    values.push(sortValue(b.sort));
  }
  if (b.hidden !== undefined) {
    sets.push('hidden = ?');
    values.push(Number(bool(b.hidden, 'hidden')));
  }
  if (b.metadata !== undefined) {
    sets.push('metadata = ?');
    values.push(pageMetadata(b.metadata));
  }
  if (b.navigation !== undefined) {
    sets.push('navigation = ?');
    values.push(navigationMetadata(b.navigation));
  }
  if (!sets.length) throw new ApiError(400, '没有可更新字段');
  await commitEdit(c, [
    c.env.DB.prepare('UPDATE pages SET ' + sets.join(', ') + ' WHERE id = ?').bind(...values, id),
  ]);
  return c.json({ ok: true });
});

pagesRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await c.env.DB.prepare('SELECT id FROM pages WHERE id = ?').bind(id).first()))
    throw new ApiError(404, '页面不存在');
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM categories WHERE page_id = ?')
    .bind(id)
    .first<{ n: number }>();
  const count = row!.n;
  if (count && c.req.query('force') !== '1')
    return c.json({ ok: false, error: '页面仍有分类，请确认级联删除', count }, 409);
  await commitEdit(c, [
    c.env.DB.prepare(
      'DELETE FROM sites WHERE category_id IN (SELECT id FROM categories WHERE page_id = ?)'
    ).bind(id),
    c.env.DB.prepare('DELETE FROM categories WHERE page_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true, count });
});
