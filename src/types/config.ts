import type { PageConfig } from '../lib/config/schema/page';
import type { SiteConfig } from './site';
import type { RenderContext } from './render';
import type {
  NavigationItem as SchemaNavigationItem,
  NavigationSubmenuItem as SchemaNavigationSubmenuItem,
} from '../lib/config/schema/shared';

export type NavigationItem = SchemaNavigationItem;
export type NavigationSubmenuItem = SchemaNavigationSubmenuItem;

export type PageId = string;

export type ResolvedConfig = {
  site: SiteConfig;
  navigation: NavigationItem[];
  pages: Record<PageId, PageConfig>;
  homePageId: PageId;
  renderContext: RenderContext;
  fonts?: SiteConfig['fonts'];
  profile?: SiteConfig['profile'];
  social?: SiteConfig['social'];
  icons?: SiteConfig['icons'];
  rss?: SiteConfig['rss'];
  github?: SiteConfig['github'];
  theme?: SiteConfig['theme'];
  security?: SiteConfig['security'];
  /** 动态构建专用输入；正文、缓存与图片均已包含在 D1 快照中。 */
  snapshot?: {
    revision: number;
    updatedAt: string;
    externalData: Record<string, unknown>;
    assets: Record<string, string>;
    /** 仅本次公开构建创建的临时缓存目录。 */
    cacheDir?: string;
  };
};

export interface LinkNavigationItem {
  label: string;
  href: string;
  external?: boolean;
}

export type NavigationGroup = {
  title: string;
  items: LinkNavigationItem[];
};
