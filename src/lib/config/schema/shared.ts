import type { z as ZodNamespace } from 'zod';

const { z } = require('zod') as typeof import('zod');

function optionalTrimmedStringSchema(fieldName: string) {
  return z
    .string({ error: `${fieldName} 必须是字符串` })
    .trim()
    .optional();
}

const urlStringSchema = z
  .string({ error: 'url 必须是字符串' })
  .trim()
  .optional();

const iconModeSchema = z.enum(['favicon', 'manual'], {
  error: 'mode 必须是 favicon 或 manual',
});

const siteItemSchema = z.looseObject({
  name: optionalTrimmedStringSchema('name'),
  url: urlStringSchema,
  icon: optionalTrimmedStringSchema('icon'),
  description: optionalTrimmedStringSchema('description'),
  faviconUrl: optionalTrimmedStringSchema('faviconUrl'),
  forceIconMode: iconModeSchema.optional(),
  external: z.boolean({ error: 'external 必须是布尔值' }).optional(),
  style: optionalTrimmedStringSchema('style'),
  type: optionalTrimmedStringSchema('type'),
});

const socialItemSchema = z.looseObject({
  name: optionalTrimmedStringSchema('name'),
  url: urlStringSchema,
  icon: optionalTrimmedStringSchema('icon'),
});

const navigationSubmenuItemSchema = z.looseObject({
  name: optionalTrimmedStringSchema('name'),
  icon: optionalTrimmedStringSchema('icon'),
  slug: optionalTrimmedStringSchema('slug'),
});

const navigationItemSchema = z.looseObject({
  id: optionalTrimmedStringSchema('id'),
  name: optionalTrimmedStringSchema('name'),
  icon: optionalTrimmedStringSchema('icon'),
  isActive: z.boolean({ error: 'isActive 必须是布尔值' }).optional(),
  active: z.boolean({ error: 'active 必须是布尔值' }).optional(),
  submenu: z.array(navigationSubmenuItemSchema, { error: 'submenu 必须是数组' }).optional(),
});

const profileSchema = z.looseObject({
  title: optionalTrimmedStringSchema('title'),
  subtitle: optionalTrimmedStringSchema('subtitle'),
});

const fontsSchema = z.looseObject({
  source: z.enum(['css', 'google', 'system'], { error: 'source 必须是 css、google 或 system' }).optional(),
  cssUrl: optionalTrimmedStringSchema('cssUrl'),
  preload: z.boolean({ error: 'preload 必须是布尔值' }).optional(),
  family: optionalTrimmedStringSchema('family'),
  weight: z.union([z.string(), z.number()], { error: 'weight 必须是字符串或数字' }).optional(),
});

const iconsSchema = z.looseObject({
  mode: iconModeSchema.optional(),
  region: z.enum(['com', 'cn'], { error: 'region 必须是 com 或 cn' }).optional(),
});

const themeSchema = z.looseObject({
  mode: z.enum(['dark', 'light', 'system'], { error: 'mode 必须是 dark、light 或 system' }).optional(),
});

const securitySchema = z.looseObject({
  allowedSchemes: z.array(z.string(), { error: 'allowedSchemes 必须是字符串数组' }).optional(),
});

const rssSchema = z.looseObject({
  enabled: z.boolean({ error: 'enabled 必须是布尔值' }).optional(),
  cacheDir: optionalTrimmedStringSchema('cacheDir'),
  fetch: z
    .looseObject({
      timeoutMs: z.number({ error: 'timeoutMs 必须是数字' }).optional(),
      totalTimeoutMs: z.number({ error: 'totalTimeoutMs 必须是数字' }).optional(),
      concurrency: z.number({ error: 'concurrency 必须是数字' }).optional(),
      maxRetries: z.number({ error: 'maxRetries 必须是数字' }).optional(),
      maxRedirects: z.number({ error: 'maxRedirects 必须是数字' }).optional(),
    })
    .optional(),
  articles: z
    .looseObject({
      perSite: z.number({ error: 'perSite 必须是数字' }).optional(),
      total: z.number({ error: 'total 必须是数字' }).optional(),
      summaryMaxLength: z.number({ error: 'summaryMaxLength 必须是数字' }).optional(),
    })
    .optional(),
});

const githubSchema = z.looseObject({
  username: optionalTrimmedStringSchema('username'),
  heatmapColor: z.union([z.string(), z.number()], { error: 'heatmapColor 必须是字符串或数字' }).optional(),
  cacheDir: optionalTrimmedStringSchema('cacheDir'),
});

export type SiteItemSchema = typeof siteItemSchema;
export type SocialItemSchema = typeof socialItemSchema;
export type NavigationSubmenuItemSchema = typeof navigationSubmenuItemSchema;
export type NavigationItemSchema = typeof navigationItemSchema;
export type ProfileSchema = typeof profileSchema;
export type FontsSchema = typeof fontsSchema;
export type IconsSchema = typeof iconsSchema;
export type ThemeSchema = typeof themeSchema;
export type SecuritySchema = typeof securitySchema;
export type RssSchema = typeof rssSchema;
export type GithubSchema = typeof githubSchema;

export type SiteItem = ZodNamespace.output<SiteItemSchema>;
export type SocialItem = ZodNamespace.output<SocialItemSchema>;
export type NavigationSubmenuItem = ZodNamespace.output<NavigationSubmenuItemSchema>;
export type NavigationItem = ZodNamespace.output<NavigationItemSchema>;
export type ProfileConfig = ZodNamespace.output<ProfileSchema>;
export type FontsConfig = ZodNamespace.output<FontsSchema>;
export type IconsConfig = ZodNamespace.output<IconsSchema>;
export type ThemeConfig = ZodNamespace.output<ThemeSchema>;
export type SecurityConfig = ZodNamespace.output<SecuritySchema>;
export type RssConfig = ZodNamespace.output<RssSchema>;
export type GithubConfig = ZodNamespace.output<GithubSchema>;

module.exports = {
  siteItemSchema,
  socialItemSchema,
  navigationSubmenuItemSchema,
  navigationItemSchema,
  profileSchema,
  fontsSchema,
  iconsSchema,
  themeSchema,
  securitySchema,
  rssSchema,
  githubSchema,
};
