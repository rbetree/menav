import type { MenavConfig } from '../types';

import { SELECTORS, byId } from '../dom/selectors.ts';

// 配置数据缓存：避免浏览器扩展/站点脚本频繁 JSON.parse
let menavConfigCacheReady = false;
let menavConfigCacheRaw: string | null = null;
let menavConfigCacheValue: MenavConfig | null = null;

function getConfig(options?: { clone?: boolean }): MenavConfig | null {
  const configData = byId(SELECTORS.configData);
  if (!configData) return null;

  const raw = configData.textContent || '';
  if (!menavConfigCacheReady || menavConfigCacheRaw !== raw) {
    menavConfigCacheValue = JSON.parse(raw) as MenavConfig;
    menavConfigCacheRaw = raw;
    menavConfigCacheReady = true;
  }

  if (options && options.clone) {
    if (typeof structuredClone === 'function') {
      return structuredClone(menavConfigCacheValue);
    }
    return JSON.parse(JSON.stringify(menavConfigCacheValue)) as MenavConfig | null;
  }

  return menavConfigCacheValue;
}

export { getConfig };
