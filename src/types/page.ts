export interface PageMeta {
  title: string;
  description?: string;
  keywords?: string[];
}

export interface PageData {
  meta: PageMeta;
  path: string;
}

export type PageStatus = "draft" | "published";
