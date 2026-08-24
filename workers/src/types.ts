import type { D1Database } from '@cloudflare/workers-types';

/** wrangler.jsonc 暴露的 bindings 与 vars。 */
export interface Env {
  DB: D1Database;
  TEAM_DOMAIN: string; // Cloudflare Access team domain,如 https://<team>.cloudflareaccess.com
  POLICY_AUD: string; // Access 应用 AUD tag
}

/** 通用操作结果。 */
export interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  /** 非空删除被拒时的子项数量等附注。 */
  detail?: string;
  count?: number;
}