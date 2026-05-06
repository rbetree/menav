export type RuntimeMode = "development" | "production" | "test";

export interface RuntimeContext {
  mode: RuntimeMode;
  isServer: boolean;
  isClient: boolean;
}

export type RuntimeValue<T> = T | (() => T);
