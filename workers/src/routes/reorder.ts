import { Hono } from 'hono';
import type { Env } from '../types';
import { markDirty } from '../db/dirty';

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

  // M6:先预检所有 id 存在,避免「部分更新已落库却因个别 id 无效不置 dirty」的快照静默过期
  const placeholders = items.map(() => '?').join(',');
  const found = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE id IN (${placeholders})`)
    .bind(...items.map((it) => it.id))
    .first<{ n: number }>();
  if (Number(found?.n ?? 0) !== items.length) {
    return c.json({ ok: false, error: '部分 id 不存在,排序未保存' }, 400);
  }

  const stmts = items.map((it) =>
    c.env.DB.prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`).bind(it.sort, it.id),
  );
  await c.env.DB.batch(stmts);
  await markDirty(c.env.DB);
  return c.json({ ok: true, count: items.length });
});