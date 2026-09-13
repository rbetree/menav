import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { ApiError } from '../errors';

export type AdminContext = Context<{ Bindings: Env; Variables: { revision: number } }>;
export type AdminEnv = { Bindings: Env; Variables: { revision: number } };

export function revisionTag(revision: number): string {
  return `"${revision}"`;
}

/** 先记录校验所依据的版本，提交时在同一事务再次检查。 */
export async function editRevision(c: AdminContext, next: Next): Promise<void> {
  const row = await c.env.DB.prepare('SELECT revision FROM content_state WHERE id = 1').first<{
    revision: number;
  }>();
  const revision = row!.revision;
  const expected = c.req.header('if-match');
  if (expected !== undefined && expected !== revisionTag(revision)) {
    throw new ApiError(409, '内容已在其他窗口更新，请刷新后重新编辑', 'revision_conflict');
  }
  c.set('revision', revision);
  await next();
}

/** 校验、业务写入、版本递增共同提交；任何一句失败都会整批回滚。 */
export async function commitEdit(
  c: AdminContext,
  statements: D1PreparedStatement[]
): Promise<void> {
  const revision = c.get('revision');
  await commitRevision(c.env.DB, revision, statements);
  c.header('ETag', revisionTag(revision + 1));
}

export async function commitRevision(
  db: D1Database,
  revision: number,
  statements: D1PreparedStatement[]
): Promise<void> {
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE content_state
        SET revision = CASE WHEN revision = ? THEN revision + 1 ELSE -1 END,
            updated_at = ? WHERE id = 1`
        )
        .bind(revision, new Date().toISOString()),
      ...statements,
    ]);
  } catch (error) {
    // 命名 CHECK 约束将版本争用变成事务失败，杜绝先检查后写入的竞态。
    if (String(error).includes('revision_conflict')) {
      throw new ApiError(409, '内容已在其他窗口更新，请刷新后重新编辑', 'revision_conflict');
    }
    throw error;
  }
}
