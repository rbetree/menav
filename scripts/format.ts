import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';

const lifecycleEvent = process.env.npm_lifecycle_event
  ? String(process.env.npm_lifecycle_event)
  : '';
const scope =
  lifecycleEvent === 'format' || lifecycleEvent.startsWith('format:') ? lifecycleEvent : 'format';
const log = createLogger(scope);

const PATTERNS = [
  'src/**/*.js',
  'src/**/*.astro',
  'scripts/**/*.js',
  'test/**/*.ts',
  '.github/**/*.yml',
  'astro.config.mjs',
  '*.{md,json}',
  'config/**/*.md',
  'config/**/*.yml',
];

function parseMode(argv: string[]): 'check' | 'write' {
  if (argv.includes('--check')) return 'check';
  if (argv.includes('--write')) return 'write';
  return 'check';
}

async function main() {
  const elapsedMs = startTimer();
  const mode = parseMode(process.argv.slice(2));
  log.info('开始', { mode, version: process.env.npm_package_version });

  const repoRoot = path.resolve(__dirname, '..');
  const prettierCli = path.join(repoRoot, 'node_modules', 'prettier', 'bin', 'prettier.cjs');

  const args: string[] = [];
  if (mode === 'write') args.push('--write');
  else args.push('--check');
  args.push('--no-error-on-unmatched-pattern');

  // Prettier 本身会根据 .prettierignore 过滤；这里不额外做 file list，保持输出简洁
  if (isVerbose()) {
    log.info('检查范围', { patterns: PATTERNS.join(' ') });
  }

  const result = spawnSync(process.execPath, [prettierCli, ...args, ...PATTERNS], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  const exitCode = Number.isFinite(result.status) ? Number(result.status) : 1;
  if (exitCode !== 0) {
    log.error('失败', { ms: elapsedMs(), exit: exitCode });
    process.exitCode = exitCode;
    return;
  }

  log.ok('完成', { ms: elapsedMs(), mode });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('执行失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
