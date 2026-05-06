export interface SiteAuthor {
  name: string;
  url?: string;
  email?: string;
}

export interface SiteInfo {
  title: string;
  description: string;
  baseUrl: string;
  author?: SiteAuthor;
}
