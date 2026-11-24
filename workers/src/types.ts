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
  /** 外部同步通道(如 GitHub Actions 桥接)专用 Bearer Token;未设置时该通道整体关闭。 */
  PUSH_TOKEN?: string;
  /** 私密区访问密码;未设置时 vault 子域整体拒绝访问(503)。 */
  VAULT_PASSWORD?: string;
  /** 私密区会话签名密钥(HMAC-SHA256);更换即让全部已登录会话失效。 */
  VAULT_SECRET?: string;
  /** 私密区自定义域名，默认 vault.eyeoko.com。 */
  VAULT_HOST?: string;
  /** 只在本地 .dev.vars 设置；生产必须配置 Access。 */
  ALLOW_INSECURE_DEV: string;
}
