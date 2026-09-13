import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Env } from './types';
import { applySchema } from './db/schema';
import { loadSnapshot, loadSettings } from './db/site-model';
import { editRevision, revisionTag, type AdminEnv } from './db/revision';
import { ApiError } from './errors';
import { authMiddleware } from './auth';
import { navRoutes } from './routes/nav';
import { reorderRoutes } from './routes/reorder';
import { pagesRoutes } from './routes/pages';
import { categoriesRoutes } from './routes/categories';
import { sitesRoutes } from './routes/sites';
import { seedRoutes } from './routes/seed';
import { bookmarksRoutes } from './routes/bookmarks';
import { rebuildRoutes } from './routes/rebuild';
import { rebuildSnapshot, publishStatus, reconcilePublication, buildSnapshot } from './rebuild';

const app = new Hono<{ Bindings: Env }>();

app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ ok: false, error: error.code, detail: error.message }, error.status);
  if (error instanceof SyntaxError)
    return c.json({ ok: false, error: 'invalid_json', detail: '请求不是有效的 JSON' }, 400);
  console.error('请求失败', error);
  return c.json({ ok: false, error: 'internal_error', detail: '服务暂时不可用，请稍后重试' }, 500);
});

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

// 匿名实时页面树；构建读取使用独立的冻结快照端点。
app.route('/api/nav', navRoutes);

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
  // ASSETS 会返回自身的缓存头，必须在最终响应上覆盖。
  c.header('Cache-Control', 'no-store');
});
admin.use('*', authMiddleware);
admin.use(
  '/api/*',
  bodyLimit({
    maxSize: 16_000_000,
    onError: (c) =>
      c.json({ ok: false, error: 'payload_too_large', detail: '请求体不能超过 16 MB' }, 413),
  })
);
admin.use('/api/*', async (c, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(c.req.method) && c.req.path !== '/api/rebuild') {
    return editRevision(c, next);
  }
  await next();
});

admin.get('/api/state', async (c) => {
  const snapshot = await loadSnapshot(c.env.DB);
  c.header('ETag', revisionTag(snapshot.revision));
  return c.json(snapshot.pages);
});
admin.get('/api/settings', async (c) => c.json(await loadSettings(c.env.DB)));
admin.get('/api/export', async (c) => c.json(await loadSnapshot(c.env.DB)));
admin.get('/api/publish-status', async (c) => {
  await reconcilePublication(c.env.DB, c.env);
  return c.json(await publishStatus(c.env.DB, c.env));
});

admin.route('/api/pages', pagesRoutes);
admin.route('/api/categories', categoriesRoutes);
admin.route('/api/sites', sitesRoutes);
admin.route('/api/reorder', reorderRoutes);
admin.route('/api/seed', seedRoutes);
admin.route('/api/bookmarks', bookmarksRoutes);
admin.route('/api/rebuild', rebuildRoutes);

app.route('/', admin);

app.get('/', async (c) =>
  c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text('管理台静态资源未配置', 503)
);
app.get('/index.html', async (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()));
for (const path of ['/app.js', '/style.css']) {
  app.get(path, async (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()));
}

// 定时检查待发布版本，复用手动发布流程。cron 见 wrangler.jsonc triggers。
export async function scheduled(
  _controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  try {
    await ensureSchema(env);
    await rebuildSnapshot(env.DB, env);
  } catch (e) {
    // 构建失败不会推进已发布版本，下次定时或手动发布可重试。
    console.error('scheduled rebuild failed', e);
  }
}

// Cloudflare Worker 默认导出需带 fetch + scheduled;Hono app.fetch 即 fetch handler。
export default {
  fetch: app.fetch,
  scheduled,
};
