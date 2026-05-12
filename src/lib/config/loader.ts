const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const { createLogger, isVerbose } = require('../logging/logger.ts');

type LoadedConfig = Record<string, unknown>;
type YamlLoadError = Error & { stack?: string };
type LoadedPageConfig = {
  configKey: string;
  config: unknown;
  filePath: string;
};

const log = createLogger('config');

function handleConfigLoadError(filePath: string, error: YamlLoadError): void {
  log.error('加载配置失败', {
    path: filePath,
    message: error && error.message ? error.message : String(error),
  });
  if (isVerbose() && error && error.stack) {
    console.error(error.stack);
  }
}

function safeLoadYamlConfig(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const docs = yaml.loadAll(fileContent);

    if (docs.length === 1) {
      return docs[0];
    }

    if (docs.length > 1) {
      log.warn('检测到 YAML 多文档，仅使用第一个', { path: filePath });
      return docs[0];
    }

    return null;
  } catch (error) {
    handleConfigLoadError(filePath, error as YamlLoadError);
    return null;
  }
}

function loadPageConfigFiles(pagesPath: string): LoadedPageConfig[] {
  if (!fs.existsSync(pagesPath)) {
    return [];
  }

  return fs
    .readdirSync(pagesPath)
    .filter((file: string) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file: string) => {
      const filePath = path.join(pagesPath, file);
      return {
        configKey: path.basename(file, path.extname(file)),
        config: safeLoadYamlConfig(filePath),
        filePath,
      };
    });
}

module.exports = {
  safeLoadYamlConfig,
  loadPageConfigFiles,
};
