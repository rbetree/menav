const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const yaml = require('js-yaml') as {
  load: (source: string) => unknown;
  dump: (value: unknown, options?: Record<string, unknown>) => string;
};
const { FileError, wrapAsyncError } = require('./lib/errors.ts') as {
  FileError: new (message: string, filePath?: string | null, suggestions?: string[]) => Error;
  wrapAsyncError: <TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult> | TResult
  ) => (...args: TArgs) => Promise<TResult>;
};
const { createLogger, isVerbose, startTimer } = require('./lib/logging/logger.ts') as {
  createLogger: (scope?: string) => {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
    ok: (message: string, meta?: Record<string, unknown>) => void;
  };
  isVerbose: () => boolean;
  startTimer: () => () => number;
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

type InitResult = {
  initialized: boolean;
  source: 'existing' | '_default' | 'empty';
};

type UpsertBookmarksNavResult =
  | { updated: true; reason: 'added_navigation_block' | 'updated_navigation_block' }
  | {
      updated: false;
      reason: 'site_yml_not_object' | 'already_present' | 'navigation_not_array';
    }
  | { updated: false; reason: 'error'; error: unknown };

type NavigationUpdateResult =
  | { updated: true; target: 'site.yml'; reason: string }
  | { updated: false; target: 'site.yml'; reason: string; error?: unknown }
  | { updated: false; target: null; reason: 'no_site_yml' };

type Range = {
  name: string;
  start: number;
  end: number;
};

type FolderRange = Range & {
  headerEnd: number;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function getMatchIndex(match: RegExpMatchArray): number {
  return typeof match.index === 'number' ? match.index : 0;
}

const log = createLogger('import-bookmarks');

// 书签文件夹路径 - 使用相对路径
const BOOKMARKS_DIR = 'bookmarks';
// 模块化配置目录
const CONFIG_USER_DIR = 'config/user';
// 模块化默认配置目录
const CONFIG_DEFAULT_DIR = 'config/_default';
// 模块化页面配置目录
const CONFIG_USER_PAGES_DIR = path.join(CONFIG_USER_DIR, 'pages');
// 模块化输出配置文件路径
const MODULAR_OUTPUT_FILE = path.join(CONFIG_USER_PAGES_DIR, 'bookmarks.yml');
// 模块化默认书签配置文件路径
const MODULAR_DEFAULT_BOOKMARKS_FILE = 'config/_default/pages/bookmarks.yml';

const USER_SITE_YML = path.join(CONFIG_USER_DIR, 'site.yml');
const DEFAULT_SITE_YML = path.join(CONFIG_DEFAULT_DIR, 'site.yml');

function ensureUserConfigInitialized(): InitResult {
  if (fs.existsSync(CONFIG_USER_DIR)) {
    return { initialized: false, source: 'existing' };
  }

  if (fs.existsSync(CONFIG_DEFAULT_DIR)) {
    fs.cpSync(CONFIG_DEFAULT_DIR, CONFIG_USER_DIR, { recursive: true });
    log.info('config/user 不存在，已从 config/_default 初始化用户配置（完全替换策略）');
    return { initialized: true, source: '_default' };
  }

  fs.mkdirSync(CONFIG_USER_DIR, { recursive: true });
  log.warn('未找到 config/_default，已创建空的 config/user；建议补齐 site.yml 与 pages/*.yml');
  return { initialized: true, source: 'empty' };
}

function ensureUserSiteYmlExists(): boolean {
  if (fs.existsSync(USER_SITE_YML)) {
    return true;
  }

  if (fs.existsSync(DEFAULT_SITE_YML)) {
    if (!fs.existsSync(CONFIG_USER_DIR)) {
      fs.mkdirSync(CONFIG_USER_DIR, { recursive: true });
    }
    fs.copyFileSync(DEFAULT_SITE_YML, USER_SITE_YML);
    log.info('未找到 config/user/site.yml，已从 config/_default/site.yml 复制');
    return true;
  }

  log.warn(
    '未找到可用的 site.yml，无法自动更新导航；请在 config/user/site.yml 添加 navigation（含 id: bookmarks）'
  );
  return false;
}

function upsertBookmarksNavInSiteYml(siteYmlPath: string): UpsertBookmarksNavResult {
  try {
    const raw = fs.readFileSync(siteYmlPath, 'utf8');
    const loaded = yaml.load(raw);

    if (!loaded || typeof loaded !== 'object') {
      return { updated: false, reason: 'site_yml_not_object' };
    }

    const siteConfig = loaded as { navigation?: unknown };
    const navigation = siteConfig.navigation;

    if (
      Array.isArray(navigation) &&
      navigation.some(
        (item) => item && typeof item === 'object' && 'id' in item && item.id === 'bookmarks'
      )
    ) {
      return { updated: false, reason: 'already_present' };
    }

    if (navigation !== undefined && !Array.isArray(navigation)) {
      return { updated: false, reason: 'navigation_not_array' };
    }

    const lines = raw.split(/\r?\n/);
    const navLineIndex = lines.findIndex((line) => /^navigation\s*:/.test(line));

    const itemIndent = '  ';
    const propIndent = `${itemIndent}  `;
    const snippet = [
      `${itemIndent}- name: 书签`,
      `${propIndent}icon: fas fa-bookmark`,
      `${propIndent}id: bookmarks`,
    ];

    if (navLineIndex === -1) {
      // 不存在 navigation 段：直接追加一个新的块（尽量不破坏原文件结构）
      const normalized = raw.endsWith('\n') ? raw : `${raw}\n`;
      const spacer = normalized.trim().length === 0 ? '' : '\n';
      const updatedRaw = `${normalized}${spacer}navigation:\n${snippet.join('\n')}\n`;
      fs.writeFileSync(siteYmlPath, updatedRaw, 'utf8');
      return { updated: true, reason: 'added_navigation_block' };
    }

    // 找到 navigation 块末尾（遇到下一个顶层 key 时结束）
    let insertAt = lines.length;
    for (let i = navLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '' || /^\s*#/.test(line)) continue;
      if (/^[A-Za-z0-9_-]+\s*:/.test(line)) {
        insertAt = i;
        break;
      }
    }

    const updatedLines = [...lines];
    // 在块末尾插入，确保块内至少有一个空行分隔更易读
    if (insertAt > 0 && updatedLines[insertAt - 1].trim() !== '') {
      snippet.unshift('');
    }
    updatedLines.splice(insertAt, 0, ...snippet);

    fs.writeFileSync(siteYmlPath, `${updatedLines.join('\n')}\n`, 'utf8');
    return { updated: true, reason: 'updated_navigation_block' };
  } catch (error) {
    return { updated: false, reason: 'error', error };
  }
}

// 图标映射，根据URL关键字匹配合适的图标
const ICON_MAPPING: Record<string, string> = {
  'github.com': 'fab fa-github',
  'stackoverflow.com': 'fab fa-stack-overflow',
  'youtube.com': 'fab fa-youtube',
  'twitter.com': 'fab fa-twitter',
  'facebook.com': 'fab fa-facebook',
  'instagram.com': 'fab fa-instagram',
  'linkedin.com': 'fab fa-linkedin',
  'reddit.com': 'fab fa-reddit',
  'amazon.com': 'fab fa-amazon',
  'google.com': 'fab fa-google',
  'gmail.com': 'fas fa-envelope',
  'drive.google.com': 'fab fa-google-drive',
  'docs.google.com': 'fas fa-file-alt',
  'medium.com': 'fab fa-medium',
  'dev.to': 'fab fa-dev',
  'gitlab.com': 'fab fa-gitlab',
  'bitbucket.org': 'fab fa-bitbucket',
  'wikipedia.org': 'fab fa-wikipedia-w',
  'discord.com': 'fab fa-discord',
  'slack.com': 'fab fa-slack',
  'apple.com': 'fab fa-apple',
  'microsoft.com': 'fab fa-microsoft',
  'android.com': 'fab fa-android',
  'twitch.tv': 'fab fa-twitch',
  'spotify.com': 'fab fa-spotify',
  'pinterest.com': 'fab fa-pinterest',
  'telegram.org': 'fab fa-telegram',
  'whatsapp.com': 'fab fa-whatsapp',
  'netflix.com': 'fas fa-film',
  'trello.com': 'fab fa-trello',
  'wordpress.com': 'fab fa-wordpress',
  jira: 'fab fa-jira',
  'atlassian.com': 'fab fa-atlassian',
  'dropbox.com': 'fab fa-dropbox',
  npm: 'fab fa-npm',
  'docker.com': 'fab fa-docker',
  'python.org': 'fab fa-python',
  javascript: 'fab fa-js',
  'php.net': 'fab fa-php',
  java: 'fab fa-java',
  'codepen.io': 'fab fa-codepen',
  'behance.net': 'fab fa-behance',
  'dribbble.com': 'fab fa-dribbble',
  'tumblr.com': 'fab fa-tumblr',
  'vimeo.com': 'fab fa-vimeo',
  'flickr.com': 'fab fa-flickr',
  'github.io': 'fab fa-github',
  'airbnb.com': 'fab fa-airbnb',
  bitcoin: 'fab fa-bitcoin',
  'paypal.com': 'fab fa-paypal',
  ethereum: 'fab fa-ethereum',
  steam: 'fab fa-steam',
};

// 获取最新的书签文件
function getLatestBookmarkFile(): string | null {
  try {
    // 确保书签目录存在
    if (!fs.existsSync(BOOKMARKS_DIR)) {
      fs.mkdirSync(BOOKMARKS_DIR, { recursive: true });
      log.warn('bookmarks 目录不存在，已创建；未找到 HTML 书签文件', { dir: BOOKMARKS_DIR });
      return null;
    }

    // 获取目录中的所有HTML文件
    const files = fs
      .readdirSync(BOOKMARKS_DIR)
      .filter((file) => file.toLowerCase().endsWith('.html'));

    if (files.length === 0) {
      log.warn('未找到任何 HTML 书签文件', { dir: BOOKMARKS_DIR });
      return null;
    }

    // GitHub Actions checkout 会导致文件 mtime 大量相同；改用文件名时间戳优先排序
    const parseFilenameTimestamp = (filename: string): number => {
      const base = path.basename(filename);

      // 格式1: selective-bookmarks-2026-01-24T07-31-00.html
      const isoMatch = base.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const [, year, month, day, hour, minute, second] = isoMatch;
        return Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second)
        );
      }

      // 格式2: bookmarks_20260124.html
      const dateMatch = base.match(/(\d{4})(\d{2})(\d{2})/);
      if (dateMatch) {
        const [, year, month, day] = dateMatch;
        return Date.UTC(Number(year), Number(month) - 1, Number(day));
      }

      return 0;
    };

    // 按文件名时间戳排序，无法解析的使用文件系统 mtime 作为回退
    const fileStats = files.map((file) => {
      const filenameTimestamp = parseFilenameTimestamp(file);
      const mtime = fs.statSync(path.join(BOOKMARKS_DIR, file)).mtime.getTime();
      return {
        file,
        timestamp: filenameTimestamp || mtime,
      };
    });

    // 找出最新的文件（时间戳大的在前）；相等时用文件名做稳定排序
    fileStats.sort((a, b) => b.timestamp - a.timestamp || a.file.localeCompare(b.file));

    const latestFile = fileStats[0].file;
    const latestFilePath = path.join(BOOKMARKS_DIR, latestFile);

    log.info('选择最新的书签文件', { file: latestFile });

    return latestFilePath;
  } catch (error) {
    log.error('查找书签文件时出错', { message: getErrorMessage(error) });
    const stack = getErrorStack(error);
    if (isVerbose() && stack) console.error(stack);
    return null;
  }
}

