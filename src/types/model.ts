import type { NavigationItem, ResolvedConfig } from './config';
import type { PageEntry, PageRegistryItem, PageMeta } from './page';
import type { RenderContext } from './render';
import type { RepoMeta } from '../lib/cache/projects';
import type { SiteItem } from './site';

export type CardType = 'site' | 'article';

export type CardViewModel = {
  pageId: string;
  title: string;
  description: string;
  url: string;
  safeUrl: string;
  icon: string;
  type: CardType;
  style?: string;
  faviconUrl?: string;
  forceIconMode?: string;
  external?: boolean;
  categoryId?: string;
  categoryName?: string;
  categoryPath?: string[];
  publishedAt?: string;
  source?: string;
  language?: string;
  languageColor?: string;
  stars?: number;
  forks?: number;
  issues?: number;
  searchText: string;
};

export type SiteExternalData = {
  articles?: Record<
    string,
    {
      items: SiteItem[];
      meta?: Record<string, unknown> | null;
    }
  >;
  content?: Record<
    string,
    {
      file: string;
      html: string;
    }
  >;
  pageMeta?: Record<string, PageMeta | null>;
  projects?: Record<
    string,
    {
      heatmap?: {
        html?: string;
        meta?: Record<string, unknown>;
      } | null;
      repoMetaMap?: Map<string, RepoMeta> | null;
    }
  >;
};

export type MenavRuntimeConfig = {
  version: string;
  timestamp: string;
  icons?: unknown;
  data: {
    homePageId: string | null;
    pageRegistry: PageRegistryItem[];
    pageTemplates: Record<string, string>;
    site?: {
      security?: {
        allowedSchemes?: unknown;
      };
    };
  };
};

export type SiteModelMeta = {
  generatedAt: Date;
  version: string;
  generatedBy: 'MeNav';
};

export type SiteModelInput = {
  config: ResolvedConfig;
  externalData?: SiteExternalData;
  now?: Date;
  version?: string;
};

export type SiteModel = {
  config: ResolvedConfig;
  pages: PageEntry[];
  navigationData: NavigationItem[];
  pageRegistry: PageRegistryItem[];
  pageTemplates: Record<string, string>;
  runtimeConfig: MenavRuntimeConfig;
  runtimeConfigJson: string;
  searchSources: CardViewModel[];
  renderContext: RenderContext;
  meta: SiteModelMeta;
};
