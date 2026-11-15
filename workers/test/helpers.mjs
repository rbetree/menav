import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
let bundle;

async function readResponse(response) {
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return { status: response.status, headers: response.headers, data };
}

/** 每个用例使用独立临时 D1；只通过真实 Worker HTTP 接口断言行为。 */
export async function createBackend(options = {}) {
  bundle ??= build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
  });
  const code = (await bundle).outputFiles[0].text;
  const config = convertV4MiniflareOptions({
    modules: true,
    script: code,
    compatibilityDate: '2026-08-01',
    d1Databases: ['DB'],
    host: '127.0.0.1',
    port: 0,
    cf: false,
    assets: {
      directory: fileURLToPath(new URL('../../admin/', import.meta.url)),
      binding: 'ASSETS',
      run_worker_first: true,
      routerConfig: { has_user_worker: true },
    },
    ...options,
    bindings: {
      TEAM_DOMAIN: '',
      POLICY_AUD: '',
      CF_ACCOUNT_ID: '',
      CF_PAGES_PROJECT: '',
      CF_API_TOKEN: '',
      BUILD_TOKEN: '',
      ALLOW_INSECURE_DEV: '1',
      ...options.bindings,
    },
  });
  config.telemetry = { enabled: false };
  const worker = new Miniflare(config);
  const url = String(await worker.ready);
  return {
    url,
    async request(method, path, body, headers = {}) {
      // 字符串视为已序列化的请求体，便于构造接近上限的原始载荷。
      const payload =
        body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
      const response = await worker.dispatchFetch(new URL(path, url), {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        body: payload,
      });
      return readResponse(response);
    },
    // 流式发送可避免服务端按 Content-Length 提前拒绝时客户端仍在写大请求体。
    async requestStream(method, path, text, headers = {}) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (let offset = 0; offset < text.length; offset += 1_000_000)
            controller.enqueue(encoder.encode(text.slice(offset, offset + 1_000_000)));
          controller.close();
        },
      });
      const response = await worker.dispatchFetch(new URL(path, url), {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: stream,
        duplex: 'half',
      });
      return readResponse(response);
    },
    db: () => worker.getD1Database('DB'),
    dispose: () => worker.dispose(),
  };
}

export const BOOKMARK_HTML =
  '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>' +
  '<DT><H3>开发工具</H3><DL><p><DT><A HREF="https://example.com">Example</A>' +
  '</DL><p></DL><p>';
