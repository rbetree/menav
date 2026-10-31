import { Hono } from 'hono';
import { object } from '../validation';
import { commitEdit, type AdminEnv } from '../db/revision';
import { siteConfigSchema } from '../../../src/lib/config/schema/site';
import { isSnapshotAssetPath } from '../../../src/shared/snapshot-assets';
import { ApiError } from '../errors';

/**
 * 站点级配置(settings.site)的分区块更新。
 * 导航由 pages 表派生,这里不接受 navigation;写入走 commitEdit 复用 CAS 与版本递增。
 */
export const settingsRoutes = new Hono<AdminEnv>();

// 这些字段按「深一层的对象合并」处理;其余字段整体替换。
const NESTED_KEYS = ['theme', 'fonts', 'icons', 'profile', 'security', 'rss', 'github'];

settingsRoutes.put('/site', async (c) => {
  const patch = object(await c.req.json(), '站点配置');
  const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'site'").first<{
    value: string;
  }>();
  let current: Record<string, unknown> = {};
  if (row?.value) {
    try {
      current = object(JSON.parse(row.value), 'settings.site');
    } catch {
      current = {};
    }
  }

  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const base = merged[key];
    if (
      NESTED_KEYS.includes(key) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base &&
      typeof base === 'object' &&
      !Array.isArray(base)
    ) {
      merged[key] = { ...(base as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      merged[key] = value;
    }
  }
  // 形态二导航由页面树派生,忽略该键避免污染快照。
  delete merged.navigation;

  // 必须整体校验:siteConfigSchema 是 strictObject,局部提交也要在完整上下文里通过。
  const parsed = siteConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(
      400,
      `${issue.path.join('.') || '配置'} 无效：${issue.message}`,
      'invalid_site_config'
    );
  }

  // favicon 只能指向已存在的快照资源,否则校验通过但发布后 404。
  const favicon = (parsed.data as { favicon?: string }).favicon;
  if (favicon) {
    const assetsRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'assets'").first<{
      value: string;
    }>();
    let keys: string[] = [];
    if (assetsRow?.value) {
      try {
        keys = Object.keys(object(JSON.parse(assetsRow.value), 'settings.assets'));
      } catch {
        keys = [];
      }
    }
    if (!isSnapshotAssetPath(favicon) || !keys.includes(favicon))
      throw new ApiError(400, 'favicon 必须是已存在的图片资源', 'invalid_favicon');
  }

  await commitEdit(c, [
    c.env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('site', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(JSON.stringify(parsed.data)),
  ]);
  return c.json({ ok: true });
});
