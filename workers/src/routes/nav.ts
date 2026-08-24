import { Hono } from 'hono';
import type { Env } from '../types';
import { loadSiteModel } from '../db/site-model';

/**
 * 站点模型读取(公开 + 后台初始化)。
 * - GET /api/nav   :公开,导出全量站点模型(供快照构建)
 * - GET /api/state :后台初始化,返回全量(供 admin 渲染;受 auth 保护)
 */
export const navRoutes = new Hono<{ Bindings: Env }>();

navRoutes.get('/', async (c) => {
  const model = await loadSiteModel(c.env.DB);
  return c.json(model);
});