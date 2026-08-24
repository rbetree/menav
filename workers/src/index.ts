import { Hono } from 'hono';
import type { Env } from './types';
import { applySchema } from './db/schema';
import { loadSiteModel } from './db/site-model';
import { authMiddleware } from './auth';
import { navRoutes } from './routes/nav';
import { reorderRoutes } from './routes/reorder';
import { pagesRoutes } from './routes/pages';
import { categoriesRoutes } from './routes/categories';
import { sitesRoutes } from './routes/sites';
import { seedRoutes } from './routes/seed';
import { bookmarksRoutes } from './routes/bookmarks';
import { rebuildRoutes } from './routes/rebuild';
import { rebuildSnapshot } from './rebuild';

const app = new Hono<{ Bindings: Env }>();

// schema 幂等就绪一次(module 级缓存;失败重置以便重试)
let schemaReady: Promise<void> | null = null;
app.use('/api/*', async (c, next) => {
  schemaReady ??= applySchema(c.env.DB).catch((e) => {
    schemaReady = null;
    throw e;
  });
  await schemaReady;
  return next();
});

// 公开:站点模型导出(供快照构建;不鉴权)
app.route('/api/nav', navRoutes);

// 受保护:后台(全部走 Access JWT 校验)
const admin = new Hono<{ Bindings: Env }>();
admin.use('*', authMiddleware);

admin.get('/api/state', async (c) => c.json(await loadSiteModel(c.env.DB)));

admin.route('/api/pages', pagesRoutes);
admin.route('/api/categories', categoriesRoutes);
admin.route('/api/sites', sitesRoutes);
admin.route('/api/reorder', reorderRoutes);
admin.route('/api/seed', seedRoutes);
admin.route('/api/bookmarks', bookmarksRoutes);
admin.route('/api/rebuild', rebuildRoutes);

app.route('/', admin);

// 定时聚合重建(定案 T-2=B):dirty 时触发同一 rebuild 流程。cron 见 wrangler.jsonc triggers。
export async function scheduled(
  _controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  try {
    await applySchema(env.DB); // scheduled 不经 /api/* 中间件,需自行确保 schema 就绪
    await rebuildSnapshot(env.DB, env);
  } catch (e) {
    // 重建失败保留旧快照,dirty 不清除,下次 cron/手动仍可重试
    console.error('scheduled rebuild failed', e);
  }
}

// Cloudflare Worker 默认导出需带 fetch + scheduled;Hono app.fetch 即 fetch handler。
export default {
  fetch: app.fetch,
  scheduled,
};