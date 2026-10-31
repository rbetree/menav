import fs from 'node:fs';
import path from 'node:path';

import { createLogger } from '../src/lib/logging/logger.ts';
import { isSnapshotAssetPath } from '../src/shared/snapshot-assets.ts';

const log = createLogger('clean');

const distPath = path.resolve(__dirname, '..', 'dist');
const publicPath = path.resolve(__dirname, '..', 'public');
const generatedPublicPaths = [
  path.join(publicPath, 'assets'),
  path.join(publicPath, 'pinyin-match.js'),
  path.join(publicPath, 'script.js'),
  path.join(publicPath, 'menav-config.json'),
  path.join(publicPath, 'search-index.json'),
  path.join(publicPath, 'menav.svg'),
  path.join(publicPath, 'favicon.ico'),
];

try {
  const manifest = path.join(publicPath, '.menav-snapshot-assets.json');
  if (fs.existsSync(manifest)) {
    const assets: unknown = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (
      !Array.isArray(assets) ||
      assets.some((asset) => typeof asset !== 'string' || !isSnapshotAssetPath(asset))
    )
      throw new Error('快照资源清单无效');
    for (const asset of assets) fs.rmSync(path.join(publicPath, asset), { force: true });
    fs.rmSync(manifest, { force: true });
  }
  fs.rmSync(distPath, { recursive: true, force: true });
  log.ok('删除 dist 目录', { path: distPath });

  generatedPublicPaths.forEach((targetPath) => {
    fs.rmSync(targetPath, { recursive: true, force: true });
  });
  log.ok('清理 public 生成资源', { path: publicPath });
} catch (error) {
  log.error('删除 dist 目录失败', {
    path: distPath,
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}
