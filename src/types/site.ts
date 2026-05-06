export interface SiteTheme {
  mode?: string;
  [key: string]: unknown;
}

export interface SiteConfig {
  title?: string;
  description?: string;
  author?: string;
  favicon?: string;
  logo_text?: string;
  theme?: SiteTheme;
  [key: string]: unknown;
}

export interface SiteItem {
  name?: string;
  url?: string;
  icon?: string;
  description?: string;
  faviconUrl?: string;
  forceIconMode?: string;
  external?: boolean;
  style?: string;
  type?: string;
  [key: string]: unknown;
}

export interface SocialItem {
  name?: string;
  url?: string;
  icon?: string;
  [key: string]: unknown;
}
