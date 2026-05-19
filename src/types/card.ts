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

export type RepoMeta = {
  language: string;
  languageColor: string;
  stars: number | null;
  forks: number | null;
};
