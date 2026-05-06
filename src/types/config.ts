export interface AppConfig {
  name: string;
  description?: string;
  url?: string;
  locale?: string;
}

export interface NavigationItem {
  label: string;
  href: string;
  external?: boolean;
}

export type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};
