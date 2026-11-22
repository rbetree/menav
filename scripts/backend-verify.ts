import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createLogger, isVerbose, startTimer, type Logger } from '../src/lib/logging/logger.ts';
import {
  getD1Binding,
  getEffectiveConfig,
  getVars,
  isPlaceholderValue,
  isTestConfigName,
  readJsonc,
} from './lib/backend-config.ts';
import { ensureSupportedNodeVersion } from './lib/node-version.ts';

const log = createLogger('backend:verify');

export type VerifyLevel = 'ok' | 'warn' | 'error';
export type VerifyCheck = { level: VerifyLevel; message: string };
export type VerifyResult = { exitCode: number; checks: VerifyCheck[] };

export type PublicationMarker = { publicationId?: string; revision?: number };
export type ContentState = { revision: number; published_revision: number };
export type PublicationRow = {
  job_id: string;
  revision: number;
  status: string;
  deployment_id?: string | null;
};

/**
 * 只读核对 Pages 生产部署、产物版本标记与 D1 发布状态。
 * 回滚会移动 Pages canonical deployment，但 D1 的 published_revision 不会回退；
 * 这里只报告不一致，不自动改写发布状态。
 */
export function comparePublicationState(input: {
  project: { canonical_deployment?: { id?: string; url?: string } };
  marker: PublicationMarker;
  state: ContentState;
  job?: PublicationRow;
}): VerifyCheck[] {
  const checks: VerifyCheck[] = [];
  const canonical = input.project.canonical_deployment;
  if (!canonical?.id || !canonical.url) {
    checks.push({ level: 'error', message: 'Pages 项目没有生产部署，可能尚未发布' });
    return checks;
  }
  checks.push({ level: 'ok', message: `Pages 生产部署：${canonical.id}` });

  const markerRevision = Number(input.marker.revision);
  if (!Number.isFinite(markerRevision)) {
    checks.push({ level: 'error', message: 'menav-build.json 缺少有效的 revision' });
  } else if (markerRevision !== input.state.published_revision) {
    checks.push({
      level: 'error',
      message: `Pages 产物 revision=${markerRevision} 与 D1 published_revision=${input.state.published_revision} 不一致；Pages 可能已回滚或尚未发布`,
    });
  } else {
    checks.push({
      level: 'ok',
      message: `Pages 产物 revision=${markerRevision} 与 D1 published_revision 一致`,
    });
  }

  if (!input.job) {
    checks.push({ level: 'error', message: 'D1 没有发布任务记录' });
    return checks;
  }

  if (typeof input.marker.publicationId === 'string') {
    if (input.marker.publicationId === input.job.job_id) {
      checks.push({ level: 'ok', message: '产物 publicationId 与 D1 发布任务一致' });
    } else {
      checks.push({
        level: 'error',
        message: '产物 publicationId 与 D1 最近发布任务不一致',
      });
    }
  } else {
    checks.push({ level: 'error', message: 'menav-build.json 缺少 publicationId' });
  }

  if (input.job.status === 'published') {
    checks.push({ level: 'ok', message: 'D1 发布任务状态为 published' });
  } else if (input.job.status === 'dispatching' || input.job.status === 'building') {
    checks.push({ level: 'error', message: `D1 发布任务仍在进行中（${input.job.status}）` });
  } else {
    checks.push({ level: 'error', message: `D1 发布任务状态为 ${input.job.status}` });
  }

  if (Number.isFinite(markerRevision) && input.job.revision !== markerRevision) {
    checks.push({
      level: 'error',
      message: `D1 发布任务 revision=${input.job.revision} 与产物 revision=${markerRevision} 不一致`,
    });
  }

  if (!input.job.deployment_id) {
    checks.push({ level: 'error', message: 'D1 发布任务缺少部署 ID' });
  } else if (input.job.deployment_id !== canonical.id) {
    checks.push({
      level: 'error',
      message: `Pages 生产部署不是最近一次发布任务（任务部署 ${input.job.deployment_id}），可能已回滚`,
    });
  }

  return checks;
}

