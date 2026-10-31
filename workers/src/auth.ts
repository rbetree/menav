import type { Context, Next } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './types';

/**
 * Access JWT 校验中间件。
 *
 * 标准两段式:Cloudflare Access 前置放行后,Worker 仍需自行核验
 * `Cf-Access-Jwt-Assertion`(jose + 远程 JWKS),即使请求被直连绕过 Access 也兜底。
 * JWKS 从 Access 团队地址获取并缓存，支持密钥轮换。
 *
 * 开发模式:本地 `wrangler dev` 未配置 TEAM_DOMAIN/POLICY_AUD 时,仅在 .dev.vars 设
 * `ALLOW_INSECURE_DEV=1` 时放行(wrangler dev 的 host 是 workers.dev 域名,故不再硬限本机)。
 * 该开关不写入部署配置，首次命中打印告警；配置 Access 后始终执行 JWT 校验。
 *
 * 远程 JWKS 为模块级懒加载缓存,同 isolate 内复用实例(jose 内部带 10 分钟缓存),
 * 避免每个受保护请求都新增实例、固定多发一次 `cdn-cgi/access/certs` 拉取。
 */
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksDomain = '';
let developmentWarningShown = false;
function getJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksCache || jwksDomain !== teamDomain) {
    jwksCache = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksDomain = teamDomain;
  }
  return jwksCache;
}

export async function authMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  const { TEAM_DOMAIN, POLICY_AUD, ALLOW_INSECURE_DEV } = c.env;
  if (!TEAM_DOMAIN || !POLICY_AUD) {
    // fail-closed:生产漏配鉴权直接拒绝;仅本地 dev/冒烟经 .dev.vars 设 ALLOW_INSECURE_DEV=1 才放行
    const host = new URL(c.req.url).hostname;
    if (
      ALLOW_INSECURE_DEV === '1' &&
      (['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.workers.dev'))
    ) {
      if (!developmentWarningShown) {
        console.error('[auth] 本地开发鉴权已放行；生产环境必须配置 Access');
        developmentWarningShown = true;
      }
      return next();
    }
    return c.json({ ok: false, error: 'auth not configured' }, 503);
  }

  const token = c.req.header('cf-access-jwt-assertion');
  if (!token) return c.json({ ok: false, error: 'unauthorized' }, 403);

  try {
    await jwtVerify(token, getJwks(TEAM_DOMAIN), { issuer: TEAM_DOMAIN, audience: POLICY_AUD });
  } catch {
    return c.json({ ok: false, error: 'unauthorized' }, 403);
  }
  return next();
}
