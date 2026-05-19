import * as fs from 'node:fs';
import * as path from 'node:path';

import { safeLoadYamlConfig, loadPageConfigFiles } from './loader.ts';
import { ConfigError } from '../errors.ts';
import { createLogger, isVerbose } from '../logging/logger.ts';

type AnyRecord = Record<string, unknown>;
type LoadedPageConfig = {
  configKey: string;
  config: unknown;
  filePath: string;
};

const log = createLogger('config');
const emittedConfigDiagnostics = new Set<string>();

type PageIdTypoPair = {
  navigationId: string;
  pageId: string;
};

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getNavigationPageIds(navigation: unknown): Set<string> {
  if (!Array.isArray(navigation)) return new Set();

  return new Set(
    navigation
      .map((item: unknown) => {
        if (!isRecord(item) || item.id === undefined || item.id === null) return '';
        return String(item.id).trim();
      })
      .filter(Boolean)
  );
}

function normalizePageIdForCompare(id: string): string {
  return id.toLowerCase().replace(/[-_\s]/g, '');
}

function getEditDistance(left: string, right: string): number {
  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const currentRow = [leftIndex + 1];

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const insertCost = currentRow[rightIndex] + 1;
      const deleteCost = previousRow[rightIndex + 1] + 1;
      const replaceCost = previousRow[rightIndex] + (left[leftIndex] === right[rightIndex] ? 0 : 1);

      currentRow.push(Math.min(insertCost, deleteCost, replaceCost));
    }

    previousRow.splice(0, previousRow.length, ...currentRow);
  }

  return previousRow[right.length];
}

function isLikelyPageIdTypo(navigationId: string, pageId: string): boolean {
  const normalizedNavigationId = normalizePageIdForCompare(navigationId);
  const normalizedPageId = normalizePageIdForCompare(pageId);
  if (!normalizedNavigationId || !normalizedPageId || normalizedNavigationId === normalizedPageId) {
    return false;
  }

  if (
    (normalizedNavigationId.startsWith(normalizedPageId) ||
      normalizedPageId.startsWith(normalizedNavigationId)) &&
    Math.abs(normalizedNavigationId.length - normalizedPageId.length) <= 2
  ) {
    return true;
  }

  const distance = getEditDistance(normalizedNavigationId, normalizedPageId);
  const maxAllowedDistance = Math.max(
    1,
    Math.floor(Math.max(normalizedNavigationId.length, normalizedPageId.length) * 0.25)
  );
  return distance <= maxAllowedDistance;
}

function findLikelyPageIdTypoPairs(
  missingPageIds: string[],
  hiddenPageIds: string[]
): PageIdTypoPair[] {
  const pairs: PageIdTypoPair[] = [];
  const usedPageIds = new Set<string>();

  missingPageIds.forEach((navigationId) => {
    const candidates = hiddenPageIds
      .filter((pageId) => !usedPageIds.has(pageId) && isLikelyPageIdTypo(navigationId, pageId))
      .map((pageId) => ({
        pageId,
        distance: getEditDistance(
          normalizePageIdForCompare(navigationId),
          normalizePageIdForCompare(pageId)
        ),
      }))
      .sort(
        (left, right) => left.distance - right.distance || left.pageId.localeCompare(right.pageId)
      );

    const bestMatch = candidates[0];
    if (!bestMatch) return;

    usedPageIds.add(bestMatch.pageId);
    pairs.push({ navigationId, pageId: bestMatch.pageId });
  });

  return pairs;
}

function shouldSuppressConfigDiagnostics(): boolean {
  const mode = String(process.env.MENAV_CONFIG_DIAGNOSTICS || '')
    .trim()
    .toLowerCase();
  return mode === 'silent' || mode === 'off' || mode === '0' || mode === 'false';
}

function warnConfigDiagnostic(message: string, meta?: Record<string, unknown>): void {
  if (shouldSuppressConfigDiagnostics()) return;

  const key = `${message}\n${JSON.stringify(meta || {})}`;
  if (!isVerbose() && emittedConfigDiagnostics.has(key)) return;

  emittedConfigDiagnostics.add(key);
  log.warn(message, meta);
}

