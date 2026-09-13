import { Hono } from 'hono';
import type { Env } from '../types';
import { rebuildSnapshot, NotWiredError } from '../rebuild';

/**
 * 手动触发版本快照发布；返回排队情况和当前发布状态。
 */
export const rebuildRoutes = new Hono<{ Bindings: Env }>();

rebuildRoutes.post('/', async (c) => {
  // force=1:内容未变也重建(用于让新代码生效)。
  const force = c.req.query('force') === '1';
  try {
    return c.json(await rebuildSnapshot(c.env.DB, c.env, { force }));
  } catch (e) {
    if (e instanceof NotWiredError) {
      return c.json(
        {
          ok: false,
          queued: false,
          wired: false,
          error: 'not_wired',
          detail: e.message,
        },
        501
      );
    }
    throw e;
  }
});
