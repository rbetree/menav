const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCommonFeedUrls, discoverFeedUrl } = require('../scripts/sync-articles');

const SITE = 'http://1.1.1.1/';
const DEADLINE = () => Date.now() + 5_000;
const SETTINGS = {
  fetch: {
    timeoutMs: 1_000,
    maxRedirects: 2,
    userAgent: 'MeNavRSSSync/1.0',
    htmlMaxBytes: 100_000,
    feedMaxBytes: 100_000,
  },
};

function rssResponse() {
  return new Response('<rss version="2.0"></rss>', {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' },
  });
}

async function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('buildCommonFeedUrls：保留站点子目录并覆盖常见 feed 路径', () => {
  const urls = buildCommonFeedUrls('https://www.ruanyifeng.com/blog/');
  assert.ok(urls.includes('https://www.ruanyifeng.com/blog/atom.xml'));
  assert.ok(urls.includes('https://www.ruanyifeng.com/blog/index.xml'));
  assert.equal(new Set(urls).size, urls.length);
});

test('discoverFeedUrl：首页 403 时回退到 index.xml', async () => {
  const feed = await withFetch(
    async (input) => {
      const url = String(input);
      if (url === SITE) return new Response('forbidden', { status: 403 });
      if (url.endsWith('/index.xml')) return rssResponse();
      return new Response('missing', { status: 404 });
    },
    () => discoverFeedUrl(SITE, SETTINGS, DEADLINE())
  );
  assert.equal(feed, SITE + 'index.xml');
});

test('discoverFeedUrl：首页没有 feed 链接时回退到 feed.xml', async () => {
  const feed = await withFetch(
    async (input) => {
      const url = String(input);
      if (url === SITE)
        return new Response('<html><head></head></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      if (url.endsWith('/feed.xml')) return rssResponse();
      return new Response('missing', { status: 404 });
    },
    () => discoverFeedUrl(SITE, SETTINGS, DEADLINE())
  );
  assert.equal(feed, SITE + 'feed.xml');
});

test('discoverFeedUrl：优先使用首页声明的 feed', async () => {
  let fallbackCalled = false;
  const feed = await withFetch(
    async (input) => {
      const url = String(input);
      if (url === SITE)
        return new Response(
          '<html><head><link rel="alternate" type="application/rss+xml" href="/custom.xml"></head></html>',
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      if (url.endsWith('/custom.xml')) return rssResponse();
      if (url.endsWith('/feed.xml')) {
        fallbackCalled = true;
        return rssResponse();
      }
      return new Response('missing', { status: 404 });
    },
    () => discoverFeedUrl(SITE, SETTINGS, DEADLINE())
  );
  assert.equal(feed, SITE + 'custom.xml');
  assert.equal(fallbackCalled, false);
});