async function fetchPagesProject(
  fetchImpl: typeof fetch,
  token: string,
  accountId: string,
  projectName: string
): Promise<{ canonical_deployment?: { id?: string; url?: string } }> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('无法连接 Cloudflare API');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Cloudflare API 返回无效响应');
  }
  const body =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
  if (!response.ok || body?.success !== true || !body.result) {
    throw new Error(`读取 Pages 项目失败（HTTP ${response.status}）`);
  }
  return body.result as { canonical_deployment?: { id?: string; url?: string } };
}

async function fetchMarker(
  fetchImpl: typeof fetch,
  deploymentUrl: string
): Promise<PublicationMarker> {
  let response: Response;
  try {
    response = await fetchImpl(new URL('/menav-build.json', deploymentUrl), {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('无法访问 Pages 产物版本标记');
  }
  if (!response.ok) throw new Error(`Pages 产物版本标记返回 HTTP ${response.status}`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Pages 产物版本标记不是有效 JSON');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Pages 产物版本标记无效');
  }
  return payload as PublicationMarker;
}

function parseWranglerJson(output: string): Record<string, unknown>[] {
  const trimmed = output.trim();
  const candidates = [trimmed];
  const firstBracket = trimmed.indexOf('[');
  if (firstBracket > 0) candidates.push(trimmed.slice(firstBracket));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object') {
        const rows = (parsed[0] as Record<string, unknown>).results;
        if (Array.isArray(rows)) return rows as Record<string, unknown>[];
      }
    } catch {
      // 尝试下一个候选片段。
    }
  }
  throw new Error('无法解析 wrangler d1 execute 的 JSON 输出');
}

export function buildD1ExecuteArgs(configName: string, sql: string, binding = 'DB'): string[] {
  const envArgs = isTestConfigName(configName) ? ['--env', 'staging'] : [];
  return [
    'd1',
    'execute',
    binding,
    '--remote',
    '-y',
    '--json',
    '--config',
    configName,
    ...envArgs,
    '--command',
    sql,
  ];
}

function defaultD1Query(input: {
  repoRoot: string;
  configName: string;
  sql: string;
  binding: string;
}): Record<string, unknown>[] {
  const workersDir = path.join(input.repoRoot, 'workers');
  const bin = path.join(workersDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!fs.existsSync(bin)) {
    throw new Error('缺少 workers/node_modules/wrangler，先运行 npm --prefix workers ci');
  }
  const result = spawnSync(
    process.execPath,
    [bin, ...buildD1ExecuteArgs(input.configName, input.sql, input.binding)],
    {
      cwd: workersDir,
      encoding: 'utf8',
    }
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'wrangler d1 execute 失败').trim());
  }
  return parseWranglerJson(result.stdout);
}

type VerifyOptions = {
  repoRoot?: string;
  configName?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  d1Query?: (sql: string) => Promise<Record<string, unknown>[]>;
};

