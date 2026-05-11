import type { PageRegistryItem } from './page';
import type { RenderConfig } from '../lib/config/schema/site';
import type {
  NavigationItem as SchemaNavigationItem,
  NavigationSubmenuItem as SchemaNavigationSubmenuItem,
} from '../lib/config/schema/shared';

export type NavigationItem = SchemaNavigationItem;
export type NavigationSubmenuItem = SchemaNavigationSubmenuItem;

export type AppConfig = RenderConfig & {
  homePageId?: string | null;
  configJSON?: string;
  extensionConfig?: Record<string, unknown>;
  extensionConfigUrl?: string;
  navigationData?: NavigationItem[];
  pageRegistry?: PageRegistryItem[];
  socialLinks?: unknown[];
  _meta?: {
    version?: string;
    generated_at?: Date;
    generatedBy?: string;
    [key: string]: unknown;
  };
};

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
