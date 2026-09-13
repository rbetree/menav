import { Hono } from 'hono';
import { revisionTag, type AdminEnv } from '../db/revision';
import { importBookmarks } from '../bookmarks/import';

/**
 * 书签导入(需求 R9):接收浏览器导出的 Netscape 书签 HTML 文本,
 * 解析并直写 D1(自动建分类/站点)。受保护(挂在 admin 组走 Access JWT)。
 */
export const bookmarksRoutes = new Hono<AdminEnv>();

bookmarksRoutes.post('/', async (c) => {
  const body = await c.req.json<{ html?: unknown }>();
  const html = typeof body?.html === 'string' ? body.html : '';
  if (!html.trim()) {
    return c.json({ ok: false, error: 'html 不能为空' }, 400);
  }
  if (new TextEncoder().encode(html).length > 8_000_000) {
    return c.json({ ok: false, error: '书签 HTML 不能超过 8 MB' }, 413);
  }
  const result = await importBookmarks(c.env.DB, html, c.get('revision'));
  c.header('ETag', revisionTag(c.get('revision') + 1));
  return c.json({ ok: true, ...result }, 201);
});
