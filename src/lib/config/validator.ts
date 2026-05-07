const { createLogger } = require('../logging/logger.ts');

type AnyRecord = Record<string, unknown>;
type ValidationIssue = {
  path: string;
  message: string;
};

const TOP_LEVEL_NON_PAGE_KEYS = new Set([
  '_meta',
  'categories',
  'configJSON',
  'extensionConfig',
  'extensionConfigUrl',
  'fonts',
  'github',
  'homePageId',
  'icons',
  'navigation',
  'navigationData',
  'profile',
  'rss',
  'site',
  'social',
  'socialLinks',
]);

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function addTypeIssue(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  expected: string
): void {
  if (value === undefined || value === null) return;
  issues.push({ path, message: `期望为 ${expected}` });
}

function validateOptionalString(
  issues: ValidationIssue[],
  path: string,
  value: unknown
): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    addTypeIssue(issues, path, value, '字符串');
  }
}

function validateOptionalBoolean(
  issues: ValidationIssue[],
  path: string,
  value: unknown
): void {
  if (value !== undefined && value !== null && typeof value !== 'boolean') {
    addTypeIssue(issues, path, value, '布尔值');
  }
}

function validateSiteItem(issues: ValidationIssue[], path: string, value: unknown): void {
  if (!isRecord(value)) {
    issues.push({ path, message: '站点必须是对象' });
    return;
  }

  validateOptionalString(issues, `${path}.name`, value.name);
  validateOptionalString(issues, `${path}.url`, value.url);
  validateOptionalString(issues, `${path}.description`, value.description);
  validateOptionalString(issues, `${path}.icon`, value.icon);
  validateOptionalString(issues, `${path}.faviconUrl`, value.faviconUrl);
  validateOptionalBoolean(issues, `${path}.external`, value.external);
}

function validateSiteArray(issues: ValidationIssue[], path: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    issues.push({ path, message: '期望为数组' });
    return;
  }

  value.forEach((siteItem: unknown, index: number) => {
    validateSiteItem(issues, `${path}[${index}]`, siteItem);
  });
}

function validateCategoryNode(issues: ValidationIssue[], path: string, value: unknown): void {
  if (!isRecord(value)) {
    issues.push({ path, message: '分类必须是对象' });
    return;
  }

  validateOptionalString(issues, `${path}.name`, value.name);
  validateOptionalString(issues, `${path}.icon`, value.icon);
  validateOptionalString(issues, `${path}.slug`, value.slug);
  validateSiteArray(issues, `${path}.sites`, value.sites);

  ['subcategories', 'groups', 'subgroups'].forEach((childKey: string) => {
    const childValue = value[childKey];
    if (childValue === undefined || childValue === null) return;

    if (!Array.isArray(childValue)) {
      issues.push({ path: `${path}.${childKey}`, message: '期望为数组' });
      return;
    }

    childValue.forEach((child: unknown, index: number) => {
      validateCategoryNode(issues, `${path}.${childKey}[${index}]`, child);
    });
  });
}

function validateCategories(issues: ValidationIssue[], path: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    issues.push({ path, message: '期望为数组' });
    return;
  }

  value.forEach((category: unknown, index: number) => {
    validateCategoryNode(issues, `${path}[${index}]`, category);
  });
}

function validatePageConfig(issues: ValidationIssue[], path: string, value: unknown): void {
  if (!isRecord(value)) {
    issues.push({ path, message: '页面配置必须是对象' });
    return;
  }

  validateOptionalString(issues, `${path}.title`, value.title);
  validateOptionalString(issues, `${path}.subtitle`, value.subtitle);
  validateOptionalString(issues, `${path}.template`, value.template);
  validateCategories(issues, `${path}.categories`, value.categories);
  validateSiteArray(issues, `${path}.sites`, value.sites);
}

function getConfigValidationErrors(config: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(config)) {
    return [{ path: '$', message: '配置必须是对象' }];
  }

  if (!isRecord(config.site)) {
    issues.push({ path: 'site', message: '期望为对象' });
  }

  if (!Array.isArray(config.navigation)) {
    issues.push({ path: 'navigation', message: '期望为数组' });
  } else {
    config.navigation.forEach((navItem: unknown, index: number) => {
      const navPath = `navigation[${index}]`;
      if (!isRecord(navItem)) {
        issues.push({ path: navPath, message: '导航项必须是对象' });
        return;
      }

      validateOptionalString(issues, `${navPath}.id`, navItem.id);
      validateOptionalString(issues, `${navPath}.name`, navItem.name);
      validateOptionalString(issues, `${navPath}.icon`, navItem.icon);
    });
  }

  Object.entries(config).forEach(([key, value]) => {
    if (TOP_LEVEL_NON_PAGE_KEYS.has(key)) return;
    if (!isRecord(value)) return;
    if (!('categories' in value) && !('sites' in value) && !('template' in value)) return;
    validatePageConfig(issues, `pages.${key}`, value);
  });

  return issues;
}

function validateConfig(config: unknown): boolean {
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

module.exports = {
  getConfigValidationErrors,
  validateConfig,
};
