import { Hono } from 'hono';
import { commitEdit, type AdminEnv } from '../db/revision';
import { object, text, sortValue } from '../validation';
import { ApiError } from '../errors';

export const reorderRoutes = new Hono<AdminEnv>();

/** 同一个父级的一组唯一条目；用单条 JSON 更新，所有 sort 和版本一起提交。 */
reorderRoutes.post('/', async (c) => {
  const body = object(await c.req.json());
  const table = body.type;
  if (table !== 'pages' && table !== 'categories' && table !== 'sites')
    throw new ApiError(400, '排序类型无效');
  if (!Array.isArray(body.items) || !body.items.length)
    throw new ApiError(400, 'items 必须是非空数组');
  const items = body.items.map((value) => {
    const item = object(value, '排序条目');
    return { id: text(item.id, 'id'), sort: sortValue(item.sort) };
  });
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    new Set(items.map((item) => item.sort)).size !== items.length
  ) {
    throw new ApiError(400, '排序条目的 id 和 sort 不能重复');
  }
  const json = JSON.stringify(items);
  if (new TextEncoder().encode(json).length > 900_000) throw new ApiError(413, '排序条目过多');
  const parent =
    table === 'categories'
      ? 'json_array(page_id, parent_id)'
      : table === 'sites'
        ? 'category_id'
        : "'pages'";
  const rows = await c.env.DB.prepare(
    'SELECT id, ' +
      parent +
      ' AS parent FROM ' +
      table +
      " WHERE id IN (SELECT json_extract(value, '$.id') FROM json_each(?))"
  )
    .bind(json)
    .all<{ id: string; parent: string }>();
  if (rows.results.length !== items.length) throw new ApiError(400, '部分条目不存在，排序未保存');
  if (new Set(rows.results.map((row) => row.parent)).size !== 1)
    throw new ApiError(400, '只能对同一父级的条目排序');
  await commitEdit(c, [
    c.env.DB.prepare(
      "WITH updates AS (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.sort') AS sort FROM json_each(?)) UPDATE " +
        table +
        ' SET sort = (SELECT sort FROM updates WHERE updates.id = ' +
        table +
        '.id) WHERE id IN (SELECT id FROM updates)'
    ).bind(json),
  ]);
  return c.json({ ok: true, count: items.length });
});
