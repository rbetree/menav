import { sanitizeUrl } from '../../src/shared/sanitize-url';

/** 在线数据与静态站共用安全协议，允许站内链接、邮箱和电话。 */
export function sanitizeSiteUrl(raw: unknown, allowedSchemes?: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const compact = raw
    .trim()
    .replace(/[\t\n\r\f]/g, '')
    .toLowerCase();
  if (/^(?:javascript|vbscript|data|file|blob):/.test(compact)) return null;
  return sanitizeUrl(raw, { allowedSchemes });
}

/** 浏览器书签只导入有效的绝对 HTTP(S) 地址。 */
export function sanitizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const safe = sanitizeUrl(raw, { allowedSchemes: ['http', 'https'] });
  if (safe === null) return null;
  try {
    const url = new URL(safe);
    return url.protocol === 'http:' || url.protocol === 'https:' ? safe : null;
  } catch {
    return null;
  }
}

/** 图标支持 HTTP(S) 和公开静态资源路径。 */
export function sanitizeIconUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (/^(?:\.\/|\/)?assets\/[^\s\\]+$/u.test(value)) {
    const normalized = new URL(value, 'https://local.invalid/').pathname;
    if (normalized.startsWith('/assets/')) return value;
  }
  return sanitizeHttpUrl(value);
}
