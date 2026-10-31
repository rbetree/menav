import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Env } from './types';
import { applySchema } from './db/schema';
import { loadSnapshot, loadSettings } from './db/site-model';
import { editRevision, revisionTag, type AdminEnv } from './db/revision';
import { ApiError } from './errors';
import { authMiddleware } from './auth';
import { reorderRoutes } from './routes/reorder';
import { pagesRoutes } from './routes/pages';
import { categoriesRoutes } from './routes/categories';
import { sitesRoutes } from './routes/sites';
import { seedRoutes } from './routes/seed';
import { settingsRoutes } from './routes/settings';
import { bookmarksRoutes } from './routes/bookmarks';
import { rebuildRoutes } from './routes/rebuild';
import { publishStatus, reconcilePublication, buildSnapshot } from './rebuild';

const app = new Hono<{ Bindings: Env }>();
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ ok: false, error: error.code, detail: error.message }, error.status);
  if (error instanceof SyntaxError)
    return c.json({ ok: false, error: 'invalid_json', detail: '请求不是有效的 JSON' }, 400);
  // 只记录定位信息,避免把 SQL 与内容数据写入日志。
  console.error('请求失败', {
    path: c.req.path,
    name: error instanceof Error ? error.name : 'unknown',
    message: error instanceof Error ? error.message : String(error),
  });
  return c.json({ ok: false, error: 'internal_error', detail: '服务暂时不可用，请稍后重试' }, 500);
});

// 未知路径保持 JSON 错误契约(静态资源由末尾兜底路由处理)。
app.notFound((c) => c.json({ ok: false, error: 'not_found', detail: '接口不存在' }, 404));

// schema 幂等就绪一次(module 级缓存;失败重置以便重试)
let schemaReady: Promise<void> | null = null;
function ensureSchema(env: Env): Promise<void> {
  schemaReady ??= applySchema(env.DB).catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}
app.use('*', async (c, next) => {
  await ensureSchema(c.env);
  return next();
});

app.get('/build/snapshot', async (c) => {
  const provided = c.req.header('authorization') ?? '';
  if (!c.env.BUILD_TOKEN) return c.json({ ok: false, error: 'build_auth_not_configured' }, 503);
  // 比较摘要，避免明文逐字符比较泄漏 Token 长度之外的匹配信息。
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [actual, expected] = await Promise.all([
    digest(provided),
    digest('Bearer ' + c.env.BUILD_TOKEN),
  ]);
  let different = 0;
  for (let i = 0; i < actual.length; i++) different |= actual[i] ^ expected[i];
  if (different) return c.json({ ok: false, error: 'unauthorized' }, 403);
  const snapshot = await buildSnapshot(c.env.DB, c.env, c.req.query('url') ?? '');
  return c.body(snapshot, 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
});

// 受保护:后台(全部走 Access JWT 校验)
const admin = new Hono<AdminEnv>();
admin.use('*', async (c, next) => {
  await next();
  // ASSETS 会返回自身的缓存头，必须在最终响应上覆盖；
  // 管理台承载 Access 会话,补齐安全响应头抵御点击劫持与 MIME 嗅探。
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  );
});
admin.use('*', authMiddleware);

// CSRF 纵深:Access 会话 cookie 默认可被跨站携带,写操作强制同源 + JSON Content-Type。
// (跨站表单只能发出 application/x-www-form-urlencoded 等简单类型,无法伪造 application/json)
admin.use('/api/*', async (c, next) => {
  if (!WRITE_METHODS.has(c.req.method)) return next();
  const site = c.req.header('sec-fetch-site');
  const origin = c.req.header('origin');
  // 带 Origin / Sec-Fetch-Site 即视为浏览器发起的跨站风险请求;CLI/CI 客户端两者皆无。
  const fromBrowser = Boolean(site || origin);
  if (site && site !== 'same-origin')
    return c.json({ ok: false, error: 'cross_site_blocked', detail: '拒绝跨站写请求' }, 403);
  if (origin) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === new URL(c.req.url).host;
    } catch {
      sameHost = false;
    }
    if (!sameHost)
      return c.json({ ok: false, error: 'cross_site_blocked', detail: '拒绝跨站写请求' }, 403);
  }
  // 浏览器写请求「声明了 Content-Type 时」必须是 JSON:无体的 POST(如 /api/rebuild)与 DELETE
  // 不带该头,予以放行。其 CSRF 保护由 Origin/Sec-Fetch-Site 承担,而跨站表单必然携带简单类型
  // (application/x-www-form-urlencoded、text/plain、multipart/form-data),会被拦下。
  if (fromBrowser) {
    const contentType = (c.req.header('content-type') ?? '').toLowerCase();
    if (contentType && !contentType.startsWith('application/json'))
      return c.json(
        { ok: false, error: 'unsupported_media_type', detail: '写操作需使用 application/json' },
        415
      );
  }
  return next();
});

admin.use(
  '/api/*',
  bodyLimit({
    maxSize: 9_000_000,
    onError: (c) =>
      c.json({ ok: false, error: 'payload_too_large', detail: '请求体不能超过 8 MB' }, 413),
  })
);

admin.use('/api/*', async (c, next) => {
  // 归一去尾斜杠,避免 /api/rebuild/ 被误纳入内容版本校验。
  const path = c.req.path.replace(/\/+$/, '') || '/';
  if (WRITE_METHODS.has(c.req.method) && path !== '/api/rebuild') {
    return editRevision(c, next);
  }
  await next();
});

admin.get('/api/state', async (c) => {
  const snapshot = await loadSnapshot(c.env.DB);
  const tag = revisionTag(snapshot.revision);
  c.header('ETag', tag);
  if (c.req.header('if-none-match') === tag) return c.body(null, 304);
  return c.json(snapshot.pages);
});
admin.get('/api/settings', async (c) => {
  const [settings, state] = await Promise.all([
    loadSettings(c.env.DB),
    c.env.DB.prepare('SELECT revision FROM content_state WHERE id = 1').first<{
      revision: number;
    }>(),
  ]);
  c.header('ETag', revisionTag(state!.revision));
  return c.json(settings);
});
admin.get('/api/export', async (c) => c.json(await loadSnapshot(c.env.DB)));
admin.get('/api/publish-status', async (c) => {
  // Pages API 抖动不应让本地状态不可读;核对失败时附带 reconcileError 交由前端提示。
  let reconcileError: string | undefined;
  try {
    await reconcilePublication(c.env.DB, c.env);
  } catch (e) {
    reconcileError = e instanceof Error ? e.message : String(e);
  }
  const status = await publishStatus(c.env.DB, c.env);
  return c.json(reconcileError ? { ...status, reconcileError } : status);
});

admin.route('/api/pages', pagesRoutes);
admin.route('/api/categories', categoriesRoutes);
admin.route('/api/sites', sitesRoutes);
admin.route('/api/reorder', reorderRoutes);
admin.route('/api/seed', seedRoutes);
admin.route('/api/settings', settingsRoutes);
admin.route('/api/bookmarks', bookmarksRoutes);
admin.route('/api/rebuild', rebuildRoutes);

app.route('/', admin);

// 静态资源兜底转发(管理台 HTML/JS/CSS 及后续新增的图片/字体等);API/build 前缀走 JSON 404。
app.get('*', async (c) => {
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/build/')) return c.notFound();
  return c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound();
});

// 发布只由管理员通过 /api/rebuild 手动触发，不注册定时任务。
export default {
  fetch: app.fetch,
};
