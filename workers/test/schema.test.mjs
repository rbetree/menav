import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('旧库并发升级追加字段，保留已有业务数据和版本', async (t) => {
  const source = `
    import { applySchema } from './workers/src/db/schema.ts';
    export default { async fetch(request, env) {
      const db = env.DB;
      if (new URL(request.url).pathname === '/legacy') {
        await db.batch([
          db.prepare('CREATE TABLE pages (id TEXT PRIMARY KEY, label TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, template TEXT)'),
          db.prepare("INSERT INTO pages VALUES ('home', '已有首页', 0, 0, 'page')"),
          db.prepare('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
          db.prepare("INSERT INTO settings VALUES ('dirty', '3')"),
        ]);
      } else {
        await Promise.all([applySchema(db), applySchema(db), applySchema(db)]);
      }
      if (new URL(request.url).pathname === '/legacy') return new Response('ready');
      const [pages, state, settings] = await db.batch([
        db.prepare('SELECT * FROM pages'), db.prepare('SELECT * FROM content_state'), db.prepare('SELECT * FROM settings'),
      ]);
      return Response.json({ pages: pages.results, state: state.results, settings: settings.results });
    } };
  `;
  const { outputFiles } = await build({
    stdin: {
      contents: source,
      resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  const config = convertV4MiniflareOptions({
    modules: true,
    script: outputFiles[0].text,
    d1Databases: ['DB'],
    host: '127.0.0.1',
    port: 0,
    cf: false,
    compatibilityDate: '2026-08-01',
  });
  config.telemetry = { enabled: false };
  const worker = new Miniflare(config);
  t.after(() => worker.dispose());
  const base = String(await worker.ready);
  assert.equal((await worker.dispatchFetch(new URL('/legacy', base))).status, 200);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await worker.dispatchFetch(base);
    assert.equal(result.status, 200, await result.clone().text());
    const { pages, state, settings } = await result.json();
    assert.equal(pages.length, 1);
    assert.equal(pages[0].label, '已有首页');
    assert.equal(pages[0].metadata, '{}');
    assert.equal(pages[0].navigation, '{}');
    assert.equal(state[0].revision, 1);
    assert.equal(state[0].published_revision, 0);
    assert.deepEqual(settings, []);
  }
});
