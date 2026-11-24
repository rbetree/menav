import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../types';
import { ensureSchema } from '../db/schema';

/**
 * 私密区(vault.eyeoko.com)。
 *
 * 与后台完全隔离:独立的密码登录 + HMAC 签名 Cookie 会话,数据只落在 D1 的
 * `vault_items` 表里,**绝不进入静态快照**,因此公开站(nav.eyeoko.com)的 HTML/JSON
 * 中不存在任何私密内容。前端不用脚本:服务端渲染 + 原生表单,配合严格 CSP。
 *
 * 安全边界:
 * - 密码只以 SHA-256 摘要做常数时间比较,明文仅存于 Worker secret;
 * - 会话 = `<过期时间戳>.<HMAC-SHA256(过期时间戳)>`,服务端无状态校验,7 天有效;
 * - 登录失败按 IP 限速(15 分钟 10 次),记录存 D1,isolate 重建后依然生效;
 * - Cookie 为 HttpOnly + Secure + SameSite=Lax:跨站 POST 不会附带会话 Cookie,
 *   配合密码门槛与限速,跨站伪造无实际收益,故不再做 Origin 同源校验(避免误伤);
 * - 所有页面响应 `Cache-Control: no-store`,并禁止被搜索引擎收录。
 */

const COOKIE_NAME = 'menav_vault';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const FAILURE_WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 10;
const MAX_ITEMS_PER_PAGE = 500;

type VaultEnv = { Bindings: Env };

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let different = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) different |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return different === 0;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64url(new Uint8Array(signature));
}

/** 密码摘要比较；未配置密码时返回 false(私密区整体关闭)。 */
async function passwordMatches(env: Env, provided: string): Promise<boolean> {
  if (!env.VAULT_PASSWORD) return false;
  const [actual, expected] = await Promise.all([sha256(provided), sha256(env.VAULT_PASSWORD)]);
  return constantTimeEqual(actual, expected);
}

async function createSession(env: Env): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = String(expires);
  return `${payload}.${await sign(env.VAULT_SECRET ?? '', payload)}`;
}

