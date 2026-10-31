import { ApiError } from './errors';
import { pageConfigSchema, categoryNodeSchema } from '../../src/lib/config/schema/page';
import { navigationItemSchema, siteItemSchema } from '../../src/lib/config/schema/shared';

export function object(value: unknown, field = '请求内容'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError(400, `${field} 必须是对象`);
  return value as Record<string, unknown>;
}

export function text(value: unknown, field: string, required = true, max = 2048): string {
  if (typeof value !== 'string' || (required && !value.trim()))
    throw new ApiError(400, `${field} 必须是${required ? '非空' : ''}字符串`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ApiError(400, `${field} 不能超过 ${max} 个字符`);
  return trimmed;
}

export function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new ApiError(400, `${field} 必须是布尔值`);
  return value;
}

export function sortValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new ApiError(400, 'sort 必须是非负整数');
  return value;
}

export function templateValue(value: unknown): string | null {
  if (value === '' || value === null) return null;
  const parsed = pageConfigSchema.shape.template.safeParse(value);
  if (!parsed.success || parsed.data === undefined || parsed.data === 'search-results')
    throw new ApiError(400, 'template 必须是可编辑的内置页面模板');
  return parsed.data;
}

export function pageMetadata(value: unknown): string {
  const record = object(value, '页面 metadata');
  const parsed = pageConfigSchema
    .omit({ categories: true, template: true, sites: true })
    .safeParse(record);
  if (!parsed.success) throw new ApiError(400, '页面标题、说明或正文格式无效');
  return JSON.stringify(parsed.data);
}

export function navigationMetadata(value: unknown): string {
  const parsed = navigationItemSchema
    .omit({ id: true, name: true, hidden: true })
    .safeParse(object(value, 'navigation'));
  if (!parsed.success) throw new ApiError(400, '导航图标或子菜单格式无效');
  return JSON.stringify(parsed.data);
}

// metadata 只保留构建期真正消费的键,避免未知键穿透到渲染层(如写进 style 的 CSS 注入)。
const SITE_METADATA_KEYS = [
  'name',
  'description',
  'icon',
  'faviconUrl',
  'forceIconMode',
  'external',
  'style',
  'type',
  'languageColor',
];
const CATEGORY_METADATA_KEYS = [
  'icon',
  'slug',
  'level',
  'foldable',
  'style',
  'type',
  'languageColor',
];

function pickAllowed(
  record: Record<string, unknown>,
  allowed: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of allowed) if (key in record) out[key] = record[key];
  return out;
}

/** 颜色值必须是十六进制;该值会写进站点的 style 属性。 */
function assertColor(value: unknown, field: string): void {
  if (value == null || value === '') return;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(value))
    throw new ApiError(400, `${field} 必须是十六进制颜色值，例如 #909296`);
}

export function categoryMetadata(value: unknown): string {
  const record = object(value, '分类 metadata');
  const structural = [
    'id',
    'name',
    'label',
    'sort',
    'kind',
    'foldable',
    'sites',
    'items',
    'categories',
    'subcategories',
    'groups',
    'subgroups',
    'cards',
  ];
  if (structural.some((key) => key in record))
    throw new ApiError(400, '分类附加字段无效；层级、排序、名称和站点须使用独立字段');
  const picked = pickAllowed(record, CATEGORY_METADATA_KEYS);
  assertColor(picked.languageColor, 'languageColor');
  if (!categoryNodeSchema.safeParse(picked).success)
    throw new ApiError(400, '分类附加字段无效；层级、排序、名称和站点须使用独立字段');
  return JSON.stringify(picked);
}

export function siteMetadata(value: unknown): string {
  const record = object(value, '站点 metadata');
  const structural = [
    'id',
    'name',
    'url',
    'description',
    'icon',
    'faviconUrl',
    'external',
    'sort',
    'kind',
  ];
  if (structural.some((key) => key in record))
    throw new ApiError(400, '站点附加字段无效；名称、地址、图标和排序须使用独立字段');
  const picked = pickAllowed(record, SITE_METADATA_KEYS);
  assertColor(picked.languageColor, 'languageColor');
  if (!siteItemSchema.safeParse(picked).success)
    throw new ApiError(400, '站点附加字段无效；名称、地址、图标和排序须使用独立字段');
  return JSON.stringify(picked);
}

export function requireContent(template: string | null, id: string, metadata: string): void {
  if ((template || id) !== 'content') return;
  let parsed: { content?: { markdown?: unknown } };
  try {
    parsed = JSON.parse(metadata);
  } catch {
    // 库中 metadata 非法属于服务端数据损坏,而非客户端请求问题。
    throw new ApiError(500, '页面 metadata 数据损坏，无法读取正文');
  }
  if (typeof parsed.content?.markdown !== 'string')
    throw new ApiError(400, '正文页必须包含内嵌 Markdown 正文');
}
