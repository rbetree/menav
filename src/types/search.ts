export type SearchIndexSourceKind = 'site' | 'article';

export interface SearchIndexItem {
  pageId: string;
  title: string;
  description: string;
  url: string;
  icon: string;
  type: SearchIndexSourceKind;
  style?: string;
  categoryId?: string;
  categoryName?: string;
  categoryPath?: string[];
  publishedAt?: string;
  source?: string;
  external?: boolean;
  searchText: string;
}

export interface SearchIndexPayload {
  schemaVersion: number;
  generatedAt: string;
  items: SearchIndexItem[];
}
