import type { RenderConfig } from './schema/site';

import { ensureConfigDefaults } from './normalizer.ts';
import { validateConfig, getConfigValidationErrors } from './validator.ts';
import {
  resolveConfigDirectory,
  loadModularConfig,
  prepareRenderData,
  MENAV_EXTENSION_CONFIG_FILE,
  getSubmenuForNavItem,
  resolveTemplateNameForPage,
  buildExtensionConfig,
} from './resolver.ts';
import { assignCategorySlugs } from './slugs.ts';
import { ConfigError } from '../errors.ts';

type ConfigRecord = RenderConfig & Record<string, unknown>;

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

  return prepareRenderData(config) as ConfigRecord;
}

export {
  MENAV_EXTENSION_CONFIG_FILE,
  resolveConfigDirectory,
  loadModularConfig,
  prepareRenderData,
  resolveTemplateNameForPage,
  buildExtensionConfig,
  getSubmenuForNavItem,
  assignCategorySlugs,
  ensureConfigDefaults,
  validateConfig,
  getConfigValidationErrors,
};
