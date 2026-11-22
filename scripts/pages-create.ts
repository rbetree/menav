import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';
import { isValidPagesProjectName, resolveWranglerBin } from './lib/pages.ts';

export { resolveWranglerBin } from './lib/pages.ts';

const log = createLogger('pages:create');

/** wrangler 旧版委托 Workers 时可能生成的未跟踪文件。 */
const WRANGLER_ARTIFACTS = new Set([
  'wrangler.jsonc',
  'wrangler.json',
  'wrangler.toml',
  'public',
  '.wrangler',
]);

export type GitStatus = { tracked: string[]; untracked: string[] };

export function parseGitStatus(output: string): GitStatus {
  const tracked: string[] = [];
  const untracked: string[] = [];
  const entries = output.split('\0').filter(Boolean);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const code = entry.slice(0, 2);
    const file = entry.slice(3);
    if (code === '??') {
      untracked.push(file);
      continue;
    }
    if (code.startsWith('R') || code.startsWith('C')) {
      // 重命名条目后紧跟原路径，原路径不单独处理。
      index += 1;
    }
    if (file) tracked.push(file);
  }
  return { tracked, untracked };
}

function git(repoRoot: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return {
    status: Number.isFinite(result.status) ? (result.status as number) : 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function readStatus(repoRoot: string): GitStatus {
  const result = git(repoRoot, ['status', '--porcelain', '-z', '--untracked-files=all']);
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'git status 执行失败');
  return parseGitStatus(result.stdout);
}

export function describeStatus(status: GitStatus): string {
  const files = [...status.tracked, ...status.untracked];
  return files.length <= 5
    ? files.join(', ')
    : `${files.slice(0, 5).join(', ')} 等 ${files.length} 个文件`;
}

/** 还原跟踪文件，只删除 wrangler 已知的未跟踪产物；返回仍未清理的条目。 */
export function restoreWranglerWorkspace(repoRoot: string): {
  restored: string[];
  removed: string[];
  remaining: string[];
} {
  const before = readStatus(repoRoot);
  if (before.tracked.length > 0) {
    const restored = git(repoRoot, [
      'restore',
      '--source=HEAD',
      '--staged',
      '--worktree',
      '--',
      '.',
    ]);
    if (restored.status !== 0) throw new Error(restored.stderr.trim() || 'git restore 执行失败');
  }

  const removed: string[] = [];
  const artifactRoots = new Set<string>();
  for (const file of before.untracked) {
    const topLevel = file.split(/[\\/]/)[0];
    if (!WRANGLER_ARTIFACTS.has(topLevel)) continue;
    artifactRoots.add(topLevel);
    fs.rmSync(path.join(repoRoot, file), { recursive: true, force: true });
    removed.push(file);
  }
  // 只清理空目录；public/ 等目录里可能还有已跟踪文件。
  for (const topLevel of artifactRoots) {
    removeEmptyDirs(path.join(repoRoot, topLevel));
  }

  const after = readStatus(repoRoot);
  return {
    restored: before.tracked,
    removed,
    remaining: [...after.tracked, ...after.untracked],
  };
}

function removeEmptyDirs(dir: string): boolean {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  for (const entry of fs.readdirSync(dir)) {
    removeEmptyDirs(path.join(dir, entry));
  }
  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
    return true;
  }
  return false;
}

function isGitRepo(repoRoot: string): boolean {
  return git(repoRoot, ['rev-parse', '--is-inside-work-tree']).status === 0;
}

export type PagesCreateOptions = {
  repoRoot?: string;
  projectName: string;
  productionBranch?: string;
};

