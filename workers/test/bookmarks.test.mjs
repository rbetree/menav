import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackend, BOOKMARK_HTML } from './helpers.mjs';

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
