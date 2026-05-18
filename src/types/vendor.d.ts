declare module 'markdown-it' {
  const MarkdownIt: new (options: Record<string, unknown>) => unknown;
  export default MarkdownIt;
}

declare module 'js-yaml' {
  export function loadAll(source: string): unknown[];

  const yaml: {
    loadAll: typeof loadAll;
  };

  export default yaml;
}
