// 书签导入 + 快照重建(dirty/rebuild)端到端冒烟。复用 smoke.mjs 的 fetch 模式。
// 先起 wrangler dev(本地未配置 TEAM_DOMAIN/POLICY_AUD 时鉴权放行),再运行:
//   npx wrangler dev        (另起)
//   node scripts/smoke-snapshot.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:8787';

async function req(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try {
    json = await r.json();
  } catch {
    json = await r.text();
  }
  return { status: r.status, json };
}

let failures = 0;
function assert(cond, name) {
  if (cond) console.log('  PASS', name);
  else {
    console.log('  FAIL', name);
    failures++;
  }
}

// 简单 Netscape 书签 HTML:书签栏内 1 个子文件夹(Dev) + 1 个根级书签(Example)。
const SAMPLE_HTML = [
  '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
  '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
  '<TITLE>Bookmarks</TITLE>',
  '<H1>Bookmarks</H1>',
  '<DL><p>',
  '  <DT><H3 ADD_DATE="0" LAST_MODIFIED="0" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Bar</H3>',
  '  <DL><p>',
  '    <DT><H3 ADD_DATE="0">Dev</H3>',
  '    <DL><p>',
  '      <DT><A HREF="https://github.com">GitHub</A>',
  '      <DT><A HREF="https://stackoverflow.com">Stack Overflow</A>',
  '    </DL><p>',
  '    <DT><A HREF="https://example.com">Example</A>',
  '  </DL><p>',
  '</DL><p>',
  '</DL>',
].join('\n');

// 0. 可选:先灌注数据(与 smoke.mjs 一致,保证有基础页面;书签导入本身不自依赖它)。
// 若已 seed 过可跳过——这里选择不 seed,让书签导入自证能建页/分类/站点。

// 1. 书签 HTML 导入
const imp = await req('POST', '/api/bookmarks', { html: SAMPLE_HTML });
assert(
  imp.status === 201 && imp.json.ok,
  'POST /api/bookmarks 书签导入成功(建页/分类/站点)',
);
if (!(imp.status === 201 && imp.json.ok)) {
  console.error('  body:', JSON.stringify(imp.json));
}

// 2. GET /api/nav 出现书签分类/站点
const nav = await (await fetch(BASE + '/api/nav')).json();
const bmPage = nav.find((p) => p.template === 'bookmarks');
assert(!!bmPage, 'GET /api/nav 出现 bookmarks 模板页面');
const dev = bmPage?.categories?.find((c) => c.label === 'Dev');
const rootCat = bmPage?.categories?.find((c) => c.label === '根目录书签');
assert(!!dev && dev.sites?.some((s) => s.name === 'GitHub' && s.url === 'https://github.com'), '书签子文件夹 Dev → 分类,含 GitHub 站点');
assert(!!dev && dev.sites?.some((s) => s.icon === 'fab fa-github'), 'GitHub 站点图标按 URL 推断为 github');
assert(!!rootCat && rootCat.sites?.some((s) => s.name === 'Example'), '根级书签生成「根目录书签」分类,含 Example');
const devCatId = dev?.id;

// 3. dirty 置位后手动发布 → 命中排队
const rb1 = await req('POST', '/api/rebuild');
assert(rb1.status === 200 && rb1.json.ok === true && rb1.json.queued === true, 'POST /api/rebuild 返回 {ok:true, queued:true}');

// 4. rebuild 消费 dirty:再次触发 → 无待重建
const rb2 = await req('POST', '/api/rebuild');
assert(rb2.status === 200 && rb2.json.ok === true && rb2.json.queued === false, 'rebuild 消费 dirty 后再次触发 → queued:false');

// 5. 写操作后 dirty 置位 → 再触发 rebuild 仍 queued
const addSite = await req('POST', '/api/sites', {
  categoryId: devCatId,
  name: 'AddLater',
  url: 'https://later.example.com',
});
assert(addSite.status === 201 && addSite.json.ok, 'POST /api/sites 新增站点(触发 dirty)');
const rb3 = await req('POST', '/api/rebuild');
assert(rb3.status === 200 && rb3.json.ok === true && rb3.json.queued === true, '写操作后 dirty 置位 → rebuild 仍 queued:true');

if (failures === 0) console.log('\nSMOKE-SNAPSHOT OK — 全部断言通过');
else console.log(`\nSMOKE-SNAPSHOT FAILED — ${failures} 项未通过`);
process.exit(failures === 0 ? 0 : 1);