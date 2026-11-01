const fs = require('node:fs');
const dns = require('node:dns').promises;
const originalLookup = dns.lookup.bind(dns);
const originalFetch = globalThis.fetch;

// 仅用于构建集成测试：实际同步脚本照常执行，外站响应保持可重复。
dns.lookup = (hostname, options) =>
  hostname.endsWith('.example')
    ? Promise.resolve([{ address: '93.184.216.34', family: 4 }])
    : originalLookup(hostname, options);

globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  const headers = new Headers(options?.headers);
  if (
    process.env.MENAV_BACKEND_URL &&
    url.origin === new URL(process.env.MENAV_BACKEND_URL).origin &&
    url.pathname === '/build/snapshot'
  ) {
    // 保留本机 Worker HTTP 请求，覆盖 Pages 下载冻结快照的真实入口。
    if (
      url.hostname !== '127.0.0.1' ||
      headers.get('authorization') !== 'Bearer test-build-token'
    ) {
      throw new Error('构建测试只能向隔离本机 Worker 发送测试凭证');
    }
    return originalFetch(input, options);
  }
  if (headers.has('authorization')) throw new Error('外部刷新不得携带构建凭证');
  fs.appendFileSync(
    process.env.MENAV_REFRESH_TEST_LOG,
    JSON.stringify({
      url: url.href,
      cache: process.env.MENAV_SNAPSHOT_CACHE_DIR,
    }) + '\n'
  );
  if (url.hostname === 'a.example' && url.pathname === '/') {
    return new Response('<link rel="alternate" type="application/rss+xml" href="/feed">', {
      headers: { 'content-type': 'text/html' },
    });
  }
  if (url.hostname === 'a.example' && url.pathname === '/feed') {
    return new Response(
      '<?xml version="1.0"?><rss version="2.0"><channel><title>甲站</title><link>https://a.example</link><description>测试</description><item><title>刷新后的文章</title><link>https://a.example/new</link><pubDate>Tue, 08 Sep 2026 12:00:00 GMT</pubDate></item></channel></rss>'
    );
  }
  if (url.hostname === 'b.example' || url.pathname === '/repos/b/two')
    return new Response('unavailable', { status: 503 });
  if (url.hostname === 'raw.githubusercontent.com')
    return Response.json({ TypeScript: { color: '#3178c6' } });
  if (url.hostname === 'api.github.com' && url.pathname === '/repos/a/one')
    return Response.json({ language: 'TypeScript', stargazers_count: 42, forks_count: 3 });
  if (url.hostname === 'github.com' && url.pathname === '/users/tester/contributions')
    return new Response(
      '<div class="js-yearly-contributions"><div class="refresh-heatmap">42 contributions</div></div>'
    );
  throw new Error('测试中不应请求未声明的外站：' + url.href);
};
