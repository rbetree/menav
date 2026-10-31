import type { D1Database } from '@cloudflare/workers-types';

/** Worker 配置；密钥通过 wrangler secret 设置。 */
export interface Env {
  DB: D1Database;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
  CF_ACCOUNT_ID: string;
  CF_PAGES_PROJECT: string;
  CF_API_TOKEN: string;
  BUILD_TOKEN: string;
  /** 只在本地 .dev.vars 设置；生产必须配置 Access。 */
  ALLOW_INSECURE_DEV: string;
}
