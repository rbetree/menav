import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createBackend } from './helpers.mjs';

const app = await createBackend();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
try {
  const seed = await app.request('POST', '/api/seed', {
    settings: { site: JSON.stringify({ title: '浏览器测试站点' }) },
    pages: [
      {
        id: 'home',
        label: '首页',
        categories: [
          {
            label: 'A',
            sites: [
              {
                name: 'One',
                url: 'https://example.com/1',
                description: '可清空',
                icon: 'fas fa-link',
                faviconUrl: 'https://example.com/favicon.ico',
              },
              { name: 'Two', url: 'https://example.com/2' },
            ],
          },
          { label: 'B' },
        ],
      },
      { id: 'other', label: '其他' },
    ],
  });
  assert.equal(seed.status, 200, JSON.stringify(seed.data));
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(app.url);
  await page.waitForSelector('.page-block');
  const labels = () => page.locator('.page-label').allTextContents();
  assert.deepEqual(await labels(), ['首页', '其他']);
  await page.locator('[data-type="pages"][data-action="move-down"]').first().click();
  await page.waitForFunction(() => document.querySelector('.page-label')?.textContent === '其他');
  await page.locator('[data-type="categories"][data-action="move-down"]').first().click();
  await page.waitForFunction(() => document.querySelector('.cat-label')?.textContent === 'B');
  await page.locator('[data-type="sites"][data-action="move-down"]').first().click();
  await page.waitForFunction(() => document.querySelector('.site-name')?.textContent === 'Two');
  await page.locator('[data-action="edit-site"]').last().click();
  await page.locator('#f-description').fill('');
  await page.locator('#node-form button[type="submit"]').click();
  await page.waitForFunction(
    () => !document.querySelector('#modal-overlay').classList.contains('open')
  );
  const state = await app.request('GET', '/api/state');
  const one = state.data
    .find((p) => p.id === 'home')
    .categories.find((c) => c.label === 'A')
    .sites.find((s) => s.name === 'One');
  assert.equal(one.description, undefined);
  assert.equal(one.faviconUrl, 'https://example.com/favicon.ico');
  assert.equal(one.icon, 'fas fa-link');
  await page.locator('[data-action="data-page"]').click();
  await page.waitForFunction(() => !document.querySelector('#data-page').hidden);
  await page.locator('[data-action="settings"]').click();
  await page.waitForSelector('.settings-json');
  assert.match(await page.locator('.settings-json').textContent(), /浏览器测试站点/);
  await page.locator('[data-action="modal-close"]').last().click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="export-backup"]').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let backupText = '';
  for await (const chunk of stream) backupText += chunk.toString();
  const backup = JSON.parse(backupText);
  assert.equal(backup.pages.length, 2);
  assert.equal(JSON.parse(backup.settings.site).title, '浏览器测试站点');
  await page.locator('[data-action="seed"]').click();
  await page.locator('#seed-file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText),
  });
  await page.waitForFunction(() =>
    document.querySelector('#seed-preview').textContent.includes('2 个页面')
  );
  await page.locator('#seed-form button[type="submit"]').click();
  assert.match(await page.locator('#form-error').textContent(), /确认替换/);
  await page.locator('#f-reset').check();
  await page.locator('#seed-form button[type="submit"]').click();
  await page.waitForFunction(
    () => !document.querySelector('#modal-overlay').classList.contains('open')
  );
  await page.locator('[data-action="show-tree"]').click();
  await page.waitForFunction(() => !document.querySelector('#tree-page').hidden);
  await page.waitForSelector('.page-block');
  assert.deepEqual(await labels(), ['其他', '首页']);
  await page.locator('[data-action="edit-page"]').first().click();
  await page.locator('#f-label').fill('旧窗口输入');
  const concurrent = await app.request('POST', '/api/pages', { label: '另一个窗口新增' });
  assert.equal(concurrent.status, 201);
  await page.locator('#node-form button[type="submit"]').click();
  await page.waitForSelector('#form-error:not([hidden])');
  assert.match(await page.locator('#form-error').textContent(), /其他窗口更新/);
  assert.equal(await page.locator('#f-label').inputValue(), '旧窗口输入');
  await page.locator('.modal-close').click();
  await page.locator('#btn-refresh').click();
  await page.waitForFunction(() => document.querySelectorAll('.page-block').length === 3);
  await page.locator('#btn-publish').click();
  await page.waitForFunction(() =>
    document.querySelector('#publish-status').textContent.includes('尚未配置')
  );
  assert.deepEqual(errors, []);

  await page.locator('[data-action="open-site-config"]').click();
  await page.waitForFunction(() => !document.querySelector('#site-config-page').hidden);
  await page.waitForSelector('#site-config-form');
  assert.match(await page.locator('#site-config-page h1').textContent(), /站点设置/);
  await page.locator('[data-action="cancel-site-config"]').click();
  await page.waitForFunction(() => !document.querySelector('#tree-page').hidden);

  // 真实服务器 HTML 500 不应误报会话失效。
  await page.route('**/api/state', (route) =>
    route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>server error</h1>' })
  );
  await page.locator('#btn-refresh').click();
  await page.waitForSelector('#status.is-error');
  assert.match(await page.locator('#status').textContent(), /500/);
  assert.doesNotMatch(await page.locator('#status').textContent(), /需登录/);
  console.log('管理台浏览器回归通过：排序、清空字段、配置查看、备份恢复、并发冲突和错误提示');
} finally {
  await browser.close();
  await app.dispose();
}
