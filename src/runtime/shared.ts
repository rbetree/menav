import type { MenavConfig } from './types';

const { getRuntimeConfig } = require('./runtime-config.ts') as typeof import('./runtime-config');
const { sanitizeUrlOrHash } =
  require('../shared/sanitize-url.ts') as typeof import('../shared/sanitize-url');

// URL 安全策略：默认仅允许 http/https（可加 mailto/tel）与相对链接；其他 scheme 降级为 '#'
function menavGetAllowedUrlSchemes(): string[] {
  try {
    const cfg: MenavConfig | null = getRuntimeConfig();
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

function menavSanitizeUrl(rawUrl: unknown, contextLabel: string): string {
  return sanitizeUrlOrHash(rawUrl, {
    allowedSchemes: menavGetAllowedUrlSchemes(),
    label: contextLabel,
  });
}

// 修复移动端 `100vh` 视口高度问题：用实际可视高度驱动布局，避免侧边栏/内容区底部被浏览器 UI 遮挡
let appHeightFrame: number | null = null;

function menavUpdateAppHeight(): void {
  if (appHeightFrame !== null) return;
  appHeightFrame = window.requestAnimationFrame(() => {
    appHeightFrame = null;
    const viewportHeight = window.visualViewport
      ? window.visualViewport.height
      : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`);
  });
}
export { menavSanitizeUrl, menavUpdateAppHeight };