export async function runVerify(options: VerifyOptions = {}): Promise<VerifyResult> {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const configName = options.configName ?? 'wrangler.jsonc';
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? log;
  const checks: VerifyCheck[] = [];

  const add = (level: VerifyLevel, message: string) => {
    checks.push({ level, message });
    logger[level](message);
  };
  const finish = (): VerifyResult => ({
    exitCode: checks.some((item) => item.level === 'error') ? 1 : 0,
    checks,
  });

  const workersDir = path.join(repoRoot, 'workers');
  const configPath = path.resolve(workersDir, configName);
  if (!configPath.startsWith(workersDir + path.sep)) {
    add('error', '--config 只能指向 workers/ 目录内的配置文件');
    return finish();
  }
  const displayPath = path.relative(repoRoot, configPath).split(path.sep).join('/');
  if (!fs.existsSync(configPath)) {
    add('error', `缺少 ${displayPath}，先运行 npm run backend:init`);
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

  const section = getEffectiveConfig(config, configName);
  if (!section) {
    add(
      'error',
      `${displayPath} 缺少 ${isTestConfigName(configName) ? 'env.staging' : '配置内容'}`
    );
    return finish();
  }
  const vars = getVars(section);
  const d1 = getD1Binding(section);
  const accountId =
    (env.CLOUDFLARE_ACCOUNT_ID ?? '').trim() ||
    (isPlaceholderValue(vars.CF_ACCOUNT_ID) ? '' : String(vars.CF_ACCOUNT_ID).trim());
  const projectName = isPlaceholderValue(vars.CF_PAGES_PROJECT)
    ? ''
    : String(vars.CF_PAGES_PROJECT).trim();
  const token = (env.CLOUDFLARE_API_TOKEN ?? '').trim() || (env.CF_API_TOKEN ?? '').trim();

  if (!accountId) {
    add('error', '缺少 CF_ACCOUNT_ID 或 CLOUDFLARE_ACCOUNT_ID');
    return finish();
  }
  if (!projectName) {
    add('error', '缺少 CF_PAGES_PROJECT');
    return finish();
  }
  if (!d1 || isPlaceholderValue(d1.database_id)) {
    add('error', '缺少有效的 D1 database_id');
    return finish();
  }
  const d1Binding = typeof d1.binding === 'string' && d1.binding.trim() ? d1.binding.trim() : 'DB';
  if (!token) {
    add('error', '需要设置 CLOUDFLARE_API_TOKEN（Pages Read）或 CF_API_TOKEN');
    return finish();
  }

  let project: { canonical_deployment?: { id?: string; url?: string } };
  let marker: PublicationMarker;
  try {
    project = await fetchPagesProject(fetchImpl, token, accountId, projectName);
    const canonicalUrl = project.canonical_deployment?.url;
    if (!canonicalUrl) {
      add('error', 'Pages 项目没有生产部署，可能尚未发布');
      return finish();
    }
    marker = await fetchMarker(fetchImpl, canonicalUrl);
  } catch (error) {
    add('error', error instanceof Error ? error.message : String(error));
    return finish();
  }

  const d1Query =
    options.d1Query ??
    ((sql: string) =>
      Promise.resolve(defaultD1Query({ repoRoot, configName, sql, binding: d1Binding })));

  let state: ContentState;
  let job: PublicationRow | undefined;
  try {
    const stateRows = await d1Query(
      'SELECT revision, published_revision FROM content_state WHERE id = 1'
    );
    const stateRow = stateRows[0];
    if (!stateRow) throw new Error('D1 content_state 没有记录');
    state = {
      revision: Number(stateRow.revision),
      published_revision: Number(stateRow.published_revision),
    };
    const jobRows = await d1Query(
      'SELECT job_id, revision, status, deployment_id FROM publication WHERE id = 1'
    );
    const jobRow = jobRows[0];
    if (jobRow) {
      job = {
        job_id: String(jobRow.job_id),
        revision: Number(jobRow.revision),
        status: String(jobRow.status),
        deployment_id: jobRow.deployment_id == null ? null : String(jobRow.deployment_id),
      };
    }
  } catch (error) {
    add('error', `读取 D1 发布状态失败：${error instanceof Error ? error.message : String(error)}`);
    return finish();
  }

  for (const check of comparePublicationState({ project, marker, state, job })) {
    add(check.level, check.message);
  }

  if (state.revision !== state.published_revision) {
    logger.info(
      `D1 有未发布修改：revision=${state.revision}，published_revision=${state.published_revision}`
    );
  }

  return finish();
}

async function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');

  if (!ensureSupportedNodeVersion({ repoRoot, log, command: 'npm run backend:verify' })) {
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

  const result = await runVerify({ repoRoot, configName });
  if (result.exitCode === 0) log.ok('发布版本核对通过', { ms: elapsedMs() });
  else {
    log.error(
      `发布版本核对未通过：${result.checks.filter((item) => item.level === 'error').length} 项`,
      { ms: elapsedMs() }
    );
  }
  process.exitCode = result.exitCode;
}

if (require.main === module) {
  main().catch((error) => {
    log.error('核对失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  buildD1ExecuteArgs,
  comparePublicationState,
  parseWranglerJson,
  runVerify,
};
