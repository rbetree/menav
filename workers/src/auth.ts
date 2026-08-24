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
 * 开发模式:本地 `wrangler dev` 未配置 TEAM_DOMAIN/POLICY_AUD 时,仅在 .dev.vars 设
 * `ALLOW_INSECURE_DEV=1` 时放行(该开关不在 wrangler.jsonc vars 中,M9:杜绝随部署产物
 * 携带;每次命中打印显式告警便于排查)。生产配置后即强制。
 *
 * M8:远程 JWKS 为模块级懒加载缓存,同 isolate 内复用实例(jose 内部带 10 分钟缓存),
 * 避免每个受保护请求都新增实例、固定多发一次 `cdn-cgi/access/certs` 拉取。
 *
 * 预留(T-3=A,后续排期):MarksVault 等机器/浏览器扩展为「直推」数据而非经浏览器交互登录,
 * 部署时可再签发一枚 **Access Service Token** 走 Service Auth(请求头
 * `CF-Access-Client-Id` / `CF-Access-Client-Secret`,Access 侧放行机器身份),Worker 侧
 * 同样以该 Service Token 换取的 JWT 进入本校验或独立 Service-Auth 分支。当前首版以
 * 「后台上传/粘贴 HTML」闭环 R9,Service Token 直推本期不实现,但写路由(含 /api/bookmarks)
 * 统一挂在 admin 组走本中间件,接口上不阻塞后续接入。
 */
/** M8:远程 JWKS 懒加载缓存(跨模块级共享,jose 实例内含 10 分钟缓存)。 */
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksCache) jwksCache = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  return jwksCache;
}

export async function authMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const { TEAM_DOMAIN, POLICY_AUD, ALLOW_INSECURE_DEV } = c.env;
  if (!TEAM_DOMAIN || !POLICY_AUD) {
    // fail-closed:生产漏配鉴权直接拒绝;仅本地 dev/冒烟经 .dev.vars 设 ALLOW_INSECURE_DEV=1 才放行
    if (ALLOW_INSECURE_DEV === '1') {
      // M9:旁路命中显式告警,便于线上排查误配置
      console.error(
        '[auth] WARN: ALLOW_INSECURE_DEV=1 放行 admin 写操作(仅限本地开发;生产严禁设置)',
      );
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