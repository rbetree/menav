import type { D1Database } from '@cloudflare/workers-types';

/**
 * 快照 dirty 标记(定案 T-2=B:脏标记 + 定时聚合 + 手动发布)。
 *
 * M6 修订:value 由布尔 '0'/'1' 升级为**单调计数器**(未决变更数)。
 * - `markDirty` 自增:每次写成功 +1,避免「读-清」时序中并发写标记被无条件清零吞掉;
 * - `clearDirty` 采用 CAS:`WHERE value = <读取到的值>` 才清零,若期间又有新写入
 *   (值已变化)则不清零,留待下一轮重建,rbuild 不会丢失更新;
 * - `dirtyCount` 读取当前未决变更数。settings 为 `<TEXT, TEXT>` kv 表,故以字符串存数字。
 */
const KEY = 'dirty';

const INCREMENT = `INSERT INTO settings (key, value) VALUES ('${KEY}', '1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`;
const CLEAR_IF = (expected: number) =>
  `UPDATE settings SET value = '0' WHERE key = '${KEY}' AND value = '${String(expected)}'`;

/** 置位:标记有数据变更,公开快照待重建。 */
export async function markDirty(db: D1Database): Promise<void> {
  await db.prepare(INCREMENT).run();
}

/** 读取未决变更计数。未初始化时视为 0(干净)。 */
export async function dirtyCount(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = '${KEY}'`).first<{
    value: string;
  }>();
  const n = Number(row?.value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * CAS 清零:仅当计数仍等于调用方读取到的 expected 时清除(消费的正是该次快照)。
 * 返回是否清除成功;false 表示期间发生了新的写入,重建应下次再触发。
 */
export async function clearDirty(db: D1Database, expected: number): Promise<boolean> {
  const res = await db.prepare(CLEAR_IF(expected)).run();
  return res.meta.changes > 0;
}