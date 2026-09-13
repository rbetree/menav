import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
let bundle;

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
      const response = await worker.dispatchFetch(new URL(path, url), {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
      return { status: response.status, headers: response.headers, data };
    },
    dispose: () => worker.dispose(),
  };
}

export const BOOKMARK_HTML =
  '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>' +
  '<DT><H3>开发工具</H3><DL><p><DT><A HREF="https://example.com">Example</A>' +
  '</DL><p></DL><p>';
