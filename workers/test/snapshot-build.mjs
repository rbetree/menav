import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { createBackend } from './helpers.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
require('../../scripts/register-ts.cjs');
const { loadConfig } = require('../../src/lib/config/index.ts');
const { createSeed } = require('../../scripts/lib/seed.ts');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-build-contract-'));
const deploymentUrl = 'https://snapshot-contract.menav-test.pages.dev';
let deployment;
const app = await createBackend({
  bindings: {
    CF_ACCOUNT_ID: 'test-account',
    CF_PAGES_PROJECT: 'menav-test',
    CF_API_TOKEN: 'test-api-token',
    BUILD_TOKEN: 'test-build-token',
  },
  outboundService: async (request) => {
    assert.equal(
      request.url,
      'https://api.cloudflare.com/client/v4/accounts/test-account/pages/projects/menav-test/deployments'
    );
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('authorization'), 'Bearer test-api-token');
    assert.equal(deployment, undefined, '同一内容版本只能创建一次部署');
    const form = await request.formData();
    deployment = {
      id: 'snapshot-contract',
      url: deploymentUrl,
      environment: 'production',
      deployment_trigger: { metadata: { commit_message: form.get('commit_message') } },
      latest_stage: { name: 'build', status: 'active' },
    };
    return Response.json({ success: true, result: deployment });
  },
});
let browser;

function run(script, env, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-r', './scripts/register-ts.cjs', script, ...args], {
      cwd: root,
      env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(script + ' failed: ' + code))
    );
  });
}

