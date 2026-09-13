import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from './types';
import { loadSnapshot } from './db/site-model';
import { ApiError } from './errors';
import { pagesApi, PagesApiError, type Deployment } from './pages-api';
import { getPageIdIssue } from '../../src/lib/config/page-id';

type Job = {
  job_id: string;
  revision: number;
  status: 'dispatching' | 'building' | 'published' | 'failed';
  deployment_id: string | null;
  deployment_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

function isActive(job: Job): boolean {
  return job.status === 'dispatching' || job.status === 'building';
}

export function publicationWired(env: Env): boolean {
  return Boolean(env.CF_ACCOUNT_ID && env.CF_PAGES_PROJECT && env.CF_API_TOKEN && env.BUILD_TOKEN);
}

function marker(jobId: string): string {
  return 'MeNav snapshot ' + jobId;
}

async function currentJob(db: D1Database): Promise<Job | null> {
  return db.prepare('SELECT * FROM publication WHERE id = 1').first<Job>();
}

async function failJob(db: D1Database, job: Job, error: string): Promise<void> {
  await db
    .prepare(
      "UPDATE publication SET status = 'failed', error = ?, updated_at = ? WHERE id = 1 AND job_id = ? AND status IN ('dispatching', 'building')"
    )
    .bind(error, new Date().toISOString(), job.job_id)
    .run();
}

async function attachDeployment(db: D1Database, job: Job, deployment: Deployment): Promise<void> {
  if (deployment.environment !== 'production' || !deployment.id || !deployment.url) {
    await failJob(db, job, 'Pages 未返回有效的生产部署，请检查项目配置');
    throw new ApiError(502, 'Pages 未返回有效的生产部署');
  }
  await db
    .prepare(
      "UPDATE publication SET deployment_id = ?, deployment_url = ?, status = 'building', error = NULL, updated_at = ? WHERE id = 1 AND job_id = ? AND status = 'dispatching'"
    )
    .bind(deployment.id, deployment.url, new Date().toISOString(), job.job_id)
    .run();
}

/** 网络中断可能发生在 Pages 已受理之后；用持久化任务标识恢复，不盲目重发 POST。 */
async function recoverDeployment(db: D1Database, env: Env, job: Job): Promise<Deployment | null> {
  const deployments = await pagesApi<Deployment[]>(env, '/deployments');
  const deployment = deployments.find(
    (item) => item.deployment_trigger?.metadata?.commit_message === marker(job.job_id)
  );
  if (deployment) {
    await attachDeployment(db, job, deployment);
    return deployment;
  }
  if (Date.now() - Date.parse(job.created_at) > 300_000) {
    await db
      .prepare(
        "UPDATE publication SET status = 'failed', error = ?, updated_at = ? WHERE id = 1 AND job_id = ? AND status = 'dispatching' AND deployment_id IS NULL"
      )
      .bind('未找到 Pages 构建任务，请重试发布', new Date().toISOString(), job.job_id)
      .run();
  }
  return null;
}

/** 只有生产部署和构建产物中的版本标记都匹配，才推进 published_revision。 */
export async function reconcilePublication(db: D1Database, env: Env): Promise<void> {
  const job = await currentJob(db);
  if (!job || !isActive(job) || !publicationWired(env)) return;
  let deployment: Deployment | null;
  if (job.deployment_id) {
    deployment = await pagesApi<Deployment>(
      env,
      '/deployments/' + encodeURIComponent(job.deployment_id)
    );
  } else {
    // 让正在发送的 POST 先完成；构建端需要时仍可主动恢复。
    if (Date.now() - Date.parse(job.created_at) < 30_000) return;
    deployment = await recoverDeployment(db, env, job);
  }
  if (!deployment) return;
  const stage = deployment.latest_stage;
  if (deployment.is_skipped || stage.status === 'failure' || stage.status === 'canceled') {
    await failJob(db, job, 'Pages 构建失败或已取消，请查看构建日志后重试');
    return;
  }
  if (stage.name !== 'deploy' || stage.status !== 'success') return;
  const project = await pagesApi<{ canonical_deployment?: Deployment }>(env);
  if (project.canonical_deployment?.id !== deployment.id) {
    await failJob(db, job, '该部署未成为当前生产版本，请检查 Pages 是否有其他发布任务');
    return;
  }
  let buildMarker: { publicationId?: string; revision?: number };
  try {
    const response = await fetch(new URL('/menav-build.json', deployment.url), {
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('marker');
    buildMarker = await response.json();
  } catch {
    throw new ApiError(502, 'Pages 已部署，暂时无法核对版本标记；下次检查将重试');
  }
  if (buildMarker.publicationId !== job.job_id || buildMarker.revision !== job.revision) {
    await failJob(db, job, '部署产物版本与快照不匹配，未标记为已发布');
    return;
  }
  await db.batch([
    db
      .prepare(
        "UPDATE content_state SET published_revision = MAX(published_revision, ?) WHERE id = 1 AND EXISTS (SELECT 1 FROM publication WHERE job_id = ? AND status IN ('dispatching', 'building'))"
      )
      .bind(job.revision, job.job_id),
    db
      .prepare(
        "UPDATE publication SET status = 'published', error = NULL, updated_at = ? WHERE id = 1 AND job_id = ? AND status IN ('dispatching', 'building')"
      )
      .bind(new Date().toISOString(), job.job_id),
  ]);
}

export async function publishStatus(db: D1Database, env: Env) {
  const [stateResult, jobResult] = await db.batch([
    db.prepare('SELECT revision, published_revision FROM content_state WHERE id = 1'),
    db.prepare('SELECT * FROM publication WHERE id = 1'),
  ]);
  const state = stateResult.results[0] as { revision: number; published_revision: number };
  const job = jobResult.results[0] as Job | undefined;
  return {
    wired: publicationWired(env),
    revision: state.revision,
    publishedRevision: state.published_revision,
    pending: state.revision > state.published_revision,
    job: job
      ? {
          id: job.job_id,
          revision: job.revision,
          status: job.status,
          deploymentId: job.deployment_id,
          url: job.deployment_url,
          error: job.error,
          updatedAt: job.updated_at,
        }
      : null,
  };
}

/** 单个持久化发布槽串行构建；快照在申请该槽时冻结，编辑仍可继续。 */
export async function rebuildSnapshot(db: D1Database, env: Env) {
  if (!publicationWired(env)) throw new NotWiredError();
  await reconcilePublication(db, env);
  const existing = await currentJob(db);
  if (existing && isActive(existing))
    return { ok: true, queued: false, ...(await publishStatus(db, env)) };
  const snapshot = await loadSnapshot(db);
  for (const page of snapshot.pages) {
    const issue = getPageIdIssue(page.id);
    if (issue)
      throw new ApiError(
        409,
        `旧数据的页面标识 ${page.id} 无法构建：${issue}。请先导出备份，修正标识后重新导入。`,
        'invalid_page_id'
      );
  }
  const id = crypto.randomUUID();
  const data = JSON.stringify({ ...snapshot, publicationId: id });
  const bytes = new TextEncoder().encode(data);
  if (bytes.length > 8_000_000) throw new ApiError(413, '快照超过 8 MB，请缩减内嵌资源后重试');
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 700_000) {
    chunks.push(
      decoder.decode(bytes.slice(i, i + 700_000), { stream: i + 700_000 < bytes.length })
    );
  }
  const now = new Date().toISOString();
  const statements = [
    db
      .prepare(
        "INSERT INTO publication (id, job_id, revision, status, created_at, updated_at) SELECT 1, ?, ?, 'dispatching', ?, ? FROM content_state WHERE id = 1 AND revision = ? AND revision > published_revision ON CONFLICT(id) DO UPDATE SET job_id = excluded.job_id, revision = excluded.revision, status = 'dispatching', deployment_id = NULL, deployment_url = NULL, error = NULL, created_at = excluded.created_at, updated_at = excluded.updated_at WHERE publication.status IN ('published', 'failed')"
      )
      .bind(id, snapshot.revision, now, now, snapshot.revision),
    db
      .prepare(
        'DELETE FROM snapshot_chunks WHERE EXISTS (SELECT 1 FROM publication WHERE job_id = ?)'
      )
      .bind(id),
    ...chunks.map((chunk, index) =>
      db
        .prepare(
          'INSERT INTO snapshot_chunks (part, data) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM publication WHERE job_id = ?)'
        )
        .bind(index, chunk, id)
    ),
  ];
  const results = await db.batch(statements);
  if (!results[0].meta.changes)
    return { ok: true, queued: false, ...(await publishStatus(db, env)) };
  const job = (await currentJob(db))!;
  const form = new FormData();
  form.set('commit_message', marker(id));
  try {
    const deployment = await pagesApi<Deployment>(env, '/deployments', form);
    await attachDeployment(db, job, deployment);
  } catch (error) {
    if (error instanceof PagesApiError && error.definitive) await failJob(db, job, error.message);
    else
      await db
        .prepare(
          "UPDATE publication SET error = ?, updated_at = ? WHERE job_id = ? AND status = 'dispatching'"
        )
        .bind('请求结果尚未确认，正在核对 Pages 构建任务', new Date().toISOString(), id)
        .run();
    throw error;
  }
  return { ok: true, queued: true, ...(await publishStatus(db, env)) };
}

/** 构建身份只可读取与 CF_PAGES_URL 对应的不可变快照，无法操作管理 API。 */
export async function buildSnapshot(
  db: D1Database,
  env: Env,
  deploymentUrl: string
): Promise<string> {
  let job = await currentJob(db);
  if (!job || !isActive(job)) throw new ApiError(409, '当前没有待构建的快照');
  if (!job.deployment_id) {
    await recoverDeployment(db, env, job);
    job = (await currentJob(db))!;
  }
  if (job.deployment_url !== deploymentUrl || !isActive(job))
    throw new ApiError(409, '该构建不属于当前发布任务');
  const result = await db.batch([
    db.prepare('SELECT job_id FROM publication WHERE id = 1'),
    db.prepare('SELECT data FROM snapshot_chunks ORDER BY part'),
  ]);
  if ((result[0].results[0] as { job_id: string })?.job_id !== job.job_id)
    throw new ApiError(409, '发布任务已变化，请重新构建');
  return (result[1].results as { data: string }[]).map((row) => row.data).join('');
}

export class NotWiredError extends Error {
  constructor() {
    super('需要配置 Cloudflare 账号、Pages 项目、API Token 和构建读取 Token');
    this.name = 'NotWiredError';
  }
}