function warnNavigationPageMismatches(
  config: AnyRecord,
  pageIds: Set<string>,
  dirPath: string
): void {
  const navIds = getNavigationPageIds(config.navigation);
  if (navIds.size === 0 && pageIds.size === 0) return;

  const missingPageIds = [...navIds].filter((id) => !pageIds.has(id));
  const hiddenPageIds = [...pageIds].filter((id) => !navIds.has(id));
  const typoPairs = findLikelyPageIdTypoPairs(missingPageIds, hiddenPageIds);
  const pairedNavigationIds = new Set(typoPairs.map((pair) => pair.navigationId));
  const pairedPageIds = new Set(typoPairs.map((pair) => pair.pageId));

  typoPairs.forEach((pair) => {
    warnConfigDiagnostic('navigation id 与页面文件名疑似不一致，页面不会显示或同步', {
      navigationId: pair.navigationId,
      page: path.join(dirPath, 'pages', `${pair.pageId}.yml`),
      suggestion: `将 site.yml 中该导航项 id 改为 ${pair.pageId}，或创建 pages/${pair.navigationId}.yml`,
    });
  });

  const unpairedMissingPageIds = missingPageIds.filter((id) => !pairedNavigationIds.has(id));
  if (unpairedMissingPageIds.length > 0) {
    warnConfigDiagnostic('navigation 页面缺少配置文件，将使用空页面回退', {
      id: unpairedMissingPageIds.join(','),
      site: path.join(dirPath, 'site.yml'),
      suggestion: '创建对应的 pages/<id>.yml，或从 site.yml 的 navigation 中移除该项',
    });
  }

  const unpairedHiddenPageIds = hiddenPageIds.filter((id) => !pairedPageIds.has(id));
  if (unpairedHiddenPageIds.length > 0) {
    throw new ConfigError('页面配置未在 navigation 中声明', [
      `未声明页面：${unpairedHiddenPageIds.join(', ')}`,
      `文件：${unpairedHiddenPageIds.map((id) => path.join(dirPath, 'pages', `${id}.yml`)).join(', ')}`,
      '如需侧边栏显示，请在 site.yml 的 navigation 中添加对应 id',
      '如需隐藏但可通过 ?page=<id> 访问，请在 navigation 中添加该 id 并设置 hidden: true',
      '如不需要该页面，请删除对应 pages/<id>.yml 文件',
    ]);
  }
}

export function resolveConfigDirectory(): string {
  const configDirOverride = String(process.env.MENAV_CONFIG_DIR || '').trim();
  if (configDirOverride) {
    const resolvedConfigDir = path.resolve(configDirOverride);
    if (!fs.existsSync(resolvedConfigDir)) {
      throw new ConfigError('MENAV_CONFIG_DIR 指向的配置目录不存在', [
        `当前值：${configDirOverride}`,
        '请将 MENAV_CONFIG_DIR 指向包含 site.yml 与 pages/ 的配置目录',
      ]);
    }
    if (!fs.existsSync(path.join(resolvedConfigDir, 'site.yml'))) {
      throw new ConfigError('MENAV_CONFIG_DIR 指向的配置目录缺少 site.yml', [
        `当前值：${configDirOverride}`,
        '请将 MENAV_CONFIG_DIR 指向包含 site.yml 与 pages/ 的配置目录',
      ]);
    }

    return resolvedConfigDir;
  }

  const hasUserModularConfig = fs.existsSync('config/user');
  const hasDefaultModularConfig = fs.existsSync('config/_default');

  if (hasUserModularConfig) {
    if (!fs.existsSync('config/user/site.yml')) {
      throw new ConfigError('检测到 config/user/ 目录，但缺少 config/user/site.yml', [
        '由于配置采用"完全替换"策略，系统不会从 config/_default/ 补齐缺失配置',
        '如果尚未创建个人配置，请删除空的 config/user/ 后运行 npm run init-config',
        '如果已有个人配置，请手动补齐 config/user/site.yml',
        '参考文档: config/README.md',
      ]);
    }

    if (!fs.existsSync('config/user/pages')) {
      warnConfigDiagnostic('检测到 config/user/pages/ 缺失，部分页面内容可能为空');
      warnConfigDiagnostic(
        'npm run init-config 不会覆盖已有 config/user；请手动补齐 config/user/pages/'
      );
    }

    return 'config/user';
  }

  if (hasDefaultModularConfig) {
    return 'config/_default';
  }

  throw new ConfigError('未找到可用配置：缺少 config/user/ 或 config/_default/', [
    '本版本已不再支持旧版单文件配置（config.yml / config.yaml）',
    '解决方法：使用模块化配置目录（建议从 config/_default/ 复制到 config/user/ 再修改）',
    '参考文档: config/README.md',
  ]);
}

export function loadModularConfig(dirPath: string): AnyRecord | null {
  if (!fs.existsSync(dirPath)) {
    return null;
  }

  const config: AnyRecord = {
    site: {},
    navigation: [],
    fonts: {},
    profile: {},
    social: [],
    categories: [],
    pages: {},
  };

  const siteConfigPath = path.join(dirPath, 'site.yml');
  const hasSiteConfig = fs.existsSync(siteConfigPath);
  const siteConfig = safeLoadYamlConfig(siteConfigPath) as unknown | null;
  if (hasSiteConfig) {
    config.site = siteConfig;
  }

  if (isRecord(siteConfig)) {
    if (siteConfig.fonts) config.fonts = siteConfig.fonts;
    if (siteConfig.profile) config.profile = siteConfig.profile;
    if (siteConfig.social) config.social = siteConfig.social;
    if (siteConfig.icons) config.icons = siteConfig.icons;

    if (siteConfig.navigation) {
      config.navigation = siteConfig.navigation;
      if (isVerbose()) log.info('使用 site.yml 中的 navigation 配置');
    }
  }

  const pagesPath = path.join(dirPath, 'pages');
  const pageIds = new Set<string>();
  const pages: AnyRecord = {};
  loadPageConfigFiles(pagesPath).forEach((entry: LoadedPageConfig) => {
    pageIds.add(entry.configKey);
    pages[entry.configKey] = entry.config;
  });
  config.pages = pages;
  warnNavigationPageMismatches(config, pageIds, dirPath);

  return config;
}
