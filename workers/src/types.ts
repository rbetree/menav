import type { D1Database } from '@cloudflare/workers-types';

/** wrangler.jsonc 暴露的 bindings 与 vars。 */
export interface Env {
  DB: D1Database;
  TEAM_DOMAIN: string; // Cloudflare Access team domain,如 https://<team>.cloudflareaccess.com
  POLICY_AUD: string; // Access 应用 AUD tag
  /**
   * 快照构建执行体回调 URL(定案 T-1=A,部署侧)。
   * 为空表示本地/未接线——rebuild 仅消费 dirty,不改发外部构建。
   * 真实部署配为形态二专属 Pages 构建 hook / Deployments API 地址。
   */
  BUILD_HOOK_URL: string;
  /**
   * 鉴权 fail-closed 的显式本地放行开关。默认(空)=生产安全:未配置 TEAM_DOMAIN/POLICY_AUD 即拒绝(503)。
   * M9:仅本地开发/冒烟在 .dev.vars(已 gitignore)设 `ALLOW_INSECURE_DEV=1` 放行;
   * 不写入 wrangler.jsonc vars,杜绝随部署产物携带在线上误开。
   */
  ALLOW_INSECURE_DEV: string;
}

/** 通用操作结果。 */
export interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  /** 附注(如非空删除被拒时的 {childCount,siteCount})。 */
  detail?: unknown;
  count?: number;
}