import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';
import { isValidPagesProjectName, resolveWranglerBin } from './lib/pages.ts';

const log = createLogger('pages:deploy');

export type PagesDeployOptions = {
  repoRoot?: string;
  projectName: string;
  distDir?: string;
  branch?: string;
};

export function buildPagesDeployArgs(options: {
  projectName: string;
  distDir: string;
  branch?: string;
}): string[] {
  return [
    'pages',
    'deploy',
    options.distDir,
    '--project-name',
    options.projectName,
    '--commit-dirty=true',
    ...(options.branch ? ['--branch', options.branch] : []),
  ];
}

export function runPagesDeploy(options: PagesDeployOptions): number {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const projectName = options.projectName.trim();
  const distDir = (options.distDir ?? 'dist').trim();

  if (!isValidPagesProjectName(projectName)) {
    log.error('项目名只能包含小写字母、数字和连字符，且不能以连字符开头或结尾');
    return 1;
  }
  if (!fs.existsSync(path.join(repoRoot, distDir))) {
    log.error(`找不到 ${distDir}/，先运行 npm run build`);
    return 1;
  }
  const bin = resolveWranglerBin(repoRoot);
  if (!bin) {
    log.error(
      '找不到 wrangler。先运行 npm --prefix workers ci，或设置 MENAV_WRANGLER_BIN 指向 wrangler.js'
    );
    return 1;
  }

  log.info(`上传 ${distDir}/ 到 Pages 项目 ${projectName}`);
  const result = spawnSync(
    process.execPath,
    [bin, ...buildPagesDeployArgs({ projectName, distDir, branch: options.branch })],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    }
  );
  if (result.status !== 0) {
    log.error('Pages 部署失败', { exit: result.status });
    return Number.isFinite(result.status) ? (result.status as number) : 1;
  }
  log.ok(`Pages 项目 ${projectName} 部署完成`);
  return 0;
}

function parseArgs(argv: string[]): {
  projectName?: string;
  distDir: string;
  branch?: string;
  error?: string;
} {
  let projectName: string | undefined;
  let distDir = 'dist';
  let branch: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dist') {
      const value = argv[index + 1];
      if (!value) return { distDir, error: '--dist 需要指定目录' };
      distDir = value;
      index += 1;
    } else if (arg.startsWith('--dist=')) {
      distDir = arg.slice('--dist='.length);
    } else if (arg === '--branch') {
      const value = argv[index + 1];
      if (!value) return { distDir, error: '--branch 需要指定分支名' };
      branch = value;
      index += 1;
    } else if (arg.startsWith('--branch=')) {
      branch = arg.slice('--branch='.length);
    } else if (arg.startsWith('-')) {
      return { distDir, error: `未知参数：${arg}` };
    } else if (!projectName) {
      projectName = arg;
    } else {
      return { distDir, error: `多余的参数：${arg}` };
    }
  }
  if (!projectName)
    return { distDir, error: '缺少项目名，用法：npm run pages:deploy -- <project-name>' };
  return { projectName, distDir, branch };
}

async function main() {
  const elapsedMs = startTimer();
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    log.error(parsed.error);
    process.exitCode = 1;
    return;
  }
  const exitCode = runPagesDeploy({
    repoRoot: path.resolve(__dirname, '..'),
    projectName: parsed.projectName!,
    distDir: parsed.distDir,
    branch: parsed.branch,
  });
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return;
  }
  log.ok('完成', { ms: elapsedMs() });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('部署失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  buildPagesDeployArgs,
  runPagesDeploy,
};
