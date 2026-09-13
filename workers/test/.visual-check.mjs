/* 临时视觉自查脚本（跑完即删） */
import { chromium } from 'playwright';
import { createBackend } from './helpers.mjs';

const app = await createBackend();
await app.request('POST', '/api/seed', {
  settings: { site: JSON.stringify({ title: 'MeNav', author: 'rbetree' }) },
  pages: [
    {
      id: 'home',
      label: '首页',
      categories: [
        {
          label: '开发工具',
          foldable: true,
          sites: [
            {
              name: 'GitHub',
              url: 'https://github.com/rbetree/menav',
              faviconUrl: 'https://github.com/favicon.ico',
              external: true,
            },
            { name: 'MDN Web Docs', url: 'https://developer.mozilla.org/zh-CN/docs/Web' },
            { name: 'Cloudflare Dashboard', url: 'https://dash.cloudflare.com/', external: true },
          ],
          categories: [
            {
              label: '编辑器',
              sites: [
                { name: 'VS Code', url: 'https://code.visualstudio.com', external: true },
                { name: 'Neovim', url: 'https://neovim.io' },
              ],
              categories: [
                {
                  label: '配置集合',
                  sites: [{ name: 'LazyVim', url: 'https://www.lazyvim.org' }],
                },
              ],
            },
          ],
        },
        {
          label: '设计参考',
          foldable: true,
          sites: [
            { name: 'Linear', url: 'https://linear.app', external: true },
            { name: 'Stripe Dashboard', url: 'https://dashboard.stripe.com' },
            { name: 'Vercel', url: 'https://vercel.com' },
            { name: 'Refactoring UI', url: 'https://www.refactoringui.com' },
          ],
        },
        { label: '待整理（空分类）' },
      ],
    },
    {
      id: 'bookmarks',
      label: '书签',
      categories: [
        {
          label: '阅读',
          sites: [
            { name: 'Hacker News', url: 'https://news.ycombinator.com' },
            { name: '阮一峰的网络日志', url: 'https://www.ruanyifeng.com/blog/' },
          ],
        },
      ],
    },
    { id: 'drafts', label: '草稿（导航中隐藏）', hidden: true },
  ],
});

const browser = await chromium.launch({ headless: true });
const errors = [];
const out = 'D:/CODE/menav/.visual';
const fs = await import('node:fs');
fs.mkdirSync(out, { recursive: true });

async function shoot(name, width, height, prep, scheme = 'dark') {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(app.url);
  await page.waitForSelector('.page-block');
  if (prep) await prep(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  return page;
}

// 1. 深色 · 桌面
const desktop = await shoot('01-dark-desktop', 1440, 940);
// 2. 浅色 · 桌面
await shoot(
  '02-light-desktop',
  1440,
  940,
  async (p) => {
    await p.evaluate(() => document.documentElement.classList.add('light-theme'));
  },
  'light'
);
// 3. 弹窗（编辑站点）
await shoot('03-dark-modal', 1440, 940, async (p) => {
  await p.locator('[data-action="edit-site"]').first().click();
  await p.waitForSelector('#node-form');
});
// 4. 搜索命中
await shoot('04-dark-search', 1440, 940, async (p) => {
  await p.locator('#tree-search').fill('vercel');
  await p.waitForTimeout(200);
});
// 5. 搜索无结果（空态）
await shoot('05-dark-empty', 1440, 940, async (p) => {
  await p.locator('#tree-search').fill('zzzz-not-found');
  await p.waitForTimeout(200);
});
// 6. 数据与备份弹窗
await shoot('06-dark-settings', 1440, 940, async (p) => {
  await p.locator('[data-action="settings"]').click();
  await p.waitForSelector('.settings-json');
});
// 7. 移动端
await shoot('07-dark-mobile', 390, 844);
// 8. 收集契约与对比度信息
const report = await desktop.evaluate(() => {
  const ids = [
    'tree-root',
    'publish-status',
    'status',
    'toast-container',
    'modal-overlay',
    'modal-title',
    'modal-content',
    'btn-refresh',
    'btn-import',
    'btn-publish',
    'tree-search',
    'tree-search-clear',
    'tree-search-count',
    'theme-toggle',
  ];
  const actions = [
    'refresh',
    'publish',
    'import',
    'open-import',
    'settings',
    'open-settings',
    'export',
    'export-backup',
    'seed',
    'add-page',
    'edit-page',
    'del-page',
    'add-cat',
    'add-subcat',
    'edit-cat',
    'del-cat',
    'add-site',
    'edit-site',
    'del-site',
    'move-up',
    'move-down',
    'toggle',
    'modal-close',
  ];
  const classes = [
    'page-block',
    'page-header',
    'page-label',
    'cat-list',
    'cat-item',
    'cat-header',
    'cat-label',
    'site-list',
    'site-row',
    'site-info',
    'site-name',
    'site-url',
    'site-favicon',
    'node-actions',
    'badge',
    'badge-hidden',
    'badge-foldable',
    'collapse-btn',
    'collapse-caret',
    'empty-hint',
    'btn',
    'btn-primary',
    'btn-danger',
    'btn-sm',
    'btn-icon',
    'status-notice',
    'status-icon',
    'status-text',
    'form-field',
    'form-check',
    'field-hint',
    'form-error',
    'form-actions',
    'settings-json',
    'import-drop',
    'toast',
    'toast-container',
    'modal-overlay',
    'modal-panel',
    'modal-header',
    'modal-body',
    'modal-close',
  ];
  const missingIds = ids.filter((i) => !document.getElementById(i));
  const missingActions = actions.filter(
    (a) => !document.querySelector(`[data-action="${a}"]`) && !a.startsWith('export')
  );
  const missingClasses = classes.filter((c) => !document.querySelector('.' + c));
  const st = getComputedStyle(document.getElementById('status'));
  const ps = getComputedStyle(document.getElementById('publish-status'));
  return {
    missingIds,
    missingActions,
    missingClasses,
    statusRole: document.getElementById('status').getAttribute('role'),
    statusLive: document.getElementById('status').getAttribute('aria-live'),
    psRole: document.getElementById('publish-status').getAttribute('role'),
    psLive: document.getElementById('publish-status').getAttribute('aria-live'),
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    sideNavActive: document.querySelectorAll('.side-link.is-active').length,
    statusDisplay: st.display,
    psDisplay: ps.display,
  };
});
console.log(JSON.stringify(report, null, 2));

// 9. 交互：折叠 / 主题 / 搜索清空
await desktop.locator('[data-action="toggle"]').first().click();
await desktop.waitForTimeout(300);
await desktop.screenshot({ path: `${out}/08-dark-collapsed.png` });
await desktop.locator('#theme-toggle').click();
await desktop.waitForTimeout(300);
await desktop.screenshot({ path: `${out}/09-light-collapsed.png` });
const themeAfter = await desktop.evaluate(() =>
  document.documentElement.classList.contains('light-theme')
);
console.log('theme toggled to light:', themeAfter);
console.log('theme toggle icon present:', await desktop.locator('#theme-toggle svg').count());

// 10. 提示条（浅色）
await desktop.locator('[data-action="publish"]').first().click();
await desktop.waitForTimeout(600);
await desktop.screenshot({ path: `${out}/10-light-toast.png` });

console.log('pageerrors:', JSON.stringify(errors));
await browser.close();
await app.dispose();
