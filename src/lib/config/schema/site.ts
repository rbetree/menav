import type { z as ZodNamespace } from 'zod';
import { z } from 'zod';
import { pageConfigSchema } from './page.ts';
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
} from './shared.ts';

const siteConfigSchema = z.strictObject({
  title: z.string({ error: 'title 必须是字符串' }).trim().optional(),
  description: z.string({ error: 'description 必须是字符串' }).trim().optional(),
  keywords: z.string({ error: 'keywords 必须是字符串' }).trim().optional(),
  author: z.string({ error: 'author 必须是字符串' }).trim().optional(),
  favicon: z.string({ error: 'favicon 必须是字符串' }).trim().optional(),
  logo_text: z.string({ error: 'logo_text 必须是字符串' }).trim().optional(),
  logo: z.string({ error: 'logo 必须是字符串' }).nullable().optional(),
  footer: z.string({ error: 'footer 必须是字符串' }).optional(),
  icons: iconsSchema.optional(),
  security: securitySchema.optional(),
  theme: themeSchema.optional(),
  fonts: fontsSchema.optional(),
  profile: profileSchema.optional(),
  rss: rssSchema.optional(),
  github: githubSchema.optional(),
  social: z.array(socialItemSchema, { error: 'social 必须是数组' }).optional(),
  navigation: z.array(navigationItemSchema, { error: 'navigation 必须是数组' }).optional(),
});

const modularConfigSchema = z.strictObject({
  site: siteConfigSchema,
  fonts: fontsSchema.optional(),
  profile: profileSchema.optional(),
  social: z.array(socialItemSchema, { error: 'social 必须是数组' }).optional(),
  icons: iconsSchema.optional(),
  navigation: z.array(navigationItemSchema, { error: 'navigation 必须是数组' }),
});

const renderConfigSchema = modularConfigSchema.catchall(pageConfigSchema.or(z.unknown()));

export type SiteConfigSchema = typeof siteConfigSchema;
export type ModularConfigSchema = typeof modularConfigSchema;
export type RenderConfigSchema = typeof renderConfigSchema;

export type SiteConfig = ZodNamespace.output<SiteConfigSchema>;
export type ModularConfig = ZodNamespace.output<ModularConfigSchema> & Record<string, unknown>;
export type RenderConfig = ZodNamespace.output<RenderConfigSchema>;

export {
  siteConfigSchema,
  modularConfigSchema,
  renderConfigSchema,
};
