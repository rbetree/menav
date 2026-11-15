import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createBackend, BOOKMARK_HTML } from './helpers.mjs';

let parserModule;
function loadParser() {
  parserModule ??= build({
    stdin: {
      contents:
        "export { parseBookmarks } from './src/lib/bookmarks/parser-core.ts';" +
        "export { workerParserLogger } from './workers/src/bookmarks/import.ts';",
      resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  }).then(async ({ outputFiles }) => {
    const code = outputFiles[0].text;
    return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  });
  return parserModule;
}

const NESTED_BOOKMARK_HTML =
  '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>' +
  '<DT><H3 PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3><DL><p>' +
  '<DT><H3>第一层</H3><DL><p>' +
  '<DT><H3>第二层</H3><DL><p>' +
  '<DT><H3>第三层</H3><DL><p>' +
  '<DT><H3>第四层</H3><DL><p>' +
  '<DT><H3>第五层</H3><DL><p>' +
  '<DT><A HREF="https://example.com">Example</A>' +
  '</DL><p></DL><p></DL><p></DL><p></DL><p></DL><p></DL><p>';

test('有效书签导入可建立页面、分类和站点，重复导入不累积', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  for (let i = 0; i < 2; i++) {
    const result = await app.request('POST', '/api/bookmarks', { html: BOOKMARK_HTML });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    assert.equal(result.data.sites, 1);
    assert.equal(result.headers.get('etag'), `"${i + 1}"`);
    const state = await app.request('GET', '/api/state');
    assert.equal(state.data.length, 1);
    assert.equal(state.data[0].categories.length, 1);
    assert.equal(state.data[0].categories[0].sites[0].name, 'Example');
  }
});

test('空文件夹和仅含不安全链接的导入保留原书签与版本', async (t) => {
  const app = await createBackend();
  t.after(() => app.dispose());
  await app.request('POST', '/api/bookmarks', { html: BOOKMARK_HTML });
  const before = await app.request('GET', '/api/state');
  for (const html of [
    '<DL><DT><H3>空文件夹</H3><DL></DL></DL>',
    '<DL><DT><H3>危险链接</H3><DL><DT><A HREF="javascript:alert(1)">Bad</A></DL></DL>',
  ]) {
    const result = await app.request('POST', '/api/bookmarks', { html });
    assert.equal(result.status, 422);
    const after = await app.request('GET', '/api/state');
    assert.deepEqual(after.data, before.data);
    assert.equal(after.headers.get('etag'), before.headers.get('etag'));
  }
});

test('Worker 导入日志不拼接截断文件夹名，CLI 默认日志保留原名', async () => {
  const { parseBookmarks, workerParserLogger } = await loadParser();
  const captureWarn = () => {
    const messages = [];
    const original = console.warn;
    console.warn = (...args) => messages.push(args.map(String).join(' '));
    return { messages, restore: () => (console.warn = original) };
  };
  const cli = captureWarn();
  parseBookmarks(NESTED_BOOKMARK_HTML);
  cli.restore();
  assert.ok(
    cli.messages.some((message) => message.includes('第四层')),
    'CLI 默认日志应保留文件夹名'
  );
  const worker = captureWarn();
  parseBookmarks(NESTED_BOOKMARK_HTML, workerParserLogger);
  worker.restore();
  assert.ok(worker.messages.some((message) => message.includes('超过 4 层')));
  assert.ok(worker.messages.every((message) => !message.includes('第四层')));
});
