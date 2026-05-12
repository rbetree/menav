import type { z as ZodNamespace } from 'zod';
import type { PageConfigSchema } from './page';
import type {
  FontsSchema,
  GithubSchema,
  IconsSchema,
  NavigationItemSchema,
  ProfileSchema,
  RssSchema,
  SecuritySchema,
  SocialItemSchema,
  ThemeSchema,
} from './shared';

const { z } = require('zod') as typeof import('zod');
const { pageConfigSchema } = require('./page.ts') as { pageConfigSchema: PageConfigSchema };
const {
  fontsSchema,
  githubSchema,
  iconsSchema,
  navigationItemSchema,
  profileSchema,
  rssSchema,
  securitySchema,
  socialItemSchema,
  themeSchema,
} = require('./shared.ts') as {
  fontsSchema: FontsSchema;
  githubSchema: GithubSchema;
  iconsSchema: IconsSchema;
  navigationItemSchema: NavigationItemSchema;
  profileSchema: ProfileSchema;
  rssSchema: RssSchema;
  securitySchema: SecuritySchema;
  socialItemSchema: SocialItemSchema;
  themeSchema: ThemeSchema;
};

const siteConfigSchema = z.looseObject({
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

const modularConfigSchema = z.looseObject({
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

module.exports = {
  siteConfigSchema,
  modularConfigSchema,
  renderConfigSchema,
};
