import type { NavigationItem } from './config';
import type { SiteItem } from './site';

export interface PageMeta {
  updatedAt?: string;
  updatedAtSource?: string;
  [key: string]: unknown;
}

export interface GroupItem {
  name?: string;
  icon?: string;
  level?: number;
  subgroups?: GroupItem[];
  sites?: SiteItem[];
  [key: string]: unknown;
}

export interface CategoryItem {
  name?: string;
  icon?: string;
  slug?: string;
  level?: number;
  items?: SiteItem[];
  subcategories?: CategoryItem[];
  groups?: GroupItem[];
  sites?: SiteItem[];
  [key: string]: unknown;
}

export interface PageData {
  pageId?: string;
  homePageId?: string;
  currentPage?: string;
  isHome?: boolean;
  title?: string;
  subtitle?: string;
  categories?: CategoryItem[];
  navigation?: NavigationItem[];
  siteCardStyle?: string;
  contentFile?: string;
  contentHtml?: string;
  projectsMeta?: {
    heatmap?: Record<string, unknown>;
    [key: string]: unknown;
  };
  articlesItems?: SiteItem[];
  articlesCategories?: CategoryItem[];
  pageMeta?: PageMeta;
  [key: string]: unknown;
}

export interface PageEntry {
  id: string;
  isActive?: boolean;
  templateName?: string;
  data?: PageData;
  [key: string]: unknown;
}

export type PageStatus = "draft" | "published";
