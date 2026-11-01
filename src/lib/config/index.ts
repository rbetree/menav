import type { ResolvedConfig } from '../../types/config';

import { ensureConfigDefaults } from './normalizer.ts';
import { getSubmenuForNavItem, resolveTemplateNameForPage } from './page-template.ts';
import { resolveConfigDirectory, loadModularConfig } from './resolver.ts';
import { validateConfig, getConfigValidationErrors } from './validator.ts';
import { assignCategorySlugs } from './slugs.ts';
import { ConfigError } from '../errors.ts';
import { createRenderContext } from '../view-data/render-context.ts';
import { loadSnapshotConfig } from './snapshot.ts';

type ConfigRecord = ResolvedConfig & Record<string, unknown>;

/** 动态形态的后台地址就是构建时访问的 Worker；未显式配置时自动写入公开站入口。 */
function applyBackendAdminUrl(config: ConfigRecord): void {
  const endpoint = process.env.MENAV_BACKEND_URL?.trim();
  if (!endpoint || config.site.admin_url) return;
  try {
    const parsed = new URL(endpoint);
    const allowed =
      parsed.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (allowed) config.site.admin_url = endpoint.replace(/\/$/, '');
  } catch {
    // 无效地址不显示入口，由访问后端的请求本身报错。
  }
}

export function loadConfig(): ConfigRecord {
  const snapshotFile = process.env.MENAV_SNAPSHOT_FILE?.trim();
  let config = snapshotFile
    ? loadSnapshotConfig(snapshotFile)
    : (loadModularConfig(resolveConfigDirectory()) as ConfigRecord);

  if (!validateConfig(config)) {
    const suggestions = getConfigValidationErrors(config).map(
      (issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`
    );
    throw new ConfigError('配置校验失败', suggestions);
  }

  config = ensureConfigDefaults(config) as ConfigRecord;
  applyBackendAdminUrl(config);
  config.homePageId =
    Array.isArray(config.navigation) && config.navigation[0]
      ? String(config.navigation[0].id).trim()
      : 'home';
  config.renderContext = createRenderContext(config);

  return config;
}

export {
  resolveConfigDirectory,
  loadModularConfig,
  resolveTemplateNameForPage,
  getSubmenuForNavItem,
  assignCategorySlugs,
  ensureConfigDefaults,
  validateConfig,
  getConfigValidationErrors,
};
