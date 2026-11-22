import fs from 'node:fs';
import path from 'node:path';

import { createLogger, isVerbose, startTimer, type Logger } from '../src/lib/logging/logger.ts';
import {
  getD1Binding,
  getEffectiveConfig,
  getVars,
  isLocalConfigName,
  isPlaceholderValue,
  isTestConfigName,
  readEnvFile,
  readJsonc,
  validateRoutes,
} from './lib/backend-config.ts';
import { ensureSupportedNodeVersion } from './lib/node-version.ts';

const log = createLogger('backend:doctor');

export type DoctorLevel = 'ok' | 'warn' | 'error' | 'info';
export type DoctorCheck = { level: DoctorLevel; message: string };
export type DoctorResult = { exitCode: number; checks: DoctorCheck[] };

type DoctorOptions = {
  repoRoot?: string;
  configName?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  logger?: Logger;
};

type ApiResponse = { status: number; success: boolean; result?: unknown };

async function apiGet(
  fetchImpl: typeof fetch,
  token: string,
  pathName: string
): Promise<ApiResponse> {
  try {
    const response = await fetchImpl('https://api.cloudflare.com/client/v4' + pathName, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    const body =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    return {
      status: response.status,
      success: body?.success === true,
      result: body?.result,
    };
  } catch {
    return { status: 0, success: false };
  }
}

function appMatchesAud(app: unknown, aud: string): boolean {
  if (!app || typeof app !== 'object' || Array.isArray(app)) return false;
  const value = (app as Record<string, unknown>).aud;
  if (typeof value === 'string') return value === aud;
  return Array.isArray(value) && value.includes(aud);
}

function requiredVarCheck(name: string, vars: Record<string, unknown>): boolean {
  return !isPlaceholderValue(vars[name]);
}

function teamDomainIssue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || isPlaceholderValue(text)) return null;
  if (!text.startsWith('https://')) return 'TEAM_DOMAIN 必须以 https:// 开头';
  if (text.endsWith('/')) return 'TEAM_DOMAIN 不能以 / 结尾';
  try {
    new URL(text);
  } catch {
    return 'TEAM_DOMAIN 不是有效地址';
  }
  return null;
}

/**
 * 部署前检查 wrangler 配置。
 *
 * 测试配置（wrangler.test.jsonc）只校验 env.staging，并在生产 wrangler.jsonc
 * 存在时比较 Worker 名与 D1；缺失时只警告，不阻断测试环境搭建。资源检查需要
 * CLOUDFLARE_API_TOKEN，缺失时明确标注“未检查”，不把网络或权限问题当成配置错误。
 */
