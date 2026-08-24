import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from './types';
import { dirtyCount, clearDirty } from './db/dirty';
import { loadSiteModel, loadSettings, type PageNode } from './db/site-model';

/**
 * 快照重建(改动点 6;定案 T-1=A 构建执行体 / T-2=B dirty 标记 + 定时聚合 + 手动发布)。
 *
 * 协议:写路由成功后 `markDirty` 自增未决计数;定时(scheduled)与手动 `POST /api/rebuild`
 * 统一走 rebuildSnapshot():有未决变更时「排队触发」并 CAS 清零,否则无操作。
 *
 * M6:clearDirty 采用 `WHERE value = 读取值` 的条件清零——若导出/构建期间有并发写,
 * 计数已变化则本次不清零,留待下一轮 cron/手动重建,不丢更新。
 *
 * M3 阶段缺口登记:导出物 = `{ settings, pages }`(settings 为 site.yml 级配置,title/主题/图标),
 * 覆盖「settings 不进构建输入」缺口;但公开快照的端到端渲染仍依赖部署侧接入构建执行体
 * (改动点 7「Astro 外部 JSON 数据适配器」未随本阶段交付,T-1 部署侧 open question)。
 * 因此 AC-8「分钟级生效」待部署侧落地后验证,AC-9「渲染一致」待适配器实现后验证——均非本仓库可验证,
 * 详见《动态后台能力-技术方案文档.md》「十二、阶段缺口」。
 */
export async function rebuildSnapshot(
  db: D1Database,
  env: Env,
): Promise<{ ok: boolean; queued: boolean }> {
  const count = await dirtyCount(db);
  if (count === 0) {
    return { ok: true, queued: false };
  }

  // 导出当前站点模型(隐藏页不进公开快照),连同 settings 交予构建执行体(公开 GET /api/nav 同数据源)
  const [pages, settings] = await Promise.all([
    loadSiteModel(db, { excludeHidden: true }),
    loadSettings(db),
  ]);
  await dispatchBuild({ settings, pages }, env);

  // 构建已触发(入队):CAS 消费脏标记,避免多次触发;期间新写入会保留计数留待下轮
  await clearDirty(db, count);
  return { ok: true, queued: true };
}

/**
 * 将站点模型 JSON(含 settings 段)交给构建执行体的入口(部署侧接线点 T-1=A)。
 *
 * 部署说明:在真实部署中,把这里接到形态二专属 Pages 构建的方式之一——
 *   const hook = env.BUILD_HOOK_URL; // 例如 https://api.cloudflare.com/client/v4/.../deploy 或构建 hook
 *   await fetch(hook, { method: 'POST', body: JSON.stringify(model), headers: { 'content-type': 'application/json' } });
 * 即「D1 导出 JSON → 构建作业 → 公开静态快照」。当前阶段无 hook 配置时为空操作。
 */
async function dispatchBuild(model: { settings: Record<string, string>; pages: PageNode[] }, env: Env): Promise<void> {
  const hook = env.BUILD_HOOK_URL;
  if (!hook) return;
  const res = await fetch(hook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(model),
  });
  // 构建执行体非 2xx 即失败:抛错使 dirty 不被消费,保留可重试(定案 T-2=B「构建失败保留旧快照」)
  if (!res.ok) {
    throw new Error(`build hook failed: ${res.status}`);
  }
}