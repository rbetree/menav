/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const dns = require('node:dns').promises;
const net = require('node:net');
const Parser = require('rss-parser');

const { loadConfig } = require('../src/generator.js');

const DEFAULT_RSS_SETTINGS = {
  enabled: true,
  cacheDir: 'dev',
  fetch: {
    timeoutMs: 10_000,
    maxRetries: 1,
    concurrency: 5,
    totalTimeoutMs: 60_000,
    maxRedirects: 3,
    userAgent: 'MeNavRSSSync/1.0',
    htmlMaxBytes: 512 * 1024,
    feedMaxBytes: 1024 * 1024
  },
  articles: {
    perSite: 5,
    total: 50,
    summaryMaxLength: 200
  }
};

function parseBooleanEnv(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'y') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'n') return false;
  return fallback;
}

function parseIntegerEnv(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function getRssSettings(config) {
  const fromConfig = (config && config.site && config.site.rss && typeof config.site.rss === 'object')
    ? config.site.rss
    : {};

  const merged = {
    ...DEFAULT_RSS_SETTINGS,
    ...fromConfig,
    fetch: {
      ...DEFAULT_RSS_SETTINGS.fetch,
      ...(fromConfig.fetch || {})
    },
    articles: {
      ...DEFAULT_RSS_SETTINGS.articles,
      ...(fromConfig.articles || {})
    }
  };

  // 环境变量覆盖（主要给 CI 调试/降级用）
  merged.enabled = parseBooleanEnv(process.env.RSS_ENABLED, merged.enabled);
  merged.cacheDir = process.env.RSS_CACHE_DIR ? String(process.env.RSS_CACHE_DIR) : merged.cacheDir;

  merged.fetch.timeoutMs = parseIntegerEnv(process.env.RSS_FETCH_TIMEOUT, merged.fetch.timeoutMs);
  merged.fetch.maxRetries = parseIntegerEnv(process.env.RSS_FETCH_MAX_RETRIES, merged.fetch.maxRetries);
  merged.fetch.concurrency = parseIntegerEnv(process.env.RSS_FETCH_CONCURRENCY, merged.fetch.concurrency);
  merged.fetch.totalTimeoutMs = parseIntegerEnv(process.env.RSS_TOTAL_TIMEOUT, merged.fetch.totalTimeoutMs);
  merged.fetch.maxRedirects = parseIntegerEnv(process.env.RSS_FETCH_MAX_REDIRECTS, merged.fetch.maxRedirects);

  merged.articles.perSite = parseIntegerEnv(process.env.RSS_ARTICLES_PER_SITE, merged.articles.perSite);
  merged.articles.total = parseIntegerEnv(process.env.RSS_ARTICLES_TOTAL, merged.articles.total);
  merged.articles.summaryMaxLength = parseIntegerEnv(
    process.env.RSS_SUMMARY_MAX_LENGTH,
    merged.articles.summaryMaxLength
  );

  // 兜底约束：避免奇怪配置导致卡死/爆内存
  merged.fetch.timeoutMs = Math.max(1_000, merged.fetch.timeoutMs);
  merged.fetch.totalTimeoutMs = Math.max(5_000, merged.fetch.totalTimeoutMs);
  merged.fetch.concurrency = Math.max(1, Math.min(20, merged.fetch.concurrency));
  merged.fetch.maxRetries = Math.max(0, Math.min(3, merged.fetch.maxRetries));
  merged.fetch.maxRedirects = Math.max(0, Math.min(10, merged.fetch.maxRedirects));

  merged.articles.perSite = Math.max(1, Math.min(50, merged.articles.perSite));
  merged.articles.total = Math.max(1, Math.min(500, merged.articles.total));
  merged.articles.summaryMaxLength = Math.max(0, Math.min(2_000, merged.articles.summaryMaxLength));

  return merged;
}

function isHttpUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(String(url));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPrivateIp(ip) {
  if (!ip) return true;

  if (net.isIP(ip) === 4) {
    const parts = ip.split('.').map(n => Number.parseInt(n, 10));
    if (parts.length !== 4 || parts.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return true;

    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // 组播/保留
    return false;
  }

  if (net.isIP(ip) === 6) {
    const normalized = String(ip).toLowerCase();
    if (normalized === '::1') return true;
    if (normalized.startsWith('fe80:')) return true; // link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
    return false;
  }

  return true;
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} 超时（${timeoutMs}ms）`)), timeoutMs);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function assertSafeToFetch(url, timeoutMs) {
  const u = new URL(String(url));
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`仅允许 http/https：${u.protocol}`);
  }

  if (u.username || u.password) {
    throw new Error('禁止包含用户名/密码的 URL');
  }

  const hostname = u.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '127.0.0.1' || hostname === '::1') {
    throw new Error('禁止访问本机地址');
  }
  if (hostname.endsWith('.local')) {
    throw new Error('禁止访问 .local 域名');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('禁止访问内网/保留 IP');
    return;
  }

  // 解析域名，阻断解析到内网的情况（best-effort）
  const records = await withTimeout(
    dns.lookup(hostname, { all: true, verbatim: true }),
    Math.min(2_000, timeoutMs),
    `DNS 解析 ${hostname}`
  );

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('DNS 解析失败或无结果');
  }

  const hasPrivate = records.some(r => isPrivateIp(r.address));
  if (hasPrivate) throw new Error('DNS 解析到内网/保留地址，已阻断');
}

function buildHeaders(userAgent) {
  return {
    'user-agent': userAgent,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };
}

async function fetchWithRedirects(url, { timeoutMs, maxRedirects, headers, maxBytes }) {
  let current = String(url);
  for (let i = 0; i <= maxRedirects; i += 1) {
    await assertSafeToFetch(current, timeoutMs);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`重定向缺少 Location（${status}）`);
      current = new URL(location, current).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${status}`);
    }

    const text = await readResponseTextWithLimit(response, maxBytes);
    return { url: current, response, text };
  }

  throw new Error(`重定向次数超过上限（${maxRedirects}）`);
}

