import type { z as ZodNamespace, ZodType } from 'zod';
import type { SiteItem, SiteItemSchema } from './shared';

const { z } = require('zod') as typeof import('zod');
const { siteItemSchema } = require('./shared.ts') as { siteItemSchema: SiteItemSchema };

type CategoryNode = {
  name?: string;
  icon?: string;
  slug?: string;
  level?: number;
  items?: SiteItem[];
  sites?: SiteItem[];
  subcategories?: CategoryNode[];
  groups?: CategoryNode[];
  subgroups?: CategoryNode[];
  [key: string]: unknown;
};

const categoryNodeSchema: ZodType<CategoryNode> = z.lazy(() =>
  z.looseObject({
    name: z.string({ error: 'name 必须是字符串' }).trim().optional(),
    icon: z.string({ error: 'icon 必须是字符串' }).trim().optional(),
    slug: z.string({ error: 'slug 必须是字符串' }).trim().optional(),
    level: z.number({ error: 'level 必须是数字' }).optional(),
    items: z.array(siteItemSchema, { error: 'items 必须是数组' }).optional(),
    sites: z.array(siteItemSchema, { error: 'sites 必须是数组' }).optional(),
    subcategories: z.array(categoryNodeSchema, { error: 'subcategories 必须是数组' }).optional(),
    groups: z.array(categoryNodeSchema, { error: 'groups 必须是数组' }).optional(),
    subgroups: z.array(categoryNodeSchema, { error: 'subgroups 必须是数组' }).optional(),
  })
);

const contentPageSchema = z.looseObject({
  file: z.string({ error: 'file 必须是字符串' }).trim().optional(),
});

const pageConfigSchema = z.looseObject({
  title: z.string({ error: 'title 必须是字符串' }).trim().optional(),
  subtitle: z.string({ error: 'subtitle 必须是字符串' }).trim().optional(),
  template: z
    .enum(['articles', 'bookmarks', 'content', 'page', 'projects', 'search-results'], {
      error: 'template 必须是内置页面模板',
    })
    .optional(),
  categories: z.array(categoryNodeSchema, { error: 'categories 必须是数组' }).optional(),
  sites: z.array(siteItemSchema, { error: 'sites 必须是数组' }).optional(),
  content: contentPageSchema.optional(),
});

export type CategoryNodeSchema = typeof categoryNodeSchema;
export type ContentPageSchema = typeof contentPageSchema;
export type PageConfigSchema = typeof pageConfigSchema;

export type CategoryItem = ZodNamespace.output<CategoryNodeSchema>;
export type PageConfig = ZodNamespace.output<PageConfigSchema>;
export type ContentPageConfig = ZodNamespace.output<ContentPageSchema>;

module.exports = {
  categoryNodeSchema,
  contentPageSchema,
  pageConfigSchema,
};
