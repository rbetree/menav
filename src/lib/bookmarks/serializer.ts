const yaml = require('js-yaml') as {
  dump: (value: unknown, options?: Record<string, unknown>) => string;
};

type BookmarksData = {
  categories: unknown[];
};

function generateBookmarksYaml(bookmarks: BookmarksData): string | null {
  const bookmarksPage = {
    title: '我的书签',
    subtitle: '从浏览器导入的书签收藏',
    template: 'bookmarks',
    categories: bookmarks.categories,
  };

  const yamlString = yaml.dump(bookmarksPage, {
    indent: 2,
    lineWidth: -1,
    quotingType: '"',
  });

  const deterministic = process.env.MENAV_BOOKMARKS_DETERMINISTIC === '1';
  const timestampLine = deterministic ? '' : `# 由bookmark-processor.ts生成于 ${new Date().toISOString()}\n`;

  return `# 自动生成的书签配置文件
${timestampLine}# 若要更新，请将新的书签HTML文件放入bookmarks/目录
# 此文件使用模块化配置格式，位于config/user/pages/目录下

${yamlString}`;
}

export { generateBookmarksYaml };
export type { BookmarksData };
