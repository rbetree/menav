const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  mergeArticlesWithPrevious,
  shouldWriteSourceCache,
  writeSourceCacheIfUsable,
} = require('../scripts/sync-articles');
const { mergeRepoMetas } = require('../scripts/sync-projects');
const { tryLoadArticlesFeedCache } = require('../src/lib/cache/articles');
const { normalizeUrlKey } = require('../src/lib/site-data/sites');

function article(title: string, url: string, sourceUrl: string, publishedAt: string) {
  return {
    title,
    url,
    summary: '',
    publishedAt,
    source: title,
    sourceUrl,
    icon: 'fas fa-pen',
  };
}

test('articles 合并：成功来源覆盖，失败来源回退，已删除来源丢弃', () => {
  const previous = [
    article('old-a', 'https://a.example/old', 'https://a.example', '2025-01-01T00:00:00.000Z'),
    article('old-b', 'https://b.example/old', 'https://b.example', '2025-01-02T00:00:00.000Z'),
    article('gone', 'https://gone.example/old', 'https://gone.example', '2025-01-03T00:00:00.000Z'),
  ];
  const current = [
    article('new-a', 'https://a.example/new', 'https://a.example', '2025-01-04T00:00:00.000Z'),
  ];

  const merged = mergeArticlesWithPrevious(
    current,
    ['https://a.example', 'https://b.example'],
    ['https://a.example'],
    previous
  );

  assert.deepEqual(
    merged.map((item: { title: string }) => item.title),
    ['new-a', 'old-b']
  );
});

test('articles 合并：成功空 feed 清空该来源，不回退旧文章', () => {
  const previous = [
    article('old-a', 'https://a.example/old', 'https://a.example', '2025-01-01T00:00:00.000Z'),
  ];
  const merged = mergeArticlesWithPrevious(
    [],
    ['https://a.example'],
    ['https://a.example'],
    previous
  );
  assert.deepEqual(merged, []);
});

test('缓存写入策略：全部来源失败时不覆盖旧缓存', () => {
  assert.equal(shouldWriteSourceCache(3, 0), false);
  assert.equal(shouldWriteSourceCache(3, 1), true);
  assert.equal(shouldWriteSourceCache(0, 0), true);
});

test('缓存写入：全部失败保留旧文件，部分成功才覆盖', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-sync-write-'));
  const cachePath = path.join(dir, 'articles.feed-cache.json');
  fs.writeFileSync(cachePath, '{"version":"old"}', 'utf8');

  try {
    const skipped = writeSourceCacheIfUsable(cachePath, { version: 'new' }, 2, 0);
    assert.equal(skipped, false);
    assert.equal(fs.readFileSync(cachePath, 'utf8'), '{"version":"old"}');

    const written = writeSourceCacheIfUsable(cachePath, { version: 'new' }, 2, 1);
    assert.equal(written, true);
    assert.equal(JSON.parse(fs.readFileSync(cachePath, 'utf8')).version, 'new');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('projects 合并：成功仓库覆盖，失败仓库回退，已删除仓库丢弃', () => {
  const repoList = [
    { owner: 'a', repo: 'one', canonicalUrl: 'https://github.com/a/one' },
    { owner: 'b', repo: 'two', canonicalUrl: 'https://github.com/b/two' },
    { owner: 'c', repo: 'three', canonicalUrl: 'https://github.com/c/three' },
  ];
  const fresh = [
    {
      url: 'https://github.com/a/one',
      fullName: 'a/one',
      language: 'TypeScript',
      languageColor: '#3178c6',
      stars: 10,
      forks: 2,
    },
  ];
  const previous = [
    {
      url: 'https://github.com/a/one',
      fullName: 'a/one',
      language: 'Old',
      languageColor: '#000000',
      stars: 1,
      forks: 0,
    },
    {
      url: 'https://github.com/b/two',
      fullName: 'b/two',
      language: 'Rust',
      languageColor: '#dea584',
      stars: 5,
      forks: 1,
    },
    {
      url: 'https://github.com/gone/repo',
      fullName: 'gone/repo',
      language: 'Go',
      languageColor: '#00add8',
      stars: 99,
      forks: 9,
    },
  ];

  const merged = mergeRepoMetas(repoList, fresh, previous);

  assert.deepEqual(
    merged.repos.map((repo: { url: string }) => repo.url),
    ['https://github.com/a/one', 'https://github.com/b/two']
  );
  assert.equal(merged.repos[0].stars, 10);
  assert.equal(merged.repos[1].stars, 5);
  assert.deepEqual([...merged.retainedUrls], ['https://github.com/b/two']);
});

test('静态 articles 缓存：按当前页面来源过滤已删除来源', () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-sync-cache-'));
  const cachePath = path.join(cacheDir, 'articles.feed-cache.json');
  fs.writeFileSync(
    cachePath,
    JSON.stringify({
      version: '1.0',
      pageId: 'articles',
      generatedAt: '2025-01-01T00:00:00.000Z',
      articles: [
        article('keep', 'https://a.example/post', 'https://a.example', '2025-01-02T00:00:00.000Z'),
        article(
          'removed',
          'https://old.example/post',
          'https://old.example',
          '2025-01-01T00:00:00.000Z'
        ),
      ],
      stats: { totalArticles: 2 },
    }),
    'utf8'
  );

  try {
    const config = { site: { rss: { cacheDir } } };
    const allowed = new Set([normalizeUrlKey('https://a.example')]);
    const cache = tryLoadArticlesFeedCache('articles', config, allowed);

    assert.ok(cache);
    assert.deepEqual(
      cache.items.map((item: { name: string }) => item.name),
      ['keep']
    );
    assert.equal(cache.meta.total, 1);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});
