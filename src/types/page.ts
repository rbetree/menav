import type { NavigationItem } from './config';
import type { CategoryItem as SchemaCategoryItem } from '../lib/config/schema/page';
import type { SiteItem } from './site';

export interface PageMeta {
  updatedAt?: string;
  updatedAtSource?: string;
  [key: string]: unknown;
}

export type GroupItem = SchemaCategoryItem;
export type CategoryItem = SchemaCategoryItem;

export interface PageData {
  pageId?: string;
  homePageId?: string | null;
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

export type PageStatus = 'draft' | 'published';
