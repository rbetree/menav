import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { ApiError } from '../errors';

type Cell = string | number | null;
const MAX_CHUNK_BYTES = 900_000;
const MAX_TOTAL_BYTES = 8_000_000;

/** json_each 将一批行绑定为一个参数，单次 batch 覆盖完整导入事务。 */
export function insertRows(
  db: D1Database,
  table: 'pages' | 'categories' | 'sites' | 'settings',
  columns: string[],
  rows: Cell[][]
): D1PreparedStatement[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk: string[] = [];
  let size = 2;
  let total = 0;
  for (const row of rows) {
    const json = JSON.stringify(row);
    const bytes = encoder.encode(json).length + 1;
    total += bytes;
    if (bytes > MAX_CHUNK_BYTES || total > MAX_TOTAL_BYTES) {
      throw new ApiError(413, '导入内容过大：单条记录最多 900 KB，每类数据最多 8 MB');
    }
    if (size + bytes > MAX_CHUNK_BYTES && chunk.length) {
      chunks.push(`[${chunk.join(',')}]`);
      chunk = [];
      size = 2;
    }
    chunk.push(json);
    size += bytes;
  }
  if (chunk.length) chunks.push(`[${chunk.join(',')}]`);
  const values = columns.map((_, index) => `json_extract(value, '$[${index}]')`).join(', ');
  return chunks.map((json) =>
    db
      .prepare(`INSERT INTO ${table} (${columns.join(', ')}) SELECT ${values} FROM json_each(?)`)
      .bind(json)
  );
}
