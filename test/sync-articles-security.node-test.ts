const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isPrivateIp,
  assertSafeToFetch,
  fetchWithRedirects,
  extractFeedLinksFromHtml,
} = require('../scripts/sync-articles');

test('isPrivateIp：覆盖 IPv4 保留、CGNAT 与组播网段', () => {
  for (const ip of [
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '100.127.255.254',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.254',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '239.255.255.255',
    '255.255.255.255',
  ]) {
    assert.equal(isPrivateIp(ip), true, `${ip} 应判定为内网/保留`);
  }

  for (const ip of ['1.1.1.1', '8.8.8.8', '172.32.0.1', '192.169.0.1', '198.20.0.1']) {
    assert.equal(isPrivateIp(ip), false, `${ip} 应判定为公网`);
  }
});

test('isPrivateIp：覆盖 IPv6、IPv4-mapped 与 link-local 全段', () => {
  for (const ip of [
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:8.8.8.8',
    '[::ffff:7f00:1]',
    'fe80::1',
    'fe80::ffff:1',
    'febf::1',
    'fc00::1',
    'fdff::1',
    'ff02::1',
  ]) {
    assert.equal(isPrivateIp(ip), true, `${ip} 应判定为内网/保留`);
  }

  for (const ip of ['2001:4860:4860::8888', '2606:4700:4700::1111']) {
    assert.equal(isPrivateIp(ip), false, `${ip} 应判定为公网`);
  }
});

test('assertSafeToFetch：带方括号的 IPv6 与 .local 域名被阻断', async () => {
  await assert.rejects(
    () => assertSafeToFetch('http://[::ffff:127.0.0.1]/', 1000),
    /内网|保留|本机/
  );
  await assert.rejects(() => assertSafeToFetch('http://[::1]/', 1000), /内网|保留|本机/);
  await assert.rejects(() => assertSafeToFetch('http://localhost/', 1000), /本机/);
  await assert.rejects(() => assertSafeToFetch('http://printer.local/', 1000), /\.local/);
  await assert.rejects(() => assertSafeToFetch('ftp://8.8.8.8/', 1000), /http/);
  await assert.rejects(() => assertSafeToFetch('http://user:pass@8.8.8.8/', 1000), /用户名/);
  await assert.doesNotReject(() => assertSafeToFetch('http://8.8.8.8/', 1000));
});

test('fetchWithRedirects：重定向链逐跳校验，跳转到内网时阻断', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(null, {
      status: 302,
      headers: { location: 'http://[::ffff:127.0.0.1]/secret' },
    });
  };

  try {
    await assert.rejects(
      () =>
        fetchWithRedirects('http://8.8.8.8/', {
          timeoutMs: 1000,
          maxRedirects: 3,
          headers: {},
          maxBytes: 1024,
        }),
      /内网|保留|本机/
    );
    assert.deepEqual(calls, ['http://8.8.8.8/']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithRedirects：公网重定向链返回最终地址与响应体', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'http://8.8.8.8/') {
      return new Response(null, { status: 301, headers: { location: 'http://1.1.1.1/feed' } });
    }
    return new Response('<rss />', { status: 200, headers: { 'content-type': 'application/xml' } });
  };

  try {
    const result = await fetchWithRedirects('http://8.8.8.8/', {
      timeoutMs: 1000,
      maxRedirects: 3,
      headers: {},
      maxBytes: 1024,
    });
    assert.equal(result.url, 'http://1.1.1.1/feed');
    assert.equal(result.text, '<rss />');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithRedirects：响应体超过上限时拒绝', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('x'.repeat(2048), { status: 200 });

  try {
    await assert.rejects(
      () =>
        fetchWithRedirects('http://8.8.8.8/', {
          timeoutMs: 1000,
          maxRedirects: 1,
          headers: {},
          maxBytes: 1024,
        }),
      /响应体过大/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('extractFeedLinksFromHtml：解码 &amp; 并支持无引号属性', () => {
  const html = [
    '<link rel=alternate type=application/rss+xml href=https://example.com/rss.xml>',
    '<link rel="alternate" type="application/atom+xml" href="https://example.com/atom.xml?lang=zh&amp;format=atom">',
    "<link rel='alternate' type='application/rss+xml' href='/feed?a=1&amp;b=2'>",
    '<link rel=alternate type=application/rss+xml href=https://example.com/unquoted?x=1&amp;y=2>',
  ].join('');
  const links = extractFeedLinksFromHtml(html, 'https://example.com');

  assert.ok(links.includes('https://example.com/rss.xml'));
  assert.ok(links.includes('https://example.com/atom.xml?lang=zh&format=atom'));
  assert.ok(links.includes('https://example.com/feed?a=1&b=2'));
  assert.ok(links.includes('https://example.com/unquoted?x=1&y=2'));
  assert.equal(links[0], 'https://example.com/rss.xml');
});

test('extractFeedLinksFromHtml：忽略非 alternate 与非 feed 类型', () => {
  const html = [
    '<link rel="stylesheet" type="text/css" href="https://example.com/app.css">',
    '<link rel="alternate" type="text/html" href="https://example.com/page">',
  ].join('');
  assert.deepEqual(extractFeedLinksFromHtml(html, 'https://example.com'), []);
});
