const { ensureConfigDefaults } = require('./normalizer.ts');
const { validateConfig, getConfigValidationErrors } = require('./validator.ts');
const {
  resolveConfigDirectory,
  loadModularConfig,
  prepareRenderData,
  MENAV_EXTENSION_CONFIG_FILE,
  getSubmenuForNavItem,
  resolveTemplateNameForPage,
  buildExtensionConfig,
} = require('./resolver.ts');
const { assignCategorySlugs } = require('./slugs.ts');
const { ConfigError } = require('../errors.ts');

type ConfigRecord = Record<string, unknown>;

function loadConfig(): ConfigRecord {
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

module.exports = {
  MENAV_EXTENSION_CONFIG_FILE,
  loadConfig,
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
