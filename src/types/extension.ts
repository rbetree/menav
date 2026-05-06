export interface ExtensionMeta {
  id: string;
  name: string;
  version?: string;
}

export interface ExtensionContext {
  meta: ExtensionMeta;
  enabled: boolean;
}

export type ExtensionHook<T = void> = (context: ExtensionContext) => T;
