import fs from 'node:fs';
import path from 'node:path';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';
import { ensureSupportedNodeVersion } from './lib/node-version.ts';

const log = createLogger('backend:doctor');

type CheckResult = { ok: boolean; message: string };

function stripJsonComments(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        out += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    out += char;
  }

  return out;
}

function stripTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, '$1');
}

function readJsonc(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(stripTrailingCommas(stripJsonComments(raw))) as Record<string, unknown>;
}

function isPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.includes('REPLACE_WITH') || trimmed.includes('<');
}

async function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');

  if (!ensureSupportedNodeVersion({ repoRoot, log, command: 'npm run backend:doctor' })) {
    process.exitCode = 1;
    return;
  }

  const workersDir = path.join(repoRoot, 'workers');
  const configPath = path.join(workersDir, 'wrangler.jsonc');
  const checks: CheckResult[] = [];

  const check = (ok: boolean, okMessage: string, failMessage: string) => {
    checks.push({ ok, message: ok ? okMessage : failMessage });
    if (ok) log.ok(okMessage);
    else log.error(failMessage);
  };

  if (!fs.existsSync(configPath)) {
    log.error('缺少 workers/wrangler.jsonc，先运行 npm run backend:init');
    process.exitCode = 1;
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = readJsonc(configPath);
  } catch (error) {
    log.error('workers/wrangler.jsonc 无法解析', {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
    return;
  }

  const bindings = Array.isArray(config.d1_databases) ? config.d1_databases : [];
  const firstBinding =
    bindings[0] && typeof bindings[0] === 'object'
      ? (bindings[0] as Record<string, unknown>)
      : undefined;
  check(
    !isPlaceholder(firstBinding?.database_id),
    'D1 database_id 已填写',
    'D1 database_id 未填写或仍是占位符'
  );

  const vars =
    config.vars && typeof config.vars === 'object'
      ? (config.vars as Record<string, unknown>)
      : undefined;
  for (const key of ['TEAM_DOMAIN', 'POLICY_AUD', 'CF_ACCOUNT_ID', 'CF_PAGES_PROJECT']) {
    check(!isPlaceholder(vars?.[key]), `${key} 已填写`, `${key} 未填写或仍是占位符`);
  }

  const devVarsPath = path.join(workersDir, '.dev.vars');
  if (fs.existsSync(devVarsPath)) {
    log.ok('workers/.dev.vars 存在');
  } else {
    log.warn('workers/.dev.vars 不存在，本地开发可复制 .dev.vars.example');
  }

  for (const name of ['.dev.vars.example', 'pages.env.example']) {
    if (fs.existsSync(path.join(workersDir, name))) log.ok(`模板 ${name} 存在`);
    else log.warn(`模板 ${name} 缺失`);
  }

  log.info('Worker secret 无法在本地读取，部署前确认已设置：CF_API_TOKEN、BUILD_TOKEN');
  log.info('可用 npx wrangler secret list 核对');

  const failed = checks.filter((item) => !item.ok).length;
  if (failed > 0) {
    log.error(`检查未通过：${failed} 项`, { ms: elapsedMs() });
    process.exitCode = 1;
    return;
  }

  log.ok('配置检查通过', { ms: elapsedMs() });
}

if (require.main === module) {
  main().catch((error) => {
    log.error('检查失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