async function readResponseTextWithLimit(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error('响应体过大');
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let received = 0;
  let text = '';

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      try {
        reader.cancel();
      } catch {
        // ignore
      }
      throw new Error('响应体过大');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function extractFeedLinksFromHtml(html, baseUrl) {
  const candidates = [];
  if (!html) return candidates;

  const linkTags = String(html).match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] || '';
    if (!/alternate/i.test(rel)) continue;

    const type = /type\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] || '';
    const isFeedType = /application\/(rss|atom)\+xml/i.test(type) || /(rss|atom)/i.test(type);
    if (!isFeedType) continue;

    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;

    try {
      const resolved = new URL(href, baseUrl).toString();
      if (isHttpUrl(resolved)) candidates.push(resolved);
    } catch {
      // ignore bad url
    }
  }

  // 简单排序：优先 RSS，其次 Atom
  const rank = url => (url.includes('atom') ? 2 : 1);
  return [...new Set(candidates)].sort((a, b) => rank(a) - rank(b));
}

function buildCommonFeedUrls(siteUrl) {
  const common = ['/feed', '/rss.xml', '/rss', '/atom.xml', '/atom', '/feed.xml'];
  const out = [];
  for (const p of common) {
    try {
      const u = new URL(p, siteUrl).toString();
      out.push(u);
    } catch {
      // ignore
    }
  }
  return out;
}

async function discoverFeedUrl(siteUrl, settings, deadlineTs) {
  const timeRemaining = deadlineTs - Date.now();
  if (timeRemaining <= 0) throw new Error('总超时：无法继续发现 RSS');

  const homepage = await fetchWithRedirects(siteUrl, {
    timeoutMs: Math.min(settings.fetch.timeoutMs, timeRemaining),
    maxRedirects: settings.fetch.maxRedirects,
    headers: buildHeaders(settings.fetch.userAgent),
    maxBytes: settings.fetch.htmlMaxBytes
  });

  const contentType = homepage.response.headers.get('content-type') || '';
  if (/text\/html/i.test(contentType) || /application\/xhtml\+xml/i.test(contentType) || !contentType) {
    const candidates = extractFeedLinksFromHtml(homepage.text, homepage.url);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return null;
}

function stripHtmlToText(input) {
  const raw = String(input || '');
  const withoutTags = raw.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  const decoded = withoutTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number.parseInt(num, 10)));

  return decoded.replace(/\s+/g, ' ').trim();
}

function truncateText(text, maxLen) {
  if (!maxLen || maxLen <= 0) return '';
  const s = String(text || '');
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '...';
}

