// 书签 HTML 解析核心 —— 单事实源（M4:消除根/worker 双份拷贝,ADR D5/D10「复用」）。
//
// 本模块零 Node API（可供 Astro 静态构建与 Cloudflare Worker 两端直接 import）:
// - 依赖 html.ts(decodeHtmlEntities)与 icons.ts(inferBookmarkIcon),二者皆为纯 JS;
// - logger 通过参数注入,默认降级为 console——避免引用 Node-only logging/logger.ts,
//   使前端(worker/workerd)可直接复用同一份解析逻辑(AC-10 语义一致)。
//
// 性能(M13):不再对剩余串反复 substring + search,改为 indexOf 游标推进的
// 大小写不敏感扫描(<dl><p>/</dl><p> 标签为纯 ASCII,|32 位折叠即可),避免 O(n²) 拷贝;
// 4 层嵌套截断时累计 truncated 计数并随结果返回,供导入链路向用户可见。
import { decodeHtmlEntities } from '../security/html.ts';
import { inferBookmarkIcon } from './icons.ts';

type BookmarkSite = {
  name: string;
  url: string;
  icon: string;
  description: string;
};

type BookmarkCategory = {
  name: string;
  icon: string;
  path: string[];
  sites?: BookmarkSite[];
  subcategories?: BookmarkCategory[];
  groups?: BookmarkCategory[];
  subgroups?: BookmarkCategory[];
};

type BookmarksData = {
  categories: BookmarkCategory[];
  /** 超过 4 层被截断的文件夹数(0/缺省=无截断)。 */
  truncated?: number;
};

type Range = {
  name: string;
  start: number;
  end: number;
};

type FolderRange = Range & {
  headerEnd: number;
};

type ParserLogger = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

/** 默认日志:console 适配器(workerd 与 Node 通用)。 */
const consoleLogger: ParserLogger = {
  info(message, meta) {
    console.log(`[bookmarks:parser] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`);
  },
  warn(message, meta) {
    console.warn(`[bookmarks:parser] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`);
  },
  error(message, meta) {
    console.error(`[bookmarks:parser] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`);
  },
};

/**
 * 大小写不敏感 indexOf(标签为 ASCII):`charCodeAt | 32` 折叠大小写且长度不变,
 * 替代对剩余串逐次 substring + /i 正则的搜索,避免大文件下反复的 O(n) 子串拷贝。
 */
