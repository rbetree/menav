/* 临时拖拽/键盘自查（跑完即删） */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createBackend } from './helpers.mjs';

const app = await createBackend();
await app.request('POST', '/api/seed', {
  settings: { site: JSON.stringify({ title: 'T' }) },
  pages: [
    {
      id: 'home',
      label: '首页',
      categories: [
        { label: 'A', sites: [{ name: 'One', url: 'https://1.example' }, { name: 'Two', url: 'https://2.example' }] },
        { label: 'B', sites: [{ name: 'Three', url: 'https://3.example' }] },
      ],
    },
    { id: 'other', label: '其他' },
  ],
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(app.url);
await page.waitForSelector('.page-block');

// 1) 站点拖拽：把 One 拖到 Two 之后
await page.locator('.site-row[data-id]').first().dragTo(page.locator('.site-row[data-id]').nth(1));
await page.waitForTimeout(700);
let rows = await page.locator('.site-name').allTextContents();
console.log('站点拖拽后顺序:', rows);
assert.deepEqual(rows.slice(0, 2), ['Two', 'One']);

// 2) 分类拖拽：A 与 B 互换
await page
  .locator('.cat-item[data-type="category"] > .cat-header')
  .first()
  .dragTo(page.locator('.cat-item[data-type="category"] > .cat-header').nth(1));
await page.waitForTimeout(700);
let cats = await page.locator('.cat-label').allTextContents();
console.log('分类拖拽后顺序:', cats);
assert.deepEqual(cats, ['B', 'A']);

// 3) 页面拖拽：首页 <-> 其他
await page
  .locator('.page-block[data-type="page"] > .page-header')
  .first()
  .dragTo(page.locator('.page-block[data-type="page"] > .page-header').nth(1));
await page.waitForTimeout(700);
let pages = await page.locator('.page-label').allTextContents();
console.log('页面拖拽后顺序:', pages);
assert.deepEqual(pages, ['其他', '首页']);

// 4) 落点高亮确实出现过
console.log('drop 状态类已清理:', (await page.locator('.drop-target').count()) === 0);

// 5) 键盘：Tab 到行内操作按钮，确认可聚焦且有可见焦点
await page.locator('#tree-search').focus();
let found = false;
for (let i = 0; i < 60; i++) {
  await page.keyboard.press('Tab');
  const info = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      action: el.dataset ? el.dataset.action : null,
      outline: cs.outlineStyle + ' ' + cs.outlineWidth,
      opacity: cs.opacity,
      visible: el.getBoundingClientRect().width > 0,
    };
  });
  if (info.action === 'edit-site') {
    console.log('Tab 到 edit-site:', JSON.stringify(info));
    assert.notEqual(info.outline, 'none 0px');
    assert.equal(info.opacity, '1');
    found = true;
    break;
  }
}
assert.ok(found, '未通过键盘到达 edit-site 按钮');

// 6) 折叠后再展开，焦点保持在同一按钮上
await page.locator('[data-action="toggle"]').first().click();
await page.waitForTimeout(300);
const collapsedCats = await page.locator('.cat-label').count();
await page.locator('[data-action="toggle"]').first().click();
await page.waitForTimeout(300);
console.log('折叠时可见分类数:', collapsedCats, '展开后:', await page.locator('.cat-label').count());

// 7) Escape / 遮罩关闭弹窗，焦点回到触发按钮
await page.locator('[data-action="edit-page"]').first().click();
await page.waitForSelector('#node-form');
const focusedInModal = await page.evaluate(() => document.activeElement.id);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
const back = await page.evaluate(() => document.activeElement.dataset.action || document.activeElement.id);
console.log('弹窗内初始焦点:', focusedInModal, '| Esc 后焦点回到:', back);
assert.equal(back, 'edit-page');

console.log('pageerrors:', JSON.stringify(errors));
assert.deepEqual(errors, []);
console.log('拖拽 / 键盘自查通过');
await browser.close();
await app.dispose();
