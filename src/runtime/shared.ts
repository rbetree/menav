import type { MenavConfig } from './types';

const { SELECTORS, qs, byId } = require('./dom/selectors.ts') as typeof import('./dom/selectors');

function menavExtractDomain(url: unknown): string {
  if (!url) return '';

  try {
    // 移除协议部分 (http://, https://, etc.)
    let domain = String(url).replace(/^[a-zA-Z]+:\/\//, '');

    // 移除路径、查询参数和锚点
    domain = domain.split('/')[0].split('?')[0].split('#')[0];

    // 移除端口号（如果有）
    domain = domain.split(':')[0];

    return domain;
  } catch (e) {
    return String(url);
  }
}

// URL 安全策略：默认仅允许 http/https（可加 mailto/tel）与相对链接；其他 scheme 降级为 '#'
function menavGetAllowedUrlSchemes(): string[] {
  try {
    const cfg: MenavConfig | null =
      window.MeNav && typeof window.MeNav.getConfig === 'function'
        ? window.MeNav.getConfig()
        : null;
    const fromConfig =
      cfg &&
      cfg.data &&
      cfg.data.site &&
      cfg.data.site.security &&
      cfg.data.site.security.allowedSchemes;
    if (Array.isArray(fromConfig) && fromConfig.length > 0) {
      return fromConfig
        .map((s) =>
          String(s || '')
            .trim()
            .toLowerCase()
            .replace(/:$/, '')
        )
        .filter(Boolean);
    }
  } catch (e) {
    // 忽略，回退默认
  }
  return ['http', 'https', 'mailto', 'tel'];
}

function menavIsRelativeUrl(url: unknown): boolean {
  const s = String(url || '').trim();
  return (
    s.startsWith('#') ||
    s.startsWith('/') ||
    s.startsWith('./') ||
    s.startsWith('../') ||
    s.startsWith('?')
  );
}

function menavSanitizeUrl(rawUrl: unknown, contextLabel: string): string {
  if (rawUrl === undefined || rawUrl === null) return '#';
  const url = String(rawUrl).trim();
  if (!url) return '#';

  if (menavIsRelativeUrl(url)) return url;

  // 明确拒绝协议相对 URL（//example.com），避免意外绕过策略
  if (url.startsWith('//')) {
    console.warn(`[MeNav][安全] 已拦截不安全 URL（协议相对形式）：${contextLabel || ''}`, url);
    return '#';
  }

  try {
    const parsed = new URL(url);
    const scheme = String(parsed.protocol || '')
      .toLowerCase()
      .replace(/:$/, '');
    const allowed = menavGetAllowedUrlSchemes();
    if (allowed.includes(scheme)) return url;
    console.warn(`[MeNav][安全] 已拦截不安全 URL scheme：${contextLabel || ''}`, url);
    return '#';
  } catch (e) {
    console.warn(`[MeNav][安全] 已拦截无法解析的 URL：${contextLabel || ''}`, url);
    return '#';
  }
}

// class token 清洗：仅允许字母/数字/下划线/中划线与空格分隔，避免属性/事件注入
function menavSanitizeClassList(rawClassList: unknown, contextLabel: string): string {
  const input = String(rawClassList || '').trim();
  if (!input) return '';

  const tokens = input
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/[^\w-]/g, ''))
    .filter(Boolean);

  const sanitized = tokens.join(' ');
  if (sanitized !== input) {
    console.warn(`[MeNav][安全] 已清洗不安全的 icon class：${contextLabel || ''}`, rawClassList);
  }
  return sanitized;
}

// 版本号统一来源：优先读取 meta[menav-version]，回退到 menav-config-data.version
function menavDetectVersion(): string {
  try {
    const meta = qs(SELECTORS.metaVersion);
    const v = meta ? String(meta.getAttribute('content') || '').trim() : '';
    if (v) return v;
  } catch (e) {
    // 忽略
  }

  try {
    const configData = byId(SELECTORS.configData);
    const raw = configData ? String(configData.textContent || '').trim() : '';
    if (!raw) return '1.0.0';
    const parsed = JSON.parse(raw);
    const v = parsed && parsed.version ? String(parsed.version).trim() : '';
    return v || '1.0.0';
  } catch (e) {
    return '1.0.0';
  }
}

// 修复移动端 `100vh` 视口高度问题：用实际可视高度驱动布局，避免侧边栏/内容区底部被浏览器 UI 遮挡
function menavUpdateAppHeight(): void {
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`);
}

module.exports = {
  menavExtractDomain,
  menavSanitizeUrl,
  menavSanitizeClassList,
  menavDetectVersion,
  menavUpdateAppHeight,
};

export {
  menavExtractDomain,
  menavSanitizeUrl,
  menavSanitizeClassList,
  menavDetectVersion,
  menavUpdateAppHeight,
};
