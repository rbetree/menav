const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
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
const {
  ensureUserConfigInitialized,
  ensureUserSiteYmlExists,
} = require('./lib/config/init.ts') as {
  ensureUserConfigInitialized: () => { initialized: boolean; source: string };
  ensureUserSiteYmlExists: () => boolean;
};
const { parseBookmarks } = require('./lib/bookmarks/parser.ts') as {
  parseBookmarks: (htmlContent: string) => BookmarksData;
};
const { generateBookmarksYaml: serializeBookmarksYaml } = require('./lib/bookmarks/serializer.ts') as {
  generateBookmarksYaml: (bookmarks: BookmarksData) => string | null;
};
const { upsertBookmarksNavInSiteYml } = require('./lib/bookmarks/writer.ts') as {
  upsertBookmarksNavInSiteYml: (siteYmlPath: string) => UpsertBookmarksNavResult;
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
  path?: string[];
  sites?: BookmarkSite[];
  subcategories?: BookmarkCategory[];
  groups?: BookmarkCategory[];
  subgroups?: BookmarkCategory[];
};

type BookmarksData = {
  categories: BookmarkCategory[];
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

const log = createLogger('import-bookmarks');

const BOOKMARKS_DIR = 'bookmarks';
const CONFIG_USER_DIR = 'config/user';
const CONFIG_USER_PAGES_DIR = path.join(CONFIG_USER_DIR, 'pages');
const MODULAR_OUTPUT_FILE = path.join(CONFIG_USER_PAGES_DIR, 'bookmarks.yml');
const USER_SITE_YML = path.join(CONFIG_USER_DIR, 'site.yml');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function parseFilenameTimestamp(filename: string): number {
  const base = path.basename(filename);
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

  const dateMatch = base.match(/(\d{4})(\d{2})(\d{2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  return 0;
}

function getLatestBookmarkFile(): string | null {
  try {
    if (!fs.existsSync(BOOKMARKS_DIR)) {
      fs.mkdirSync(BOOKMARKS_DIR, { recursive: true });
      log.warn('bookmarks 目录不存在，已创建；未找到 HTML 书签文件', { dir: BOOKMARKS_DIR });
      return null;
    }

    const files = fs
      .readdirSync(BOOKMARKS_DIR)
      .filter((file) => file.toLowerCase().endsWith('.html'));

    if (files.length === 0) {
      log.warn('未找到任何 HTML 书签文件', { dir: BOOKMARKS_DIR });
      return null;
    }

    const [latest] = files
      .map((file) => {
        const filenameTimestamp = parseFilenameTimestamp(file);
        const mtime = fs.statSync(path.join(BOOKMARKS_DIR, file)).mtime.getTime();
        return { file, timestamp: filenameTimestamp || mtime };
      })
      .sort((a, b) => b.timestamp - a.timestamp || a.file.localeCompare(b.file));

    const latestFilePath = path.join(BOOKMARKS_DIR, latest.file);
    log.info('选择最新的书签文件', { file: latest.file });
    return latestFilePath;
  } catch (error) {
    log.error('查找书签文件时出错', { message: getErrorMessage(error) });
    const stack = getErrorStack(error);
    if (isVerbose() && stack) console.error(stack);
    return null;
  }
}

function generateBookmarksYaml(bookmarks: BookmarksData): string | null {
  try {
    return serializeBookmarksYaml(bookmarks);
  } catch (error) {
    log.error('生成 YAML 失败', { message: getErrorMessage(error) });
    const stack = getErrorStack(error);
    if (isVerbose() && stack) console.error(stack);
    return null;
  }
}

function updateNavigationWithBookmarks(): NavigationUpdateResult {
  if (ensureUserSiteYmlExists()) {
    const result = upsertBookmarksNavInSiteYml(USER_SITE_YML);
    if (result.updated) return { updated: true, target: 'site.yml', reason: result.reason };
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

async function main() {
  const elapsedMs = startTimer();
  log.info('开始', { version: process.env.npm_package_version });

  log.info('查找书签文件', { dir: BOOKMARKS_DIR });
  const bookmarkFile = getLatestBookmarkFile();
  if (!bookmarkFile) {
    log.ok('未找到书签文件，跳过', { dir: BOOKMARKS_DIR });
    return;
  }
  log.ok('找到书签文件', { file: bookmarkFile });

  try {
    log.info('读取书签文件', { file: bookmarkFile });
    const htmlContent = fs.readFileSync(bookmarkFile, 'utf8');
    log.ok('读取成功', { chars: htmlContent.length });

    log.info('解析书签结构');
    const bookmarks = parseBookmarks(htmlContent);
    if (bookmarks.categories.length === 0) {
      log.error('HTML 文件中未找到书签分类，处理终止');
      return;
    }
    log.ok('解析完成', { categories: bookmarks.categories.length });

    log.info('生成 YAML 配置');
    const yamlContent = generateBookmarksYaml(bookmarks);
    if (!yamlContent) {
      log.error('YAML 生成失败，处理终止');
      return;
    }
    log.ok('YAML 生成成功');

    log.info('写入配置文件', { path: MODULAR_OUTPUT_FILE });
    try {
      ensureUserConfigInitialized();
      if (!fs.existsSync(CONFIG_USER_PAGES_DIR)) fs.mkdirSync(CONFIG_USER_PAGES_DIR, { recursive: true });
      fs.writeFileSync(MODULAR_OUTPUT_FILE, yamlContent, 'utf8');

      if (!fs.existsSync(MODULAR_OUTPUT_FILE)) {
        throw new FileError('文件未能创建', MODULAR_OUTPUT_FILE, [
          '检查目录权限是否正确',
          '确认磁盘空间是否充足',
          '尝试手动创建目录: mkdir -p config/user/pages',
        ]);
      }

      log.ok('写入成功', { path: MODULAR_OUTPUT_FILE });
      log.info('更新导航配置（确保包含 bookmarks 入口）');
      const navUpdateResult = updateNavigationWithBookmarks();
      if (navUpdateResult.updated) {
        log.ok('导航配置已更新', { target: navUpdateResult.target, reason: navUpdateResult.reason });
      } else if (navUpdateResult.reason === 'already_present') {
        log.ok('导航配置已包含书签入口，无需更新', { target: navUpdateResult.target });
      } else if (navUpdateResult.reason === 'no_site_yml') {
        log.warn('未找到可用的 site.yml，无法自动更新导航', { path: USER_SITE_YML });
      } else if (navUpdateResult.reason === 'navigation_not_array') {
        log.warn('site.yml 中 navigation 不是数组，无法自动更新导航', { path: USER_SITE_YML });
      } else if (navUpdateResult.reason === 'error') {
        log.warn('导航更新失败，请手动检查配置文件格式（详见错误信息）');
        if (navUpdateResult.error !== undefined) {
          log.warn('导航更新错误详情', { message: getErrorMessage(navUpdateResult.error) });
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
    if (error instanceof FileError) throw error;
    throw new FileError('处理书签文件时发生错误', null, [
      '检查书签 HTML 文件格式是否正确',
      '确认配置目录结构是否完整',
      `错误详情: ${getErrorMessage(error)}`,
    ]);
  }
}

if (require.main === module) {
  wrapAsyncError(main)();
}
