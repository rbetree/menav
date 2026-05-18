import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

import { createLogger, isVerbose } from '../logging/logger.ts';
import { getPageIdIssue } from './page-id.ts';

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

export function safeLoadYamlConfig(filePath: string): unknown | null {
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

export function loadPageConfigFiles(pagesPath: string): LoadedPageConfig[] {
  if (!fs.existsSync(pagesPath)) {
    return [];
  }

  return fs
    .readdirSync(pagesPath)
    .filter((file: string) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file: string) => {
      const filePath = path.join(pagesPath, file);
      const configKey = path.basename(file, path.extname(file));
      const issue = getPageIdIssue(configKey);
      if (issue) {
        throw new Error(
          `页面配置文件名无效：${file}\n${issue}\n请将文件改名为 pages/<id>.yml，或从 navigation 中移除对应页面。`
        );
      }
      return {
        configKey,
        config: safeLoadYamlConfig(filePath),
        filePath,
      };
    });
}
