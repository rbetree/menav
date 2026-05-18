import type { z as ZodNamespace } from 'zod';
import { z } from 'zod';
import { createLogger } from '../logging/logger.ts';
import { pageConfigSchema } from './schema/page.ts';
import {
  fontsSchema,
  githubSchema,
  iconsSchema,
  navigationItemSchema,
  profileSchema,
  rssSchema,
  securitySchema,
  socialItemSchema,
  themeSchema,
} from './schema/shared.ts';
import { siteConfigSchema } from './schema/site.ts';
import { getPageIdIssue, normalizePageId } from './page-id.ts';

type AnyRecord = Record<string, unknown>;
type ValidationIssue = {
  path: string;
  message: string;
};
type ZodIssueLike = {
  path: PropertyKey[];
  message: string;
};
type SchemaLike = {
  safeParse: (
    value: unknown
  ) => { success: true } | { success: false; error: { issues: ZodIssueLike[] } };
};

const TOP_LEVEL_NON_PAGE_KEYS = new Set([
  '_meta',
  'categories',
  'fonts',
  'github',
  'homePageId',
  'icons',
  'navigation',
  'navigationData',
  'pageRegistry',
  'profile',
  'runtimeConfig',
  'runtimeConfigJson',
  'rss',
  'security',
  'site',
  'social',
  'socialLinks',
  'theme',
]);

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function appendPath(basePath: string, segments: PropertyKey[]): string {
  return segments.reduce((current: string, segment: PropertyKey) => {
    if (typeof segment === 'number') {
      return `${current}[${segment}]`;
    }

    const key = String(segment);
    return current ? `${current}.${key}` : key;
  }, basePath);
}

function normalizeSchemaMessage(message: string): string {
  if (message.startsWith('Invalid input: expected object')) return '期望为对象';
  if (message.startsWith('Invalid input: expected array')) return '期望为数组';
  if (message.startsWith('Invalid input: expected string')) return '期望为字符串';
  if (message.startsWith('Invalid input: expected number')) return '期望为数字';
  if (message.startsWith('Invalid input: expected boolean')) return '期望为布尔值';
  return message;
}

function collectSchemaIssues(
  issues: ValidationIssue[],
  schema: SchemaLike,
  value: unknown,
  basePath: string
): void {
  const result = schema.safeParse(value);
  if (result.success) return;

  result.error.issues.forEach((issue: ZodIssueLike) => {
    issues.push({
      path: appendPath(basePath, issue.path),
      message: normalizeSchemaMessage(issue.message),
    });
  });
}

function getPageValidationEntries(config: AnyRecord): [string, unknown][] {
  const pages = isRecord(config.pages)
    ? config.pages
    : Object.fromEntries(Object.entries(config).filter(([key]) => !TOP_LEVEL_NON_PAGE_KEYS.has(key)));
  return Object.entries(pages);
}

function collectNavigationIdIssues(config: AnyRecord, issues: ValidationIssue[]): void {
  if (!Array.isArray(config.navigation)) return;

  const seen = new Map<string, number>();
  config.navigation.forEach((item, index) => {
    const record = isRecord(item) ? item : {};
    const id = normalizePageId(record.id);
    const issue = getPageIdIssue(record.id);
    if (issue) {
      issues.push({
        path: `navigation[${index}].id`,
        message: `${issue}；当前值：${id || '<empty>'}；修复示例：id: common`,
      });
      return;
    }

    const firstIndex = seen.get(id);
    if (firstIndex !== undefined) {
      issues.push({
        path: `navigation[${index}].id`,
        message: `页面 id 重复：${id}；首次出现于 navigation[${firstIndex}]`,
      });
      return;
    }
    seen.set(id, index);
  });
}

function collectPageFileIdIssues(config: AnyRecord, issues: ValidationIssue[]): void {
  const pages = isRecord(config.pages)
    ? config.pages
    : Object.fromEntries(Object.entries(config).filter(([key]) => !TOP_LEVEL_NON_PAGE_KEYS.has(key)));
  Object.keys(pages).forEach((id) => {
    const issue = getPageIdIssue(id);
    if (issue) {
      issues.push({
        path: `pages.${id}`,
        message: `${issue}；请将文件改名为 pages/<id>.yml`,
      });
    }
  });
}

export function getConfigValidationErrors(config: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(config)) {
    return [{ path: '$', message: '配置必须是对象' }];
  }

  collectSchemaIssues(issues, siteConfigSchema, config.site, 'site');
  collectSchemaIssues(
    issues,
    zArray(navigationItemSchema, 'navigation 必须是数组'),
    config.navigation,
    'navigation'
  );
  collectNavigationIdIssues(config, issues);
  collectPageFileIdIssues(config, issues);

  if (config.fonts !== undefined) collectSchemaIssues(issues, fontsSchema, config.fonts, 'fonts');
  if (config.profile !== undefined)
    collectSchemaIssues(issues, profileSchema, config.profile, 'profile');
  if (config.icons !== undefined) collectSchemaIssues(issues, iconsSchema, config.icons, 'icons');
  if (config.theme !== undefined) collectSchemaIssues(issues, themeSchema, config.theme, 'theme');
  if (config.security !== undefined)
    collectSchemaIssues(issues, securitySchema, config.security, 'security');
  if (config.rss !== undefined) collectSchemaIssues(issues, rssSchema, config.rss, 'rss');
  if (config.github !== undefined)
    collectSchemaIssues(issues, githubSchema, config.github, 'github');
  if (config.social !== undefined) {
    collectSchemaIssues(
      issues,
      zArray(socialItemSchema, 'social 必须是数组'),
      config.social,
      'social'
    );
  }

  getPageValidationEntries(config).forEach(([key, value]) => {
    collectSchemaIssues(issues, pageConfigSchema, value, `pages.${key}`);
  });

  return issues;
}

function zArray<T extends ZodNamespace.ZodTypeAny>(schema: T, message: string) {
  return z.array(schema, { error: message });
}

export function validateConfig(config: unknown): boolean {
  const issues = getConfigValidationErrors(config);

  if (issues.length === 0) {
    return true;
  }

  const log = createLogger('config');
  issues.forEach((issue: ValidationIssue) => {
    log.error('配置字段无效', { path: issue.path, message: issue.message });
  });

  return false;
}
