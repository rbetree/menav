import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runBuildPipeline } from './lib/build-pipeline.ts';
import { loadConfig } from '../src/lib/config/index.ts';
import { createLogger } from '../src/lib/logging/logger.ts';
import { spawnSync } from 'node:child_process';

const log = createLogger('build-snapshot');

/** Pages 使用 CF_PAGES_URL 领取该部署的冻结快照；本地也可传入快照文件构建。 */
async function main(): Promise<void> {
  const root = path.resolve(__dirname, '..');
  let temporary: string | undefined;
  const oldSnapshot = process.env.MENAV_SNAPSHOT_FILE;
  const previousCache = {
    MENAV_SNAPSHOT_CACHE_DIR: process.env.MENAV_SNAPSHOT_CACHE_DIR,
    RSS_CACHE_DIR: process.env.RSS_CACHE_DIR,
    PROJECTS_CACHE_DIR: process.env.PROJECTS_CACHE_DIR,
  };
  try {
    if (!oldSnapshot) {
      const endpoint = process.env.MENAV_BACKEND_URL;
      const token = process.env.MENAV_BUILD_TOKEN;
      const deploymentUrl = process.env.CF_PAGES_URL;
      if (!endpoint || !token || !deploymentUrl)
        throw new Error(
          '需要 MENAV_BACKEND_URL、MENAV_BUILD_TOKEN 和 CF_PAGES_URL，或设置本地 MENAV_SNAPSHOT_FILE'
        );
      const backend = new URL(endpoint);
      if (backend.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(backend.hostname))
        throw new Error('后台地址必须使用 HTTPS');
      const url = new URL('/build/snapshot', backend);
      url.searchParams.set('url', deploymentUrl.replace(/\/$/, ''));
      let response: Response | undefined;
      const headers: Record<string, string> = { Authorization: 'Bearer ' + token };
      // 后台启用 Access 时，构建身份经由 service token 放行 /build/snapshot 后再做 Bearer 校验。
      if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
        headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
        headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
      }
      // Pages 构建可能比触发请求的响应落库更快，短暂等待该部署标识同步。
      for (let attempt = 0; attempt < 6; attempt++) {
        response = await fetch(url, {
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        });
        if (response.status !== 409 && response.status !== 502) break;
        await response.arrayBuffer();
        if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (!response?.ok)
        throw new Error(
          '获取构建快照失败（HTTP ' + response?.status + '），请检查后台发布状态与构建读取凭证'
        );
      const data = await response.text();
      if (Buffer.byteLength(data) > 8_000_000) throw new Error('快照超过 8 MB');
      temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-build-'));
      process.env.MENAV_SNAPSHOT_FILE = path.join(temporary, 'snapshot.json');
      fs.writeFileSync(process.env.MENAV_SNAPSHOT_FILE, data, 'utf8');
    }
    const config = loadConfig();
    const source = JSON.parse(fs.readFileSync(process.env.MENAV_SNAPSHOT_FILE!, 'utf8')) as {
      publicationId?: string;
      revision: number;
    };
    if (process.env.CF_PAGES && !source.publicationId)
      throw new Error('Pages 构建缺少发布任务标识');
    if (!process.argv.includes('--offline')) {
      temporary ??= fs.mkdtempSync(path.join(os.tmpdir(), 'menav-build-'));
      const cacheDir = path.join(temporary, 'cache');
      fs.mkdirSync(cacheDir);
      process.env.MENAV_SNAPSHOT_CACHE_DIR = cacheDir;
      process.env.RSS_CACHE_DIR = cacheDir;
      process.env.PROJECTS_CACHE_DIR = cacheDir;
      const templates = new Set(
        config.navigation.map((nav) => config.pages[nav.id]?.template || nav.id)
      );
      const scripts = [
        ...(templates.has('projects') ? ['sync-projects.ts', 'sync-heatmap.ts'] : []),
        ...(templates.has('articles') ? ['sync-articles.ts'] : []),
      ];
      for (const script of scripts) {
        const result = spawnSync(
          process.execPath,
          ['-r', path.join(root, 'scripts/register-ts.cjs'), path.join(root, 'scripts', script)],
          {
            cwd: root,
            env: process.env,
            stdio: 'inherit',
            timeout: 120_000,
          }
        );
        if (result.status !== 0) log.warn('外部数据刷新未完成，将使用已有快照数据', { script });
      }
    } else {
      delete process.env.MENAV_SNAPSHOT_CACHE_DIR;
    }
    if (!runBuildPipeline({ log, repoRoot: root, sync: false, command: 'npm run build:snapshot' }))
      throw new Error('快照构建失败');
    fs.rmSync(path.join(root, 'dist', '.menav-snapshot-assets.json'), { force: true });
    fs.writeFileSync(
      path.join(root, 'dist', 'menav-build.json'),
      JSON.stringify({
        publicationId: source.publicationId ?? null,
        revision: config.snapshot!.revision,
      }) + '\n'
    );
    log.ok('快照构建完成', { revision: config.snapshot!.revision });
  } finally {
    if (oldSnapshot === undefined) delete process.env.MENAV_SNAPSHOT_FILE;
    else process.env.MENAV_SNAPSHOT_FILE = oldSnapshot;
    for (const [key, value] of Object.entries(previousCache)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (require.main === module)
  main().catch((error) => {
    log.error('快照构建失败', { message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  });