function ciIndexOf(hay: string, needle: string, from: number): number {
  if (hay.length < needle.length) return -1;
  const start = from < 0 ? 0 : from;
  const last = hay.length - needle.length;
  outer: for (let i = start; i <= last; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if ((hay.charCodeAt(i + j) | 32) !== needle.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

const DL_OPEN = '<dl><p>';
const DL_CLOSE = '</dl><p>';

function getMatchIndex(match: RegExpMatchArray): number {
  return typeof match.index === 'number' ? match.index : 0;
}

// 解析书签HTML内容，支持2-4层级嵌套结构
function parseBookmarks(htmlContent: string, logger?: ParserLogger): BookmarksData {
  const log = logger ?? consoleLogger;
  // 储存解析结果
  const bookmarks: BookmarksData = {
    categories: [],
  };
  let truncated = 0;

  // 提取根路径书签（书签栏容器内但不在任何子文件夹内的书签）
  function extractRootBookmarks(content: string): BookmarkSite[] {
    // 找到书签栏文件夹标签
    const bookmarkBarMatch = content.match(
      /<DT><H3[^>]*PERSONAL_TOOLBAR_FOLDER[^>]*>([^<]+)<\/H3>/i,
    );
    if (!bookmarkBarMatch) {
      return [];
    }
    const bookmarkBarStart = getMatchIndex(bookmarkBarMatch) + bookmarkBarMatch[0].length;

    // 找到书签栏后面的 <DL><p> 标签
    const dlIndex = ciIndexOf(content, DL_OPEN, bookmarkBarStart);
    if (dlIndex < 0) return [];
    const bookmarkBarContentStart = dlIndex + DL_OPEN.length;

    // 找到书签栏内容的结束位置(游标推进,depth 平衡)
    let depth = 1;
    let pos = bookmarkBarContentStart;
    let bookmarkBarContentEnd = content.length;
    while (pos < content.length && depth > 0) {
      const dlStartIndex = ciIndexOf(content, DL_OPEN, pos);
      const dlEndIndex = ciIndexOf(content, DL_CLOSE, pos);
      if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
        depth += 1;
        pos = dlStartIndex + DL_OPEN.length;
      } else if (dlEndIndex !== -1) {
        depth -= 1;
        if (depth === 0) bookmarkBarContentEnd = dlEndIndex;
        pos = dlEndIndex + DL_CLOSE.length;
      } else {
        break;
      }
    }

    const bookmarkBarContent = content.substring(bookmarkBarContentStart, bookmarkBarContentEnd);

    // 现在提取书签栏内所有子文件夹的范围
    const subfolderRanges: Range[] = [];
    const folderRegex = /<DT><H3[^>]*>([^<]+)<\/H3>/g;
    let folderMatch;
    while ((folderMatch = folderRegex.exec(bookmarkBarContent)) !== null) {
      const folderStart = folderMatch.index + folderMatch[0].length;

      // 找到这个文件夹内容的结束位置
      let folderDepth = 0;
      let folderPos = folderStart;
      let folderContentEnd = bookmarkBarContent.length;

      // 跳过空白直到找到 <DL><p>
      const dlIndex = ciIndexOf(bookmarkBarContent, DL_OPEN, folderPos);
      if (dlIndex >= 0) {
        folderDepth = 1;
        folderPos = dlIndex + DL_OPEN.length;
        while (folderPos < bookmarkBarContent.length && folderDepth > 0) {
          const dlStartIndex = ciIndexOf(bookmarkBarContent, DL_OPEN, folderPos);
          const dlEndIndex = ciIndexOf(bookmarkBarContent, DL_CLOSE, folderPos);
          if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
            folderDepth += 1;
            folderPos = dlStartIndex + DL_OPEN.length;
          } else if (dlEndIndex !== -1) {
            folderDepth -= 1;
            if (folderDepth === 0) folderContentEnd = dlEndIndex + DL_CLOSE.length;
            folderPos = dlEndIndex + DL_CLOSE.length;
          } else {
            break;
          }
        }
      }

      subfolderRanges.push({
        name: folderMatch[1],
        start: folderMatch.index,
        end: folderContentEnd,
      });
    }

    // 提取不在任何子文件夹范围内的书签
    const rootSites: BookmarkSite[] = [];
    const bookmarkRegex = /<DT><A HREF="([^"]+)"[^>]*>(.*?)<\/A>/g;
    let bookmarkMatch;
    while ((bookmarkMatch = bookmarkRegex.exec(bookmarkBarContent)) !== null) {
      const bookmarkPos = bookmarkMatch.index;
      // 浏览器导出的书签会将 & 编码为 &amp;，需先解码实体再写入站点名称与 URL
      const url = decodeHtmlEntities(bookmarkMatch[1]);
      const name = decodeHtmlEntities(bookmarkMatch[2]).trim();

      // 检查这个书签是否在任何子文件夹范围内
      let inFolder = false;
      for (const folder of subfolderRanges) {
        if (bookmarkPos >= folder.start && bookmarkPos < folder.end) {
          inFolder = true;
          break;
        }
      }

      if (!inFolder) {
        rootSites.push({
          name,
          url,
          icon: inferBookmarkIcon(url),
          description: '',
        });
      }
    }

    return rootSites;
  }

  // 递归解析嵌套文件夹
  function parseNestedFolder(
    content: string,
    parentPath: string[] = [],
    level = 1,
  ): BookmarkCategory[] {
    const folders: BookmarkCategory[] = [];

    // 第一步：扫描所有文件夹，记录它们的完整范围
    const folderRanges: FolderRange[] = [];
    const scanRegex = /<DT><H3([^>]*)>(.*?)<\/H3>/g;
    let scanMatch;
    while ((scanMatch = scanRegex.exec(content)) !== null) {
      const folderName = decodeHtmlEntities(scanMatch[2]).trim();
      const folderStart = scanMatch.index;
      const folderHeaderEnd = scanMatch.index + scanMatch[0].length;

      // 找到文件夹内容的结束位置
      let depth = 0;
      let pos = folderHeaderEnd;

      // 跳过空白直到找到 <DL><p>
      const dlIndex = ciIndexOf(content, DL_OPEN, pos);
      if (dlIndex >= 0) {
        depth = 1;
        pos = dlIndex + DL_OPEN.length;
        while (pos < content.length && depth > 0) {
          const dlStartIndex = ciIndexOf(content, DL_OPEN, pos);
          const dlEndIndex = ciIndexOf(content, DL_CLOSE, pos);
          if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
            depth += 1;
            pos = dlStartIndex + DL_OPEN.length;
          } else if (dlEndIndex !== -1) {
            depth -= 1;
            if (depth === 0) {
              folderRanges.push({
                name: folderName,
                start: folderStart,
                headerEnd: folderHeaderEnd,
                end: dlEndIndex + DL_CLOSE.length,
              });
            }
            pos = dlEndIndex + DL_CLOSE.length;
          } else {
            break;
          }
        }
      }
    }

    // 第二步：只处理当前层级的文件夹（不在其他文件夹内部的）
    for (let i = 0; i < folderRanges.length; i += 1) {
      const currentFolder = folderRanges[i];

      // 检查这个文件夹是否在其他文件夹内部
      let isNested = false;
      for (let j = 0; j < folderRanges.length; j += 1) {
        if (i === j) continue; // 跳过自己
        const otherFolder = folderRanges[j];
        // 如果当前文件夹的起始位置在另一个文件夹的范围内，说明它是嵌套的
        if (currentFolder.start > otherFolder.start && currentFolder.end <= otherFolder.end) {
          isNested = true;
          break;
        }
      }

      if (isNested) {
        continue; // 跳过嵌套的文件夹，它们会被递归调用处理
      }

      const folderName = currentFolder.name;

      // 提取文件夹内容（保留完整的HTML结构供递归使用）
      // 从headerEnd到end之间包含完整的<DL><p>...</DL><p>结构
      const folderContent = content.substring(currentFolder.headerEnd, currentFolder.end);

      // 验证是否有有效的容器结构
      if (ciIndexOf(folderContent, DL_OPEN, 0) < 0) {
        continue;
      }

      // 解析文件夹内容
      const folder: BookmarkCategory = {
        name: folderName,
        icon: 'fas fa-folder',
        path: [...parentPath, folderName],
      };

      // 检查是否包含子文件夹 - 创建新的正则实例避免干扰主循环
      const testFolderRegex = /<DT><H3([^>]*)>(.*?)<\/H3>/;
      const hasSubfolders = testFolderRegex.test(folderContent);

      // 先解析当前层级的书签
      const currentLevelSites = parseSitesInFolder(folderContent);

      if (hasSubfolders && level < 4) {
        // 递归解析子文件夹
        const subfolders = parseNestedFolder(folderContent, folder.path, level + 1);

        // 根据层级深度决定数据结构
        if (level === 1) {
          folder.subcategories = subfolders;
        } else if (level === 2) {
          folder.groups = subfolders;
        } else if (level === 3) {
          folder.subgroups = subfolders;
        }

        // 添加当前层级的书签（如果有）
        if (currentLevelSites.length > 0) {
          folder.sites = currentLevelSites;
        }
      } else {
        // 到达最大层级（level >= 4）时不再递归解析子文件夹，深层嵌套将被截断
        if (hasSubfolders) {
          truncated += 1;
          log.warn(`文件夹 "${folderName}" 超过 4 层的嵌套已被截断，深层子文件夹将被忽略`);
        }
        // 解析书签
        folder.sites = currentLevelSites;
      }

      // 只添加包含内容的文件夹
      const hasContent =
        (folder.sites && folder.sites.length > 0) ||
        (folder.subcategories && folder.subcategories.length > 0) ||
        (folder.groups && folder.groups.length > 0) ||
        (folder.subgroups && folder.subgroups.length > 0);

      if (hasContent) {
        folders.push(folder);
      }
    }

    return folders;
  }

  // 解析文件夹中的书签（仅当前层级，排除子文件夹内的书签）
  function parseSitesInFolder(content: string): BookmarkSite[] {
    const sites: BookmarkSite[] = [];

    // 首先找到所有子文件夹的范围
    const subfolderRanges: Range[] = [];
    const folderRegex = /<DT><H3[^>]*>([^<]+)<\/H3>/g;
    let folderMatch;
    while ((folderMatch = folderRegex.exec(content)) !== null) {
      const folderStart = folderMatch.index;
      const folderHeaderEnd = folderMatch.index + folderMatch[0].length;

      // 找到这个文件夹内容的结束位置
      let folderDepth = 0;
      let folderPos = folderHeaderEnd;
      let folderContentEnd = content.length;

      // 跳过空白直到找到 <DL><p>
      const dlIndex = ciIndexOf(content, DL_OPEN, folderPos);
      if (dlIndex >= 0) {
        folderDepth = 1;
        folderPos = dlIndex + DL_OPEN.length;
        while (folderPos < content.length && folderDepth > 0) {
          const dlStartIndex = ciIndexOf(content, DL_OPEN, folderPos);
          const dlEndIndex = ciIndexOf(content, DL_CLOSE, folderPos);
          if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
            folderDepth += 1;
            folderPos = dlStartIndex + DL_OPEN.length;
          } else if (dlEndIndex !== -1) {
            folderDepth -= 1;
            if (folderDepth === 0) folderContentEnd = dlEndIndex + DL_CLOSE.length;
            folderPos = dlEndIndex + DL_CLOSE.length;
          } else {
            break;
          }
        }
      }

      subfolderRanges.push({
        name: folderMatch[1],
        start: folderStart,
        end: folderContentEnd,
      });
    }

    // 现在提取不在任何子文件夹范围内的书签
    const bookmarkRegex = /<DT><A HREF="([^"]+)"[^>]*>(.*?)<\/A>/g;
    let bookmarkMatch;
    while ((bookmarkMatch = bookmarkRegex.exec(content)) !== null) {
      const bookmarkPos = bookmarkMatch.index;
      // 浏览器导出的书签会将 & 编码为 &amp;，需先解码实体再写入站点名称与 URL
      const url = decodeHtmlEntities(bookmarkMatch[1]);
      const name = decodeHtmlEntities(bookmarkMatch[2]).trim();

      // 检查这个书签是否在任何子文件夹范围内
      let inSubfolder = false;
      for (const folder of subfolderRanges) {
        if (bookmarkPos >= folder.start && bookmarkPos < folder.end) {
          inSubfolder = true;
          break;
        }
      }

      if (!inSubfolder) {
        sites.push({
          name,
          url,
          icon: inferBookmarkIcon(url),
          description: '',
        });
      }
    }

    return sites;
  }

  // 开始解析
  const rootSites = extractRootBookmarks(htmlContent);

  // 找到书签栏文件夹（PERSONAL_TOOLBAR_FOLDER）
  const bookmarkBarMatch = htmlContent.match(
    /<DT><H3[^>]*PERSONAL_TOOLBAR_FOLDER[^>]*>([^<]+)<\/H3>/i,
  );
  if (!bookmarkBarMatch) {
    log.warn('未找到书签栏文件夹（PERSONAL_TOOLBAR_FOLDER），使用备用方案');
    // 备用方案：使用第一个 <DL><p> 标签
    const firstDLIndex = ciIndexOf(htmlContent, DL_OPEN, 0);
    if (firstDLIndex < 0) {
      log.error('未找到任何书签容器');
      bookmarks.categories = [];
    } else {
      const dlStart = firstDLIndex + DL_OPEN.length;
      let dlEnd = htmlContent.length;
      let depth = 1;
      let pos = dlStart;
      while (pos < htmlContent.length && depth > 0) {
        const dlStartIndex = ciIndexOf(htmlContent, DL_OPEN, pos);
        const dlEndIndex = ciIndexOf(htmlContent, DL_CLOSE, pos);
        if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
          depth += 1;
          pos = dlStartIndex + DL_OPEN.length;
        } else if (dlEndIndex !== -1) {
          depth -= 1;
          pos = dlEndIndex + DL_CLOSE.length;
        } else {
          break;
        }
      }
      dlEnd = pos - DL_CLOSE.length;
      const bookmarksBarContent = htmlContent.substring(dlStart, dlEnd);
      bookmarks.categories = parseNestedFolder(bookmarksBarContent);
    }
  } else {
    const bookmarkBarStart = getMatchIndex(bookmarkBarMatch) + bookmarkBarMatch[0].length;

    // 找到书签栏后面的 <DL><p> 标签
    const dlIndex = ciIndexOf(htmlContent, DL_OPEN, bookmarkBarStart);
    if (dlIndex < 0) {
      log.error('未找到书签栏的内容容器 <DL><p>');
      bookmarks.categories = [];
    } else {
      const bookmarkBarContentStart = dlIndex + DL_OPEN.length;

      // 找到书签栏内容的结束位置
      let depth = 1;
      let pos = bookmarkBarContentStart;
      let bookmarkBarContentEnd = htmlContent.length;
      while (pos < htmlContent.length && depth > 0) {
        const dlStartIndex = ciIndexOf(htmlContent, DL_OPEN, pos);
        const dlEndIndex = ciIndexOf(htmlContent, DL_CLOSE, pos);
        if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
          depth += 1;
          pos = dlStartIndex + DL_OPEN.length;
        } else if (dlEndIndex !== -1) {
          depth -= 1;
          if (depth === 0) bookmarkBarContentEnd = dlEndIndex;
          pos = dlEndIndex + DL_CLOSE.length;
        } else {
          break;
        }
      }

      const bookmarkBarContent = htmlContent.substring(
        bookmarkBarContentStart,
        bookmarkBarContentEnd,
      );

      // 解析书签栏内的子文件夹作为顶层分类（跳过书签栏本身）
      bookmarks.categories = parseNestedFolder(bookmarkBarContent);
    }
  }

  log.info('解析完成', { categories: bookmarks.categories.length, truncated });

  // 如果存在根路径书签，创建"根目录书签"特殊分类并插入到首位
  if (rootSites.length > 0) {
    log.info('创建"根目录书签"特殊分类', { sites: rootSites.length });
    const rootCategory = {
      name: '根目录书签',
      icon: 'fas fa-star',
      path: ['根目录书签'],
      sites: rootSites,
    };

    // 插入到数组首位
    bookmarks.categories.unshift(rootCategory);
    log.info('"根目录书签"已插入到分类列表首位');
  }

  if (truncated > 0) bookmarks.truncated = truncated;
  return bookmarks;
}

export { parseBookmarks };
export type { BookmarkCategory, BookmarksData, BookmarkSite, ParserLogger };