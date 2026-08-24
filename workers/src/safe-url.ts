// 站点/图标 URL 写入口白名单(M1:与根 sanitize 防线同语义,工作在数据面)。
//
// 与 src/shared/sanitize-url.ts 的关系:那是面向 HTML 内容的通用消毒(放行相对链接,
// 供静态站点渲染);本模块面向「D1 中存储的站点链接数据」,语义更严格——站点/图标
// 必须是绝对 http/https URL(相对链接在公开快照与 favicon 渲染中无意义)。二者互补,
// 不重复实现解析;仅对 URL scheme 做白名单判定,返回 null 表示需拒绝/过滤。
//
// 写入面统一调用点:sites.ts(POST/PUT)、seed.ts(walkCategory)、bookmarks/import.ts。

/** 剥离控制字符并对 scheme 做 http/https 白名单判定。绝对 http(s) 返回原文,否则 null。 */
export function sanitizeHttpUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const value = String(raw)
    .trim()
    .replace(/[\t\n\r\f]/g, '');
  if (!value) return null;
  // 防协议相对与反斜杠 authority 绕过(与根 sanitize 判定一致)
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}