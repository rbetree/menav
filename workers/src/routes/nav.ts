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
  const body = JSON.stringify(model);
  // 内容摘要作 ETag,轮询可命中 304;公开读取允许短暂缓存,减轻匿名刷取。
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const tag =
    'W/"' +
    [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('') +
    '"';
  c.header('ETag', tag);
  c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  if (c.req.header('if-none-match') === tag) return c.body(null, 304);
  return c.body(body, 200, { 'Content-Type': 'application/json; charset=utf-8' });
});
