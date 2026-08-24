import type { Context, Next } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './types';

/**
 * Access JWT 校验中间件(技术方案「五、API 层」改动点 4)。
 *
 * 标准两段式:Cloudflare Access 前置放行后,Worker 仍需自行核验
 * `Cf-Access-Jwt-Assertion`(jose + 远程 JWKS),即使请求被直连绕过 Access 也兜底。
 * 密钥 6 周轮换,JWKS 必须远程拉取、不可硬编码。
 *
 * 开发模式:本地 `wrangler dev` 未配置 TEAM_DOMAIN/POLICY_AUD 时跳过校验(仅开发放宽,
 * 生产配置后即强制)。
 */
export async function authMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const { TEAM_DOMAIN, POLICY_AUD } = c.env;
  if (!TEAM_DOMAIN || !POLICY_AUD) return next();

  const token = c.req.header('cf-access-jwt-assertion');
  if (!token) return c.json({ ok: false, error: 'unauthorized' }, 403);

  try {
    const jwks = createRemoteJWKSet(new URL(`${TEAM_DOMAIN}/cdn-cgi/access/certs`));
    await jwtVerify(token, jwks, { issuer: TEAM_DOMAIN, audience: POLICY_AUD });
  } catch {
    return c.json({ ok: false, error: 'unauthorized' }, 403);
  }
  return next();
}