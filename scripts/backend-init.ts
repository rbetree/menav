import fs from 'node:fs';
import path from 'node:path';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';
import { ensureSupportedNodeVersion } from './lib/node-version.ts';

const log = createLogger('backend:init');

async function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');

  if (!ensureSupportedNodeVersion({ repoRoot, log, command: 'npm run backend:init' })) {
    process.exitCode = 1;
    return;
  }

  const workersDir = path.join(repoRoot, 'workers');
  const examplePath = path.join(workersDir, 'wrangler.example.jsonc');
  const targetPath = path.join(workersDir, 'wrangler.jsonc');

  if (!fs.existsSync(examplePath)) {
    log.error('缺少 workers/wrangler.example.jsonc，无法生成配置');
    process.exitCode = 1;
    return;
  }

  if (fs.existsSync(targetPath)) {
    log.ok('workers/wrangler.jsonc 已存在，跳过复制', { ms: elapsedMs() });
  } else {
    fs.copyFileSync(examplePath, targetPath);
    log.ok('已生成 workers/wrangler.jsonc', { ms: elapsedMs() });
  }

  log.info('下一步：');
  console.log('  1. 在 workers/ 下运行 npx wrangler d1 create menav-db');
  console.log('  2. 把 database_id 填入 workers/wrangler.jsonc');
  console.log('  3. 填写 TEAM_DOMAIN、POLICY_AUD、CF_ACCOUNT_ID、CF_PAGES_PROJECT');
  console.log('  4. 运行 npm run backend:doctor 检查配置');
  console.log('  5. 设置 CF_API_TOKEN 与 BUILD_TOKEN 两个 secret');
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
};