function normalizePublishedAt(item) {
  const iso = item && typeof item.isoDate === 'string' ? item.isoDate : '';
  if (iso) return iso;

  const pub = item && typeof item.pubDate === 'string' ? item.pubDate : '';
  if (pub) {
    const d = new Date(pub);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  return '';
}

function normalizeArticle(item, sourceSite, settings) {
  const title = (item && item.title !== undefined) ? String(item.title).trim() : '';
  if (!title) return null;

  const link = item && item.link ? String(item.link).trim() : '';
  if (!isHttpUrl(link)) return null;

  const summaryRaw =
    (item && item.contentSnippet) ||
    (item && item.summary) ||
    (item && item.content) ||
    '';
  const summaryText = stripHtmlToText(summaryRaw);
  const summary = settings.articles.summaryMaxLength
    ? truncateText(summaryText, settings.articles.summaryMaxLength)
    : summaryText;

  const publishedAt = normalizePublishedAt(item);

  const source = sourceSite && sourceSite.name ? String(sourceSite.name) : '';
  const icon = sourceSite && sourceSite.icon ? String(sourceSite.icon) : 'fas fa-pen';

  return {
    title,
    url: link,
    summary,
    publishedAt,
    source,
    icon
  };
}

async function fetchAndParseFeed(feedUrl, settings, parser, deadlineTs) {
  const timeRemaining = deadlineTs - Date.now();
  if (timeRemaining <= 0) throw new Error('总超时：无法继续抓取 Feed');

  const feed = await fetchWithRedirects(feedUrl, {
    timeoutMs: Math.min(settings.fetch.timeoutMs, timeRemaining),
    maxRedirects: settings.fetch.maxRedirects,
    headers: {
      ...buildHeaders(settings.fetch.userAgent),
      accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
    },
    maxBytes: settings.fetch.feedMaxBytes
  });

  const parsed = await parser.parseString(feed.text);
  return { feedUrl: feed.url, feedTitle: parsed.title || '', items: Array.isArray(parsed.items) ? parsed.items : [] };
}

async function processSourceSite(sourceSite, settings, parser, deadlineTs) {
  const url = sourceSite && sourceSite.url ? String(sourceSite.url) : '';
  if (!isHttpUrl(url)) {
    return {
      site: {
        name: sourceSite && sourceSite.name ? String(sourceSite.name) : '',
        url,
        feedUrl: '',
        status: 'skipped',
        error: '无效 URL（需为 http/https）',
        fetchedAt: new Date().toISOString()
      },
      articles: []
    };
  }

  let lastError = null;

  const tryOnce = async feedUrl => {
    const parsed = await fetchAndParseFeed(feedUrl, settings, parser, deadlineTs);
    const normalized = parsed.items
      .map(item => normalizeArticle(item, sourceSite, settings))
      .filter(Boolean)
      .slice(0, settings.articles.perSite);
    return { feedUrl: parsed.feedUrl, articles: normalized };
  };

  const attempt = async () => {
    const discovered = await discoverFeedUrl(url, settings, deadlineTs);
    const candidates = discovered ? [discovered, ...buildCommonFeedUrls(url)] : buildCommonFeedUrls(url);

    for (const candidate of [...new Set(candidates)]) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await tryOnce(candidate);
        return res;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('未找到可用 Feed');
  };

  const startedAt = Date.now();
  for (let i = 0; i <= settings.fetch.maxRetries; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await attempt();
      return {
        site: {
          name: sourceSite && sourceSite.name ? String(sourceSite.name) : '',
          url,
          feedUrl: res.feedUrl,
          status: 'success',
          error: '',
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt
        },
        articles: res.articles
      };
    } catch (e) {
      lastError = e;
    }
  }

  return {
    site: {
      name: sourceSite && sourceSite.name ? String(sourceSite.name) : '',
      url,
      feedUrl: '',
      status: 'failed',
      error: lastError ? String(lastError.message || lastError) : '未知错误',
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt
    },
    articles: []
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runOne() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        // eslint-disable-next-line no-await-in-loop
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      } catch (e) {
        results[currentIndex] = { error: e };
      }
    }
  }

  const runners = [];
  const count = Math.max(1, Math.min(concurrency, items.length));
  for (let i = 0; i < count; i += 1) {
    runners.push(runOne());
  }
  await Promise.all(runners);
  return results;
}

function collectSitesRecursively(node, output) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node.subcategories)) node.subcategories.forEach(child => collectSitesRecursively(child, output));
  if (Array.isArray(node.groups)) node.groups.forEach(child => collectSitesRecursively(child, output));
  if (Array.isArray(node.subgroups)) node.subgroups.forEach(child => collectSitesRecursively(child, output));

  if (Array.isArray(node.sites)) {
    node.sites.forEach(site => {
      if (site && typeof site === 'object') output.push(site);
    });
  }
}

