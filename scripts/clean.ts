import fs from 'node:fs';
import path from 'node:path';

import { createLogger } from '../src/lib/logging/logger.ts';

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
