import { Hono } from 'hono';
import type { Env } from '../types';
import { rebuildSnapshot } from '../rebuild';

/**
 * 手动发布(定案 T-2=B 的「手动兜底」):若 dirty 则触发快照重建并清零,
 * 否则无操作。受保护(挂在 admin 组走 Access JWT)。返回:
 *   { ok:true, queued:true  }  —— dirty 已被消费,已入队触发
 *   { ok:true, queued:false }  —— 无待重建变更
 */
export const rebuildRoutes = new Hono<{ Bindings: Env }>();

rebuildRoutes.post('/', async (c) => {
  return c.json(await rebuildSnapshot(c.env.DB, c.env));
});