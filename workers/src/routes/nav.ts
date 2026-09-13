import { Hono } from 'hono';
import type { Env } from '../types';
import { loadSiteModel } from '../db/site-model';

/**
 * 公开实时站点模型读取。
 * - GET /api/nav：公开站点模型；hidden 只隐藏导航，链接和搜索仍可访问。
 */
export const navRoutes = new Hono<{ Bindings: Env }>();

navRoutes.get('/', async (c) => {
  const model = await loadSiteModel(c.env.DB);
  c.header('Cache-Control', 'no-store');
  return c.json(model);
});
