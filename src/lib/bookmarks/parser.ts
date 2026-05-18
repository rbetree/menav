const { inferBookmarkIcon } = require('./icons.ts') as {
  inferBookmarkIcon: (url: unknown) => string;
};
const { createLogger } = require('../logging/logger.ts') as {
  createLogger: (scope?: string) => {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
};

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
};

type Range = {
  name: string;
  start: number;
  end: number;
};

type FolderRange = Range & {
  headerEnd: number;
};

function getMatchIndex(match: RegExpMatchArray): number {
  return typeof match.index === 'number' ? match.index : 0;
}

const log = createLogger('bookmarks:parser');
// 解析书签HTML内容，支持2-4层级嵌套结构
function parseBookmarks(htmlContent: string): BookmarksData {
  // 储存解析结果
  const bookmarks: BookmarksData = {
    categories: [],
  };

  // 提取根路径书签（书签栏容器内但不在任何子文件夹内的书签）
  function extractRootBookmarks(htmlContent: string): BookmarkSite[] {
    // 找到书签栏文件夹标签
    const bookmarkBarMatch = htmlContent.match(
      /<DT><H3[^>]*PERSONAL_TOOLBAR_FOLDER[^>]*>([^<]+)<\/H3>/i
    );
    if (!bookmarkBarMatch) {
      return [];
    }
    const bookmarkBarStart = getMatchIndex(bookmarkBarMatch) + bookmarkBarMatch[0].length;

    // 找到书签栏后面的 <DL><p> 标签
    const remainingAfterBar = htmlContent.substring(bookmarkBarStart);
    const dlMatch = remainingAfterBar.match(/<DL><p>/i);
    if (!dlMatch) {
      return [];
    }

    const bookmarkBarContentStart = bookmarkBarStart + getMatchIndex(dlMatch) + dlMatch[0].length;

    // 找到书签栏内容的结束位置
    let depth = 1;
    let pos = bookmarkBarContentStart;
    let bookmarkBarContentEnd = htmlContent.length;

    while (pos < htmlContent.length && depth > 0) {
      const remaining = htmlContent.substring(pos);
      const dlStartIndex = remaining.search(/<DL><p>/i);
      const dlEndIndex = remaining.search(/<\/DL><p>/i);

      if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
        depth++;
        pos += dlStartIndex + '<DL><p>'.length;
      } else if (dlEndIndex !== -1) {
        depth--;
        pos += dlEndIndex;
        if (depth === 0) {
          bookmarkBarContentEnd = pos;
        }
        pos += '</DL><p>'.length;
      } else {
        break;
      }
    }

    const bookmarkBarContent = htmlContent.substring(
      bookmarkBarContentStart,
      bookmarkBarContentEnd
    );

    // 现在提取书签栏内所有子文件夹的范围
    const subfolderRanges: Range[] = [];
    const folderRegex = /<DT><H3[^>]*>([^<]+)<\/H3>/g;
    let folderMatch;

    while ((folderMatch = folderRegex.exec(bookmarkBarContent)) !== null) {
      const folderName = folderMatch[1].trim();
      const folderStart = folderMatch.index + folderMatch[0].length;

      // 找到这个文件夹内容的结束位置
      let folderDepth = 0;
      let folderPos = folderStart;
      let folderContentEnd = bookmarkBarContent.length;

      // 跳过空白直到找到 <DL><p>
      const afterFolder = bookmarkBarContent.substring(folderPos);
      const folderDLMatch = afterFolder.match(/<DL><p>/i);
      if (folderDLMatch) {
        folderDepth = 1;
        folderPos += getMatchIndex(folderDLMatch) + folderDLMatch[0].length;

        while (folderPos < bookmarkBarContent.length && folderDepth > 0) {
          const remaining = bookmarkBarContent.substring(folderPos);
          const dlStartIdx = remaining.search(/<DL><p>/i);
          const dlEndIdx = remaining.search(/<\/DL><p>/i);

          if (dlStartIdx !== -1 && (dlEndIdx === -1 || dlStartIdx < dlEndIdx)) {
            folderDepth++;
            folderPos += dlStartIdx + '<DL><p>'.length;
          } else if (dlEndIdx !== -1) {
            folderDepth--;
            folderPos += dlEndIdx;
            if (folderDepth === 0) {
              folderContentEnd = folderPos + '</DL><p>'.length;
            }
            folderPos += '</DL><p>'.length;
          } else {
            break;
          }
        }

        subfolderRanges.push({
          name: folderName,
          start: folderMatch.index,
          end: folderContentEnd,
        });
      }
    }

    // 提取不在任何子文件夹范围内的书签
    const rootSites: BookmarkSite[] = [];
    const bookmarkRegex = /<DT><A HREF="([^"]+)"[^>]*>(.*?)<\/A>/g;
    let bookmarkMatch;

    while ((bookmarkMatch = bookmarkRegex.exec(bookmarkBarContent)) !== null) {
      const bookmarkPos = bookmarkMatch.index;
      const url = bookmarkMatch[1];
      const name = bookmarkMatch[2].trim();

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
          name: name,
          url: url,
          icon: inferBookmarkIcon(url),
          description: '',
        });
      }
    }

    return rootSites;
  }

  // 递归解析嵌套文件夹
  function parseNestedFolder(
    htmlContent: string,
    parentPath: string[] = [],
    level = 1
  ): BookmarkCategory[] {
    const folders: BookmarkCategory[] = [];

    // 第一步：扫描所有文件夹，记录它们的完整范围
    const folderRanges: FolderRange[] = [];
    const scanRegex = /<DT><H3([^>]*)>(.*?)<\/H3>/g;
    let scanMatch;

    while ((scanMatch = scanRegex.exec(htmlContent)) !== null) {
      const folderName = scanMatch[2].trim();
      const folderStart = scanMatch.index;
      const folderHeaderEnd = scanMatch.index + scanMatch[0].length;

      // 找到文件夹内容的结束位置
      let depth = 0;
      let pos = folderHeaderEnd;

      // 跳过空白直到找到 <DL><p>
      const afterFolder = htmlContent.substring(pos);
      const folderDLMatch = afterFolder.match(/<DL><p>/i);
      if (folderDLMatch) {
        depth = 1;
        pos += getMatchIndex(folderDLMatch) + folderDLMatch[0].length;

        while (pos < htmlContent.length && depth > 0) {
          const remaining = htmlContent.substring(pos);
          const dlStartIdx = remaining.search(/<DL><p>/i);
          const dlEndIdx = remaining.search(/<\/DL><p>/i);

          if (dlStartIdx !== -1 && (dlEndIdx === -1 || dlStartIdx < dlEndIdx)) {
            depth++;
            pos += dlStartIdx + '<DL><p>'.length;
          } else if (dlEndIdx !== -1) {
            depth--;
            pos += dlEndIdx;
            if (depth === 0) {
              const folderEnd = pos + '</DL><p>'.length;
              folderRanges.push({
                name: folderName,
                start: folderStart,
                headerEnd: folderHeaderEnd,
                end: folderEnd,
              });
            }
            pos += '</DL><p>'.length;
          } else {
            break;
          }
        }
      }
    }

    // 第二步：只处理当前层级的文件夹（不在其他文件夹内部的）
    for (let i = 0; i < folderRanges.length; i++) {
      const currentFolder = folderRanges[i];

      // 检查这个文件夹是否在其他文件夹内部
      let isNested = false;
      for (let j = 0; j < folderRanges.length; j++) {
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
      const folderHeaderEnd = currentFolder.headerEnd;
      const folderEnd = currentFolder.end;

      // 提取文件夹内容（保留完整的HTML结构供递归使用）
      // 从headerEnd到end之间包含完整的<DL><p>...</DL><p>结构
      const folderContent = htmlContent.substring(folderHeaderEnd, folderEnd);

      // 验证是否有有效的容器结构
      if (!/<DL><p>/i.test(folderContent)) {
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
  function parseSitesInFolder(folderContent: string): BookmarkSite[] {
    const sites: BookmarkSite[] = [];

    // 首先找到所有子文件夹的范围
    const subfolderRanges: Range[] = [];
    const folderRegex = /<DT><H3[^>]*>([^<]+)<\/H3>/g;
    let folderMatch;

    while ((folderMatch = folderRegex.exec(folderContent)) !== null) {
      const folderName = folderMatch[1].trim();
      const folderStart = folderMatch.index;
      const folderHeaderEnd = folderMatch.index + folderMatch[0].length;

      // 找到这个文件夹内容的结束位置
      let folderDepth = 0;
      let folderPos = folderHeaderEnd;
      let folderContentEnd = folderContent.length;

      // 跳过空白直到找到 <DL><p>
      const afterFolder = folderContent.substring(folderPos);
      const folderDLMatch = afterFolder.match(/<DL><p>/i);
      if (folderDLMatch) {
        folderDepth = 1;
        folderPos += getMatchIndex(folderDLMatch) + folderDLMatch[0].length;

        while (folderPos < folderContent.length && folderDepth > 0) {
          const remaining = folderContent.substring(folderPos);
          const dlStartIdx = remaining.search(/<DL><p>/i);
          const dlEndIdx = remaining.search(/<\/DL><p>/i);

          if (dlStartIdx !== -1 && (dlEndIdx === -1 || dlStartIdx < dlEndIdx)) {
            folderDepth++;
            folderPos += dlStartIdx + '<DL><p>'.length;
          } else if (dlEndIdx !== -1) {
            folderDepth--;
            folderPos += dlEndIdx;
            if (folderDepth === 0) {
              folderContentEnd = folderPos + '</DL><p>'.length;
            }
            folderPos += '</DL><p>'.length;
          } else {
            break;
          }
        }

        subfolderRanges.push({
          name: folderName,
          start: folderStart,
          end: folderContentEnd,
        });
      }
    }

    // 现在提取不在任何子文件夹范围内的书签
    const bookmarkRegex = /<DT><A HREF="([^"]+)"[^>]*>(.*?)<\/A>/g;
    let bookmarkMatch;

    while ((bookmarkMatch = bookmarkRegex.exec(folderContent)) !== null) {
      const bookmarkPos = bookmarkMatch.index;
      const url = bookmarkMatch[1];
      const name = bookmarkMatch[2].trim();

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
          name: name,
          url: url,
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
    /<DT><H3[^>]*PERSONAL_TOOLBAR_FOLDER[^>]*>([^<]+)<\/H3>/i
  );
  if (!bookmarkBarMatch) {
    log.warn('未找到书签栏文件夹（PERSONAL_TOOLBAR_FOLDER），使用备用方案');
    // 备用方案：使用第一个 <DL><p> 标签
    const firstDLMatch = htmlContent.match(/<DL><p>/i);
    if (!firstDLMatch) {
      log.error('未找到任何书签容器');
      bookmarks.categories = [];
    } else {
      const dlStart = getMatchIndex(firstDLMatch) + firstDLMatch[0].length;
      let dlEnd = htmlContent.length;
      let depth = 1;
      let pos = dlStart;

      while (pos < htmlContent.length && depth > 0) {
        const remainingContent = htmlContent.substring(pos);
        const dlStartIndex = remainingContent.search(/<DL><p>/i);
        const dlEndIndex = remainingContent.search(/<\/DL><p>/i);

        if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
          depth++;
          pos += dlStartIndex + '<DL><p>'.length;
        } else if (dlEndIndex !== -1) {
          depth--;
          pos += dlEndIndex + '</DL><p>'.length;
        } else {
          break;
        }
      }

      dlEnd = pos - '</DL><p>'.length;
      const bookmarksBarContent = htmlContent.substring(dlStart, dlEnd);
      bookmarks.categories = parseNestedFolder(bookmarksBarContent);
    }
  } else {
    const bookmarkBarStart = getMatchIndex(bookmarkBarMatch) + bookmarkBarMatch[0].length;

    // 找到书签栏后面的 <DL><p> 标签
    const remainingAfterBar = htmlContent.substring(bookmarkBarStart);
    const dlMatch = remainingAfterBar.match(/<DL><p>/i);
    if (!dlMatch) {
      log.error('未找到书签栏的内容容器 <DL><p>');
      bookmarks.categories = [];
    } else {
      const bookmarkBarContentStart = bookmarkBarStart + getMatchIndex(dlMatch) + dlMatch[0].length;

      // 找到书签栏内容的结束位置
      let depth = 1;
      let pos = bookmarkBarContentStart;
      let bookmarkBarContentEnd = htmlContent.length;

      while (pos < htmlContent.length && depth > 0) {
        const remaining = htmlContent.substring(pos);
        const dlStartIndex = remaining.search(/<DL><p>/i);
        const dlEndIndex = remaining.search(/<\/DL><p>/i);

        if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
          depth++;
          pos += dlStartIndex + '<DL><p>'.length;
        } else if (dlEndIndex !== -1) {
          depth--;
          pos += dlEndIndex;
          if (depth === 0) {
            bookmarkBarContentEnd = pos;
          }
          pos += '</DL><p>'.length;
        } else {
          break;
        }
      }

      const bookmarkBarContent = htmlContent.substring(
        bookmarkBarContentStart,
        bookmarkBarContentEnd
      );

      // 解析书签栏内的子文件夹作为顶层分类（跳过书签栏本身）
      bookmarks.categories = parseNestedFolder(bookmarkBarContent);
    }
  }

  log.info('解析完成', { categories: bookmarks.categories.length });

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

  return bookmarks;
}

export { parseBookmarks };
export type { BookmarkCategory, BookmarksData, BookmarkSite };