async function sessionValid(env: Env, raw: string | undefined): Promise<boolean> {
  if (!raw || !env.VAULT_SECRET) return false;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return false;
  const expires = Number(payload);
  if (!Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) return false;
  const expected = await sign(env.VAULT_SECRET, payload);
  return constantTimeEqual(encoder.encode(signature), encoder.encode(expected));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 只放行 http/https,避免 javascript:/data: 之类进入 href。 */
function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function noticePage(message: string): string {
  return `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>私密收藏</title>
<style>${STYLE}</style></head><body><main>
<div class="card login">
  <h1>私密收藏</h1>
  <p class="error">${escapeHtml(message)}</p>
  <p><a href="/">返回</a></p>
</div>
</main></body></html>`;
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#0d1117;color:#e6edf3;
  font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 20px 64px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}
h1{font-size:20px;margin:0;font-weight:600;letter-spacing:.02em}
h2{font-size:13px;margin:28px 0 10px;color:#8b949e;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
a{color:#58a6ff;text-decoration:none}
a:hover{text-decoration:underline}
button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid #30363d;background:#21262d;color:#e6edf3;padding:6px 12px}
button:hover{background:#30363d}
button.ghost{background:transparent;color:#8b949e;border-color:transparent;padding:2px 6px;font-size:13px}
button.ghost:hover{color:#f85149}
input,select{font:inherit;width:100%;padding:8px 10px;border-radius:8px;border:1px solid #30363d;background:#0d1117;color:#e6edf3}
input:focus,select:focus{outline:2px solid #1f6feb;outline-offset:-1px;border-color:transparent}
.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px}
.login{max-width:360px;margin:12vh auto 0}
.login p{margin:0 0 16px;color:#8b949e;font-size:14px}
.login label{display:block;font-size:13px;color:#8b949e;margin-bottom:6px}
.login button{width:100%;margin-top:14px;background:#238636;border-color:#2ea043}
.login button:hover{background:#2ea043}
.error{color:#f85149;font-size:14px;margin:0 0 12px}
.group{display:flex;flex-direction:column;gap:2px;background:#161b22;border:1px solid #30363d;border-radius:12px;padding:6px}
.row{display:flex;align-items:baseline;gap:12px;padding:8px 10px;border-radius:8px}
.row:hover{background:#1c2128}
.row .title{flex:1;min-width:0;overflow-wrap:anywhere}
.row .note{color:#8b949e;font-size:12.5px;white-space:nowrap}
.row form{margin:0}
.empty{color:#8b949e;font-size:14px;padding:12px}
details{margin-top:32px}
summary{cursor:pointer;color:#8b949e;font-size:14px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
.form-grid .full{grid-column:1/-1}
.form-grid label{display:block;font-size:12.5px;color:#8b949e;margin-bottom:4px}
.form-grid button{justify-self:start;background:#238636;border-color:#2ea043}
.form-grid button:hover{background:#2ea043}
footer{margin-top:40px;color:#484f58;font-size:12px;text-align:center}
@media(max-width:600px){.form-grid{grid-template-columns:1fr}.row .note{display:none}}
`;

function loginPage(message = ''): string {
  return `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>私密收藏</title>
<style>${STYLE}</style></head><body><main>
<div class="card login">
  <h1>私密收藏</h1>
  <p>该区域包含敏感链接与凭据清单，请输入访问密码。</p>
  ${message ? `<p class="error">${escapeHtml(message)}</p>` : ''}
  <form method="post" action="/login" autocomplete="off">
    <label for="password">密码</label>
    <input id="password" name="password" type="password" required autofocus autocomplete="current-password">
    <button type="submit">进入</button>
  </form>
</div>
<footer>登录状态保持 7 天 · 仅存于本机 Cookie</footer>
</main></body></html>`;
}

interface VaultItem {
  id: string;
  kind: string;
  category: string;
  title: string;
  url: string | null;
  note: string | null;
  sort: number;
}

async function loadItems(c: {
  env: VaultEnv['Bindings'];
}): Promise<{ items: VaultItem[]; categories: string[] }> {
  const { results } = await c.env.DB.prepare(
    'SELECT id, kind, category, title, url, note, sort FROM vault_items ORDER BY kind, category, sort DESC, title LIMIT ?'
  )
    .bind(MAX_ITEMS_PER_PAGE)
    .all<VaultItem>();
  const categories = [...new Set(results.map((item) => item.category))].sort();
  return { items: results, categories };
}

function groupItems(items: VaultItem[]): Map<string, VaultItem[]> {
  const groups = new Map<string, VaultItem[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  return groups;
}

function renderGroups(items: VaultItem[], kind: 'link' | 'file'): string {
  const groups = groupItems(items.filter((item) => item.kind === kind));
  if (groups.size === 0) return '<p class="empty">暂无内容</p>';
  let html = '';
  for (const [category, list] of groups) {
    html += `<h2>${escapeHtml(category)} · ${list.length}</h2><div class="group">`;
    for (const item of list) {
      const note = item.note ? `<span class="note">${escapeHtml(item.note)}</span>` : '';
      const href = item.url ? safeHref(item.url) : null;
      const title = href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || href)}</a>`
        : escapeHtml(item.title || item.url || '(无标题)');
      html += `<div class="row"><span class="title">${title}</span>${note}
        <form method="post" action="/items/delete">
          <input type="hidden" name="id" value="${escapeHtml(item.id)}">
          <button class="ghost" type="submit" title="删除该项">删除</button>
        </form></div>`;
    }
    html += '</div>';
  }
  return html;
}

function vaultPage(items: VaultItem[], categories: string[]): string {
  const options = categories
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join('');
  return `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>私密收藏</title>
<style>${STYLE}</style></head><body><main>
<header>
  <h1>私密收藏</h1>
  <form method="post" action="/logout"><button type="submit">退出</button></form>
</header>
<section>${renderGroups(items, 'link')}</section>
<h2>文件清单</h2>
<section>${renderGroups(items, 'file')}</section>
<details>
  <summary>添加条目</summary>
  <form method="post" action="/items" class="form-grid">
    <div><label for="kind">类型</label>
      <select id="kind" name="kind"><option value="link">链接</option><option value="file">文件</option></select>
    </div>
    <div><label for="category">分类</label>
      <input id="category" name="category" list="categories" placeholder="如：订阅 / 私钥">
      <datalist id="categories">${options}</datalist>
    </div>
    <div class="full"><label for="title">标题</label><input id="title" name="title" required></div>
    <div class="full"><label for="url">URL（文件条目可留空）</label><input id="url" name="url" placeholder="https://"></div>
    <div class="full"><label for="note">备注</label><input id="note" name="note"></div>
    <div class="full"><button type="submit">保存</button></div>
  </form>
</details>
<footer>内容仅存于 D1，不参与公开站构建 · 会话 7 天</footer>
</main></body></html>`;
}

export const vaultApp = new Hono<VaultEnv>();

vaultApp.use('*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  );
});

vaultApp.get('/', async (c) => {
  if (!c.env.VAULT_PASSWORD || !c.env.VAULT_SECRET) {
    return c.html(loginPage('私密区尚未配置（缺少 VAULT_PASSWORD / VAULT_SECRET）。'), 503);
  }
  if (!(await sessionValid(c.env, getCookie(c, COOKIE_NAME)))) return c.html(loginPage());
  const { items, categories } = await loadItems(c);
  return c.html(vaultPage(items, categories));
});

// 登录成功后的页面就渲染在 /login 上；刷新时重定向回 /（会话有效则直接显示内容）。
vaultApp.get('/login', (c) => c.redirect('/', 302));

vaultApp.post('/login', async (c) => {
  if (!c.env.VAULT_PASSWORD || !c.env.VAULT_SECRET) {
    return c.html(loginPage('私密区尚未配置。'), 503);
  }
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const now = Math.floor(Date.now() / 1000);
  // 顺带清理一天前的失败记录，避免表无限增长。
  await c.env.DB.prepare('DELETE FROM vault_attempts WHERE at < ?')
    .bind(now - 86400)
    .run();
  const row = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM vault_attempts WHERE ip = ? AND at > ?'
  )
    .bind(ip, now - FAILURE_WINDOW_SECONDS)
    .first<{ n: number }>();
  if ((row?.n ?? 0) >= MAX_FAILURES) {
    c.header('Retry-After', String(FAILURE_WINDOW_SECONDS));
    return c.html(loginPage('尝试次数过多，请 15 分钟后再试。'), 429);
  }
  const body = await c.req.parseBody();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!(await passwordMatches(c.env, password))) {
    await c.env.DB.prepare('INSERT INTO vault_attempts (ip, at) VALUES (?, ?)').bind(ip, now).run();
    return c.html(loginPage('密码不正确。'), 401);
  }
  await c.env.DB.prepare('DELETE FROM vault_attempts WHERE ip = ?').bind(ip).run();
  setCookie(c, COOKIE_NAME, await createSession(c.env), {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
  // 直接返回已登录页面而不是 303 跳转：弱网下少一次往返、少一个失败点。
  const { items, categories } = await loadItems(c);
  return c.html(vaultPage(items, categories));
});

vaultApp.post('/logout', async (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
  // 同样直接返回登录页，避免 303 后的第二次往返。
  return c.html(loginPage('已退出登录。'));
});

vaultApp.post('/items', async (c) => {
  if (!(await sessionValid(c.env, getCookie(c, COOKIE_NAME)))) return c.redirect('/', 303);
  const body = await c.req.parseBody();
  const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string).trim() : '');
  const kind = text('kind') === 'file' ? 'file' : 'link';
  const category = text('category') || '未分类';
  const title = text('title');
  const url = text('url');
  if (!title) return c.html(noticePage('标题不能为空。'), 400);
  if (kind === 'link' && !safeHref(url)) {
    return c.html(noticePage('链接需要以 http:// 或 https:// 开头。'), 400);
  }
  await c.env.DB.prepare(
    'INSERT INTO vault_items (id, kind, category, title, url, note, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      crypto.randomUUID(),
      kind,
      category.slice(0, 40),
      title.slice(0, 300),
      url.slice(0, 2000) || null,
      text('note').slice(0, 300) || null,
      Math.floor(Date.now() / 1000),
      new Date().toISOString()
    )
    .run();
  return c.redirect('/', 303);
});

vaultApp.post('/items/delete', async (c) => {
  if (!(await sessionValid(c.env, getCookie(c, COOKIE_NAME)))) return c.redirect('/', 303);
  const body = await c.req.parseBody();
  const id = typeof body.id === 'string' ? body.id : '';
  if (id) await c.env.DB.prepare('DELETE FROM vault_items WHERE id = ?').bind(id).run();
  return c.redirect('/', 303);
});

vaultApp.get('/api/items', async (c) => {
  if (!(await sessionValid(c.env, getCookie(c, COOKIE_NAME)))) {
    return c.json({ ok: false, error: 'unauthorized' }, 401);
  }
  const { results } = await c.env.DB.prepare(
    'SELECT id, kind, category, title, url, note, sort FROM vault_items ORDER BY kind, category, sort DESC, title LIMIT ?'
  )
    .bind(MAX_ITEMS_PER_PAGE)
    .all<VaultItem>();
  return c.json({ ok: true, items: results });
});

vaultApp.get('/favicon.ico', (c) => c.body(null, 204));
