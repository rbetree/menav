const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { createLogger, isVerbose, startTimer } = require('../src/lib/logging/logger.ts');

const log = createLogger('format:check:changed');

function runGit(args, cwd, options = {}) {
  const { allowFailure = false, stdio } = options;
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: stdio || 'pipe' }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

function tryReadGithubEvent(eventPath) {
  if (!eventPath) return null;
  try {
    const raw = fs.readFileSync(eventPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isAllZerosSha(value) {
  return typeof value === 'string' && /^0{40}$/.test(value);
}

function getDiffRangeFromGithubEvent(event) {
  if (!event || typeof event !== 'object') return null;

  if (event.pull_request && event.pull_request.base && event.pull_request.head) {
    const base = event.pull_request.base.sha;
    const head = event.pull_request.head.sha;
    if (base && head) return { base, head };
  }

  if (event.before && (event.after || event.head_commit)) {
    const base = event.before;
    const head = event.after || (event.head_commit && event.head_commit.id);
    if (base && head && !isAllZerosSha(base)) return { base, head };
  }

  return null;
}

function gitObjectExists(repoRoot, sha) {
  if (!sha) return false;
  const result = runGit(['cat-file', '-e', `${sha}^{commit}`], repoRoot, { allowFailure: true });
  return result !== null;
}

function isShallowRepository(repoRoot) {
  const result = runGit(['rev-parse', '--is-shallow-repository'], repoRoot, { allowFailure: true });
  return result === 'true';
}

function tryFetchMoreHistory(repoRoot) {
  // 仅在 CI 场景兜底：actions/checkout 若是浅克隆，可能缺少 base commit，导致 diff range 失败
  try {
    if (isShallowRepository(repoRoot)) {
      execFileSync('git', ['fetch', '--prune', '--no-tags', '--unshallow'], {
        cwd: repoRoot,
        stdio: 'inherit',
      });
      return true;
    }
  } catch {
    // ignore
  }

  try {
    execFileSync('git', ['fetch', '--prune', '--no-tags', '--depth=200', 'origin'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    return true;
  } catch {
    return false;
  }
}

function collectHeadChangedFiles(repoRoot) {
  const output = runGit(
    ['show', '--name-only', '--diff-filter=ACMR', '--pretty=format:', 'HEAD'],
    repoRoot,
    { allowFailure: true }
  );

  if (!output) return [];

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function collectChangedFiles(repoRoot, range) {
  if (!range) return [];

  const diffArgs = ['diff', '--name-only', '--diff-filter=ACMR', `${range.base}..${range.head}`];

  const baseExists = gitObjectExists(repoRoot, range.base);
  const headExists = gitObjectExists(repoRoot, range.head);
  if (!baseExists || !headExists) {
    log.warn('检测到 diff range 所需提交缺失，尝试补全 git 历史（避免浅克隆导致失败）');
    tryFetchMoreHistory(repoRoot);
  }

  const output = runGit(diffArgs, repoRoot, { allowFailure: true });
  if (!output) {
    log.warn('无法计算 revision range，回退为 HEAD 变更文件（可能仅覆盖最后一次提交）');
    return collectHeadChangedFiles(repoRoot);
  }

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function collectWorkingTreeChangedFiles(repoRoot) {
  const files = new Set();
  const unstaged = runGit(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], repoRoot, {
    allowFailure: true,
  });
  const staged = runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], repoRoot, {
    allowFailure: true,
  });

  [unstaged, staged].forEach((block) => {
    if (!block) return;
    block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((filePath) => files.add(filePath));
  });

  return Array.from(files).sort();
}

function shouldCheckFile(filePath) {
  const normalized = filePath.split(path.sep).join('/');

  if (normalized === 'package-lock.json') return false;

  // 这些文件历史上未统一为 Prettier 风格；避免为了启用检查产生巨量格式化 diff
  if (normalized === 'src/runtime/index.js') return false;

  // 与现有 npm scripts 的检查范围对齐：不检查 docs/
  const allowedRoots = ['src/', 'scripts/', 'test/', '.github/', 'config/'];
  const isRootFile = !normalized.includes('/');
  const hasAllowedRoot = allowedRoots.some((prefix) => normalized.startsWith(prefix));

  const isAllowedPath =
    hasAllowedRoot || (isRootFile && (normalized.endsWith('.md') || normalized.endsWith('.json')));

  if (!isAllowedPath) return false;

  const ext = path.extname(normalized).toLowerCase();
  return ['.astro', '.js', '.json', '.md', '.yml', '.yaml'].includes(ext);
}

function resolvePrettierBin(repoRoot) {
  const base = path.join(repoRoot, 'node_modules', '.bin', 'prettier');
  if (fs.existsSync(base)) return base;
  if (fs.existsSync(`${base}.cmd`)) return `${base}.cmd`;
  return null;
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const elapsedMs = startTimer();

  log.info('开始');

  const event = tryReadGithubEvent(process.env.GITHUB_EVENT_PATH);
  const range = getDiffRangeFromGithubEvent(event);

  const candidateFiles = range
    ? collectChangedFiles(repoRoot, range)
    : collectWorkingTreeChangedFiles(repoRoot);

  const filesToCheck = candidateFiles.filter(shouldCheckFile);

  if (filesToCheck.length === 0) {
    log.ok('未发现需要检查的文件，跳过');
    return;
  }

  const prettierBin = resolvePrettierBin(repoRoot);
  if (!prettierBin) {
    log.error('未找到 prettier，可先运行 npm ci / npm install');
    process.exitCode = 1;
    return;
  }

  log.info('准备检查文件格式', { files: filesToCheck.length });
  if (isVerbose()) {
    filesToCheck.forEach((filePath) => log.info('待检查', { file: filePath }));
  }

  try {
    execFileSync(prettierBin, ['--check', ...filesToCheck], { cwd: repoRoot, stdio: 'inherit' });
    log.ok('通过', { ms: elapsedMs(), files: filesToCheck.length });
  } catch (error) {
    log.error('未通过', {
      ms: elapsedMs(),
      files: filesToCheck.length,
      exit: error && error.status ? error.status : 1,
    });
    process.exitCode = error && error.status ? error.status : 1;
  }
}

main();
