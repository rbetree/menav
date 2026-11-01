// 书签 HTML 解析 —— 门面,复用共享解析核心 parser-core.ts(单事实源,M4)。
//
// 解析算法的唯一实现在 parser-core.ts(纯 JS、logger 可注入、零 Node API),根静态路径
// 与 workers/ 动态后台共同引用;本文件保持历史 require() 接口(bookmark-processor.ts 与
// 测试用 `require('./lib/bookmarks/parser.ts')` 获取 parseBookmarks),行为与日志前缀不变。
const { createLogger } = require('../logging/logger.ts') as {
  createLogger: (scope?: string) => {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
};
const { parseBookmarks: coreParse } = require('./parser-core.ts') as {
  parseBookmarks: (html: string, logger?: unknown) => BookmarksData;
};
import type { BookmarkCategory, BookmarksData, BookmarkSite } from './parser-core.ts';

const log = createLogger('bookmarks:parser');

function parseBookmarks(htmlContent: string): BookmarksData {
  return coreParse(htmlContent, log);
}

export { parseBookmarks };
export type { BookmarkCategory, BookmarksData, BookmarkSite };