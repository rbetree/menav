import type { MenavConfig } from './types';

import { SELECTORS, byId } from './dom/selectors.ts';

let runtimeConfigCacheReady = false;
let runtimeConfigCacheRaw: string | null = null;
let runtimeConfigCacheValue: MenavConfig | null = null;

function cloneConfig(config: MenavConfig | null): MenavConfig | null {
  if (config === null) return null;

  if (typeof structuredClone === 'function') {
    return structuredClone(config);
  }

  return JSON.parse(JSON.stringify(config)) as MenavConfig;
}

function getRuntimeConfig(options?: { clone?: boolean }): MenavConfig | null {
  const configData = byId(SELECTORS.runtimeConfigData);
  if (!configData) return null;

  const raw = configData.textContent || '';
  if (!runtimeConfigCacheReady || runtimeConfigCacheRaw !== raw) {
    runtimeConfigCacheValue = JSON.parse(raw) as MenavConfig;
    runtimeConfigCacheRaw = raw;
    runtimeConfigCacheReady = true;
  }

  if (options && options.clone) {
    return cloneConfig(runtimeConfigCacheValue);
  }

  return runtimeConfigCacheValue;
}

export { getRuntimeConfig };
