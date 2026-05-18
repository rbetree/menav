import type { ResolvedConfig } from '../../types/config';

import { ensureConfigDefaults } from './normalizer.ts';
import { getSubmenuForNavItem, resolveTemplateNameForPage } from './page-template.ts';
import { resolveConfigDirectory, loadModularConfig } from './resolver.ts';
import { validateConfig, getConfigValidationErrors } from './validator.ts';
import { assignCategorySlugs } from './slugs.ts';
import { ConfigError } from '../errors.ts';
import { createRenderContext } from '../view-data/render-context.ts';

type ConfigRecord = ResolvedConfig & Record<string, unknown>;

export function loadConfig(): ConfigRecord {
  const configDir = resolveConfigDirectory();
  let config = loadModularConfig(configDir) as ConfigRecord;

  if (!validateConfig(config)) {
    const suggestions = getConfigValidationErrors(config).map(
      (issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`
    );
    throw new ConfigError('配置校验失败', suggestions);
  }

  config = ensureConfigDefaults(config) as ConfigRecord;
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
