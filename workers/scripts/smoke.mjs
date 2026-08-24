// 最小闭环端到端冒烟测试。先起 wrangler dev 并 POST /api/seed,再运行本脚本:
//   npx wrangler dev        (另起)
//   node -e "... seed ..."  (或手动 seed)
//   node scripts/smoke.mjs  (本脚本;认证在本地 dev 未配置时放行)
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

// 1. 公开读取
const nav = await (await fetch(BASE + '/api/nav')).json();
const page = nav[0];
const cat0 = page.categories[0];
assert(Array.isArray(nav) && nav.length > 0, 'GET /api/nav 返回页面');
assert(page.id && page.categories.length > 0, '页面含嵌套分类');
assert(cat0.sites && cat0.sites.length > 0, '分类含站点');

// 2. 新增站点
const addSite = await req('POST', '/api/sites', {
  categoryId: cat0.id,
  name: 'TestSite',
  url: 'https://example.com',
  description: 'd',
});
assert(addSite.status === 201 && addSite.json.ok, 'POST /api/sites 新增站点 201');
const siteId = addSite.json.data.id;

// 3. 修改站点
const putSite = await req('PUT', '/api/sites/' + siteId, { name: 'TestSite改' });
assert(putSite.status === 200 && putSite.json.ok, 'PUT /api/sites/:id 改名');

// 4. 新增子分类(层级维护 R6)
const addCat = await req('POST', '/api/categories', {
  pageId: page.id,
  parentId: cat0.id,
  label: '子分组',
});
assert(addCat.status === 201 && addCat.json.ok, 'POST /api/categories 新增子分类');
const childCatId = addCat.json.data.id;

// 5. 排序(reorder)
const s1 = cat0.sites[0];
const reorder = await req('POST', '/api/reorder', {
  type: 'sites',
  items: [
    { id: s1.id, sort: 99 },
    { id: siteId, sort: 1 },
  ],
});
assert(reorder.status === 200 && reorder.json.ok, 'POST /api/reorder 排序');

// 6. 非空分类删除无 force → 409(T-5=B)
const delNoForce = await req('DELETE', '/api/categories/' + cat0.id);
assert(delNoForce.status === 409, 'DELETE 非空分类(无 force) → 409 拒绝');

// 7. 空分类删除 → 200
const delChild = await req('DELETE', '/api/categories/' + childCatId);
assert(delChild.status === 200 && delChild.json.ok, 'DELETE 空子分类 → 200');

// 8. 循环防护:把 cat0 设为其子孙的父
const addChild2 = await req('POST', '/api/categories', {
  pageId: page.id,
  parentId: cat0.id,
  label: '循环子',
});
const child2 = addChild2.json.data.id;
const cycle = await req('PUT', '/api/categories/' + cat0.id, { parentId: child2 });
assert(cycle.status === 400, 'PUT parentId 形成循环 → 400');

// 9. 级联删除:给 child2 加一个站点,再 force 删
const siteInChild = await req('POST', '/api/sites', {
  categoryId: child2,
  name: '子站',
  url: 'https://child.example.com',
});
assert(siteInChild.status === 201, '在子分类新增站点 201');
const delCascade = await req('DELETE', '/api/categories/' + child2 + '?force=1');
assert(delCascade.status === 200 && delCascade.json.ok, 'DELETE 非空分类 ?force=1 级联删除');

// 10. 最终读取确认(新增站点是否可在线读到)
const navAfter = await (await fetch(BASE + '/api/nav')).json();
const stillThere = navAfter[0].categories[0].sites.some((s) => s.id === siteId);
assert(stillThere, 'GET /api/nav 可读到改动后数据');

if (failures === 0) console.log('\nSMOKE OK — 全部断言通过');
else console.log(`\nSMOKE FAILED — ${failures} 项未通过`);
process.exit(failures === 0 ? 0 : 1);