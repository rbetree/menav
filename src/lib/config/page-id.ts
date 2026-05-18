const PAGE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

const RESERVED_PAGE_IDS = new Set([
  '_meta',
  'categories',
  'fonts',
  'github',
  'homePageId',
  'icons',
  'navigation',
  'navigationData',
  'pageRegistry',
  'pages',
  'profile',
  'runtimeConfig',
  'runtimeConfigJson',
  'rss',
  'search-results',
  'security',
  'site',
  'social',
  'socialLinks',
  'theme',
]);

function normalizePageId(value: unknown): string {
  return String(value === null || value === undefined ? '' : value).trim();
}

function isValidPageId(value: unknown): boolean {
  const id = normalizePageId(value);
  return Boolean(id && PAGE_ID_PATTERN.test(id) && !RESERVED_PAGE_IDS.has(id));
}

function getPageIdIssue(value: unknown): string | null {
  const id = normalizePageId(value);
  if (!id) return '页面 id 不能为空';
  if (!PAGE_ID_PATTERN.test(id)) {
    return '页面 id 只能使用小写字母、数字和连字符，并且必须以小写字母开头，例如 common 或 my-page';
  }
  if (RESERVED_PAGE_IDS.has(id)) {
    return `页面 id 不能使用保留字：${id}`;
  }
  return null;
}

export { PAGE_ID_PATTERN, RESERVED_PAGE_IDS, getPageIdIssue, isValidPageId, normalizePageId };
