import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';

const log = createLogger('backend:check:configs');

export type DryRunCommand = {
  name: string;
  config: string;
  env?: string;
  args: string[];
};

export function buildDryRunCommands(): DryRunCommand[] {
  return [
    { name: 'example', config: 'wrangler.example.jsonc', args: [] },
    { name: 'test', config: 'wrangler.test.example.jsonc', env: 'staging', args: [] },
    { name: 'local', config: 'wrangler.local.example.jsonc', args: [] },
  ];
}

function wranglerBin(repoRoot: string): string {
  return path.join(repoRoot, 'workers', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
}

export function runExampleChecks(repoRoot: string): number {
  const workersDir = path.join(repoRoot, 'workers');
  const bin = wranglerBin(repoRoot);
  if (!fs.existsSync(bin)) {
    log.error('缺少 workers/node_modules/wrangler，先运行 npm --prefix workers ci');
    return 1;
  }

  const outRoot = path.join(workersDir, '.wrangler', 'dry-run');
  fs.rmSync(outRoot, { recursive: true, force: true });

  let exitCode = 0;
  for (const item of buildDryRunCommands()) {
    const outdir = path.join(outRoot, item.name);
    const args = [
      bin,
      'deploy',
      '--dry-run',
      '--config',
      item.config,
      '--outdir',
      outdir,
      ...(item.env === undefined ? [] : ['--env', item.env]),
    ];
    log.info(`校验 ${item.config}${item.env ? `（env: ${item.env || '顶层'}）` : ''}`);
    const result = spawnSync(process.execPath, args, {
      cwd: workersDir,
      stdio: isVerbose() ? 'inherit' : 'pipe',
      encoding: 'utf8',
      // dry-run 只做本地打包；显式清空凭据，确保 Fork PR 等无 Token 环境可用。
      env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' },
    });
    if (result.status !== 0) {
      exitCode = 1;
      log.error(`${item.config} 校验失败`, {
        exit: result.status,
        detail: (result.stderr || result.stdout || '').trim().split('\n').slice(-6).join(' | '),
      });
    } else {
      log.ok(`${item.config} 校验通过`);
    }
  }

  fs.rmSync(outRoot, { recursive: true, force: true });
  return exitCode;
}

async function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');
  const exitCode = runExampleChecks(repoRoot);
  if (exitCode !== 0) {
    log.error('示例配置校验未通过', { ms: elapsedMs() });
    process.exitCode = exitCode;
    return;
  }
  log.ok('示例配置校验通过', { ms: elapsedMs() });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('校验失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  buildDryRunCommands,
  runExampleChecks,
};