try {
  process.chdir(root);
  const config = loadConfig();
  const seed = createSeed(config);
  const result = await app.request('POST', '/api/seed', seed);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const snapshot = await app.request('GET', '/api/export');
  assert.equal(snapshot.status, 200);
  const snapshotFile = path.join(temporary, 'snapshot.json');
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshot.data));
  await run('./scripts/build.ts', { ...process.env, MENAV_SNAPSHOT_FILE: '' });
  const staticHtml = path.join(temporary, 'static.html');
  fs.copyFileSync(path.join(root, 'dist/index.html'), staticHtml);
  const staticIndex = JSON.parse(
    fs.readFileSync(path.join(root, 'dist/search-index.json'), 'utf8')
  );
  await run(
    './scripts/build-snapshot.ts',
    {
      ...process.env,
      MENAV_SNAPSHOT_FILE: snapshotFile,
      MENAV_CONFIG_DIR: path.join(temporary, 'no-yaml'),
    },
    ['--offline']
  );
  const dynamicHtml = path.join(temporary, 'dynamic.html');
  fs.copyFileSync(path.join(root, 'dist/index.html'), dynamicHtml);
  assert.ok(staticIndex.items.length > 0);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, 'dist/search-index.json'), 'utf8')).items,
    staticIndex.items
  );
  const buildMarker = JSON.parse(fs.readFileSync(path.join(root, 'dist/menav-build.json'), 'utf8'));
  assert.equal(buildMarker.revision, snapshot.data.revision);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  const page = await browser.newPage({ javaScriptEnabled: false });
  const dom = async (file) => {
    await page.goto(pathToFileURL(file).href);
    return page.evaluate(() => ({
      navigation: [...document.querySelectorAll('.nav-item[data-page]')].map((n) => [
        n.getAttribute('data-page'),
        n.textContent.trim(),
      ]),
      cards: [...document.querySelectorAll('.site-card')].map((n) => [
        n.getAttribute('href'),
        n.textContent.replace(/\s+/g, ' ').trim(),
      ]),
      categories: [...document.querySelectorAll('[data-type="category"], [data-type="group"]')].map(
        (n) => [
          n.getAttribute('data-name'),
          n.getAttribute('data-level'),
          n.getAttribute('data-icon'),
        ]
      ),
      toggles: [...document.querySelectorAll('[data-toggle]')].map((n) =>
        n.getAttribute('data-toggle')
      ),
      content: [...document.querySelectorAll('.markdown-content, .content-page')].map(
        (n) => n.innerHTML
      ),
      styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((n) =>
        n.getAttribute('href')
      ),
    }));
  };
  const staticDom = await dom(staticHtml);
  assert.ok(
    staticDom.navigation.length &&
      staticDom.cards.length &&
      staticDom.categories.length &&
      staticDom.content.length &&
      staticDom.styles.length
  );
  assert.deepEqual(await dom(dynamicHtml), staticDom);
  console.log(
    '完整快照构建通过：YAML → 隔离 D1 → JSON → Astro；导航、卡片、分类层级、正文、样式及搜索一致'
  );

  const icon = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7"/></svg>'
  ).toString('base64');
  const onlineSeed = await app.request('POST', '/api/seed?reset=1', {
    settings: {
      site: JSON.stringify({
        favicon: 'snapshot-only.svg',
        github: { username: 'tester' },
        rss: { fetch: { maxRetries: 0 } },
      }),
      assets: JSON.stringify({ 'snapshot-only.svg': icon }),
      externalData: JSON.stringify({
        articles: {
          articles: {
            items: [
              {
                name: '成功来源旧文',
                url: 'https://a.example/old',
                sourceUrl: 'https://a.example',
              },
              {
                name: '失败来源旧文',
                url: 'https://b.example/old',
                sourceUrl: 'https://b.example',
              },
            ],
          },
        },
        projects: {
          projects: {
            repoMetaMap: {
              'https://github.com/b/two': { language: 'JavaScript', stars: 7, forks: 1 },
            },
          },
        },
      }),
    },
    pages: [
      {
        id: 'articles',
        label: '文章',
        categories: [
          {
            label: '来源',
            sites: [
              { name: '甲站', url: 'https://a.example' },
              { name: '乙站', url: 'https://b.example' },
            ],
          },
        ],
      },
      {
        id: 'projects',
        label: '项目',
        hidden: true,
        categories: [
          {
            label: '项目分类',
            foldable: false,
            sites: [
              { name: '项目甲', url: 'https://github.com/a/one' },
              { name: '项目乙', url: 'https://github.com/b/two' },
            ],
            categories: [
              {
                label: '子分类',
                kind: 'subcategories',
                sites: [{ name: '子分类链接', url: 'https://sub.example' }],
              },
              {
                label: '分组',
                kind: 'groups',
                sites: [{ name: '分组链接', url: 'https://group.example' }],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(onlineSeed.status, 200, JSON.stringify(onlineSeed.data));
  const beforeSort = (await app.request('GET', '/api/state')).data[1].categories[0];
  for (const [type, nodes] of [
    ['categories', beforeSort.categories],
    ['sites', beforeSort.sites],
  ]) {
    const reorder = await app.request('POST', '/api/reorder', {
      type,
      items: nodes.toReversed().map((node, sort) => ({ id: node.id, sort })),
    });
    assert.equal(reorder.status, 200);
  }
  const beforePublish = await app.request('GET', '/api/export');
  const publication = await app.request('POST', '/api/rebuild');
  assert.equal(publication.status, 200, JSON.stringify(publication.data));
  assert.equal(publication.data.queued, true);
  assert.equal(publication.data.job.revision, beforePublish.data.revision);
  // 冻结后继续编辑，真实 HTTP 构建入口必须仍领取本次发布的旧版本。
  assert.equal(
    (await app.request('POST', '/api/pages', { label: '构建期间的新编辑' })).status,
    201
  );
  const networkLog = path.join(temporary, 'requests.jsonl');
  const fixture = fileURLToPath(new URL('./fixtures/external-refresh.cjs', import.meta.url));
  await run('./scripts/build-snapshot.ts', {
    ...process.env,
    MENAV_SNAPSHOT_FILE: '',
    MENAV_CONFIG_DIR: path.join(temporary, 'no-yaml'),
    MENAV_BACKEND_URL: app.url,
    MENAV_BUILD_TOKEN: 'test-build-token',
    CF_PAGES: '1',
    CF_PAGES_URL: deploymentUrl,
    MENAV_REFRESH_TEST_LOG: networkLog,
    NODE_OPTIONS: '--require ' + JSON.stringify(fixture),
    RSS_ENABLED: 'true',
    PROJECTS_ENABLED: 'true',
    HEATMAP_ENABLED: 'true',
    RSS_CACHE_DIR: path.join(temporary, 'forbidden-cache'),
    PROJECTS_CACHE_DIR: path.join(temporary, 'forbidden-cache'),
  });
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const publishedMarker = JSON.parse(
    fs.readFileSync(path.join(root, 'dist/menav-build.json'), 'utf8')
  );
  assert.deepEqual(publishedMarker, {
    publicationId: publication.data.job.id,
    revision: beforePublish.data.revision,
  });
  assert.doesNotMatch(html, /构建期间的新编辑/);
  assert.match(html, /刷新后的文章/);
  assert.match(html, /失败来源旧文/);
  assert.doesNotMatch(html, /成功来源旧文/);
  assert.match(html, /refresh-heatmap/);
  assert.equal(fs.readFileSync(path.join(root, 'dist/snapshot-only.svg')).toString('base64'), icon);
  assert.equal(fs.existsSync(path.join(root, 'dist/.menav-snapshot-assets.json')), false);
  const requests = fs.readFileSync(networkLog, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(requests.some((r) => r.url === 'https://a.example/feed'));
  assert.ok(requests.some((r) => r.url === 'https://api.github.com/repos/a/one'));
  assert.ok(requests.every((r) => r.cache && !fs.existsSync(r.cache)));
  assert.equal(fs.existsSync(path.join(temporary, 'forbidden-cache')), false);
  const freshIndex = JSON.parse(
    fs.readFileSync(path.join(root, 'dist/search-index.json'), 'utf8')
  ).items;
  assert.ok(freshIndex.some((card) => card.pageId === 'projects'));
  await page.goto(pathToFileURL(path.join(root, 'dist/index.html')).href);
  const rendered = await page.evaluate(() => ({
    navigation: [...document.querySelectorAll('.nav-item[data-page]')].map((n) =>
      n.getAttribute('data-page')
    ),
    order: [
      ...document.querySelectorAll(
        '#projects [data-type="category"], #projects [data-type="group"]'
      ),
    ].map((n) => n.getAttribute('data-name')),
    foldable: document.querySelector('#projects .category-header').hasAttribute('data-toggle'),
    projects: [...document.querySelectorAll('#projects .site-card')].map((n) => [
      n.getAttribute('href'),
      n.textContent,
    ]),
  }));
  assert.deepEqual(rendered.navigation, ['articles']);
  assert.deepEqual(rendered.order, ['项目分类', '分组', '子分类']);
  assert.equal(rendered.foldable, false);
  assert.deepEqual(
    rendered.projects.slice(-2).map(([url]) => url),
    ['https://github.com/b/two', 'https://github.com/a/one']
  );
  assert.match(rendered.projects.at(-1)[1], /42/);
  assert.match(rendered.projects.at(-2)[1], /7/);
  // 恢复静态构建，验证动态资源不会残留到下一次静态产物。
  await run('./scripts/build.ts', { ...process.env, MENAV_SNAPSHOT_FILE: '' });
  assert.equal(fs.existsSync(path.join(root, 'dist/snapshot-only.svg')), false);
  assert.equal(fs.existsSync(path.join(root, 'public/snapshot-only.svg')), false);
  console.log(
    '构建刷新通过：HTTP 领取冻结版本、真实同步脚本、部分失败回退、缓存隔离、隐藏页、排序、折叠开关与图片清理'
  );
} finally {
  await browser?.close();
  await app.dispose();
  fs.rmSync(temporary, { recursive: true, force: true });
}
