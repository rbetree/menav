import fs from 'node:fs';
import path from 'node:path';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';
import { ensureSupportedNodeVersion } from './lib/node-version.ts';

const log = createLogger('backend:init');

export type InitOptions = { withTest: boolean; withLocal: boolean };
export type InitResult = {
  exitCode: number;
  generated: string[];
  skipped: string[];
};

export function parseInitArgs(argv: string[]): {
  options: InitOptions;
  unknown: string[];
  help: boolean;
} {
  const options: InitOptions = { withTest: false, withLocal: false };
  const unknown: string[] = [];
  let help = false;
  for (const arg of argv) {
    if (arg === '--with-test') options.withTest = true;
    else if (arg === '--with-local') options.withLocal = true;
    else if (arg === '--all') {
      options.withTest = true;
      options.withLocal = true;
    } else if (arg === '--help' || arg === '-h') help = true;
    else unknown.push(arg);
  }
  return { options, unknown, help };
}

function copyTemplate(
  source: string,
  target: string,
  generated: string[],
  skipped: string[]
): void {
  const targetName = path.basename(target);
  if (fs.existsSync(target)) {
    skipped.push(targetName);
    log.ok(`${targetName} 已存在，跳过复制`);
    return;
  }
  fs.copyFileSync(source, target);
  generated.push(targetName);
  log.ok(`已生成 ${targetName}`);
}

export function runInit(options: { repoRoot?: string; argv?: string[] }): InitResult {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const argv = options.argv ?? process.argv.slice(2);
  const { options: flags, unknown, help } = parseInitArgs(argv);
  const generated: string[] = [];
  const skipped: string[] = [];

  if (help) {
    printUsage();
    return { exitCode: 0, generated, skipped };
  }
  if (unknown.length > 0) {
    log.error(`未知参数：${unknown.join(' ')}`);
    printUsage();
    return { exitCode: 1, generated, skipped };
  }

  const workersDir = path.join(repoRoot, 'workers');
  const pairs: { source: string; target: string }[] = [
    {
      source: path.join(workersDir, 'wrangler.example.jsonc'),
      target: path.join(workersDir, 'wrangler.jsonc'),
    },
  ];
  if (flags.withTest) {
    pairs.push({
      source: path.join(workersDir, 'wrangler.test.example.jsonc'),
      target: path.join(workersDir, 'wrangler.test.jsonc'),
    });
  }
  if (flags.withLocal) {
    pairs.push({
      source: path.join(workersDir, 'wrangler.local.example.jsonc'),
      target: path.join(workersDir, 'wrangler.local.jsonc'),
    });
  }

  for (const pair of pairs) {
    if (!fs.existsSync(pair.source)) {
      log.error(`缺少模板 ${path.relative(repoRoot, pair.source)}，无法生成配置`);
      return { exitCode: 1, generated, skipped };
    }
  }

  for (const pair of pairs) {
    copyTemplate(pair.source, pair.target, generated, skipped);
  }

  if (flags.withLocal) {
    const devVars = path.join(workersDir, '.dev.vars');
    if (fs.existsSync(devVars)) {
      skipped.push('.dev.vars');
      log.ok('.dev.vars 已存在，跳过复制');
    } else if (fs.existsSync(path.join(workersDir, '.dev.vars.example'))) {
      fs.copyFileSync(path.join(workersDir, '.dev.vars.example'), devVars);
      generated.push('.dev.vars');
      log.ok('已生成 .dev.vars（含 ALLOW_INSECURE_DEV=1）');
    } else {
      log.warn('缺少 workers/.dev.vars.example，本地开发需要手动创建 .dev.vars');
    }
  }

  printNextSteps(flags, generated, skipped);
  return { exitCode: 0, generated, skipped };
}

function printUsage(): void {
  console.log('用法：npm run backend:init -- [--with-test] [--with-local] [--all]');
  console.log('  --with-test   同时生成 workers/wrangler.test.jsonc');
  console.log('  --with-local  同时生成 workers/wrangler.local.jsonc 与 workers/.dev.vars');
  console.log('  --all         生成生产、测试、本地三份配置');
}

function printNextSteps(flags: InitOptions, generated: string[], skipped: string[]): void {
  const targets = [...generated, ...skipped];
  log.info('下一步：');
  if (targets.includes('wrangler.jsonc')) {
    console.log('  1. 在 workers/ 下运行 npx wrangler d1 create menav-db');
    console.log('  2. 把 database_id 填入 workers/wrangler.jsonc');
    console.log('  3. 填写 TEAM_DOMAIN、POLICY_AUD、CF_ACCOUNT_ID、CF_PAGES_PROJECT');
  }
  if (flags.withTest && targets.includes('wrangler.test.jsonc')) {
    console.log('  4. 在 workers/wrangler.test.jsonc 的 env.staging 填入测试 D1 与测试 Worker 名');
    console.log('     执行 npm run backend:doctor -- --config wrangler.test.jsonc 检查');
  }
  if (flags.withLocal && targets.includes('wrangler.local.jsonc')) {
    console.log('  5. 运行 npm run backend:dev:local 启动本地 Worker 与本地 D1');
  }
  console.log(`  已处理 ${targets.length} 个文件；运行 npm run backend:doctor 检查`);
}

async function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');

  if (!ensureSupportedNodeVersion({ repoRoot, log, command: 'npm run backend:init' })) {
    process.exitCode = 1;
    return;
  }

  const result = runInit({ repoRoot });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
    return;
  }
  log.ok('完成', { ms: elapsedMs(), generated: result.generated.length });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('初始化失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  runInit,
  parseInitArgs,
};