export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorResult> {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const workersDir = path.join(repoRoot, 'workers');
  const configName = options.configName ?? 'wrangler.jsonc';
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? log;
  const checks: DoctorCheck[] = [];

  const add = (level: DoctorLevel, message: string) => {
    checks.push({ level, message });
    logger[level](message);
  };
  const finish = (): DoctorResult => ({
    exitCode: checks.some((item) => item.level === 'error') ? 1 : 0,
    checks,
  });

  const configPath = path.resolve(workersDir, configName);
  if (!configPath.startsWith(workersDir + path.sep)) {
    add('error', '--config 只能指向 workers/ 目录内的配置文件');
    return finish();
  }
  const displayPath = path.relative(repoRoot, configPath).split(path.sep).join('/');

  if (!fs.existsSync(configPath)) {
    add('error', `缺少 ${displayPath}，先运行 npm run backend:init 或从示例复制`);
    return finish();
  }

  let config: Record<string, unknown>;
  try {
    config = readJsonc(configPath);
  } catch (error) {
    add(
      'error',
      `${displayPath} 无法解析：${error instanceof Error ? error.message : String(error)}`
    );
    return finish();
  }

  const local = isLocalConfigName(configName);
  const test = isTestConfigName(configName);
  const section = getEffectiveConfig(config, configName);
  if (!section) {
    add(
      'error',
      test
        ? `${displayPath} 缺少 env.staging；测试配置必须提供 staging 段`
        : `${displayPath} 内容无效`
    );
    return finish();
  }

  const vars = getVars(section);
  let productionSection: Record<string, unknown> | undefined = config;
  if (test) {
    const productionPath = path.join(workersDir, 'wrangler.jsonc');
    if (!fs.existsSync(productionPath)) {
      add(
        'warn',
        '缺少 workers/wrangler.jsonc，未与生产 Worker 和 D1 做隔离比对；先运行 npm run backend:init 可补上'
      );
      productionSection = undefined;
    } else {
      try {
        productionSection = readJsonc(productionPath);
      } catch (error) {
        add(
          'error',
          `workers/wrangler.jsonc 无法解析：${error instanceof Error ? error.message : String(error)}`
        );
        productionSection = undefined;
      }
    }
  }
  const productionD1 = getD1Binding(productionSection);
  const productionName =
    typeof productionSection?.name === 'string' ? productionSection.name.trim() : '';

  const sectionName = typeof section.name === 'string' ? section.name.trim() : '';
  if (!sectionName || sectionName.includes('REPLACE_WITH')) {
    add('error', `${test ? 'env.staging' : '顶层'} name 未填写或仍是占位符`);
  } else if (test) {
    add('ok', `staging Worker 名：${sectionName}`);
  }

  const d1 = getD1Binding(section);
  if (!d1) {
    add('error', '缺少 d1_databases[0] 绑定');
  } else {
    if (isPlaceholderValue(d1.database_id)) {
      add('error', `${test ? 'env.staging' : '顶层'} D1 database_id 未填写或仍是占位符`);
    } else {
      add('ok', `${test ? 'env.staging' : '顶层'} D1 database_id 已填写`);
    }
    if (d1.binding !== 'DB') {
      add('warn', 'D1 绑定名不是 DB，Worker 运行时默认读取 DB 绑定');
    }
    if (local && d1.remote === true) {
      add('warn', '本地配置的 D1 绑定仍是 remote: true，会连接远端数据库');
    }
  }
  const d1Id = d1 && !isPlaceholderValue(d1.database_id) ? String(d1.database_id).trim() : '';
  const d1Name = d1 && typeof d1.database_name === 'string' ? d1.database_name.trim() : '';

  if (local) {
    const authConfigured =
      requiredVarCheck('TEAM_DOMAIN', vars) && requiredVarCheck('POLICY_AUD', vars);
    if (!authConfigured) {
      const devVars = readEnvFile(path.join(workersDir, '.dev.vars'));
      if (devVars.ALLOW_INSECURE_DEV === '1') {
        add('ok', '本地配置已设置 ALLOW_INSECURE_DEV=1，可跳过 Access 鉴权');
      } else {
        add(
          'error',
          '本地配置的 TEAM_DOMAIN / POLICY_AUD 为空，需要在 workers/.dev.vars 设置 ALLOW_INSECURE_DEV=1'
        );
      }
    } else {
      const issue = teamDomainIssue(vars.TEAM_DOMAIN);
      if (issue) add('error', issue);
      else add('ok', '本地配置已填写 Access 变量');
    }
    if (isPlaceholderValue(vars.CF_ACCOUNT_ID) || isPlaceholderValue(vars.CF_PAGES_PROJECT)) {
      add('info', '本地配置未填写 CF_ACCOUNT_ID / CF_PAGES_PROJECT，发布功能不可用');
    }
  } else {
    for (const key of ['TEAM_DOMAIN', 'CF_ACCOUNT_ID', 'CF_PAGES_PROJECT']) {
      if (requiredVarCheck(key, vars)) add('ok', `${key} 已填写`);
      else add('error', `${key} 未填写或仍是占位符`);
    }
    if (requiredVarCheck('TEAM_DOMAIN', vars)) {
      const issue = teamDomainIssue(vars.TEAM_DOMAIN);
      if (issue) add('error', issue);
    }
    if (requiredVarCheck('POLICY_AUD', vars)) {
      add('ok', 'POLICY_AUD 已填写');
    } else {
      add('warn', 'POLICY_AUD 尚未填写：Access 应用创建后补齐并重新部署 Worker');
    }
  }

  for (const error of validateRoutes(section.routes)) {
    add('error', error);
  }

  if (test && productionSection) {
    const productionId = productionD1?.database_id;
    const productionDbName =
      typeof productionD1?.database_name === 'string' ? productionD1.database_name.trim() : '';
    const hasProductionName = Boolean(productionName) && !productionName.includes('REPLACE_WITH');
    const hasProductionId = !isPlaceholderValue(productionId);
    let conflict = false;

    if (!hasProductionName) add('warn', '生产配置的 Worker 名未填写，未做隔离比对');
    if (!hasProductionId) add('warn', '生产配置的 D1 未填写，未做隔离比对');

    if (hasProductionName && sectionName === productionName) {
      add('error', 'env.staging 的 Worker 名与生产相同，测试环境不能复用生产 Worker');
      conflict = true;
    }
    if (hasProductionId && d1Id && d1Id === String(productionId).trim()) {
      add('error', 'env.staging 的 D1 与生产是同一个数据库，测试 Worker 会写入生产数据');
      conflict = true;
    }
    if (hasProductionId && d1Name && productionDbName && d1Name === productionDbName) {
      add('error', 'env.staging 的 D1 database_name 与生产相同');
      conflict = true;
    }
    if (hasProductionName && hasProductionId && !conflict) {
      add('ok', 'env.staging 未复用生产 Worker 名与 D1');
    }
  }

  if (!local) {
    const devVarsPath = path.join(workersDir, '.dev.vars');
    if (fs.existsSync(devVarsPath)) add('ok', 'workers/.dev.vars 存在');
    else add('info', 'workers/.dev.vars 不存在，仅本地开发需要');
  }

  for (const name of [
    'wrangler.example.jsonc',
    'wrangler.test.example.jsonc',
    'wrangler.local.example.jsonc',
    '.dev.vars.example',
    'pages.env.example',
  ]) {
    if (fs.existsSync(path.join(workersDir, name))) add('ok', `模板 ${name} 存在`);
    else add('warn', `模板 ${name} 缺失`);
  }

  add('info', 'Worker secret 无法在本地读取，部署前确认已设置：CF_API_TOKEN、BUILD_TOKEN');
  add(
    'info',
    '可用 npm --prefix workers exec -- wrangler secret list 核对（或在 workers/ 下执行 npx wrangler secret list）'
  );

  const pagesProject = isPlaceholderValue(vars.CF_PAGES_PROJECT)
    ? ''
    : String(vars.CF_PAGES_PROJECT).trim();
  const policyAud = isPlaceholderValue(vars.POLICY_AUD) ? '' : String(vars.POLICY_AUD).trim();
  const configAccountId = isPlaceholderValue(vars.CF_ACCOUNT_ID)
    ? ''
    : String(vars.CF_ACCOUNT_ID).trim();
  await checkCloudflareResources({
    add,
    env,
    fetchImpl,
    local,
    d1Id,
    d1Name,
    pagesProject,
    policyAud,
    configAccountId,
  });

  return finish();
}

