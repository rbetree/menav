/* 临时对比度/对齐度量脚本（跑完即删） */
import { chromium } from 'playwright';
import { createBackend } from './helpers.mjs';

const app = await createBackend();
await app.request('POST', '/api/seed', {
  settings: { site: '{}' },
  pages: [
    {
      id: 'home',
      label: '首页',
      hidden: true,
      categories: [
        {
          label: '开发工具',
          foldable: true,
          sites: [{ name: 'A', url: 'https://a.example', external: true }],
          categories: [{ label: '子级', sites: [{ name: 'B', url: 'https://b.example' }] }],
        },
        { label: '待整理空分类' },
      ],
    },
  ],
});

const browser = await chromium.launch({ headless: true });

for (const scheme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  await page.goto(app.url);
  await page.waitForSelector('.page-block');
  const m = await page.evaluate(() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = ({ r, g, b }) =>
      0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
    // 把 top 叠加到 opaque 的 bottom 上,返回实际渲染像素
    const over = (top, bottom) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillStyle = bottom;
      ctx.fillRect(0, 0, 1, 1);
      if (top && top !== 'rgba(0, 0, 0, 0)') {
        ctx.fillStyle = top;
        ctx.fillRect(0, 0, 1, 1);
      }
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    };
    const flatten = (el, stopSel) => {
      const stack = [];
      let n = el;
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg !== 'rgba(0, 0, 0, 0)') stack.unshift(bg);
        if (stopSel && n.matches(stopSel)) break;
        n = n.parentElement;
      }
      let cur = { r: 255, g: 255, b: 255 };
      for (const bg of stack) cur = over(bg, `rgb(${cur.r},${cur.g},${cur.b})`);
      return cur;
    };
    const ratio = (el, stopSel) => {
      const bg = flatten(el, stopSel);
      const fg = over(getComputedStyle(el).color, `rgb(${bg.r},${bg.g},${bg.b})`);
      const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
    };
    const q = (s) => document.querySelector(s);
    const px = (el) => Math.round(el.getBoundingClientRect().x);

    return {
      align: {
        catLabel: [...document.querySelectorAll('.cat-label')].map(
          (el) => el.textContent.trim() + '@' + px(el)
        ),
        caret: [...document.querySelectorAll('.cat-header .collapse-btn')].map(px),
        siteName: [...document.querySelectorAll('.site-name')].map(
          (el) => el.textContent.trim() + '@' + px(el)
        ),
        favicon: [...document.querySelectorAll('.site-favicon')].map(px),
        sideIcon: [...document.querySelectorAll('.side-link .side-icon')].map(px),
      },
      contrast: {
        'page-label / page-header': ratio(q('.page-label'), '.page-block'),
        'node-meta / page-header': ratio(q('.node-meta'), '.page-block'),
        'badge / page-header': ratio(q('.badge'), '.page-block'),
        'badge-hidden / page-header': ratio(q('.badge-hidden'), '.page-block'),
        'badge-foldable / cat-header': ratio(q('.badge-foldable'), '.page-block'),
        'cat-label / panel': ratio(q('.cat-label'), '.page-block'),
        'site-name / panel': ratio(q('.site-name'), '.page-block'),
        'site-url / panel': ratio(q('.site-url'), '.page-block'),
        'empty-hint / panel': ratio(q('.empty-hint'), '.page-block'),
        'action-btn rest / panel': ratio(q('.node-actions .btn'), '.page-block'),
        'side-link / sidebar': ratio(q('.side-link'), '.sidebar'),
        'search-count / bg': ratio(q('.search-count'), 'body'),
        'publish-status / bg': ratio(q('#publish-status'), 'body'),
        'topbar-subtitle / bg': ratio(q('.topbar-subtitle'), 'body'),
        'side-group-title / sidebar': ratio(q('.side-group-title'), '.sidebar'),
      },
    };
  });
  console.log('=== ' + scheme + ' ===');
  console.log(JSON.stringify(m, null, 2));

  // 弹窗内的对比度
  await page.locator('[data-action="settings"]').click();
  await page.waitForSelector('.settings-json');
  await page.locator('[data-action="seed"]').click();
  await page.waitForSelector('#seed-form');
  const modal = await page.evaluate(() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = ({ r, g, b }) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
    const over = (top, bottom) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#fff';
      ctx.fillStyle = bottom;
      ctx.fillRect(0, 0, 1, 1);
      if (top && top !== 'rgba(0, 0, 0, 0)') {
        ctx.fillStyle = top;
        ctx.fillRect(0, 0, 1, 1);
      }
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    };
    const flatten = (el, stopSel) => {
      const stack = [];
      let n = el;
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg !== 'rgba(0, 0, 0, 0)') stack.unshift(bg);
        if (stopSel && n.matches(stopSel)) break;
        n = n.parentElement;
      }
      let cur = { r: 255, g: 255, b: 255 };
      for (const bg of stack) cur = over(bg, `rgb(${cur.r},${cur.g},${cur.b})`);
      return cur;
    };
    const ratio = (el, stop) => {
      const bg = flatten(el, stop);
      const fg = over(getComputedStyle(el).color, `rgb(${bg.r},${bg.g},${bg.b})`);
      const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
    };
    const q = (s) => document.querySelector(s);
    return {
      'modal h2 / panel': ratio(q('#modal-title'), '.modal-panel'),
      'field label / panel': ratio(q('.form-field > label'), '.modal-panel'),
      'field hint / panel': ratio(q('.field-hint'), '.modal-panel'),
      'form-check label / bg': ratio(q('.form-check label'), '.modal-panel'),
      'btn / panel': ratio(q('.form-actions .btn'), '.modal-panel'),
      'primary btn': (() => {
        const b = q('.btn-primary');
        const bg = flatten(b, '.modal-panel');
        const fg = over(getComputedStyle(b).color, `rgb(${bg.r},${bg.g},${bg.b})`);
        const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
      })(),
    };
  });
  console.log('modal contrast:', JSON.stringify(modal, null, 2));
  await page.close();
}

await browser.close();
await app.dispose();