// 解析书签HTML内容，支持2-4层级嵌套结构
function parseBookmarks(htmlContent: string): BookmarksData {
  // 正则表达式匹配文件夹和书签
  const folderRegex = /<DT><H3([^>]*)>(.*?)<\/H3>/g;
  const bookmarkRegex = /<DT><A HREF="([^"]+)"[^>]*>(.*?)<\/A>/g;

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
        // 基于URL选择适当的图标
        let icon = 'fas fa-link';
        for (const [keyword, iconClass] of Object.entries(ICON_MAPPING)) {
          if (url.includes(keyword)) {
            icon = iconClass;
            break;
          }
        }

        rootSites.push({
          name: name,
          url: url,
          icon: icon,
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
        // 基于URL选择适当的图标
        let icon = 'fas fa-link'; // 默认图标
        for (const [keyword, iconClass] of Object.entries(ICON_MAPPING)) {
          if (url.includes(keyword)) {
            icon = iconClass;
            break;
          }
        }

        sites.push({
          name: name,
          url: url,
          icon: icon,
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

// 生成YAML配置
function generateBookmarksYaml(bookmarks: BookmarksData): string | null {
  try {
    // 创建书签页面配置
    const bookmarksPage = {
      title: '我的书签',
      subtitle: '从浏览器导入的书签收藏',
      categories: bookmarks.categories,
    };

    // 转换为YAML
    const yamlString = yaml.dump(bookmarksPage, {
      indent: 2,
      lineWidth: -1,
      quotingType: '"',
    });

    // 添加注释（可选确定性输出，方便版本管理）
    const deterministic = process.env.MENAV_BOOKMARKS_DETERMINISTIC === '1';
    const timestampLine = deterministic
      ? ''
      : `# 由bookmark-processor.ts生成于 ${new Date().toISOString()}\n`;

    const yamlWithComment = `# 自动生成的书签配置文件
${timestampLine}# 若要更新，请将新的书签HTML文件放入bookmarks/目录
# 此文件使用模块化配置格式，位于config/user/pages/目录下

${yamlString}`;

    return yamlWithComment;
  } catch (error) {
    log.error('生成 YAML 失败', {
      message: getErrorMessage(error),
    });
    const stack = getErrorStack(error);
    if (isVerbose() && stack) console.error(stack);
    return null;
  }
}

// 更新导航以包含书签页面
function updateNavigationWithBookmarks(): NavigationUpdateResult {
  // 1) 优先更新 site.yml（当前推荐方式）
  if (ensureUserSiteYmlExists()) {
    const result = upsertBookmarksNavInSiteYml(USER_SITE_YML);
    if (result.updated) {
      return { updated: true, target: 'site.yml', reason: result.reason };
    }
    if (result.reason === 'already_present') {
      return { updated: false, target: 'site.yml', reason: 'already_present' };
    }
    if (result.reason === 'error') {
      return { updated: false, target: 'site.yml', reason: 'error', error: result.error };
    }
    return { updated: false, target: 'site.yml', reason: result.reason };
  }
  return { updated: false, target: null, reason: 'no_site_yml' };
}

// 主函数
async function main() {
  const elapsedMs = startTimer();
  log.info('开始', { version: process.env.npm_package_version });

  // 获取最新的书签文件
  log.info('查找书签文件', { dir: BOOKMARKS_DIR });
  const bookmarkFile = getLatestBookmarkFile();
  if (!bookmarkFile) {
    log.ok('未找到书签文件，跳过', { dir: BOOKMARKS_DIR });
    return;
  }
  log.ok('找到书签文件', { file: bookmarkFile });

  try {
    // 读取文件内容
    log.info('读取书签文件', { file: bookmarkFile });
    const htmlContent = fs.readFileSync(bookmarkFile, 'utf8');
    log.ok('读取成功', { chars: htmlContent.length });

    // 解析书签
    log.info('解析书签结构');
    const bookmarks = parseBookmarks(htmlContent);
    if (bookmarks.categories.length === 0) {
      log.error('HTML 文件中未找到书签分类，处理终止');
      return;
    }
    log.ok('解析完成', { categories: bookmarks.categories.length });

    // 生成YAML
    log.info('生成 YAML 配置');
    const yamlContent = generateBookmarksYaml(bookmarks);
    if (!yamlContent) {
      log.error('YAML 生成失败，处理终止');
      return;
    }
    log.ok('YAML 生成成功');

    // 保存文件
    log.info('写入配置文件', { path: MODULAR_OUTPUT_FILE });
    try {
      // 完全替换策略：若尚未初始化用户配置，则先从默认配置初始化一份完整配置
      ensureUserConfigInitialized();

      // 确保目标目录存在
      if (!fs.existsSync(CONFIG_USER_PAGES_DIR)) {
        fs.mkdirSync(CONFIG_USER_PAGES_DIR, { recursive: true });
      }

      // 保存YAML到模块化位置
      fs.writeFileSync(MODULAR_OUTPUT_FILE, yamlContent, 'utf8');

      // 验证文件是否确实被创建
      if (!fs.existsSync(MODULAR_OUTPUT_FILE)) {
        throw new FileError('文件未能创建', MODULAR_OUTPUT_FILE, [
          '检查目录权限是否正确',
          '确认磁盘空间是否充足',
          '尝试手动创建目录: mkdir -p config/user/pages',
        ]);
      }

      log.ok('写入成功', { path: MODULAR_OUTPUT_FILE });

      // 更新导航
      log.info('更新导航配置（确保包含 bookmarks 入口）');
      const navUpdateResult = updateNavigationWithBookmarks();
      if (navUpdateResult.updated) {
        log.ok('导航配置已更新', {
          target: navUpdateResult.target,
          reason: navUpdateResult.reason,
        });
      } else if (navUpdateResult.reason === 'already_present') {
        log.ok('导航配置已包含书签入口，无需更新', { target: navUpdateResult.target });
      } else if (navUpdateResult.reason === 'no_site_yml') {
        log.warn('未找到可用的 site.yml，无法自动更新导航', { path: USER_SITE_YML });
      } else if (navUpdateResult.reason === 'navigation_not_array') {
        log.warn('site.yml 中 navigation 不是数组，无法自动更新导航', { path: USER_SITE_YML });
      } else if (navUpdateResult.reason === 'error') {
        log.warn('导航更新失败，请手动检查配置文件格式（详见错误信息）');
        if (navUpdateResult.error !== undefined) {
          log.warn('导航更新错误详情', {
            message: getErrorMessage(navUpdateResult.error),
          });
          const stack = getErrorStack(navUpdateResult.error);
          if (isVerbose() && stack) console.error(stack);
        }
      } else {
        log.info('导航配置无需更新', { reason: navUpdateResult.reason });
      }
    } catch (writeError) {
      throw new FileError('写入文件时出错', MODULAR_OUTPUT_FILE, [
        '检查文件路径是否正确',
        '确认目录权限是否正确',
        `错误详情: ${getErrorMessage(writeError)}`,
      ]);
    }

    log.ok('完成', { ms: elapsedMs(), output: MODULAR_OUTPUT_FILE });
  } catch (error) {
    // 如果是自定义错误，直接抛出
    if (error instanceof FileError) {
      throw error;
    }
    // 否则包装为 FileError
    throw new FileError('处理书签文件时发生错误', null, [
      '检查书签 HTML 文件格式是否正确',
      '确认配置目录结构是否完整',
      `错误详情: ${getErrorMessage(error)}`,
    ]);
  }
}

// 启动处理
if (require.main === module) {
  wrapAsyncError(main)();
}

module.exports = {
  ensureUserConfigInitialized,
  ensureUserSiteYmlExists,
  upsertBookmarksNavInSiteYml,
  parseBookmarks,
  generateBookmarksYaml,
  updateNavigationWithBookmarks,
};