async function checkCloudflareResources(input: {
  add: (level: DoctorLevel, message: string) => void;
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
  local: boolean;
  d1Id: string;
  d1Name: string;
  pagesProject: string;
  policyAud: string;
  configAccountId: string;
}) {
  const { add, env, fetchImpl, local, d1Id, d1Name, pagesProject, policyAud, configAccountId } =
    input;
  if (local) {
    add('info', '本地配置使用本地 D1，跳过云端资源检查');
    return;
  }

  const token = (env.CLOUDFLARE_API_TOKEN ?? '').trim();
  const envAccountId = (env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
  const accountId = envAccountId || configAccountId;
  if (!token || !accountId) {
    add('info', '未设置 CLOUDFLARE_API_TOKEN 或账号 ID，D1/Pages/Access 资源存在性未检查');
    return;
  }

  if (d1Id) {
    const response = await apiGet(fetchImpl, token, `/accounts/${accountId}/d1/database/${d1Id}`);
    if (response.status === 0) add('warn', 'D1 数据库检查未完成：无法连接 Cloudflare API');
    else if (response.status === 401 || response.status === 403) {
      add('info', 'CLOUDFLARE_API_TOKEN 无 D1 读取权限，D1 存在性未检查');
    } else if (response.status === 404) {
      add('error', 'D1 数据库不存在或 database_id 有误');
    } else if (response.status === 200 && response.success) {
      add('ok', `D1 数据库存在${d1Name ? `（${d1Name}）` : ''}`);
    } else {
      add('warn', `D1 数据库检查未完成（HTTP ${response.status}）`);
    }
  }

  if (pagesProject) {
    const response = await apiGet(
      fetchImpl,
      token,
      `/accounts/${accountId}/pages/projects/${encodeURIComponent(pagesProject)}`
    );
    if (response.status === 0) add('warn', 'Pages 项目检查未完成：无法连接 Cloudflare API');
    else if (response.status === 401 || response.status === 403) {
      add('info', 'CLOUDFLARE_API_TOKEN 无 Pages 读取权限，Pages 项目存在性未检查');
    } else if (response.status === 404) {
      add('warn', 'Pages 项目尚未创建；创建后再运行 backend:doctor');
    } else if (response.status === 200 && response.success) {
      add('ok', `Pages 项目存在（${pagesProject}）`);
    } else {
      add('warn', `Pages 项目检查未完成（HTTP ${response.status}）`);
    }
  }

  if (policyAud) {
    const apps = await apiGet(fetchImpl, token, `/accounts/${accountId}/access/apps`);
    if (apps.status === 0) add('warn', 'Access 应用检查未完成：无法连接 Cloudflare API');
    else if (apps.status === 401 || apps.status === 403) {
      add('info', 'CLOUDFLARE_API_TOKEN 无 Access 权限，Access 应用与 Service Token 未检查');
    } else if (apps.status === 200 && apps.success && Array.isArray(apps.result)) {
      if (apps.result.some((app) => appMatchesAud(app, policyAud))) {
        add('ok', 'Access 应用存在');
      } else {
        add('warn', '未找到 POLICY_AUD 对应的 Access 应用');
      }
    } else {
      add('warn', `Access 应用检查未完成（HTTP ${apps.status}）`);
    }

    const tokens = await apiGet(fetchImpl, token, `/accounts/${accountId}/access/service_tokens`);
    if (tokens.status === 200 && tokens.success && Array.isArray(tokens.result)) {
      if (tokens.result.length > 0)
        add('ok', `发现 ${tokens.result.length} 个 Access Service Token`);
      else add('warn', '未发现 Access Service Token；Pages 构建需要 Service Auth');
    } else if (tokens.status === 401 || tokens.status === 403) {
      add('info', 'CLOUDFLARE_API_TOKEN 无 Service Token 读取权限，未检查');
    } else if (tokens.status !== 0) {
      add('warn', `Access Service Token 检查未完成（HTTP ${tokens.status}）`);
    }
  }
}

async function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');

  if (!ensureSupportedNodeVersion({ repoRoot, log, command: 'npm run backend:doctor' })) {
    process.exitCode = 1;
    return;
  }

  let configName = 'wrangler.jsonc';
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === '--config') {
      const value = process.argv[index + 1];
      if (!value) {
        log.error('--config 需要指定配置文件，例如 --config wrangler.test.jsonc');
        process.exitCode = 1;
        return;
      }
      configName = value;
      index += 1;
    } else if (arg.startsWith('--config=')) {
      configName = arg.slice('--config='.length);
    } else {
      log.error(`未知参数：${arg}`);
      process.exitCode = 1;
      return;
    }
  }

  const result = await runDoctor({ repoRoot, configName });
  if (result.exitCode === 0) {
    log.ok('配置检查通过', { ms: elapsedMs() });
  } else {
    log.error(`检查未通过：${result.checks.filter((item) => item.level === 'error').length} 项`, {
      ms: elapsedMs(),
    });
  }
  process.exitCode = result.exitCode;
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
  runDoctor,
};
