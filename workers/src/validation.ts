import { ApiError } from './errors';
import { pageConfigSchema, categoryNodeSchema } from '../../src/lib/config/schema/page';
import { navigationItemSchema, siteItemSchema } from '../../src/lib/config/schema/shared';

export function object(value: unknown, field = '请求内容'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError(400, `${field} 必须是对象`);
  return value as Record<string, unknown>;
}

export function text(value: unknown, field: string, required = true): string {
  if (typeof value !== 'string' || (required && !value.trim()))
    throw new ApiError(400, `${field} 必须是${required ? '非空' : ''}字符串`);
  return value.trim();
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
  if (structural.some((key) => key in record) || !categoryNodeSchema.safeParse(record).success) {
    throw new ApiError(400, '分类附加字段无效；层级、排序、名称和站点须使用独立字段');
  }
  return JSON.stringify(record);
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
  if (structural.some((key) => key in record) || !siteItemSchema.safeParse(record).success) {
    throw new ApiError(400, '站点附加字段无效；名称、地址、图标和排序须使用独立字段');
  }
  return JSON.stringify(record);
}

export function requireContent(template: string | null, id: string, metadata: string): void {
  if (
    (template || id) === 'content' &&
    typeof JSON.parse(metadata).content?.markdown !== 'string'
  ) {
    throw new ApiError(400, '正文页必须包含内嵌 Markdown 正文');
  }
}
