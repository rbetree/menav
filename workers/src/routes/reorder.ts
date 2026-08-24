import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';

/**
 * 排序维护(技术方案「五、API 层」/api/reorder):批量更新同层级兄弟的 sort,事务提交。
 *
 * body: { type: 'pages' | 'categories' | 'sites', items: [{ id, sort }] }
 * 调用方负责传入同一父级(同页面 / 同父分类 / 同分类)下的兄弟节点及其新 sort。
 */
export const reorderRoutes = new Hono<{ Bindings: Env }>();

reorderRoutes.post('/', async (c) => {
  const body = await c.req.json<{ type?: string; items?: { id: string; sort: number }[] }>();
  const table = body.type;
  const items = Array.isArray(body.items) ? body.items : [];
  if (table !== 'pages' && table !== 'categories' && table !== 'sites') {
    return c.json({ ok: false, error: 'invalid type' }, 400);
  }
  if (items.length === 0) return c.json({ ok: false, error: 'items required' }, 400);

  const stmts = items.map((it) =>
    c.env.DB.prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`).bind(it.sort, it.id),
  );
  const results = await c.env.DB.batch(stmts);
  const ok = results.every((r) => r.meta.changes === 0 || r.meta.changes > 0);
  return c.json({ ok, count: items.length });
});