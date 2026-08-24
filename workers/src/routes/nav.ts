import { Hono } from 'hono';
import type { Env } from '../types';
import { loadSiteModel } from '../db/site-model';

/**
 * 站点模型读取(公开 + 后台初始化)。
 * - GET /api/nav   :公开,导出站点模型(供快照构建)。**过滤 hidden 页面**——隐藏内容
 *   仅管理员可见(CONTEXT.md 可见性语义),不进公开数据面与公开快照。
 * - GET /api/state :后台初始化,返回全量(供 admin 渲染;受 auth 保护)
 */
export const navRoutes = new Hono<{ Bindings: Env }>();

navRoutes.get('/', async (c) => {
  const model = await loadSiteModel(c.env.DB, { excludeHidden: true });
  return c.json(model);
});