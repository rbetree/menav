import { Hono } from 'hono';
import type { Env } from '../types';
import { importBookmarks } from '../bookmarks/import';

/**
 * 书签导入(需求 R9):接收浏览器导出的 Netscape 书签 HTML 文本,
 * 解析并直写 D1(自动建分类/站点)。受保护(挂在 admin 组走 Access JWT)。
 */
export const bookmarksRoutes = new Hono<{ Bindings: Env }>();

bookmarksRoutes.post('/', async (c) => {
  const body = await c.req.json<{ html?: unknown }>();
  const html = typeof body?.html === 'string' ? body.html : '';
  if (!html.trim()) {
    return c.json({ ok: false, error: 'html 不能为空' }, 400);
  }
  const result = await importBookmarks(c.env.DB, html);
  if (result.categories === 0 && result.sites === 0) {
    // M12:解析出 0 个分类/站点时明确失败,避免「看着成功、实则为空」的假成功
    return c.json(
      { ok: false, error: '未能从该文件解析出任何书签,请确认是浏览器导出的 Netscape 书签 HTML' },
      422,
    );
  }
  return c.json({ ok: true, ...result }, 201);
});