function buildFlatSitesFromCategories(categories) {
  const out = [];
  if (!Array.isArray(categories)) return out;
  categories.forEach(category => collectSitesRecursively(category, out));
  return out;
}

async function syncArticlesForPage(pageId, pageConfig, config, settings) {
  const sourceSites = Array.isArray(pageConfig && pageConfig.sites)
    ? pageConfig.sites
    : buildFlatSitesFromCategories(pageConfig && Array.isArray(pageConfig.categories) ? pageConfig.categories : []);

  const startedAt = Date.now();
  const deadlineTs = startedAt + settings.fetch.totalTimeoutMs;

  const parser = new Parser({
    timeout: settings.fetch.timeoutMs
  });

  const results = await mapWithConcurrency(
    sourceSites,
    settings.fetch.concurrency,
    async site => processSourceSite(site, settings, parser, deadlineTs)
  );

  const sites = [];
  const articles = [];
  const seen = new Set();

  for (const r of results) {
    if (!r || r.error) continue;
    if (r.site) sites.push(r.site);
    if (Array.isArray(r.articles)) {
      for (const a of r.articles) {
        if (!a || !a.url) continue;
        if (seen.has(a.url)) continue;
        seen.add(a.url);
        articles.push(a);
      }
    }
  }

  articles.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });

  const limitedArticles = articles.slice(0, settings.articles.total);

  const successSites = sites.filter(s => s.status === 'success').length;
  const failedSites = sites.filter(s => s.status === 'failed').length;
  const skippedSites = sites.filter(s => s.status === 'skipped').length;

  const cache = {
    version: '1.0',
    pageId,
    generatedAt: new Date().toISOString(),
    title: pageConfig && pageConfig.title ? String(pageConfig.title) : '',
    sites,
    articles: limitedArticles,
    stats: {
      totalSites: sourceSites.length,
      successSites,
      failedSites,
      skippedSites,
      totalArticles: limitedArticles.length,
      durationMs: Date.now() - startedAt
    }
  };

  const cacheDir = path.resolve(process.cwd(), settings.cacheDir);
  fs.mkdirSync(cacheDir, { recursive: true });

  const cachePath = path.join(cacheDir, `${pageId}.feed-cache.json`);
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));

  return { cachePath, cache };
}

function pickArticlesPages(config, onlyPageId) {
  const pages = [];
  const nav = Array.isArray(config.navigation) ? config.navigation : [];

  for (const item of nav) {
    const pageId = item && item.id ? String(item.id) : '';
    if (!pageId) continue;
    if (onlyPageId && pageId !== onlyPageId) continue;

    const pageConfig = config[pageId];
    if (!pageConfig || typeof pageConfig !== 'object') continue;

    const templateName = pageConfig.template ? String(pageConfig.template) : pageId;
    if (templateName !== 'articles') continue;

    pages.push({ pageId, pageConfig });
  }

  return pages;
}

async function main() {
  const args = process.argv.slice(2);
  const pageArgIndex = args.findIndex(a => a === '--page');
  const onlyPageId = pageArgIndex >= 0 ? args[pageArgIndex + 1] : null;

  const config = loadConfig();
  const settings = getRssSettings(config);

  if (!settings.enabled) {
    console.log('[INFO] RSS 已禁用（RSS_ENABLED=false），跳过。');
    return;
  }

  const pages = pickArticlesPages(config, onlyPageId);
  if (pages.length === 0) {
    console.log('[INFO] 未找到需要同步的 articles 页面。');
    return;
  }

  console.log(`[INFO] 准备同步 ${pages.length} 个 articles 页面缓存…`);

  for (const { pageId, pageConfig } of pages) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { cachePath, cache } = await syncArticlesForPage(pageId, pageConfig, config, settings);
      console.log(`[INFO] 已生成缓存：${cachePath}（articles=${cache.stats.totalArticles}, sites=${cache.stats.totalSites}）`);
    } catch (e) {
      console.warn(`[WARN] 页面 ${pageId} 同步失败：${e.message || e}`);
      // best-effort：不阻断其他页面/后续 build
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ERROR] sync-articles 执行失败：', err);
    // best-effort：除非是非常规异常，否则不阻断 CI；此处仍保留非 0 退出码便于本地排查
    process.exitCode = 1;
  });
}

module.exports = {
  getRssSettings,
  isPrivateIp,
  extractFeedLinksFromHtml,
  stripHtmlToText,
  normalizeArticle,
  buildFlatSitesFromCategories
};
