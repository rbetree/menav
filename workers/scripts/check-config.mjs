// 部署前最小校验；更完整的规则与资源检查见 scripts/backend-doctor.ts。
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  getD1Binding,
  getVars,
  isPlaceholderValue,
  parseJsonc,
  readEnvFile,
} from './config-rules.cjs';

const file = process.argv[2];
if (!file) {
  console.error('用法: node scripts/check-config.mjs <配置文件>');
  process.exit(2);
}

const filePath = path.resolve(process.cwd(), file);
const base = path.basename(filePath);
const isLocal = base === 'wrangler.local.jsonc';
const isTest = base === 'wrangler.test.jsonc';

let text;
try {
  text = readFileSync(filePath, 'utf8');
} catch {
  const hint = isLocal
    ? 'npm run backend:init -- --with-local'
    : isTest
      ? 'npm run backend:init -- --with-test'
      : 'npm run backend:init';
  console.error(`找不到 ${file}。请运行 ${hint} 生成配置。`);
  process.exit(1);
}

let config;
try {
  config = parseJsonc(text);
} catch (error) {
  console.error(`${file} 不是有效的 JSONC：${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const section = isTest ? config.env?.staging : config;
if (!section || typeof section !== 'object' || Array.isArray(section)) {
  console.error(
    isTest ? `${file} 缺少 env.staging，测试配置必须提供 staging 段。` : `${file} 内容无效。`
  );
  process.exit(1);
}

const d1 = getD1Binding(section);
const vars = getVars(section);

if (!d1 || typeof d1.database_id !== 'string' || !d1.database_id.trim()) {
  console.error(`${file} 缺少 d1_databases[0].database_id。`);
  process.exit(1);
}
if (isPlaceholderValue(d1.database_id)) {
  console.error(`${file} 的 d1_databases[0].database_id 仍是占位符。`);
  process.exit(1);
}
if (d1.binding !== undefined && d1.binding !== 'DB') {
  console.warn('提示：D1 绑定名不是 DB，Worker 运行时默认读取 DB 绑定。');
}

if (isLocal) {
  const teamDomain = typeof vars.TEAM_DOMAIN === 'string' ? vars.TEAM_DOMAIN.trim() : '';
  const policyAud = typeof vars.POLICY_AUD === 'string' ? vars.POLICY_AUD.trim() : '';
  if (teamDomain.includes('REPLACE_WITH_') || policyAud.includes('REPLACE_WITH_')) {
    console.error(
      `${file} 的 TEAM_DOMAIN / POLICY_AUD 仍是占位符；本地配置请清空这两个变量，或填写真实 Access 值。`
    );
    process.exit(1);
  }
  if (!(teamDomain && policyAud)) {
    const devVars = readEnvFile(path.join(path.dirname(filePath), '.dev.vars'));
    if (devVars.ALLOW_INSECURE_DEV !== '1') {
      console.error(
        `${file} 的 TEAM_DOMAIN / POLICY_AUD 为空，需要在 workers/.dev.vars 设置 ALLOW_INSECURE_DEV=1。`
      );
      process.exit(1);
    }
  }
  if (d1.remote === true) {
    console.warn('提示：本地配置的 D1 绑定是 remote: true，会读写远端数据库。');
  }
  if (!vars.CF_ACCOUNT_ID || !vars.CF_PAGES_PROJECT) {
    console.log('提示：本地配置未填写 CF_ACCOUNT_ID / CF_PAGES_PROJECT，发布功能不可用。');
  }
} else {
  const required = ['TEAM_DOMAIN', 'CF_ACCOUNT_ID', 'CF_PAGES_PROJECT'];
  const missing = required.filter((key) => isPlaceholderValue(vars[key]));
  if (missing.length > 0) {
    console.error(`${file} 缺少或仍使用占位符：${missing.join(', ')}。`);
    process.exit(1);
  }
  if (isPlaceholderValue(vars.POLICY_AUD)) {
    console.warn(
      `提示：${file} 的 POLICY_AUD 尚未填写；可以先部署 Worker，创建 Access 应用后补齐并重新部署。`
    );
  }
}
