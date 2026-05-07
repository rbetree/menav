import type { SiteConfig as SchemaSiteConfig } from '../lib/config/schema/site';
import type {
  SiteItem as SchemaSiteItem,
  SocialItem as SchemaSocialItem,
  ThemeConfig as SchemaThemeConfig,
} from '../lib/config/schema/shared';

export type SiteTheme = SchemaThemeConfig;
export type SiteConfig = SchemaSiteConfig;
export type SiteItem = SchemaSiteItem & {
  publishedAt?: string;
  source?: string;
  language?: string;
  languageColor?: string;
  stars?: number;
  forks?: number;
  issues?: number;
  [key: string]: unknown;
};
export type SocialItem = SchemaSocialItem;
