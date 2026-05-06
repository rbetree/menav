import type { SiteConfig, SocialItem } from './site';

export interface NavigationItem {
  id?: string;
  name?: string;
  icon?: string;
  isActive?: boolean;
  active?: boolean;
  submenu?: NavigationSubmenuItem[];
  [key: string]: unknown;
}

export interface NavigationSubmenuItem {
  name?: string;
  icon?: string;
  slug?: string;
  [key: string]: unknown;
}

export interface AppConfig {
  site?: SiteConfig;
  social?: SocialItem[];
  navigation?: NavigationItem[];
  homePageId?: string;
  profile?: {
    title?: string;
    subtitle?: string;
    [key: string]: unknown;
  };
  _meta?: {
    version?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type LayoutConfig = AppConfig;

export interface LinkNavigationItem {
  label: string;
  href: string;
  external?: boolean;
}

export type NavigationGroup = {
  title: string;
  items: LinkNavigationItem[];
};