export function runPagesCreate(options: PagesCreateOptions): number {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const projectName = options.projectName.trim();
  const productionBranch = (options.productionBranch ?? 'main').trim();

  if (!isValidPagesProjectName(projectName)) {
    log.error('项目名只能包含小写字母、数字和连字符，且不能以连字符开头或结尾');
    return 1;
  }
  if (!isGitRepo(repoRoot)) {
    log.error('当前目录不是 Git 仓库，无法检查 wrangler 是否改动了工作区');
    return 1;
  }

  let before: GitStatus;
  try {
    before = readStatus(repoRoot);
  } catch (error) {
    log.error('无法读取工作区状态', {
      message: error instanceof Error ? error.message : String(error),
    });
    return 1;
  }
  if (before.tracked.length > 0 || before.untracked.length > 0) {
    log.error(`工作区不干净，先提交或还原改动再创建 Pages 项目：${describeStatus(before)}`);
    return 1;
  }

  const bin = resolveWranglerBin(repoRoot);
  if (!bin) {
    log.error(
      '找不到 wrangler。先运行 npm --prefix workers ci，或设置 MENAV_WRANGLER_BIN 指向 wrangler.js'
    );
    return 1;
  }

  const wranglerStateDir = path.join(repoRoot, '.wrangler');
  const hadWranglerState = fs.existsSync(wranglerStateDir);

  log.info(`创建 Pages 项目 ${projectName}（生产分支 ${productionBranch}）`);
  const result = spawnSync(
    process.execPath,
    [
      bin,
      'pages',
      'project',
      'create',
      projectName,
      '--production-branch',
      productionBranch,
      '--force',
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    }
  );

  // .wrangler 被 .gitignore 忽略，git status 看不到，需要单独检查。
  if (!hadWranglerState && fs.existsSync(wranglerStateDir)) {
    try {
      fs.rmSync(wranglerStateDir, { recursive: true, force: true });
      log.warn('已清理 wrangler 生成的 .wrangler/ 缓存');
    } catch (error) {
      log.error('wrangler 生成了 .wrangler/，请手动删除后重试', {
        message: error instanceof Error ? error.message : String(error),
      });
      return 1;
    }
  }

  let after: GitStatus;
  try {
    after = readStatus(repoRoot);
  } catch (error) {
    log.error('无法读取工作区状态', {
      message: error instanceof Error ? error.message : String(error),
    });
    return 1;
  }

  if (after.tracked.length > 0 || after.untracked.length > 0) {
    log.error(`wrangler 改动了工作区：${describeStatus(after)}`);
    try {
      const restored = restoreWranglerWorkspace(repoRoot);
      log.warn(
        `已还原跟踪文件 ${restored.restored.length} 个，移除 wrangler 产物 ${restored.removed.length} 个`
      );
      if (restored.remaining.length > 0) {
        log.error(`仍有未清理的改动：${restored.remaining.join(', ')}`);
      }
    } catch (error) {
      log.error('还原工作区失败，请手动检查', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    log.error('已中止：当前 wrangler 仍未使用 --force 直接创建 Pages 项目，请升级 wrangler 后重试');
    return 1;
  }

  if (result.status !== 0) {
    log.error('Pages 项目创建失败', { exit: result.status });
    return Number.isFinite(result.status) ? (result.status as number) : 1;
  }

  log.ok(`Pages 项目 ${projectName} 已创建`);
  console.log('下一步：');
  console.log(`  npm run pages:deploy -- ${projectName}`);
  console.log('  之后不要再给 pages 命令加 --force。');
  return 0;
}

function parseArgs(argv: string[]): {
  projectName?: string;
  productionBranch?: string;
  error?: string;
} {
  let projectName: string | undefined;
  let productionBranch = 'main';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--production-branch') {
      const value = argv[index + 1];
      if (!value) return { error: '--production-branch 需要指定分支名' };
      productionBranch = value;
      index += 1;
    } else if (arg.startsWith('--production-branch=')) {
      productionBranch = arg.slice('--production-branch='.length);
    } else if (arg.startsWith('-')) {
      return { error: `未知参数：${arg}` };
    } else if (!projectName) {
      projectName = arg;
    } else {
      return { error: `多余的参数：${arg}` };
    }
  }
  if (!projectName) return { error: '缺少项目名，用法：npm run pages:create -- <project-name>' };
  return { projectName, productionBranch };
}

async function main() {
  const elapsedMs = startTimer();
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    log.error(parsed.error);
    process.exitCode = 1;
    return;
  }
  const exitCode = runPagesCreate({
    repoRoot: path.resolve(__dirname, '..'),
    projectName: parsed.projectName!,
    productionBranch: parsed.productionBranch,
  });
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return;
  }
  log.ok('完成', { ms: elapsedMs() });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('创建失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  parseGitStatus,
  resolveWranglerBin,
  restoreWranglerWorkspace,
  runPagesCreate,
};
